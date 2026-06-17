/* ════════════════════════════════════════════════════════
   UI — stato, progetti, editor, rendering pareti
   richiede engine.js
   ════════════════════════════════════════════════════════ */
const LS_KEY='pareteStudio_v1';
let store=null, P=null, layouts={};

function uid(p){ return p+Math.random().toString(36).slice(2,8); }
function randomSeed(){ return Math.floor(Math.random()*900)+100; }
function wallLetter(i){ return String.fromCharCode(65+(i%26)); }

/* ── progetto dimostrativo (neutro, nessun dato reale di cliente) ──
   Mostrato solo al primo avvio su un browser/cartella vuoti. I progetti
   reali dei clienti vivono come file nella cartella Archivio (vedi store.js). */
function demoProject(){
  const f1={id:uid('f'),name:'30×45',w:30,h:45,pp:2,cw:1.5,cc:'nera',central:false,tipo:'cornice_pp',prezzo:0};
  const f2={id:uid('f'),name:'20×30',w:20,h:30,pp:2,cw:1.5,cc:'nera',central:false,tipo:'cornice_pp',prezzo:0};
  const f3={id:uid('f'),name:'13×19,5',w:13,h:19.5,pp:2,cw:1.5,cc:'nera',central:false,tipo:'cornice_pp',prezzo:0};
  return {
    id:uid('p'), name:'Progetto dimostrativo',
    formats:[f1,f2,f3],
    walls:[{id:uid('w'),name:'Parete A',note:'esempio',w:200,h:160,seed:randomSeed(),photo:null,photoRatio:0.75,corners:null,
      counts:{[f1.id]:2,[f2.id]:4,[f3.id]:8}, countsH:{}}],
    structure:'cost', ord:0.55, gap:3, orient:false,
    photoPool:[], proposte:[], showPhotos:false, photoSeed:0,
  };
}
function emptyProject(name){
  return {
    id:uid('p'), name:name||'Nuovo progetto',
    formats:[
      {id:uid('f'),name:'30×45',w:30,h:45,pp:2},
      {id:uid('f'),name:'20×30',w:20,h:30,pp:2},
      {id:uid('f'),name:'13×19,5',w:13,h:19.5,pp:2},
      {id:uid('f'),name:'10×15',w:10,h:15,pp:2},
    ],
    walls:[{id:uid('w'),name:'Parete A',note:'',w:200,h:160,seed:randomSeed(),photo:null,photoRatio:0.75,corners:null,counts:{}}],
    structure:'cost', ord:0.55, gap:3, orient:false,
  };
}

function saveStore(){ if(window.Persist) Persist.save(store); }
function migrateStore(){
  store.projects.forEach(p=>{
    (p.formats||[]).forEach(f=>{ if(f.cw==null)f.cw=1.5; if(!f.cc)f.cc='nera'; if(f.central==null)f.central=false; if(!f.tipo)f.tipo=fmtTipo(f); if(f.prezzo==null)f.prezzo=0; });
    (p.walls||[]).forEach(w=>{ if(!w.counts)w.counts={}; if(!w.countsH)w.countsH={}; });
    if(!Array.isArray(p.photoPool))p.photoPool=[];
    if(!Array.isArray(p.proposte))p.proposte=[];
    if(p.showPhotos==null)p.showPhotos=false;
    if(p.photoSeed==null)p.photoSeed=0;
  });
}
function loadStore(){
  store=(window.Persist && Persist.getLoaded()) || null;
  if(!store || !Array.isArray(store.projects) || !store.projects.length){
    store={projects:[demoProject()], currentId:null};
  }
  migrateStore();
  P=store.projects.find(p=>p.id===store.currentId) || store.projects[0];
  store.currentId=P.id;
  if(window.Persist) Persist.attach(store);
}

/* ── palette per formato (rank per area) ── */
const FMT_PALETTE=['#c0a060','#b9a575','#beb498','#cac6c0','#d6d4d0','#c9b9a2','#b5ada0','#ddd8d0','#cfc2ae','#c4bdb2'];
function fmtColor(fmtId){
  const sorted=[...P.formats].sort((a,b)=>(b.w*b.h)-(a.w*a.h));
  const i=sorted.findIndex(f=>f.id===fmtId);
  return FMT_PALETTE[Math.max(0,i)%FMT_PALETTE.length];
}
function wallTotal(w){ return P.formats.reduce((a,f)=>a+((w.counts&&w.counts[f.id])||0)+((w.countsH&&w.countsH[f.id])||0),0); }

/* ── layout ── */
function recompute(){ layouts={}; P.walls.forEach(w=>{ layouts[w.id]=layoutWall(w,P.formats,P); }); if(typeof assignPhotos==='function') assignPhotos(); }

/* ── rendering cornici (px) ── */
function shade(hex,pct){ const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255; const t=pct<0?0:255,p=Math.abs(pct)/100; r=Math.round((t-r)*p+r); g=Math.round((t-g)*p+g); b=Math.round((t-b)*p+b); return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); }

function makeFrameEl(p, s, showLabel, num){
  const f=p.fmt, e=fmtEff(f);
  const color=fmtColor(f.id);
  const ppPx=Math.max(0, e.pp*s);
  const fw= e.cw<=0 ? 0 : Math.max(1.2, e.cw*s);
  const isWhite=e.cc==='bianca';
  const frameBg=isWhite?'linear-gradient(135deg,#ffffff,#ece7db)':'linear-gradient(135deg,#3a3632,#1b1815)';
  const frameRing=isWhite?'0 0 0 .6px rgba(92,90,86,.42)':'0 0 0 .5px rgba(0,0,0,.45)';
  const el=document.createElement('div');
  el.className='cfrm';
  el.title=`${f.name}${p.rot?' (orizzontale)':' (verticale)'} — ${TIPO_NAMES[e.tipo]||''} — da sinistra ${p.x.toFixed(0)} cm · dall'alto ${p.y.toFixed(0)} cm`;
  const grad=`linear-gradient(150deg,${shade(color,12)},${color} 45%,${shade(color,-10)})`;
  const wantPhoto=((typeof forcePhotos!=='undefined'&&forcePhotos)||P.showPhotos);
  const pc=(typeof photoCache!=='undefined')?photoCache:{};
  const photoSrc=(wantPhoto&&p.photoId&&pc[p.photoId])?pc[p.photoId]:null;
  const innerBg=photoSrc?'#cfc8bb':grad;
  const innerContent=photoSrc
    ? `<img src="${photoSrc}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`
    : (showLabel?`<span style="font-family:var(--sans);font-size:6px;color:rgba(40,30,18,.45);letter-spacing:.3px;">${f.name}</span>`:'');
  const photoBlock=`<div style="width:100%;height:100%;background:${innerBg};box-shadow:inset 0 0 0 .5px rgba(0,0,0,.18),inset 0 1px 4px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center;overflow:hidden;">${innerContent}</div>`;
  const base=`position:absolute;left:${(p.x*s).toFixed(1)}px;top:${(p.y*s).toFixed(1)}px;width:${(p.w*s).toFixed(1)}px;height:${(p.h*s).toFixed(1)}px;z-index:2;`;
  if(e.tipo==='cornice_pp'){
    el.style.cssText=base+`background:${frameBg};padding:${fw}px;box-shadow:${frameRing};`;
    el.innerHTML=`<div style="width:100%;height:100%;background:var(--mat);padding:${ppPx.toFixed(1)}px;box-shadow:inset 0 1px 3px rgba(60,45,25,.28),inset 0 0 0 .5px rgba(0,0,0,.12);">${photoBlock}</div>`;
  } else if(e.tipo==='cornice'){
    el.style.cssText=base+`background:${frameBg};padding:${fw}px;box-shadow:${frameRing};`;
    el.innerHTML=photoBlock;
  } else if(e.tipo==='tela'){
    /* tela/canvas: niente cornice, leggero spessore "gallery wrap" */
    el.style.cssText=base+`background:#111;padding:0;box-shadow:0 0 0 .5px rgba(0,0,0,.3), 2.5px 3px 5px -2px rgba(22,18,14,.5), inset 0 0 0 1px rgba(255,255,255,.05);`;
    el.innerHTML=photoBlock;
  } else { /* pannello: stampa diretta, piatta, bordo sottile */
    el.style.cssText=base+`background:#fff;padding:0;box-shadow:0 0 0 .5px rgba(0,0,0,.32), 0 1px 2px rgba(22,18,14,.3);`;
    el.innerHTML=photoBlock;
  }
  if(num!=null){
    const b=document.createElement('span');
    b.style.cssText='position:absolute;top:-7px;left:-7px;min-width:15px;height:15px;border-radius:50%;background:#9c7a45;color:#fff;font-family:var(--sans);font-size:8.5px;font-weight:600;display:flex;align-items:center;justify-content:center;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,.4);';
    b.textContent=num;
    el.appendChild(b);
  }
  return el;
}

function wallScale(w){ return Math.min(2, 1160/w.w); }

/* ombra di sospensione, su un layer SOTTO tutte le cornici: così l'ombra
   non sporca mai il passepartout o la cornice vicina */
function makeFrameShadow(p, s){
  const el=document.createElement('div'); el.className='frame-shadow';
  el.style.cssText=`position:absolute;left:${(p.x*s).toFixed(1)}px;top:${(p.y*s).toFixed(1)}px;width:${(p.w*s).toFixed(1)}px;height:${(p.h*s).toFixed(1)}px;z-index:1;background:transparent;box-shadow:0 5px 9px -3px rgba(22,18,14,.26);`;
  return el;
}

function makeDimArrow(wall,s){ const W=wall.w*s; const d=document.createElement('div'); d.className='dim-arrow'; d.style.width=W+'px'; d.innerHTML=`<div class="cap"></div><div class="cap r"></div><div class="line"></div><div class="dval">${wall.w} cm</div>`; return d; }
function makeRuler(wall,s){
  const W=wall.w*s; const r=document.createElement('div'); r.className='ruler'; r.style.width=W+'px';
  let html='<div class="rline"></div>';
  for(let cm=0;cm<=wall.w;cm+=50){ const x=cm*s; const major=(cm%100===0); html+=`<div class="tick ${major?'major':''}" style="left:${x.toFixed(1)}px;"></div>`; if(major) html+=`<div class="tlab" style="left:${x.toFixed(1)}px;">${cm===0?'0':cm+' cm'}</div>`; }
  html+=`<div class="tick major" style="left:${W.toFixed(1)}px;"></div><div class="tlab" style="left:${W.toFixed(1)}px;">${wall.w} cm</div>`;
  r.innerHTML=html; return r;
}

function renderCanvas(wall, layout, opts){
  const o=opts||{};
  const s=o.scale||wallScale(wall);
  const W=wall.w*s, H=wall.h*s;
  const cvs=document.createElement('div'); cvs.className='wall-canvas'; cvs.style.cssText=`width:${W.toFixed(0)}px;height:${H.toFixed(0)}px;`;
  if(P.structure==='cost' && !o.numbered) layout.lines.forEach(cy=>{ const g=document.createElement('div'); g.className='registro'; g.style.top=(cy*s).toFixed(1)+'px'; cvs.appendChild(g); });
  const list=o.numbered? montaggioOrder(layout.placed) : layout.placed;
  list.forEach(p=>{ cvs.appendChild(makeFrameShadow(p,s)); });
  list.forEach((p,i)=>{ cvs.appendChild(makeFrameEl(p,s,!o.numbered,o.numbered?(i+1):null)); });
  const dim=document.createElement('div'); dim.className='dimcorner'; dim.textContent=`${wall.w} × ${wall.h} cm`; cvs.appendChild(dim);
  return cvs;
}
function montaggioOrder(placed){ return [...placed].sort((a,b)=> (Math.round(a.y/12)-Math.round(b.y/12)) || (a.x-b.x)); }

/* ── render pareti (tab Composizione) ── */
function mixLabel(w){
  const parts=P.formats.filter(f=>((w.counts&&w.counts[f.id])||0)+((w.countsH&&w.countsH[f.id])||0)>0).map(f=>{
    const v=(w.counts&&w.counts[f.id])||0, h=(w.countsH&&w.countsH[f.id])||0;
    return `<b>${v+h}×</b> ${f.name}${(v&&h)?` <small>(${v}v·${h}o)</small>`:''}`;
  });
  return parts.length? parts.join(' · ')+` &nbsp;—&nbsp; <b>${wallTotal(w)} cornici</b>` : '<b>0 cornici</b> — imposta le quantità in Impostazioni';
}

function renderWalls(){
  const stack=document.getElementById('wallsStack'); stack.innerHTML='';
  P.walls.forEach((wall,wi)=>{
    const s=wallScale(wall);
    const lay=layouts[wall.id];
    const block=document.createElement('div'); block.className='wall-block';
    const head=document.createElement('div'); head.className='wall-head';
    const warn=lay.unplaced.length? `<span class="wwarn">⚠ ${lay.unplaced.length} non posizionate — riduci quantità o spaziatura</span>`:'';
    head.innerHTML=`<span class="wk">${wall.name} — ${wall.w} cm${wall.note?`<em>${wall.note}</em>`:''}</span><span class="wmix">${mixLabel(wall)}</span>${warn}`;
    const btn=document.createElement('button'); btn.className='wall-mini'; btn.textContent='↻ rigenera parete';
    btn.onclick=()=>{ wall.seed=randomSeed(); refresh(); };
    head.appendChild(btn);
    block.appendChild(head);
    block.appendChild(makeDimArrow(wall,s));
    block.appendChild(renderCanvas(wall,lay,{scale:s}));
    block.appendChild(makeRuler(wall,s));
    stack.appendChild(block);
  });
  renderLegend();
  updateCode();
}

function renderLegend(){
  const lg=document.getElementById('legend'); lg.innerHTML='';
  P.formats.forEach(f=>{
    const sp=document.createElement('span');
    const e=fmtEff(f);
    let det=TIPO_SHORT[e.tipo]||'';
    if(e.tipo==='cornice_pp') det+=` ${fmtNum(e.cw)} cm ${e.cc==='bianca'?'bianca':'nera'} · pp ${fmtNum(e.pp)}`;
    else if(e.tipo==='cornice') det+=` ${fmtNum(e.cw)} cm ${e.cc==='bianca'?'bianca':'nera'}`;
    if(+f.prezzo>0) det+=` · €${fmtNum(f.prezzo)}`;
    sp.innerHTML=`<i style="background:${fmtColor(f.id)};"></i> ${f.name} cm <small>(${det})${f.central?' · <b style="color:var(--brass)">centrale</b>':''}</small>`;
    lg.appendChild(sp);
  });
  if(P.structure==='cost'){ const sp=document.createElement('span'); sp.innerHTML='<i style="background:rgba(156,122,69,.35);"></i> Registro di sospensione'; lg.appendChild(sp); }
}

/* ── controlli ── */
function ordWord(o){ if(o<0.2)return'Molto libero'; if(o<0.42)return'Morbido'; if(o<0.62)return'Equilibrato'; if(o<0.82)return'Cadenzato'; return'Rigoroso'; }
function codeString(){ return P.walls.map((w,i)=>wallLetter(i)+w.seed).join('-'); }
function updateCode(){ const el=document.getElementById('seedCode'); if(el) el.value=codeString(); }

function renderControls(){
  document.querySelectorAll('.struct-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.s===P.structure); });
  const isCost=P.structure==='cost';
  document.getElementById('ordGroup').style.display=isCost?'flex':'none';
  document.getElementById('ordSlider').value=Math.round(P.ord*100);
  document.getElementById('ordVal').textContent=ordWord(P.ord);
  document.getElementById('gapSlider').value=P.gap;
  document.getElementById('gapVal').textContent=P.gap+' cm';
  document.getElementById('chkOrient').checked=P.orient;
  const cp=document.getElementById('chkPhotos'); if(cp) cp.checked=!!P.showPhotos;
}

function refresh(){ recompute(); renderControls(); renderWalls(); saveStore(); tabsDirty(); }

function regenerateAll(){ P.walls.forEach(w=>{ w.seed=randomSeed(); }); refresh(); }
function applyCode(){
  const v=document.getElementById('seedCode').value.trim();
  const parts=v.split('-');
  if(parts.length!==P.walls.length || parts.some(p=>!/^[A-Za-z]\d+$/.test(p))){ alert('Formato non valido. Esempio: '+P.walls.map((w,i)=>wallLetter(i)+'123').join('-')); return; }
  parts.forEach((p,i)=>{ P.walls[i].seed=parseInt(p.slice(1),10); });
  refresh();
}

/* ── barra progetti ── */
function renderProjectBar(){
  const sel=document.getElementById('projSelect'); sel.innerHTML='';
  store.projects.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; if(p.id===P.id)o.selected=true; sel.appendChild(o); });
}
function switchProject(id){
  const p=store.projects.find(x=>x.id===id); if(!p) return;
  P=p; store.currentId=id;
  renderProjectBar(); renderSettings(); refresh();
}
function newProject(){
  const name=prompt('Nome del nuovo progetto:','Nuovo cliente'); if(name==null) return;
  const p=emptyProject(name.trim()||'Nuovo progetto'); store.projects.push(p); switchProject(p.id);
  document.getElementById('settingsBox').open=true;
}
function dupProject(){
  const p=JSON.parse(JSON.stringify(P)); p.id=uid('p'); p.name=P.name+' (copia)';
  store.projects.push(p); switchProject(p.id);
}
function renProject(){
  const name=prompt('Nuovo nome del progetto:',P.name); if(name==null||!name.trim()) return;
  P.name=name.trim(); renderProjectBar(); saveStore();
}
function delProject(){
  if(store.projects.length<=1){ alert('È l\'unico progetto: creane un altro prima di eliminarlo.'); return; }
  if(!confirm(`Eliminare definitivamente «${P.name}»?`)) return;
  store.projects=store.projects.filter(p=>p.id!==P.id);
  switchProject(store.projects[0].id);
}

/* ── pannello impostazioni ── */
function numInput(val,min,max,step,onch,wpx){
  const i=document.createElement('input'); i.type='number'; i.value=val; i.min=min; i.max=max; i.step=step||1; i.className='mini-num'; if(wpx)i.style.width=wpx+'px';
  i.addEventListener('change',()=>{ let v=parseFloat(i.value); if(isNaN(v))v=min; v=Math.max(min,Math.min(max,v)); i.value=v; onch(v); });
  return i;
}
function textInput(val,onch,wpx){
  const i=document.createElement('input'); i.type='text'; i.value=val; i.className='mini-txt'; if(wpx)i.style.width=wpx+'px';
  i.addEventListener('change',()=>{ onch(i.value.trim()); });
  return i;
}
function selectInput(val,options,onch,wpx){
  const s=document.createElement('select'); s.className='mini-sel'; if(wpx)s.style.width=wpx+'px';
  options.forEach(o=>{ const op=document.createElement('option'); op.value=o.v; op.textContent=o.t; if(o.v===val)op.selected=true; s.appendChild(op); });
  s.addEventListener('change',()=>onch(s.value));
  return s;
}
function checkCell(checked,onch){
  const l=document.createElement('label'); l.className='mini-cl';
  const i=document.createElement('input'); i.type='checkbox'; i.checked=!!checked;
  i.addEventListener('change',()=>onch(i.checked));
  l.appendChild(i);
  return l;
}

function renderSettings(){
  /* pareti */
  const wt=document.getElementById('wallsEditor'); wt.innerHTML='';
  P.walls.forEach((w,wi)=>{
    const row=document.createElement('div'); row.className='ed-row';
    row.appendChild(textInput(w.name,v=>{ w.name=v||('Parete '+wallLetter(wi)); refresh(); renderSettings(); },110));
    const lw=document.createElement('span'); lw.className='ed-lab'; lw.textContent='L'; row.appendChild(lw);
    row.appendChild(numInput(w.w,40,1200,1,v=>{ w.w=v; refresh(); },62));
    const lh=document.createElement('span'); lh.className='ed-lab'; lh.textContent='H'; row.appendChild(lh);
    row.appendChild(numInput(w.h,40,600,1,v=>{ w.h=v; refresh(); },62));
    row.appendChild(textInput(w.note||'',v=>{ w.note=v; refresh(); },150));
    const del=document.createElement('button'); del.className='ed-del'; del.textContent='✕'; del.title='Rimuovi parete';
    del.onclick=()=>{ if(P.walls.length<=1){alert('Serve almeno una parete.');return;} if(!confirm(`Rimuovere ${w.name}?`))return; P.walls=P.walls.filter(x=>x.id!==w.id); renderSettings(); refresh(); };
    row.appendChild(del);
    wt.appendChild(row);
  });
  const addW=document.createElement('button'); addW.className='ed-add'; addW.textContent='+ aggiungi parete';
  addW.onclick=()=>{ P.walls.push({id:uid('w'),name:'Parete '+wallLetter(P.walls.length),note:'',w:200,h:160,seed:randomSeed(),photo:null,photoRatio:0.75,corners:null,counts:{},countsH:{}}); renderSettings(); refresh(); };
  wt.appendChild(addW);

  /* formati */
  const ft=document.getElementById('formatsEditor'); ft.innerHTML='';
  const fh=document.createElement('div'); fh.className='ed-row ed-head';
  fh.innerHTML='<span style="width:84px;">Nome</span><span style="width:96px;">Tipo</span><span style="width:48px;">Foto L</span><span style="width:48px;">Foto H</span><span style="width:46px;">Passep.</span><span style="width:46px;">Cornice</span><span style="width:56px;">Colore</span><span style="width:58px;">€ cad.</span><span style="width:46px;">Centro</span>';
  ft.appendChild(fh);
  const TIPO_OPTS=[{v:'cornice_pp',t:'Cornice + pp'},{v:'cornice',t:'Cornice'},{v:'pannello',t:'Pannello'},{v:'tela',t:'Tela'}];
  P.formats.forEach(f=>{
    const row=document.createElement('div'); row.className='ed-row';
    const e=fmtEff(f);
    row.appendChild(textInput(f.name,v=>{ f.name=v||(f.w+'×'+f.h); refresh(); renderSettings(); },84));
    row.appendChild(selectInput(fmtTipo(f),TIPO_OPTS,v=>{ f.tipo=v; refresh(); renderSettings(); },96));
    row.appendChild(numInput(f.w,5,200,0.5,v=>{ f.w=v; refresh(); },48));
    row.appendChild(numInput(f.h,5,200,0.5,v=>{ f.h=v; refresh(); },48));
    const ppIn=numInput(f.pp,0,15,0.5,v=>{ f.pp=v; refresh(); },46); if(!e.hasFrame||e.tipo!=='cornice_pp'){ ppIn.disabled=true; ppIn.style.opacity=.4; } row.appendChild(ppIn);
    const cwIn=numInput(f.cw==null?1.5:f.cw,0,15,0.5,v=>{ f.cw=v; refresh(); },46); if(!e.hasFrame){ cwIn.disabled=true; cwIn.style.opacity=.4; } row.appendChild(cwIn);
    const ccIn=selectInput(f.cc||'nera',[{v:'nera',t:'Nera'},{v:'bianca',t:'Bianca'}],v=>{ f.cc=v; refresh(); },56); if(!e.hasFrame){ ccIn.disabled=true; ccIn.style.opacity=.4; } row.appendChild(ccIn);
    row.appendChild(numInput(f.prezzo==null?0:f.prezzo,0,100000,1,v=>{ f.prezzo=v; refresh(); renderCountTotals(); },58));
    row.appendChild(checkCell(f.central,v=>{ f.central=v; refresh(); }));
    const sw=document.createElement('i'); sw.className='ed-sw'; sw.style.background=fmtColor(f.id); row.appendChild(sw);
    const del=document.createElement('button'); del.className='ed-del'; del.textContent='✕'; del.title='Rimuovi formato';
    del.onclick=()=>{ if(P.formats.length<=1){alert('Serve almeno un formato.');return;} if(!confirm(`Rimuovere il formato ${f.name}?`))return; P.formats=P.formats.filter(x=>x.id!==f.id); P.walls.forEach(w=>{ if(w.counts) delete w.counts[f.id]; if(w.countsH) delete w.countsH[f.id]; }); renderSettings(); refresh(); };
    row.appendChild(del);
    ft.appendChild(row);
  });
  const addF=document.createElement('button'); addF.className='ed-add'; addF.textContent='+ aggiungi formato';
  addF.onclick=()=>{ P.formats.push({id:uid('f'),name:'50×70',w:50,h:70,pp:3,cw:1.5,cc:'nera',central:false,tipo:'cornice_pp',prezzo:0}); renderSettings(); refresh(); };
  ft.appendChild(addF);

  /* quantità: matrice pareti × formati */
  const qt=document.getElementById('countsEditor'); qt.innerHTML='';
  const tbl=document.createElement('table'); tbl.className='counts-tbl';
  let head='<tr><th></th>'+P.formats.map(f=>`<th>${f.name}<br><small style="font-weight:400;letter-spacing:.02em;text-transform:none;color:var(--ink-faint);">vert · orizz</small></th>`).join('')+'<th>Tot</th></tr>';
  tbl.innerHTML=head;
  P.walls.forEach(w=>{
    const tr=document.createElement('tr');
    const td0=document.createElement('td'); td0.textContent=w.name; td0.className='counts-wall'; tr.appendChild(td0);
    P.formats.forEach(f=>{
      const td=document.createElement('td');
      const cell=document.createElement('div'); cell.style.cssText='display:flex;gap:5px;justify-content:center;';
      const vi=numInput((w.counts&&w.counts[f.id])||0,0,200,1,v=>{ if(!w.counts)w.counts={}; w.counts[f.id]=v; refresh(); renderCountTotals(); },42);
      vi.title='Verticali'; vi.style.borderBottom='2px solid var(--brass-dim)';
      const hi=numInput((w.countsH&&w.countsH[f.id])||0,0,200,1,v=>{ if(!w.countsH)w.countsH={}; w.countsH[f.id]=v; refresh(); renderCountTotals(); },42);
      hi.title='Orizzontali'; hi.style.borderBottom='2px dashed var(--brass-dim)';
      cell.appendChild(vi); cell.appendChild(hi);
      td.appendChild(cell);
      tr.appendChild(td);
    });
    const tt=document.createElement('td'); tt.className='counts-tot'; tt.dataset.wid=w.id; tt.textContent=wallTotal(w); tr.appendChild(tt);
    tbl.appendChild(tr);
  });
  qt.appendChild(tbl);
  const prev=document.createElement('div'); prev.id='prevTotalLine'; prev.style.cssText='font-family:var(--sans);font-size:11px;color:var(--ink-soft);margin-top:10px;';
  qt.appendChild(prev);
  renderCountTotals();
  if(typeof renderPhotoSection==='function') renderPhotoSection();
}
function fmtPrice(f){ return Math.max(0, +f.prezzo||0); }
function fmtQty(f){ let q=0; P.walls.forEach(w=>{ q+=((w.counts&&w.counts[f.id])||0)+((w.countsH&&w.countsH[f.id])||0); }); return q; }
function projPriceTotal(){ return P.formats.reduce((t,f)=>t+fmtQty(f)*fmtPrice(f),0); }
function eur(v){ return '€ '+(Math.round(v*100)/100).toLocaleString('it',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function renderCountTotals(){
  document.querySelectorAll('.counts-tot').forEach(td=>{
    const w=P.walls.find(x=>x.id===td.dataset.wid); if(w) td.textContent=wallTotal(w);
  });
  const line=document.getElementById('prevTotalLine');
  if(line){ const tot=projPriceTotal(); const priced=P.formats.some(f=>fmtPrice(f)>0);
    line.innerHTML = priced ? `Totale preventivo (quantità × listino): <b style="color:var(--brass)">${eur(tot)}</b>` : '<span style="color:var(--ink-faint)">Imposta i prezzi (€ cad.) nei formati per vedere il totale del preventivo.</span>'; }
}

/* ── tabs ── */
let dirty={real:true,mont:true,math:true,prop:true};
function tabsDirty(){ dirty={real:true,mont:true,math:true,prop:true}; }
function showTab(id,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='real'&&dirty.real){ buildReal(); dirty.real=false; }
  if(id==='mont'&&dirty.mont){ buildMontaggio(); dirty.mont=false; }
  if(id==='math'&&dirty.math){ buildMath(); dirty.math=false; }
  if(id==='prop'&&typeof renderProposte==='function'){ renderProposte(); dirty.prop=false; }
}

/* ── init ── */
function initUI(){
  loadStore();
  document.getElementById('projSelect').addEventListener('change',e=>switchProject(e.target.value));
  document.querySelectorAll('.struct-btn').forEach(b=>{ b.addEventListener('click',()=>{ P.structure=b.dataset.s; refresh(); }); });
  document.getElementById('ordSlider').addEventListener('input',e=>{ P.ord=(+e.target.value)/100; refresh(); });
  document.getElementById('gapSlider').addEventListener('input',e=>{ P.gap=+e.target.value; refresh(); });
  document.getElementById('chkOrient').addEventListener('change',e=>{ P.orient=e.target.checked; refresh(); });
  renderProjectBar(); renderSettings(); refresh();
}
