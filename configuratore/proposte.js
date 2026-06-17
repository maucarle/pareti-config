/* ════════════════════════════════════════════════════════
   PROPOSTE — configurazioni salvate + esportazione PDF cliente
   richiede engine.js + ui.js + tabs.js
   ════════════════════════════════════════════════════════ */
var forcePhotos = false;

/* ── snapshot/applica configurazione (disposizione) ── */
function snapshotConfig(){
  return {
    structure:P.structure, ord:P.ord, gap:P.gap, orient:P.orient, photoSeed:P.photoSeed,
    seeds:Object.fromEntries(P.walls.map(w=>[w.id,w.seed])),
    central:Object.fromEntries(P.formats.map(f=>[f.id,!!f.central]))
  };
}
function applyConfig(c){
  if(c.structure) P.structure=c.structure;
  if(c.ord!=null) P.ord=c.ord; if(c.gap!=null) P.gap=c.gap; if(c.orient!=null) P.orient=c.orient;
  if(c.photoSeed!=null) P.photoSeed=c.photoSeed;
  if(c.seeds) P.walls.forEach(w=>{ if(c.seeds[w.id]!=null) w.seed=c.seeds[w.id]; });
  if(c.central) P.formats.forEach(f=>{ if(c.central[f.id]!=null) f.central=c.central[f.id]; });
}
function propCode(pr){ return P.walls.map((w,i)=>wallLetter(i)+((pr.seeds&&pr.seeds[w.id])!=null?pr.seeds[w.id]:'?')).join('-'); }

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
  applyConfig(pr); refresh(); renderProposte();
  alert('Proposta «'+pr.name+'» caricata nella Composizione.');
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
  intro.innerHTML='Salva le composizioni che ti piacciono come <b>proposte</b> e generale in un unico <b>PDF</b> da sottoporre al cliente. Ogni proposta conserva la disposizione esatta (struttura, codice, formati centrali). Le foto del cliente caricate appaiono nelle cornici. Se non includi nessuna proposta, il PDF userà la configurazione attualmente mostrata.';
  box.appendChild(intro);

  const bar=document.createElement('div'); bar.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;';
  const save=document.createElement('button'); save.className='btn'; save.innerHTML='★ Salva configurazione attuale'; save.onclick=saveProposta; bar.appendChild(save);
  const pdf=document.createElement('button'); pdf.className='btn';
  pdf.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z"></path></svg> Genera PDF cliente';
  pdf.onclick=generateClientPDF; bar.appendChild(pdf);
  box.appendChild(bar);

  const prs=P.proposte||[];
  if(!prs.length){
    const e=document.createElement('p'); e.className='math-intro';
    e.textContent='Nessuna proposta salvata. Configura una parete che ti piace nella scheda Composizione e premi «Salva configurazione attuale». Puoi comunque premere «Genera PDF cliente» per esportare la configurazione corrente.';
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
    mt.textContent=`${STRUCT_NAMES[pr.structure]||pr.structure} · codice ${propCode(pr)} · ${new Date(pr.date||Date.now()).toLocaleDateString('it')}`;
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

/* ── costruzione pagine PDF ── */
function buildProposalPages(pr){
  const frag=document.createDocumentFragment();
  const walls=P.walls.filter(w=>layouts[w.id] && layouts[w.id].placed.length);
  walls.forEach(w=>{
    const lay=layouts[w.id];
    const page=document.createElement('div'); page.className='pdf-page';
    const ribbon=document.createElement('div'); ribbon.className='pdf-ribbon';
    ribbon.textContent=`${P.name} · ${pr.name} · ${new Date(pr.date||Date.now()).toLocaleDateString('it',{day:'numeric',month:'long',year:'numeric'})}`;
    const wh=document.createElement('div'); wh.className='pdf-wallhead';
    wh.innerHTML=`${w.name} <span>— ${w.w} × ${w.h} cm · ${wallTotal(w)} cornici</span>`;
    const scale=Math.min(3.0, 950/w.w);
    const canvas=renderCanvas(w, lay, {scale});
    const cwrap=document.createElement('div'); cwrap.className='pdf-canvas-wrap'; cwrap.appendChild(canvas);
    const mix=document.createElement('div'); mix.className='pdf-mix'; mix.innerHTML=mixLabel(w);
    page.appendChild(ribbon); page.appendChild(wh); page.appendChild(cwrap); page.appendChild(mix);
    frag.appendChild(page);
  });
  return frag;
}

function generateClientPDF(){
  const doc=document.getElementById('printDoc'); if(!doc) return;
  const incl=(P.proposte||[]).filter(p=>p.include!==false);
  const snap=snapshotConfig();
  doc.innerHTML='';
  forcePhotos=true;
  const renderList = incl.length ? incl : [Object.assign({name:'Configurazione attuale', date:Date.now()}, snap)];
  renderList.forEach(pr=>{ applyConfig(pr); recompute(); doc.appendChild(buildProposalPages(pr)); });
  // ripristina lo stato visibile
  forcePhotos=false;
  applyConfig(snap); refresh();
  document.body.classList.add('printing-client');
  setTimeout(()=>window.print(), 60);
}

function initProposte(){
  window.addEventListener('afterprint',()=>document.body.classList.remove('printing-client'));
}
