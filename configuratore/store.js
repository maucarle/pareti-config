/* ════════════════════════════════════════════════════════
   STORE — persistenza dei progetti
   Due backend, scelti a runtime:
     • 'fs'     → File System Access API: i progetti sono FILE
                  in una cartella scelta dall'utente (la repo dati).
                  progetti/<id>.json  +  foto/<id>.jpg
                  → portabile fra computer e storicizzato con git.
     • 'legacy' → localStorage (progetti) + IndexedDB (foto).
                  Comportamento storico: usato finché non si collega
                  una cartella, e come sorgente per la migrazione.
   L'app continua a funzionare identica in 'legacy'; la cartella è
   puramente additiva. Caricato PRIMA di ui.js.
   ════════════════════════════════════════════════════════ */
(function(){
  const LS_KEY   = 'pareteStudio_v1';      // blob progetti (legacy)
  const LS_CUR   = 'pareteStudio_current'; // currentId (anche in fs: stato UI per-macchina)
  const FOTO_DB  = 'pareteFotoDB', FOTO_STORE='fotos';   // foto legacy
  const FS_DB    = 'pareteFS',     FS_STORE='kv';         // handle cartella

  let mode = 'legacy';
  let dirHandle = null;          // FileSystemDirectoryHandle quando mode==='fs'
  let liveStore = null;          // riferimento all'oggetto store in memoria (da ui.js)
  let knownIds = new Set();      // id progetti già scritti su file (per cancellare i rimossi)
  const photoUrls = {};          // id → objectURL (fs) per revoca
  const statusCbs = [];

  /* ── IndexedDB minimale (riusato per foto legacy e per l'handle) ── */
  function idb(dbName, storeName){
    return new Promise((res,rej)=>{
      const r=indexedDB.open(dbName,1);
      r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains(storeName)) r.result.createObjectStore(storeName); };
      r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
    });
  }
  async function idbPut(dbName,storeName,key,val){ const db=await idb(dbName,storeName); return new Promise((res,rej)=>{ const tx=db.transaction(storeName,'readwrite'); tx.objectStore(storeName).put(val,key); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbGet(dbName,storeName,key){ const db=await idb(dbName,storeName); return new Promise((res,rej)=>{ const tx=db.transaction(storeName,'readonly'); const rq=tx.objectStore(storeName).get(key); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error); }); }
  async function idbDel(dbName,storeName,key){ const db=await idb(dbName,storeName); return new Promise((res,rej)=>{ const tx=db.transaction(storeName,'readwrite'); tx.objectStore(storeName).delete(key); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function idbKeys(dbName,storeName){ const db=await idb(dbName,storeName); return new Promise((res,rej)=>{ const tx=db.transaction(storeName,'readonly'); const rq=tx.objectStore(storeName).getAllKeys(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); }); }

  /* ── helper File System Access ── */
  function fsAvailable(){ return typeof window.showDirectoryPicker === 'function'; }
  async function subDir(name){ return dirHandle.getDirectoryHandle(name,{create:true}); }
  async function writeText(dir,name,text){ const fh=await dir.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(text); await w.close(); }
  async function writeBlob(dir,name,blob){ const fh=await dir.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(blob); await w.close(); }
  async function readText(dir,name){ const fh=await dir.getFileHandle(name); const f=await fh.getFile(); return await f.text(); }
  async function delFile(dir,name){ try{ await dir.removeEntry(name); }catch(e){} }
  function dataUrlToBlob(dataUrl){ const [head,b64]=dataUrl.split(','); const mime=(head.match(/:(.*?);/)||[])[1]||'image/jpeg'; const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return new Blob([u],{type:mime}); }

  async function verifyPermission(handle, write){
    const opts={ mode: write?'readwrite':'read' };
    if((await handle.queryPermission(opts))==='granted') return true;
    if((await handle.requestPermission(opts))==='granted') return true;
    return false;
  }

  /* ── lettura/scrittura progetti su cartella ── */
  async function fsLoadStore(){
    const prog=await subDir('progetti');
    const projects=[];
    knownIds=new Set();
    for await (const [name,h] of prog.entries()){
      if(h.kind!=='file' || !name.endsWith('.json')) continue;
      try{ const p=JSON.parse(await (await h.getFile()).text()); if(p&&p.id){ projects.push(p); knownIds.add(p.id); } }
      catch(e){ console.warn('progetto illeggibile', name, e); }
    }
    projects.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    const currentId=localStorage.getItem(LS_CUR)||null;
    return { projects, currentId };
  }
  async function fsFlush(storeObj){
    const prog=await subDir('progetti');
    const ids=new Set();
    for(const p of storeObj.projects){
      ids.add(p.id);
      await writeText(prog, p.id+'.json', JSON.stringify(p,null,1));
    }
    for(const old of knownIds){ if(!ids.has(old)) await delFile(prog, old+'.json'); }
    knownIds=ids;
    if(storeObj.currentId) localStorage.setItem(LS_CUR, storeObj.currentId);
  }

  /* ── lettura store legacy (localStorage) ── */
  function legacyLoadStore(){
    let s=null;
    try{ s=JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){ s=null; }
    if(s && !s.currentId) s.currentId=localStorage.getItem(LS_CUR)||null;
    return s;
  }

  /* ── salvataggio (debounced) ── */
  let saveTimer=null, lsWarned=false;
  function scheduleFlush(){
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{ saveTimer=null; flushNow(); }, 500);
  }
  async function flushNow(){
    if(!liveStore) return;
    if(mode==='fs'){
      try{ await fsFlush(liveStore); notify('saved'); }
      catch(e){ console.error('scrittura su cartella fallita', e); notify('error'); }
    } else {
      try{ localStorage.setItem(LS_KEY, JSON.stringify(liveStore)); if(liveStore.currentId) localStorage.setItem(LS_CUR, liveStore.currentId); }
      catch(e){ if(!lsWarned){ lsWarned=true; alert('Attenzione: spazio di salvataggio del browser esaurito. Collega una cartella ("Archivio") per salvare su file senza limiti.'); } }
    }
  }

  /* ── foto ── */
  async function savePhoto(id, dataUrl){
    if(mode==='fs'){ const fdir=await subDir('foto'); await writeBlob(fdir, id+'.jpg', dataUrlToBlob(dataUrl)); }
    else { await idbPut(FOTO_DB,FOTO_STORE,id,dataUrl); }
  }
  async function loadPhoto(id){
    if(mode==='fs'){
      try{ const fdir=await subDir('foto'); const f=await (await fdir.getFileHandle(id+'.jpg')).getFile(); const url=URL.createObjectURL(f); photoUrls[id]=url; return url; }
      catch(e){ return null; }
    }
    try{ return await idbGet(FOTO_DB,FOTO_STORE,id) || null; }catch(e){ return null; }
  }
  async function deletePhoto(id){
    if(mode==='fs'){ const fdir=await subDir('foto'); await delFile(fdir, id+'.jpg'); if(photoUrls[id]){ URL.revokeObjectURL(photoUrls[id]); delete photoUrls[id]; } }
    else { try{ await idbDel(FOTO_DB,FOTO_STORE,id); }catch(e){} }
  }
  function blobToDataUrl(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(blob); }); }
  async function readPhotoDataUrl(id){
    if(mode==='fs'){ try{ const fdir=await subDir('foto'); const f=await (await fdir.getFileHandle(id+'.jpg')).getFile(); return await blobToDataUrl(f); }catch(e){ return null; } }
    try{ return await idbGet(FOTO_DB,FOTO_STORE,id)||null; }catch(e){ return null; }
  }

  /* ── migrazione: dal browser (legacy) alla cartella collegata ── */
  async function migrateFromLegacy(){
    const legacy=legacyLoadStore();
    const projects=(legacy&&Array.isArray(legacy.projects))?legacy.projects:[];
    let nFoto=0;
    // foto: tutte quelle in IndexedDB referenziate dai pool
    const wanted=new Set();
    projects.forEach(p=>(p.photoPool||[]).forEach(x=>wanted.add(x.id)));
    for(const id of wanted){
      try{ const d=await idbGet(FOTO_DB,FOTO_STORE,id); if(d){ await savePhotoFs(id,d); nFoto++; } }catch(e){}
    }
    const prog=await subDir('progetti');
    for(const p of projects){ await writeText(prog, p.id+'.json', JSON.stringify(p,null,1)); knownIds.add(p.id); }
    return { projects:projects.length, foto:nFoto };
  }
  async function savePhotoFs(id,dataUrl){ const fdir=await subDir('foto'); await writeBlob(fdir, id+'.jpg', dataUrlToBlob(dataUrl)); }

  /* ── handle cartella: persistenza fra sessioni ── */
  async function saveHandle(h){ try{ await idbPut(FS_DB,FS_STORE,'dir',h); }catch(e){} }
  async function getSavedHandle(){ try{ return await idbGet(FS_DB,FS_STORE,'dir'); }catch(e){ return null; } }
  async function forgetHandle(){ try{ await idbDel(FS_DB,FS_STORE,'dir'); }catch(e){} }

  /* ── stato per la barra UI ── */
  function notify(ev){ statusCbs.forEach(cb=>{ try{ cb(ev); }catch(e){} }); }

  /* ════════════════ API pubblica ════════════════ */
  const Persist = {
    get mode(){ return mode; },
    get folderName(){ return dirHandle? dirHandle.name : null; },
    fsSupported: fsAvailable(),

    /* init: prova a riconnettere la cartella salvata; altrimenti legacy.
       Non chiede mai permessi senza gesto utente: se la cartella esiste ma
       il permesso è 'prompt', resta in legacy e segnala "da riconnettere". */
    async init(){
      this.needsReconnect=false;
      if(fsAvailable()){
        const h=await getSavedHandle();
        if(h){
          try{
            if((await h.queryPermission({mode:'readwrite'}))==='granted'){
              dirHandle=h; mode='fs';
              this._loaded=await fsLoadStore();
              return;
            } else { this.needsReconnect=true; this._savedHandle=h; }
          }catch(e){ /* handle non più valido */ }
        }
      }
      mode='legacy';
      this._loaded=legacyLoadStore();
    },

    /* riconnessione esplicita (gesto utente) all'handle salvato */
    async reconnect(){
      const h=this._savedHandle||await getSavedHandle();
      if(!h) return false;
      if(!(await verifyPermission(h,true))) return false;
      dirHandle=h; mode='fs'; this.needsReconnect=false;
      const s=await fsLoadStore();
      if(liveStore){ liveStore.projects.length=0; s.projects.forEach(p=>liveStore.projects.push(p)); }
      return s;
    },

    /* l'oggetto store caricato in init (consumato da ui.loadStore) */
    getLoaded(){ return this._loaded; },

    /* ui.js registra qui il riferimento allo store vivo */
    attach(s){ liveStore=s; if(mode==='fs'){ knownIds=new Set(s.projects.map(p=>p.id)); } },

    /* collega una NUOVA cartella (gesto utente). Se la cartella è vuota e
       in legacy ci sono progetti, propone la migrazione. Ritorna lo store
       da adottare, o null se annullato. */
    async connectFolder(){
      if(!fsAvailable()){ alert('Questo browser non supporta il salvataggio su cartella. Usa Chrome o Edge.'); return null; }
      let h;
      try{ h=await window.showDirectoryPicker({mode:'readwrite', id:'pareti-archivio'}); }
      catch(e){ return null; } // utente ha annullato
      if(!(await verifyPermission(h,true))){ alert('Permesso di scrittura negato sulla cartella.'); return null; }
      dirHandle=h; mode='fs'; await saveHandle(h);
      let loaded=await fsLoadStore();
      const legacy=legacyLoadStore();
      const hasLegacy=legacy && Array.isArray(legacy.projects) && legacy.projects.length;
      if(!loaded.projects.length && hasLegacy){
        if(confirm(`La cartella è vuota. Importo i ${legacy.projects.length} progetti già presenti nel browser (con le loro foto)?`)){
          const r=await migrateFromLegacy();
          loaded=await fsLoadStore();
          alert(`Importati ${r.projects} progetti e ${r.foto} foto nella cartella.`);
        }
      }
      this._loaded=loaded;
      return loaded;
    },

    async migrateFromLegacy(){ return migrateFromLegacy(); },

    /* importa un backup {store:{projects,...}, photos:{id:dataUrl}} prodotto
       dallo snippet di esportazione (es. dall'anteprima claude.ai/design).
       Scrive progetti e foto come file nella cartella collegata. */
    async importBackup(backup){
      if(mode!=='fs'){ alert('Collega prima una cartella, poi importa il backup.'); return null; }
      const photos=(backup&&backup.photos)||{};
      let nF=0;
      for(const id in photos){ try{ await savePhotoFs(id, photos[id]); nF++; }catch(e){ console.warn('foto backup non scritta', id, e); } }
      const projs=(backup&&backup.store&&backup.store.projects)||[];
      const prog=await subDir('progetti');
      let nP=0;
      for(const p of projs){ if(!p||!p.id) continue; await writeText(prog, p.id+'.json', JSON.stringify(p,null,1)); knownIds.add(p.id); nP++; }
      if(backup&&backup.store&&backup.store.currentId) localStorage.setItem(LS_CUR, backup.store.currentId);
      return { projects:nP, foto:nF };
    },

    /* torna a legacy senza cancellare nulla */
    async disconnect(){ await forgetHandle(); dirHandle=null; mode='legacy'; this.needsReconnect=false; },

    /* esporta TUTTI i progetti + foto come oggetto backup (formato identico
       all'import). Rete di sicurezza universale: funziona in ogni browser. */
    async exportBackup(){
      const s=liveStore||{projects:[],currentId:null};
      const ids=new Set(); s.projects.forEach(p=>(p.photoPool||[]).forEach(x=>ids.add(x.id)));
      const photos={};
      for(const id of ids){ const d=await readPhotoDataUrl(id); if(d) photos[id]=d; }
      return { type:'parete-backup', v:'1', store:s, photos };
    },

    save(s){ liveStore=s; scheduleFlush(); },
    async saveNow(s){ liveStore=s; if(saveTimer){clearTimeout(saveTimer);saveTimer=null;} await flushNow(); },

    savePhoto, loadPhoto, deletePhoto,
    onStatus(cb){ statusCbs.push(cb); },
  };
  window.Persist = Persist;
})();
