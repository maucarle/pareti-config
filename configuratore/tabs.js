/* ════════════════════════════════════════════════════════
   TABS — anteprima reale, scheda di montaggio, analisi
   richiede engine.js + ui.js
   ════════════════════════════════════════════════════════ */

/* ── proiezione prospettica (omografia) ── */
function adj(m){ return [ m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4], m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5], m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3] ]; }
function multmm(a,b){ const c=[]; for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=a[3*i+k]*b[3*k+j];c[3*i+j]=s;} return c; }
function multmv(m,v){ return [ m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2] ]; }
function basisToPoints(x1,y1,x2,y2,x3,y3,x4,y4){ const m=[x1,x2,x3, y1,y2,y3, 1,1,1]; const v=multmv(adj(m),[x4,y4,1]); return multmm(m,[v[0],0,0, 0,v[1],0, 0,0,v[2]]); }
function general2DProjection(s,d){ return multmm(basisToPoints(d[0],d[1],d[2],d[3],d[4],d[5],d[6],d[7]), adj(basisToPoints(s[0],s[1],s[2],s[3],s[4],s[5],s[6],s[7]))); }
function projectMatrix(w,h,c){ const t=general2DProjection([0,0, w,0, 0,h, w,h],[c.tl[0],c.tl[1], c.tr[0],c.tr[1], c.bl[0],c.bl[1], c.br[0],c.br[1]]); for(let i=0;i<9;i++) t[i]=t[i]/t[8]; const m=[t[0],t[3],0,t[6], t[1],t[4],0,t[7], 0,0,1,0, t[2],t[5],0,t[8]]; return 'matrix3d('+m.join(',')+')'; }

const DISP_W=384;
let calibMode=false;

function defaultCorners(){ return {tl:[0.12,0.18],tr:[0.88,0.18],br:[0.85,0.66],bl:[0.15,0.66]}; }

function uploadWallPhoto(wall){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{
    const file=inp.files&&inp.files[0]; if(!file) return;
    const rd=new FileReader();
    rd.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const maxSide=1400;
        const k=Math.min(1, maxSide/Math.max(img.width,img.height));
        const cw=Math.round(img.width*k), ch=Math.round(img.height*k);
        const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
        cv.getContext('2d').drawImage(img,0,0,cw,ch);
        wall.photo=cv.toDataURL('image/jpeg',0.78);
        wall.photoRatio=cw/ch;
        if(!wall.corners) wall.corners=defaultCorners();
        saveStore(); buildReal();
      };
      img.src=rd.result;
    };
    rd.readAsDataURL(file);
  };
  inp.click();
}

function buildReal(){
  const stage=document.getElementById('realStage'); stage.innerHTML='';
  document.getElementById('calibHint').classList.toggle('show',calibMode);
  P.walls.forEach(wall=>{
    const card=document.createElement('div'); card.className='real-card';
    const head=document.createElement('div'); head.className='rc-head';
    head.innerHTML=`<span class="rc-wall">${wall.name} — ${wall.w} cm</span><span class="rc-meta">${wallTotal(wall)} cornici</span>`;
    card.appendChild(head);

    const ratio=wall.photoRatio||0.75;
    const dispH=DISP_W/ratio;
    const wrap=document.createElement('div'); wrap.className='photo-wrap'; wrap.style.cssText=`width:${DISP_W}px;height:${dispH.toFixed(0)}px;`;

    if(!wall.photo){
      wrap.classList.add('empty');
      const ph=document.createElement('div'); ph.className='photo-empty';
      ph.innerHTML='<span>Nessuna foto della parete</span>';
      const b=document.createElement('button'); b.className='btn ghost'; b.textContent='Carica foto';
      b.onclick=()=>uploadWallPhoto(wall);
      ph.appendChild(b); wrap.appendChild(ph);
      card.appendChild(wrap); stage.appendChild(card);
      return;
    }

    const img=document.createElement('img'); img.src=wall.photo; img.alt=wall.name; wrap.appendChild(img);
    if(!wall.corners) wall.corners=defaultCorners();
    const s=2;
    const W=wall.w*s, H=wall.h*s;
    const grid=document.createElement('div'); grid.className='ovl-grid'; grid.style.cssText=`width:${W}px;height:${H}px;`;
    layouts[wall.id].placed.forEach(p=>{ grid.appendChild(makeFrameShadow(p,s)); });
    layouts[wall.id].placed.forEach(p=>{ grid.appendChild(makeFrameEl(p,s,false,null)); });
    wrap.appendChild(grid);

    const c=wall.corners; const toPx=pt=>[pt[0]*DISP_W, pt[1]*dispH];
    function applyMatrix(){ const cpx={tl:toPx(c.tl),tr:toPx(c.tr),br:toPx(c.br),bl:toPx(c.bl)}; grid.style.transform=projectMatrix(W,H,cpx); }
    applyMatrix();

    if(calibMode){
      ['tl','tr','br','bl'].forEach(corner=>{
        const h=document.createElement('div'); h.className='handle';
        const pos=toPx(c[corner]); h.style.left=pos[0]+'px'; h.style.top=pos[1]+'px';
        let dragging=false;
        const onMove=ev=>{ if(!dragging)return;
          const rect=wrap.getBoundingClientRect();
          const px=(ev.touches?ev.touches[0].clientX:ev.clientX)-rect.left;
          const py=(ev.touches?ev.touches[0].clientY:ev.clientY)-rect.top;
          c[corner]=[Math.max(0,Math.min(1,px/DISP_W)),Math.max(0,Math.min(1,py/dispH))];
          const np=toPx(c[corner]); h.style.left=np[0]+'px'; h.style.top=np[1]+'px';
          applyMatrix(); };
        const onUp=()=>{ if(dragging){ dragging=false; saveStore();
          document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
          document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onUp);} };
        const onDown=ev=>{ ev.preventDefault(); dragging=true;
          document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
          document.addEventListener('touchmove',onMove,{passive:false}); document.addEventListener('touchend',onUp); };
        h.addEventListener('mousedown',onDown); h.addEventListener('touchstart',onDown,{passive:false});
        wrap.appendChild(h);
      });
    }
    card.appendChild(wrap);

    const acts=document.createElement('div'); acts.className='rc-acts';
    const bch=document.createElement('button'); bch.className='wall-mini'; bch.textContent='cambia foto'; bch.onclick=()=>uploadWallPhoto(wall);
    const brm=document.createElement('button'); brm.className='wall-mini'; brm.textContent='rimuovi foto'; brm.onclick=()=>{ if(confirm('Rimuovere la foto di questa parete?')){ wall.photo=null; saveStore(); buildReal(); } };
    acts.appendChild(bch); acts.appendChild(brm);
    card.appendChild(acts);
    stage.appendChild(card);
  });
}

function initRealControls(){
  document.getElementById('calibBtn').addEventListener('click',()=>{ calibMode=!calibMode; buildReal(); });
  document.getElementById('resetCalib').addEventListener('click',()=>{ P.walls.forEach(w=>{ if(w.photo) w.corners=defaultCorners(); }); saveStore(); buildReal(); });
}

/* ════════════════════════════════════════════════════════
   SCHEDA DI MONTAGGIO
   ════════════════════════════════════════════════════════ */
function buildMontaggio(){
  const box=document.getElementById('montWrap'); box.innerHTML='';
  const intro=document.createElement('p'); intro.className='math-intro';
  intro.innerHTML=`Scheda operativa per il montaggio — layout <b>${codeString()}</b>. Le coordinate sono misurate dal bordo <b>sinistro</b> e dal bordo <b>alto</b> della zona utile della parete, al bordo esterno della cornice. La colonna "centro" indica la mezzeria orizzontale della cornice, utile per posizionare il gancio. Stampa questa pagina e spunta le cornici una a una.`;
  box.appendChild(intro);

  P.walls.forEach(wall=>{
    const lay=layouts[wall.id];
    if(!lay.placed.length) return;
    const sec=document.createElement('div'); sec.className='mont-sec';
    const h=document.createElement('h2'); h.textContent=`${wall.name} — ${wall.w} × ${wall.h} cm · ${lay.placed.length} cornici`; sec.appendChild(h);

    const s=Math.min(1.35, 780/wall.w);
    sec.appendChild(renderCanvas(wall, lay, {scale:s, numbered:true}));

    const ordered=montaggioOrder(lay.placed);
    const tbl=document.createElement('table');
    let html='<tr><th>N°</th><th>Formato</th><th>Ingombro cornice</th><th>Da sinistra</th><th>Dall\'alto</th><th>Centro (X)</th><th>✓</th></tr>';
    ordered.forEach((p,i)=>{
      html+=`<tr><td><strong>${i+1}</strong></td><td>${p.fmt.name}${p.rot?' <small>(orizzontale)</small>':''}</td><td>${fmtNum(p.w)} × ${fmtNum(p.h)} cm</td><td>${fmtNum(p.x)} cm</td><td>${fmtNum(p.y)} cm</td><td>${fmtNum(p.x+p.w/2)} cm</td><td class="mont-chk">☐</td></tr>`;
    });
    tbl.innerHTML=html;
    sec.appendChild(tbl);
    box.appendChild(sec);
  });
  if(!P.walls.some(w=>layouts[w.id].placed.length)){
    const p=document.createElement('p'); p.className='math-intro'; p.textContent='Nessuna cornice posizionata: imposta le quantità nella scheda Composizione → Impostazioni progetto.';
    box.appendChild(p);
  }
}
function fmtNum(v){ return (Math.round(v*2)/2).toLocaleString('it'); }

/* ════════════════════════════════════════════════════════
   ANALISI
   ════════════════════════════════════════════════════════ */
const STRUCT_NAMES={cost:'Costellazione (registri + ordine)', righe:'Righe modulari', colonne:'Colonne modulari', griglia:'Griglia allineata'};

function buildMath(){
  const frameArea=f=>(f.w+2*f.pp+2*(f.cw||0))*(f.h+2*f.pp+2*(f.cw||0));
  let rows='', totUsed=0, totAvail=0, totCount=0;
  const totals={}; P.formats.forEach(f=>totals[f.id]=0);
  P.walls.forEach(wall=>{
    let used=0,count=0;
    P.formats.forEach(f=>{ const n=((wall.counts&&wall.counts[f.id])||0)+((wall.countsH&&wall.countsH[f.id])||0); used+=n*frameArea(f); count+=n; totals[f.id]+=n; });
    const avail=wall.w*wall.h; totUsed+=used; totAvail+=avail; totCount+=count;
    const pct=avail?(used/avail*100):0;
    const cls=pct>62?'warn':'ok';
    const unp=layouts[wall.id].unplaced.length;
    rows+=`<tr><td>${wall.name} (${wall.w}×${wall.h})</td><td>${avail.toLocaleString('it')} cm²</td><td>${Math.round(used).toLocaleString('it')} cm²</td><td class="${cls}">${pct.toFixed(1)}%</td><td>${unp?`<span class="warn">⚠ ${unp} non posizionate</span>`:'tutte posizionate'}</td></tr>`;
  });
  const totPct=totAvail?(totUsed/totAvail*100).toFixed(1):'0';

  let fmtRows='';
  P.formats.forEach(f=>{
    fmtRows+=`<tr><td><strong>${f.name} cm</strong>${f.central?' <small class="warn" style="color:var(--brass)!important">centrale</small>':''}</td><td>${fmtNum(f.w+2*f.pp+2*(f.cw||0))} × ${fmtNum(f.h+2*f.pp+2*(f.cw||0))} cm</td><td>${f.pp} cm</td><td>${fmtNum(f.cw||0)} cm · ${f.cc==='bianca'?'bianca':'nera'}</td><td>${totals[f.id]} pz</td><td>${Math.round(frameArea(f)).toLocaleString('it')} cm²</td></tr>`;
  });

  let qhead='<tr><th>Parete</th>'+P.formats.map(f=>`<th>${f.name}</th>`).join('')+'<th>Totale</th></tr>';
  let qrows=P.walls.map(w=>`<tr><td>${w.name}</td>${P.formats.map(f=>{ const v=(w.counts&&w.counts[f.id])||0,h=(w.countsH&&w.countsH[f.id])||0; return `<td>${v+h}${(v&&h)?` <small>(${v}v·${h}o)</small>`:''}</td>`; }).join('')}<td><strong>${wallTotal(w)}</strong></td></tr>`).join('');
  qrows+=`<tr><td><strong>TOTALE</strong></td>${P.formats.map(f=>`<td><strong>${totals[f.id]}</strong></td>`).join('')}<td><strong>${totCount}</strong></td></tr>`;

  document.getElementById('mathWrap').innerHTML=`
    <p class="math-intro">Verifiche di spazio per «<b>${P.name}</b>» — struttura: <b>${STRUCT_NAMES[P.structure]||P.structure}</b>, spaziatura minima <b>${P.gap} cm</b>. L'ingombro di ogni cornice comprende il passepartout del suo formato. Sopra il <b>62%</b> di occupazione il posizionamento diventa difficile e alcune cornici potrebbero non trovare posto.</p>
    <h2>Quantità per parete</h2>
    <table>${qhead}${qrows}</table>
    <h2>Formati e ingombri</h2>
    <table><tr><th>Formato foto</th><th>Ingombro cornice</th><th>Passepartout</th><th>Cornice</th><th>Quantità</th><th>Area cornice</th></tr>${fmtRows}</table>
    <h2>Occupazione per parete</h2>
    <table><tr><th>Parete</th><th>Area disponibile</th><th>Area cornici</th><th>Occupazione</th><th>Stato</th></tr>${rows}
    <tr><td><strong>TOTALE</strong></td><td><strong>${totAvail.toLocaleString('it')} cm²</strong></td><td><strong>${Math.round(totUsed).toLocaleString('it')} cm²</strong></td><td><strong>${totPct}%</strong></td><td>—</td></tr></table>
    <h2>Le quattro strutture compositive</h2>
    <ul class="note">
      <li><b>Costellazione:</b> le cornici si appoggiano a registri orizzontali con libertà regolabile dal cursore Ordine — da nuvola morbida a cadenza quasi geometrica.</li>
      <li><b>Righe modulari:</b> righe a tutta larghezza dove ogni colonna pareggia l'altezza della riga: una cornice alta si allinea con due o tre più piccole impilate (es. un 30×45 verticale = un 20×30 verticale + un 13×19,5 orizzontale). Top e bottom coincidono.</li>
      <li><b>Colonne modulari:</b> lo stesso principio ruotato di 90°: colonne a tutta altezza, allineamenti verticali.</li>
      <li><b>Griglia allineata:</b> righe modulari con colonne a larghezza uniforme: allineamenti sia orizzontali sia verticali, l'estremo più geometrico.</li>
      <li><b>Formati centrali:</b> i formati marcati come «Centro» nelle impostazioni vengono raggruppati al centro della parete e tutti gli altri si dispongono attorno. Effetto attivo nella struttura <b>Costellazione</b>.</li>
      <li><b>Orientamento:</b> nella tabella quantità ogni formato si imposta in <b>verticale</b> e/o <b>orizzontale</b> (le due caselle vert · orizz per parete).</li>
      <li><b>Riproducibilità:</b> ogni disposizione ha un codice (es. ${codeString()}); richiamandolo si riottiene esattamente la stessa composizione.</li>
    </ul>`;
}
