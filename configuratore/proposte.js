/* ════════════════════════════════════════════════════════
   PROPOSTE — configurazioni salvate + esportazione PDF cliente
   richiede engine.js + ui.js + tabs.js
   ════════════════════════════════════════════════════════ */
var forcePhotos = false;

/* ── snapshot/applica configurazione — OFFERTA COMPLETA ──
   Una proposta congela non solo la disposizione (struttura, seed) ma anche
   formati (con tipo e prezzo) e quantità per parete: così due proposte possono
   avere supporti e preventivi diversi. Le proposte vecchie (senza formats/counts)
   restano valide e usano i formati correnti del progetto (retro-compatibilità). */
function snapshotConfig(){
  return {
    structure:P.structure, ord:P.ord, gap:P.gap, orient:P.orient, photoSeed:P.photoSeed,
    seeds:Object.fromEntries(P.walls.map(w=>[w.id,w.seed])),
    formats: P.formats.map(f=>Object.assign({},f)),
    counts:  Object.fromEntries(P.walls.map(w=>[w.id, Object.assign({}, w.counts||{})])),
    countsH: Object.fromEntries(P.walls.map(w=>[w.id, Object.assign({}, w.countsH||{})])),
  };
}
function applyConfig(c){
  if(c.structure) P.structure=c.structure;
  if(c.ord!=null) P.ord=c.ord; if(c.gap!=null) P.gap=c.gap; if(c.orient!=null) P.orient=c.orient;
  if(c.photoSeed!=null) P.photoSeed=c.photoSeed;
  if(c.seeds) P.walls.forEach(w=>{ if(c.seeds[w.id]!=null) w.seed=c.seeds[w.id]; });
  if(Array.isArray(c.formats)) P.formats=c.formats.map(f=>Object.assign({},f));
  if(c.counts)  P.walls.forEach(w=>{ if(c.counts[w.id])  w.counts =Object.assign({}, c.counts[w.id]); });
  if(c.countsH) P.walls.forEach(w=>{ if(c.countsH[w.id]) w.countsH=Object.assign({}, c.countsH[w.id]); });
  if(c.central) P.formats.forEach(f=>{ if(c.central[f.id]!=null) f.central=c.central[f.id]; }); /* retro-compat */
}
function propCode(pr){ return P.walls.map((w,i)=>wallLetter(i)+((pr.seeds&&pr.seeds[w.id])!=null?pr.seeds[w.id]:'?')).join('-'); }
/* statistiche di una proposta (usa i suoi formati/quantità se è un'offerta completa) */
function propStats(pr){
  const full=Array.isArray(pr.formats)&&pr.counts;
  const fmts=full?pr.formats:P.formats;
  let pezzi=0,totale=0;
  P.walls.forEach(w=>{
    const c =full?(pr.counts[w.id]||{}):(w.counts||{});
    const ch=full?((pr.countsH&&pr.countsH[w.id])||{}):(w.countsH||{});
    fmts.forEach(f=>{ const q=(c[f.id]||0)+(ch[f.id]||0); pezzi+=q; totale+=q*Math.max(0,+f.prezzo||0); });
  });
  return {pezzi, totale, priced:fmts.some(f=>+f.prezzo>0)};
}

/* ── salva / carica / rinomina / elimina ── */
function saveProposta(){
  const name=prompt('Nome della proposta da mostrare al cliente:', 'Proposta '+(((P.proposte||[]).length)+1));
  if(name==null) return;
  if(!P.proposte) P.proposte=[];
  P.proposte.push(Object.assign({ id:uid('pr'), name:(name.trim()||'Proposta'), date:Date.now(), include:true }, snapshotConfig()));
  saveStore();
  if(typeof renderProposte==='function') renderProposte();
  alert('Proposta salvata. La trovi nella scheda «Proposte».');
}
function loadProposta(id){
  const pr=(P.proposte||[]).find(x=>x.id===id); if(!pr) return;
  applyConfig(pr); renderSettings(); refresh(); renderProposte();
  alert('Proposta «'+pr.name+'» caricata: disposizione, formati e quantità sono ora nella Composizione (puoi modificarla e ri-salvarla).');
}
function renameProposta(id){
  const pr=(P.proposte||[]).find(x=>x.id===id); if(!pr) return;
  const name=prompt('Nuovo nome della proposta:', pr.name); if(name==null||!name.trim()) return;
  pr.name=name.trim(); saveStore(); renderProposte();
}
function delProposta(id){
  const pr=(P.proposte||[]).find(x=>x.id===id); if(!pr) return;
  if(!confirm('Eliminare la proposta «'+pr.name+'»?')) return;
  P.proposte=(P.proposte||[]).filter(x=>x.id!==id); saveStore(); renderProposte();
}
function toggleProposta(id, on){ const pr=(P.proposte||[]).find(x=>x.id===id); if(pr){ pr.include=on; saveStore(); } }

/* ── scheda Proposte ── */
function renderProposte(){
  const box=document.getElementById('propWrap'); if(!box) return; box.innerHTML='';
  const intro=document.createElement('p'); intro.className='math-intro';
  intro.innerHTML='Salva le composizioni che ti piacciono come <b>proposte</b>, poi genera due tipi di PDF: la <b>Carta dei gusti</b> (più varianti di stile a confronto, senza prezzi, per capire l’orientamento del cliente) e la <b>Proposta commerciale</b> (sulla foto reale della parete, con preventivo e prezzi). Spunta quali proposte includere. Senza proposte incluse, il PDF usa la configurazione attualmente mostrata.';
  box.appendChild(intro);

  const pdfIco='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"></path></svg>';
  const bar=document.createElement('div'); bar.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;';
  const save=document.createElement('button'); save.className='btn'; save.innerHTML='★ Salva configurazione attuale'; save.onclick=saveProposta; bar.appendChild(save);
  const pdfG=document.createElement('button'); pdfG.className='btn'; pdfG.innerHTML=pdfIco+' Carta dei gusti'; pdfG.onclick=generateTasteCard; bar.appendChild(pdfG);
  const pdfC=document.createElement('button'); pdfC.className='btn'; pdfC.innerHTML=pdfIco+' Proposta commerciale'; pdfC.onclick=generateCommercialPDF; bar.appendChild(pdfC);
  box.appendChild(bar);

  const prs=P.proposte||[];
  if(!prs.length){
    const e=document.createElement('p'); e.className='math-intro';
    e.textContent='Nessuna proposta salvata. Configura una parete che ti piace nella scheda Composizione e premi «Salva configurazione attuale». Puoi comunque generare i PDF (Carta dei gusti / Proposta commerciale) dalla configurazione corrente.';
    box.appendChild(e); return;
  }
  const list=document.createElement('div'); list.style.cssText='display:flex;flex-direction:column;gap:12px;';
  prs.forEach(pr=>{
    const card=document.createElement('div'); card.className='prop-card';
    const left=document.createElement('div'); left.style.cssText='flex:1;min-width:0;';
    const inc=document.createElement('label'); inc.className='prop-inc';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=pr.include!==false;
    cb.onchange=()=>toggleProposta(pr.id, cb.checked);
    inc.appendChild(cb); inc.appendChild(document.createTextNode(' includi nel PDF'));
    const nm=document.createElement('div'); nm.className='prop-name'; nm.textContent=pr.name;
    const mt=document.createElement('div'); mt.className='prop-meta';
    const st=propStats(pr);
    const full=Array.isArray(pr.formats)&&pr.counts;
    mt.textContent=`${STRUCT_NAMES[pr.structure]||pr.structure} · ${st.pezzi} pezzi${st.priced?' · '+eur(st.totale):''}${full?'':' · (solo disposizione)'} · ${new Date(pr.date||Date.now()).toLocaleDateString('it')}`;
    left.appendChild(inc); left.appendChild(nm); left.appendChild(mt);
    const acts=document.createElement('div'); acts.className='prop-acts';
    const bL=document.createElement('button'); bL.className='wall-mini'; bL.textContent='Carica'; bL.onclick=()=>loadProposta(pr.id);
    const bR=document.createElement('button'); bR.className='wall-mini'; bR.textContent='Rinomina'; bR.onclick=()=>renameProposta(pr.id);
    const bD=document.createElement('button'); bD.className='wall-mini'; bD.textContent='Elimina'; bD.onclick=()=>delProposta(pr.id);
    acts.appendChild(bL); acts.appendChild(bR); acts.appendChild(bD);
    card.appendChild(left); card.appendChild(acts);
    list.appendChild(card);
  });
  box.appendChild(list);
}

/* ── etichetta di stile (per la carta dei gusti) ── */
function styleLabel(pr){
  if(pr.structure==='cost') return 'Costellazione · '+ordWord(pr.ord!=null?pr.ord:P.ord);
  return STRUCT_NAMES[pr.structure]||pr.structure||'';
}
function pdfDate(pr){ return new Date(pr.date||Date.now()).toLocaleDateString('it',{day:'numeric',month:'long',year:'numeric'}); }
function cleanScale(w){ return Math.min(6, 1240/w.w, 900/w.h); }

/* ══ CARTA DEI GUSTI — confronto di stile, mockup grande, niente prezzi ══ */
function buildGustiPages(pr){
  const frag=document.createDocumentFragment();
  const walls=P.walls.filter(w=>layouts[w.id] && layouts[w.id].placed.length);
  walls.forEach(w=>{
    const lay=layouts[w.id];
    const page=document.createElement('div'); page.className='pdf-page';
    const ribbon=document.createElement('div'); ribbon.className='pdf-ribbon';
    ribbon.textContent=`${P.name} · Carta dei gusti · ${pdfDate(pr)}`;
    const wh=document.createElement('div'); wh.className='pdf-wallhead';
    wh.innerHTML=`${pr.name} <span>— ${w.name} · ${w.w} × ${w.h} cm</span>`;
    const stl=document.createElement('div'); stl.className='pdf-stile'; stl.textContent=styleLabel(pr);
    const cwrap=document.createElement('div'); cwrap.className='pdf-canvas-wrap'; cwrap.appendChild(renderCanvas(w, lay, {scale:cleanScale(w)}));
    const mix=document.createElement('div'); mix.className='pdf-mix'; mix.innerHTML=mixLabel(w);
    page.appendChild(ribbon); page.appendChild(wh); page.appendChild(stl); page.appendChild(cwrap); page.appendChild(mix);
    frag.appendChild(page);
  });
  return frag;
}

/* ── mockup proiettato sulla foto reale della parete (omografia) ── */
function buildProjectedMockup(wall, lay, dispW){
  const ratio=wall.photoRatio||0.75; const dispH=dispW/ratio;
  const wrap=document.createElement('div'); wrap.className='photo-wrap'; wrap.style.cssText=`width:${dispW}px;height:${dispH.toFixed(0)}px;`;
  const img=document.createElement('img'); img.src=wall.photo; img.alt=wall.name; wrap.appendChild(img);
  const c=wall.corners||defaultCorners();
  const s=2, W=wall.w*s, H=wall.h*s;
  const grid=document.createElement('div'); grid.className='ovl-grid'; grid.style.cssText=`width:${W}px;height:${H}px;`;
  lay.placed.forEach(p=>grid.appendChild(makeFrameShadow(p,s)));
  lay.placed.forEach(p=>grid.appendChild(makeFrameEl(p,s,false,null)));
  wrap.appendChild(grid);
  const toPx=pt=>[pt[0]*dispW, pt[1]*dispH];
  grid.style.transform=projectMatrix(W,H,{tl:toPx(c.tl),tr:toPx(c.tr),br:toPx(c.br),bl:toPx(c.bl)});
  return wrap;
}

/* ══ PROPOSTA COMMERCIALE — su foto reale + preventivo con prezzi ══ */
function buildCommercialPages(pr){
  const frag=document.createDocumentFragment();
  const walls=P.walls.filter(w=>layouts[w.id] && layouts[w.id].placed.length);
  walls.forEach(w=>{
    const lay=layouts[w.id];
    const page=document.createElement('div'); page.className='pdf-page';
    const ribbon=document.createElement('div'); ribbon.className='pdf-ribbon';
    ribbon.textContent=`${P.name} · ${pr.name} · ${pdfDate(pr)}`;
    const wh=document.createElement('div'); wh.className='pdf-wallhead';
    wh.innerHTML=`${w.name} <span>— ${w.w} × ${w.h} cm · ${wallTotal(w)} pezzi</span>`;
    const cwrap=document.createElement('div'); cwrap.className='pdf-canvas-wrap';
    if(w.photo){ const dispW=Math.min(1100, Math.round(900*(w.photoRatio||0.75))); cwrap.appendChild(buildProjectedMockup(w, lay, dispW)); }
    else { cwrap.appendChild(renderCanvas(w, lay, {scale:cleanScale(w)})); }
    const mix=document.createElement('div'); mix.className='pdf-mix'; mix.innerHTML=mixLabel(w);
    page.appendChild(ribbon); page.appendChild(wh); page.appendChild(cwrap); page.appendChild(mix);
    frag.appendChild(page);
  });
  frag.appendChild(buildPreventivoPage(pr));
  return frag;
}

function buildPreventivoPage(pr){
  const page=document.createElement('div'); page.className='pdf-page';
  const ribbon=document.createElement('div'); ribbon.className='pdf-ribbon'; ribbon.textContent=`${P.name} · ${pr.name} · Preventivo`;
  const wh=document.createElement('div'); wh.className='pdf-wallhead'; wh.innerHTML=`Preventivo <span>— ${P.name}</span>`;
  let rows='', tot=0, anyPrice=false;
  P.formats.forEach(f=>{ const q=fmtQty(f); if(!q) return; const pz=fmtPrice(f); const sub=q*pz; tot+=sub; if(pz)anyPrice=true;
    rows+=`<tr><td>${f.name} cm</td><td>${TIPO_SHORT[fmtTipo(f)]}</td><td>${q}</td><td>${pz?eur(pz):'—'}</td><td>${pz?eur(sub):'—'}</td></tr>`; });
  const wrap=document.createElement('div'); wrap.className='pdf-prev-wrap';
  wrap.innerHTML=`<table class="pdf-prev"><tr><th>Formato</th><th>Supporto</th><th>Q.tà</th><th>Prezzo cad.</th><th>Subtotale</th></tr>${rows}`+
    `<tr class="pdf-prev-tot"><td colspan="4">Totale</td><td>${eur(tot)}</td></tr></table>`+
    (anyPrice?'':'<div class="pdf-mix">Imposta i prezzi (€ cad.) nei formati per completare il preventivo.</div>');
  page.appendChild(ribbon); page.appendChild(wh); page.appendChild(wrap);
  return page;
}

/* ── generatore comune ── */
function generatePDF(builder){
  const doc=document.getElementById('printDoc'); if(!doc) return;
  const incl=(P.proposte||[]).filter(p=>p.include!==false);
  const snap=snapshotConfig();
  doc.innerHTML=''; forcePhotos=true;
  const renderList = incl.length ? incl : [Object.assign({name:'Configurazione attuale', date:Date.now()}, snap)];
  renderList.forEach(pr=>{ applyConfig(pr); recompute(); doc.appendChild(builder(pr)); });
  forcePhotos=false; applyConfig(snap); refresh();
  document.body.classList.add('printing-client');
  setTimeout(()=>window.print(), 60);
}
function generateTasteCard(){ generatePDF(buildGustiPages); }
function generateCommercialPDF(){ generatePDF(buildCommercialPages); }
function generateClientPDF(){ generateTasteCard(); } /* compat */

function initProposte(){
  window.addEventListener('afterprint',()=>document.body.classList.remove('printing-client'));
}
