/* ════════════════════════════════════════════════════════
   FOTO CLIENTE — pool di foto reali dentro le cornici
   Le immagini sono persistite tramite Persist (file nella cartella
   Archivio, o IndexedDB in modalità legacy); il progetto conserva
   solo gli id. richiede engine.js + ui.js + store.js
   ════════════════════════════════════════════════════════ */
var photoCache = {};

/* ── caricamento in memoria (via Persist) ── */
async function loadPhotoCache(){
  const ids=new Set();
  store.projects.forEach(p=>(p.photoPool||[]).forEach(x=>ids.add(x.id)));
  for(const id of ids){ if(photoCache[id]) continue; try{ const d=await Persist.loadPhoto(id); if(d) photoCache[id]=d; }catch(e){} }
}

function downscaleImage(file, maxSide){
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=()=>{ const img=new Image(); img.onload=()=>{
      const k=Math.min(1, maxSide/Math.max(img.width,img.height));
      const cw=Math.round(img.width*k), ch=Math.round(img.height*k);
      const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
      cv.getContext('2d').drawImage(img,0,0,cw,ch);
      res(cv.toDataURL('image/jpeg',0.82));
    }; img.onerror=rej; img.src=rd.result; };
    rd.onerror=rej; rd.readAsDataURL(file);
  });
}

/* ── assegnazione foto alle cornici (ordine stabile di montaggio) ── */
/* L'abbinamento foto\u2192cornice usa un'identit\u00e0 STABILE della cornice
   (slotIdx = formato + orientamento + ordine di creazione), non la posizione.
   Cos\u00ec rigenerando la disposizione ogni foto resta nella sua cornice, e ogni
   proposta conserva lo stesso abbinamento. */
function assignPhotos(){
  const pool=(P.photoPool||[]).map(x=>x.id);
  let order=pool.slice();
  if(P.photoSeed){ const rnd=mulberry32(P.photoSeed); engShuffle(order,rnd); }
  let gi=0;
  P.walls.forEach(w=>{
    const placed=[...layouts[w.id].placed].sort((a,b)=>(a.slotIdx||0)-(b.slotIdx||0));
    placed.forEach(p=>{ p.photoId = order.length ? order[gi++ % order.length] : null; });
  });
}

/* ── caricamento multiplo ── */
function uploadClientPhotos(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true;
  inp.onchange=async()=>{
    const files=[...(inp.files||[])]; if(!files.length) return;
    for(const file of files){
      try{
        const dataUrl=await downscaleImage(file, 1000);
        const id=uid('ph');
        await Persist.savePhoto(id, dataUrl);
        photoCache[id]=dataUrl;
        if(!P.photoPool) P.photoPool=[];
        P.photoPool.push({id, name:file.name||'foto'});
      }catch(e){ console.warn('foto non caricata', e); }
    }
    P.showPhotos=true;
    saveStore(); refresh(); renderSettings();
  };
  inp.click();
}

function photoRefElsewhere(id){ return store.projects.some(p=>p!==P && (p.photoPool||[]).some(x=>x.id===id)); }

function removeClientPhoto(id){
  P.photoPool=(P.photoPool||[]).filter(x=>x.id!==id);
  if(!photoRefElsewhere(id)){ Persist.deletePhoto(id).catch(()=>{}); delete photoCache[id]; }
  saveStore(); refresh(); renderPhotoSection();
}
function clearClientPhotos(){
  if(!(P.photoPool||[]).length) return;
  if(!confirm('Rimuovere tutte le foto del cliente da questo progetto?')) return;
  (P.photoPool||[]).forEach(x=>{ if(!photoRefElsewhere(x.id)){ Persist.deletePhoto(x.id).catch(()=>{}); delete photoCache[x.id]; } });
  P.photoPool=[]; saveStore(); refresh(); renderPhotoSection();
}
function shufflePhotos(){ P.photoSeed=Math.floor(Math.random()*1e6)+1; refresh(); }

/* ── UI: sezione foto nelle impostazioni ── */
function renderPhotoSection(){
  const box=document.getElementById('photoEditor'); if(!box) return; box.innerHTML='';
  const n=(P.photoPool||[]).length;
  const bar=document.createElement('div'); bar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:11px;';
  const up=document.createElement('button'); up.className='ed-add'; up.textContent='+ carica foto'; up.onclick=uploadClientPhotos; bar.appendChild(up);
  const info=document.createElement('span'); info.className='ed-lab';
  info.textContent = n ? `${n} foto nel pool — riempiono le cornici a rotazione` : 'nessuna foto caricata — carica le foto del cliente per vederle nelle cornici';
  bar.appendChild(info);
  if(n){
    const sh=document.createElement('button'); sh.className='wall-mini'; sh.textContent='↻ rimescola'; sh.onclick=shufflePhotos; bar.appendChild(sh);
    const cl=document.createElement('button'); cl.className='wall-mini'; cl.textContent='rimuovi tutte'; cl.onclick=clearClientPhotos; bar.appendChild(cl);
  }
  box.appendChild(bar);
  const grid=document.createElement('div'); grid.style.cssText='display:flex;flex-wrap:wrap;gap:8px;';
  (P.photoPool||[]).forEach(ph=>{
    const t=document.createElement('div'); t.style.cssText='position:relative;width:58px;height:58px;border:1px solid var(--line);overflow:hidden;background:var(--card-2);';
    const src=photoCache[ph.id];
    if(src){ const im=document.createElement('img'); im.src=src; im.style.cssText='width:100%;height:100%;object-fit:cover;display:block;'; t.appendChild(im); }
    else { const sp=document.createElement('span'); sp.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--sans);font-size:8px;color:var(--ink-faint);'; sp.textContent='…'; t.appendChild(sp); }
    const x=document.createElement('button'); x.textContent='✕'; x.title='Rimuovi'; x.style.cssText='position:absolute;top:2px;right:2px;width:16px;height:16px;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:9px;line-height:1;cursor:pointer;border-radius:2px;';
    x.onclick=()=>removeClientPhoto(ph.id); t.appendChild(x);
    grid.appendChild(t);
  });
  box.appendChild(grid);
}

function openPhotoSettings(){ const s=document.getElementById('settingsBox'); if(s) s.open=true; renderPhotoSection(); }

function initPhotos(){
  const cp=document.getElementById('chkPhotos');
  if(cp) cp.addEventListener('change',e=>{ P.showPhotos=e.target.checked; refresh(); });
  loadPhotoCache().then(()=>{ refresh(); if(typeof renderPhotoSection==='function') renderPhotoSection(); });
}
