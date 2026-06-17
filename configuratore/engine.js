/* ════════════════════════════════════════════════════════
   ENGINE — motori di disposizione parametrici
   Tutte le misure in cm. placed: {x,y,w,h,fmt,rot}
   ════════════════════════════════════════════════════════ */
const ENG_MARGIN = 2;

/* ── tipi di supporto ──
   cornice_pp = cornice con passepartout · cornice = cornice senza passepartout
   pannello   = stampa diretta su pannello · tela = stampa su tela/canvas
   fmtEff() ricava la geometria EFFETTIVA dal tipo: solo le cornici hanno
   bordo (cw) e solo cornice_pp ha passepartout (pp). pannello/tela = bordo 0. */
const TIPO_NAMES = { cornice_pp:'Cornice con passepartout', cornice:'Cornice', pannello:'Pannello', tela:'Tela' };
const TIPO_SHORT = { cornice_pp:'Cornice + pp', cornice:'Cornice', pannello:'Pannello', tela:'Tela' };
function fmtTipo(f){ return f.tipo || (((f.cw||0)>0) ? ((f.pp||0)>0 ? 'cornice_pp':'cornice') : 'pannello'); }
function fmtEff(f){
  const tipo=fmtTipo(f);
  const hasFrame=(tipo==='cornice_pp'||tipo==='cornice');
  const hasPP=(tipo==='cornice_pp');
  return { tipo, hasFrame, isCanvas:(tipo==='tela'),
           pp: hasPP?(f.pp||0):0, cw: hasFrame?(f.cw||0):0, cc:f.cc||'nera' };
}

function mulberry32(seed){ let a = seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function engShuffle(arr,rnd){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function engCollides(x,y,w,h,placed,gap){
  for(const p of placed){
    if(x < p.x+p.w+gap && x+w+gap > p.x && y < p.y+p.h+gap && y+h+gap > p.y) return true;
  }
  return false;
}

function frameDims(fmt, rot){
  const e = fmtEff(fmt);
  const w = fmt.w + 2*e.pp + 2*e.cw, h = fmt.h + 2*e.pp + 2*e.cw;
  return rot ? {w:h, h:w} : {w, h};
}

function expandItems(wall, formats, rnd, orientMix){
  const items = [];
  let idx = 0;
  formats.forEach(f=>{
    const nv = (wall.counts  && wall.counts[f.id])  || 0;   // verticali
    const nh = (wall.countsH && wall.countsH[f.id]) || 0;   // orizzontali
    const push = (count, baseRot)=>{
      for(let i=0;i<count;i++){
        const rot = orientMix ? (rnd() < 0.42 ? !baseRot : baseRot) : baseRot;
        const d = frameDims(f, rot);
        items.push({ w:d.w, h:d.h, fmt:f, rot, slotIdx: idx++ });
      }
    };
    push(nv, false);
    push(nh, true);
  });
  return items;
}

/* ── COSTELLAZIONE — registri + ordine ── */
function engScanGrid(wall,w,h,placed,rnd,gaps,step){
  const M=ENG_MARGIN, st=step||1;
  for(const gap of gaps){
    const positions=[];
    for(let x=M; x<=wall.w-w-M; x+=st)
      for(let y=M; y<=wall.h-h-M; y+=st) positions.push([x,y]);
    engShuffle(positions,rnd);
    for(const [x,y] of positions) if(!engCollides(x,y,w,h,placed,gap)) return {x,y};
  }
  return null;
}

/* ── disposizione centrale: raggruppa i formati "centrali" al centro parete ── */
function placeCentralCluster(wall, centralItems, gap){
  const M=ENG_MARGIN;
  const widest=Math.max(...centralItems.map(i=>i.w));
  const limitW=Math.min(wall.w-2*M, Math.max(wall.w*0.62, widest));
  const rows=[]; let cur=[], curW=0;
  for(const it of centralItems){
    const add=(cur.length?gap:0)+it.w;
    if(cur.length && curW+add>limitW){ rows.push({items:cur,w:curW}); cur=[]; curW=0; }
    curW += (cur.length?gap:0)+it.w; cur.push(it);
  }
  if(cur.length) rows.push({items:cur,w:curW});
  const rowHs=rows.map(r=>Math.max(...r.items.map(i=>i.h)));
  const totH=rowHs.reduce((a,b)=>a+b,0)+(rows.length-1)*gap;
  let y=wall.h/2-totH/2;
  y=Math.max(M, Math.min(wall.h-totH-M, y));
  const out=[];
  rows.forEach((r,ri)=>{
    const rh=rowHs[ri];
    let x=wall.w/2-r.w/2; x=Math.max(M, Math.min(wall.w-r.w-M, x));
    r.items.forEach(it=>{ out.push({x, y:y+(rh-it.h)/2, w:it.w, h:it.h, fmt:it.fmt, rot:it.rot, slotIdx:it.slotIdx}); x+=it.w+gap; });
    y+=rh+gap;
  });
  return out;
}

function layoutCost(wall, itemsIn, rnd, opts){
  const M=ENG_MARGIN, ord=opts.ord, g=opts.gap;
  const allItems=[...itemsIn];
  if(!allItems.length) return {placed:[],lines:[],unplaced:[]};
  const centralItems=allItems.filter(i=>i.fmt.central);
  const items=allItems.filter(i=>!i.fmt.central).sort((a,b)=>(b.w*b.h)-(a.w*a.h));
  const maxFH=Math.max(...allItems.map(i=>i.h));
  const lo=maxFH/2+M, hi=wall.h-maxFH/2-M;
  let lines;
  if(hi<=lo){ lines=[wall.h/2]; }
  else{
    const L=Math.max(2,Math.min(6,Math.round((hi-lo)/35)+1));
    lines=[]; for(let i=0;i<L;i++) lines.push(L===1?(lo+hi)/2:lo+(hi-lo)*(i/(L-1)));
  }
  const L=lines.length;
  const regSpacing=L>1?(hi-lo)/(L-1):wall.h;
  const maxJit=regSpacing*0.6, minJit=7;
  const jit=minJit+(1-ord)*Math.max(0,maxJit-minJit);

  const placed=[], leftovers=[];
  // 1) i formati centrali vanno al centro, gli altri si dispongono attorno
  if(centralItems.length) placeCentralCluster(wall, centralItems, g).forEach(p=>placed.push(p));
  const regLoad=new Array(L).fill(0);
  const nearestReg=cy=>{ let bi=0,bd=1e9; for(let i=0;i<L;i++){ const d=Math.abs(lines[i]-cy); if(d<bd){bd=d;bi=i;} } return bi; };

  for(const item of items){
    const rangeX=wall.w-item.w-2*M;
    if(rangeX<0){ leftovers.push(item); continue; }
    let pos=null;
    for(const gap of [g+1.2, g+0.5, g]){
      for(let t=0;t<700 && !pos;t++){
        let li;
        if(rnd()<0.25+0.7*ord){ const m=Math.min(...regLoad); li=regLoad.indexOf(m); }
        else li=Math.floor(rnd()*L);
        let y=lines[li]+(rnd()*2-1)*jit-item.h/2;
        y=Math.max(M,Math.min(wall.h-item.h-M,y));
        let x=M+rnd()*rangeX;
        if(ord>0.7){ const q=6; x=Math.max(M,Math.min(wall.w-item.w-M,Math.round((x-M)/q)*q+M)); }
        if(!engCollides(x,y,item.w,item.h,placed,gap)) pos={x,y};
      }
      if(pos) break;
    }
    if(!pos) pos=engScanGrid(wall,item.w,item.h,placed,rnd,[g,g*0.7,g*0.4],1);
    if(!pos) leftovers.push(item);
    else{ placed.push({...pos,w:item.w,h:item.h,fmt:item.fmt,rot:item.rot,slotIdx:item.slotIdx}); regLoad[nearestReg(pos.y+item.h/2)]+=item.w+g; }
  }
  const unplaced=[];
  for(const item of leftovers){
    const pos=engScanGrid(wall,item.w,item.h,placed,rnd,[0.6,0.3,0.1,0],0.5);
    if(pos) placed.push({...pos,w:item.w,h:item.h,fmt:item.fmt,rot:item.rot,slotIdx:item.slotIdx});
    else unplaced.push(item);
  }
  return {placed, lines, unplaced};
}

/* ── RIGHE MODULARI — top/bottom allineati, colonne a incastro ── */
function takeCol(pool,is){
  const items=is.map(i=>pool[i]);
  [...is].sort((a,b)=>b-a).forEach(i=>pool.splice(i,1));
  return {items, w:Math.max(...items.map(t=>t.w)), loose:false};
}

function buildColumn(pool,rowH,gap,rnd){
  if(!pool.length) return null;
  const idx=[...pool.keys()]; engShuffle(idx,rnd);
  for(const i of idx) if(Math.abs(pool[i].h-rowH)<0.6) return takeCol(pool,[i]);
  for(let a=0;a<idx.length;a++)for(let b=a+1;b<idx.length;b++){
    const i=idx[a],j=idx[b]; const s=pool[i].h+pool[j].h; const free=rowH-s;
    if(free>=gap*0.6 && free<=gap*3.5) return takeCol(pool,[i,j]);
  }
  for(let a=0;a<idx.length;a++)for(let b=a+1;b<idx.length;b++)for(let c=b+1;c<idx.length;c++){
    const i=idx[a],j=idx[b],k=idx[c]; const s=pool[i].h+pool[j].h+pool[k].h; const free=(rowH-s)/2;
    if(free>=gap*0.6 && free<=gap*2.5) return takeCol(pool,[i,j,k]);
  }
  for(const i of idx) if(rowH-pool[i].h<=rowH*0.45){ const c=takeCol(pool,[i]); c.loose=true; return c; }
  return null;
}

function placeColumn(col,x,slotW,y,rowH,rnd,placed){
  const k=col.items.length;
  if(k===1){
    const it=col.items[0];
    let yy;
    if(Math.abs(it.h-rowH)<0.61) yy=y;
    else if(col.loose) yy=(rnd()<0.5)? y : y+rowH-it.h;
    else yy=y+(rowH-it.h)/2;
    placed.push({x:x+(slotW-it.w)/2,y:yy,w:it.w,h:it.h,fmt:it.fmt,rot:it.rot,slotIdx:it.slotIdx});
  } else {
    const s=col.items.reduce((a,t)=>a+t.h,0);
    const g=(rowH-s)/(k-1);
    engShuffle(col.items,rnd);
    let yy=y;
    col.items.forEach(it=>{ placed.push({x:x+(slotW-it.w)/2,y:yy,w:it.w,h:it.h,fmt:it.fmt,rot:it.rot,slotIdx:it.slotIdx}); yy+=it.h+g; });
  }
}

function layoutRighe(wall, itemsIn, rnd, opts){
  const M=ENG_MARGIN, gap=opts.gap, rowGap=opts.gap, uniform=!!opts.uniform;
  const maxW=wall.w-2*M, maxH=wall.h-2*M;
  const pool=[...itemsIn];
  const unplaced=[];
  // scarta subito ciò che non può entrare
  for(let i=pool.length-1;i>=0;i--) if(pool[i].w>maxW||pool[i].h>maxH){ unplaced.push(pool[i]); pool.splice(i,1); }
  const rows=[];
  let guard=0;
  while(pool.length && guard++<200){
    pool.sort((a,b)=>b.h-a.h);
    const anchor=pool.shift();
    const rowH=anchor.h;
    const cols=[{items:[anchor],w:anchor.w,loose:false}];
    let used=anchor.w;
    let g2=0;
    while(pool.length && g2++<300){
      const col=buildColumn(pool,rowH,gap,rnd);
      if(!col) break;
      if(used+gap+col.w>maxW){ col.items.forEach(it=>pool.push(it)); break; }
      cols.push(col); used+=gap+col.w;
    }
    engShuffle(cols,rnd);
    rows.push({h:rowH,cols});
  }
  // adattamento verticale: le righe in eccesso escono
  const totH=rs=>rs.reduce((a,r)=>a+r.h,0)+(rs.length-1)*rowGap;
  while(rows.length>1 && totH(rows)>maxH){
    const r=rows.pop(); r.cols.forEach(c=>c.items.forEach(it=>unplaced.push(it)));
  }
  if(rows.length===1 && totH(rows)>maxH){ /* una riga sola troppo alta: impossibile, già filtrato */ }
  const placed=[];
  const uniW=uniform&&rows.length? Math.max(...rows.flatMap(r=>r.cols.map(c=>c.w))) : null;
  let y=M+Math.max(0,(maxH-totH(rows))/2);
  rows.forEach(r=>{
    const colWs=r.cols.map(c=> uniW? Math.max(uniW,c.w) : c.w);
    const rowW=colWs.reduce((a,b)=>a+b,0)+(r.cols.length-1)*gap;
    let x=M+Math.max(0,(maxW-rowW)/2);
    r.cols.forEach((c,ci)=>{ placeColumn(c,x,colWs[ci],y,r.h,rnd,placed); x+=colWs[ci]+gap; });
    y+=r.h+rowGap;
  });
  return {placed, lines:[], unplaced};
}

function layoutColonne(wall, itemsIn, rnd, opts){
  const tw={w:wall.h,h:wall.w};
  const titems=itemsIn.map(it=>({w:it.h,h:it.w,fmt:it.fmt,rot:it.rot}));
  const res=layoutRighe(tw,titems,rnd,opts);
  return {
    placed: res.placed.map(p=>({x:p.y,y:p.x,w:p.h,h:p.w,fmt:p.fmt,rot:p.rot,slotIdx:p.slotIdx})),
    lines: [],
    unplaced: res.unplaced
  };
}

/* ── entry point ── */
function layoutWall(wall, formats, settings){
  const rnd=mulberry32(wall.seed||1);
  const items=expandItems(wall, formats, rnd, settings.orient);
  const opts={ord:settings.ord, gap:settings.gap, uniform:false};
  switch(settings.structure){
    case 'righe':   return layoutRighe(wall, items, rnd, opts);
    case 'colonne': return layoutColonne(wall, items, rnd, opts);
    case 'griglia': return layoutRighe(wall, items, rnd, {...opts, uniform:true});
    default:        return layoutCost(wall, items, rnd, opts);
  }
}
