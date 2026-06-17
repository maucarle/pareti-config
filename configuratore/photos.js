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
  const pool=(P.photoPool||[]);
  const frames=[];
  P.walls.forEach(w=>{
    const lay=layouts[w.id]; if(!lay) return;
    const cxw=w.w/2, cyw=w.h/2;
    lay.placed.forEach(p=>{
      p.photoId=null;
      const cx=p.x+p.w/2, cy=p.y+p.h/2;
      const dist=Math.hypot((cx-cxw)/w.w, (cy-cyw)/w.h);   // distanza normalizzata dal centro parete
      frames.push({p, area:p.w*p.h, dist, slot:(p.slotIdx||0)});
    });
  });
  if(!pool.length || !frames.length) return;
  const taken=new Set();
  const free=()=>frames.filter(f=>!taken.has(f));
  const give=(id,f)=>{ if(f){ f.p.photoId=id; taken.add(f); } };
  // 1) foto marcate "al centro" -> cornice piu' centrale (a parita', piu' grande)
  pool.filter(x=>x.center).forEach(ph=>{
    const c=free(); if(!c.length) return;
    c.sort((a,b)=>(a.dist-b.dist)||(b.area-a.area)); give(ph.id, c[0]);
  });
  // 2) foto preferite -> cornici piu' grandi libere (a parita', piu' centrali)
  pool.filter(x=>x.fav && !x.center).forEach(ph=>{
    const c=free(); if(!c.length) return;
    c.sort((a,b)=>(b.area-a.area)||(a.dist-b.dist)); give(ph.id, c[0]);
  });
  // 3) resto -> cornici libere in ordine di slot, ciclando il pool restante
  let order=pool.filter(x=>!x.center && !x.fav).map(x=>x.id);
  if(P.photoSeed){ const rnd=mulberry32(P.photoSeed); engShuffle(order,rnd); }
  if(!order.length) order=pool.map(x=>x.id);   // se sono tutte fav/center, ricicla tutte
  const rest=free().sort((a,b)=>a.slot-b.slot);
  let gi=0;
  rest.forEach(f=>{ f.p.photoId = order.length ? order[gi++ % order.length] : null; });
}
function togglePhotoFav(id){ const x=(P.photoPool||[]).find(p=>p.id===id); if(x){ x.fav=!x.fav; if(x.fav)x.center=false; saveStore(); refresh(); renderPhotoSection(); } }
function togglePhotoCenter(id){ const cur=(P.photoPool||[]).find(p=>p.id===id); if(!cur) return; const on=!cur.center; (P.photoPool||[]).forEach(p=>p.center=false); cur.center=on; if(on)cur.fav=false; saveStore(); refresh(); renderPhotoSection(); }

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
  info.innerHTML = n ? `${n} foto nel pool — <b>★</b> preferita (cornici più grandi) · <b>◎</b> al centro` : 'nessuna foto caricata — carica le foto del cliente per vederle nelle cornici';
  bar.appendChild(info);
  if(n){
    const sh=document.createElement('button'); sh.className='wall-mini'; sh.textContent='↻ rimescola'; sh.onclick=shufflePhotos; bar.appendChild(sh);
    const cl=document.createElement('button'); cl.className='wall-mini'; cl.textContent='rimuovi tutte'; cl.onclick=clearClientPhotos; bar.appendChild(cl);
  }
  box.appendChild(bar);
  const grid=document.createElement('div'); grid.style.cssText='display:flex;flex-wrap:wrap;gap:8px;';
  (P.photoPool||[]).forEach(ph=>{
    const t=document.createElement('div'); t.style.cssText='position:relative;width:64px;height:64px;border:1px solid '+(ph.center?'var(--brass)':ph.fav?'var(--brass-dim)':'var(--line)')+';overflow:hidden;background:var(--card-2);';
    const src=photoCache[ph.id];
    if(src){ const im=document.createElement('img'); im.src=src; im.style.cssText='width:100%;height:100%;object-fit:cover;display:block;'; t.appendChild(im); }
    else { const sp=document.createElement('span'); sp.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--sans);font-size:8px;color:var(--ink-faint);'; sp.textContent='…'; t.appendChild(sp); }
    const mk=(txt,active,title,cb,pos)=>{ const b=document.createElement('button'); b.textContent=txt; b.title=title;
      b.style.cssText=`position:absolute;${pos}width:17px;height:17px;border:0;border-radius:2px;font-size:10px;line-height:1;cursor:pointer;`+
        (active?'background:var(--brass);color:#fff;':'background:rgba(0,0,0,.42);color:#fff;');
      b.onclick=cb; return b; };
    t.appendChild(mk('★', !!ph.fav, 'Preferita: nelle cornici più grandi', ()=>togglePhotoFav(ph.id), 'top:2px;left:2px;'));
    t.appendChild(mk('◎', !!ph.center, 'Al centro della parete', ()=>togglePhotoCenter(ph.id), 'bottom:2px;left:2px;'));
    const x=document.createElement('button'); x.textContent='✕'; x.title='Rimuovi'; x.style.cssText='position:absolute;top:2px;right:2px;width:17px;height:17px;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:9px;line-height:1;cursor:pointer;border-radius:2px;';
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
