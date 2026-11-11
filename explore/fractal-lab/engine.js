'use strict';
/* Fractal Universe Lab.
   Three layers, kept apart:
     1. the mathematical universe  - an engine from the library plus its parameters (worker, `engineOf`)
     2. the camera observing it    - centre, width, angle, depth limit (same gestures as the Survey Map)
     3. the visual representation  - a measurement of the orbit and a palette, applied after the computation
   The worker returns numbers per pixel (escape step T, smooth fraction, sensitivity S); colour is painted on
   the main thread, so switching measurement or palette never recomputes or changes the mathematics. */

const NO=65535, TAU=Math.PI*2, BLACK=0xFF000000, WHITE=0xFFFFFFFF;
const $=id=>document.getElementById(id);

/* ---------- palettes: a cyclic table for escape time, a sequential one for stretched measurements ---------- */
function ramp(stops,cyclic){
  const n=1024, lut=new Uint32Array(n), m=stops.length-1;
  for(let i=0;i<n;i++){ const t=(cyclic?i/n:i/(n-1))*m, k=Math.min(m-1,Math.floor(t)), f=t-k, a=stops[k], b=stops[k+1];
    lut[i]=(BLACK|((a[2]+(b[2]-a[2])*f)<<16)|((a[1]+(b[1]-a[1])*f)<<8)|(a[0]+(b[0]-a[0])*f))>>>0; }
  return lut;
}
function hsv(h,s,v){ const f=n=>{ const k=(n+h/60)%6; return Math.round(255*(v-v*s*Math.max(0,Math.min(k,4-k,1)))); }; return [f(5),f(3),f(1)]; }
const hueStops=(from,to,s,v0,v1,n=24)=>Array.from({length:n+1},(_,i)=>hsv(((from+(to-from)*i/n)%360+360)%360,s,v0+(v1-v0)*i/n));
const PALETTES={
  classic:{t:'Classic', cyc:ramp([[0,7,30],[32,18,110],[190,40,90],[255,140,30],[255,240,180],[90,30,140],[0,7,30]],true),
           seq:ramp([[0,7,30],[32,18,110],[190,40,90],[255,140,30],[255,240,180]],false)},
  hue:{t:'Hue / saturation', cyc:ramp(hueStops(230,590,.82,1,1),true), seq:ramp(hueStops(260,0,.9,.22,1),false)},
  gray:{t:'Grayscale', cyc:ramp([[14,14,14],[255,255,255],[14,14,14]],true), seq:ramp([[0,0,0],[255,255,255]],false)}
};

/* ---------- configuration ---------- */
const FRACTALS=[
  {v:'mandelbrot', t:'Mandelbrot', s:'z → z² + c'},
  {v:'julia',      t:'Julia',      s:'z → z² + c, c fixed'},
  {v:'multibrot',  t:'Multibrot',  s:'z → zⁿ + c'}
];
const MODES=[
  {v:'escape', t:'Escape time',       s:'smooth μ = n + 1 − log₂ log₂|zₙ|',          tag:'Escape time μ'},
  {v:'binary', t:'Black / white',     s:'white: escaped · black: no escape detected', tag:'Escape / no escape'},
  {v:'sens',   t:'Orbit sensitivity', s:'S = ln(1 + |dzₙ/dc|) at escape',            tag:'Sensitivity S'},
  {v:'flat',   t:'Sensitivity, bands removed', s:'ln(|D| / (|z| ln|z|)): exact |∇μ| by the chain rule', tag:'S, bands removed'},
  {v:'gradt',  t:'Gradient of T',     s:'|∇T| of the whole-step count: band edges',   tag:'|∇T| whole steps'},
  {v:'gradmu', t:'Gradient of μ',     s:'|∇μ| of the smooth escape time',             tag:'|∇μ| smooth'},
  {v:'compare',t:'Comparison',        s:'four synced panels, one camera',             tag:'Comparison'}
];
const modeOf=v=>MODES.find(m=>m.v===v)||MODES[0];
const SEEDS=[['Rabbit',-0.122561166876654,0.744861766619744],['Basilica',-1,0],['Dendrite',0,1],['Siegel disk',-0.390540870218399,-0.586787907346969],
  ['Cauliflower',0.25,0],['Airplane',-1.754877666246693,0],['Spiral',-0.8,0.156],['Galaxy',0.285,0.01],['Seahorse',-0.745,0.113],['Dust',0.3,0.5]];
const DEFAULTS={fractal:'mandelbrot', power:3, seed:{re:SEEDS[0][1],im:SEEDS[0][2]}, mode:'escape', panels:['escape','sens','gradt','flat'],
  depth:0, palette:'classic', iter:0, radius:16, clean:false};
const clone=c=>({...c, seed:{...c.seed}, panels:[...c.panels]});
let cfg=clone(DEFAULTS), started=false;
const SUP={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
const sup=n=>String(n).split('').map(ch=>SUP[ch]).join('');

// the mathematical universe: what the worker needs, the home frame and how far the camera may wander
function engineOf(c){
  const R=c.radius;
  if(c.fractal==='julia'){
    const m=Math.hypot(c.seed.re,c.seed.im), rad=(1+Math.sqrt(1+4*m))/2;   // the filled Julia set lies within this radius
    return {kind:1,pw:2,kr:c.seed.re,ki:c.seed.im,R2:Math.max(R*R,m*m),name:'Julia set',rule:'z → z² + c',hx:0,hy:0,span:2*rad*1.04,bx:rad+0.8,by:rad+0.8};
  }
  if(c.fractal==='multibrot')
    return {kind:0,pw:c.power,kr:0,ki:0,R2:R*R,name:'Multibrot '+c.power,rule:'z → z'+sup(c.power)+' + c',hx:0,hy:0,span:3,bx:2,by:2};
  return {kind:0,pw:2,kr:0,ki:0,R2:R*R,name:'Mandelbrot set',rule:'z → z² + c',hx:-0.75,hy:0,span:0,cxm:-0.6,bx:2,by:1.6};
}
let eng=engineOf(cfg);
const asciiRule=()=>'z -> z^'+eng.pw+' + c';
const needD=()=>cfg.mode==='sens'||cfg.mode==='flat'||cfg.mode==='compare';
const cmp=()=>cfg.mode==='compare';

/* ---------- worker: one strip of rows on a rotated grid. kind 0: the pixel is c and z₀ = 0 (parameter plane);
   kind 1: the pixel is z₀ and c is fixed (dynamical plane). Returns numbers, not colours:
   T = first n with |zₙ| > R (65535: no escape detected), F = μ − T, S = ln(1 + |Dₙ|) with D = dz/dc (kind 0) or dz/dz₀ (kind 1). ---------- */
const WORKER_SRC=`
onmessage=e=>{
  const m=e.data, {W,y0row,rows,or,oi,exr,exi,eyr,eyi,maxIt,kind,pw,kr,ki,R2,needD}=m;
  const N=W*rows, T=new Uint16Array(N), F=new Float32Array(N), S=needD?new Float32Array(N):null;
  const julia=kind===1, eps=julia?1e-13:0, quick=!julia&&pw===2, add=julia?0:1, ilp=1/Math.log(pw);
  let minN=1e9;
  for(let r=0;r<rows;r++){
    const Rw=y0row+r, rr=or+Rw*eyr, ri=oi+Rw*eyi;
    for(let x=0;x<W;x++){
      const pr=rr+x*exr, pq=ri+x*exi, i=r*W+x;
      let zr,zi,cr,ci,dr,di;
      if(julia){ zr=pr; zi=pq; cr=kr; ci=ki; dr=1; di=0; }
      else {
        cr=pr; ci=pq; zr=0; zi=0; dr=0; di=0;
        if(quick){ const xr=cr-0.25, q=xr*xr+ci*ci; if(q*(q+xr)<=0.25*ci*ci || (cr+1)*(cr+1)+ci*ci<=0.0625){ T[i]=65535; continue; } }
      }
      let zr2=zr*zr, zi2=zi*zi, n=0, qr=zr, qi=zi, lim=8, cnt=0, inside=false;
      while(zr2+zi2<=R2){
        if(n>=maxIt){ inside=true; break; }
        if(pw===2){
          if(needD){ const t=2*(zr*dr-zi*di)+add; di=2*(zr*di+zi*dr); dr=t; }
          zi=2*zr*zi+ci; zr=zr2-zi2+cr;
        } else {
          let wr=zr, wi=zi; for(let k=2;k<pw;k++){ const t=wr*zr-wi*zi; wi=wr*zi+wi*zr; wr=t; }
          if(needD){ const t=pw*(wr*dr-wi*di)+add; di=pw*(wr*di+wi*dr); dr=t; }
          const t=wr*zr-wi*zi+cr; zi=wr*zi+wi*zr+ci; zr=t;
        }
        zr2=zr*zr; zi2=zi*zi; n++;
        if(Math.abs(zr-qr)+Math.abs(zi-qi)<=eps){ inside=true; break; }
        if(++cnt===lim){ cnt=0; lim<<=1; qr=zr; qi=zi; }
      }
      if(inside){ T[i]=65535; continue; }
      if(n<minN) minN=n;
      T[i]=n; F[i]=1-Math.log(Math.log2(zr2+zi2)*0.5)*ilp;
      if(needD) S[i]=Math.log(1+Math.sqrt(dr*dr+di*di));
    }
  }
  postMessage({tag:m.tag,id:m.id,job:m.job,pass:m.pass,y0row,rows,T,F,S,minN},S?[T.buffer,F.buffer,S.buffer]:[T.buffer,F.buffer]);
};`;
const NW=Math.max(2,Math.min(8,(navigator.hardwareConcurrency||4)));
const workerURL=URL.createObjectURL(new Blob([WORKER_SRC],{type:'text/javascript'}));
const idle=[]; let queue=[];
for(let i=0;i<NW;i++){ const w=new Worker(workerURL); w.onmessage=onStrip; idle.push(w); }
function pump(){ while(idle.length && queue.length){ idle.pop().postMessage(queue.shift()); } }
const engMsg=e=>({kind:e.kind,pw:e.pw,kr:e.kr,ki:e.ki,R2:e.R2});

// the same orbit on the main thread, for single points (pin, cross-sections)
function orbit(pr,pq,maxIt,e){
  let zr,zi,cr,ci,dr,di; const pw=e.pw, add=e.kind?0:1, eps=e.kind?1e-13:0;
  if(e.kind){ zr=pr; zi=pq; cr=e.kr; ci=e.ki; dr=1; di=0; } else { cr=pr; ci=pq; zr=0; zi=0; dr=0; di=0; }
  let n=0, qr=zr, qi=zi, lim=8, cnt=0;
  while(zr*zr+zi*zi<=e.R2){
    if(n>=maxIt) return {esc:false,n};
    if(pw===2){ const t=2*(zr*dr-zi*di)+add; di=2*(zr*di+zi*dr); dr=t; const u=zr*zr-zi*zi+cr; zi=2*zr*zi+ci; zr=u; }
    else { let wr=zr, wi=zi; for(let k=2;k<pw;k++){ const t=wr*zr-wi*zi; wi=wr*zi+wi*zr; wr=t; }
      const t=pw*(wr*dr-wi*di)+add; di=pw*(wr*di+wi*dr); dr=t; const u=wr*zr-wi*zi+cr; zi=wr*zi+wi*zr+ci; zr=u; }
    n++;
    if(Math.abs(zr-qr)+Math.abs(zi-qi)<=eps) return {esc:false,n,cycle:true};
    if(++cnt===lim){ cnt=0; lim<<=1; qr=zr; qi=zi; }
  }
  const m=Math.hypot(zr,zi), ad=Math.hypot(dr,di), lp=Math.log(pw);
  // an = |∇μ| from the chain rule: μ = const − log_p G, G ≈ p⁻ⁿ ln|zₙ|  ⇒  |∇μ| = |D| / (|z| ln|z| ln p)
  return {esc:true,n,mu:n+1-Math.log(Math.log2(m))/lp,absD:ad,S:Math.log(1+ad),an:ad/(m*Math.log(m)*lp)};
}

/* ---------- camera: centre, width (complex units across the screen), angle ---------- */
const wrap=a=>{ a=(a+Math.PI)%TAU; if(a<0) a+=TAU; return a-Math.PI; };
const HOME={cx:-0.75,cy:0,w:3.2,a:0}, view={...HOME};
const cv=$('c'), ctx=cv.getContext('2d');
let DPR=1, Wd=1, Hd=1, SA={t:0,r:0,b:0,l:0};
function fitHome(){
  HOME.cx=eng.hx; HOME.cy=eng.hy; HOME.a=0;
  if(eng.span) HOME.w=Math.max(eng.span, eng.span*Wd/Hd);
  else { const a=Hd/Wd; HOME.w= a>=0.8 ? 3.2 : 2.6/a; }
}
function readSafe(){ const s=getComputedStyle($('sa')); SA={t:parseFloat(s.paddingTop)||0,r:parseFloat(s.paddingRight)||0,b:parseFloat(s.paddingBottom)||0,l:parseFloat(s.paddingLeft)||0}; }
function resize(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  Wd=Math.max(2,Math.round(innerWidth*DPR)); Hd=Math.max(2,Math.round(innerHeight*DPR));
  cv.width=Wd; cv.height=Hd; readSafe();
  const first=!resize.done; resize.done=true;
  fitHome(); if(first){ Object.assign(view,HOME); renderHome(); }
  dirty=true; needDraw=true; if(secOpen) drawPlot();
}
let lastMin=0, boost=1;
const CAP=40000;
function itFor(w){
  if(cfg.iter) return cfg.iter;
  const byDepth=150+260*Math.max(0,Math.log10(HOME.w/w));
  return Math.round(Math.min(CAP, Math.max(byDepth, lastMin*1.8+400)*boost));
}
const depthOf=w=>Math.log2(HOME.w/w);
function atLimit(v){ return v.w/Wd < 2.5e-15*Math.max(1,Math.abs(v.cx),Math.abs(v.cy)); }
function toWorld(px,py,v=view){
  const s=v.w/Wd, ux=(px-Wd/2)*s, uy=-(py-Hd/2)*s, c=Math.cos(v.a), n=Math.sin(v.a);
  return [v.cx+ux*c-uy*n, v.cy+ux*n+uy*c];
}
function toScreen(wx,wy,v=view){
  const s=v.w/Wd, dx=wx-v.cx, dy=wy-v.cy, c=Math.cos(v.a), n=Math.sin(v.a);
  return [Wd/2+(dx*c+dy*n)/s, Hd/2-(-dx*n+dy*c)/s];
}
function pinTo(px,py,wx,wy){
  const s=view.w/Wd, ux=(px-Wd/2)*s, uy=-(py-Hd/2)*s, c=Math.cos(view.a), n=Math.sin(view.a);
  view.cx=wx-(ux*c-uy*n); view.cy=wy-(ux*n+uy*c);
}
function gridFor(v,W,H,sx){
  const a=v.a||0, c=Math.cos(a), n=Math.sin(a), exr=sx*c, exi=sx*n, eyr=sx*n, eyi=-sx*c, ox=0.5-W/2, oy=0.5-H/2;
  return {or:v.cx+ox*exr+oy*eyr, oi:v.cy+ox*exi+oy*eyi, exr,exi,eyr,eyi};
}

/* ---------- layers of numbers ---------- */
function newLayer(v,W,H,maxIt,withS){
  return {W,H,sx:v.w/W,cx:v.cx,cy:v.cy,a:v.a||0,w:v.w,maxIt,left:H,minN:1e9,T:new Uint16Array(W*H),F:new Float32Array(W*H),S:withS?new Float32Array(W*H):null,imgs:[],rng:{},g:{}};
}
function fill(L,m){ L.T.set(m.T,m.y0row*L.W); L.F.set(m.F,m.y0row*L.W); if(L.S&&m.S) L.S.set(m.S,m.y0row*L.W); L.left-=m.rows; if(m.minN<L.minN) L.minN=m.minN; }
function strips(L,v,tag,extra,e,front){
  const g=gridFor(v,L.W,L.H,L.sx), rows=Math.max(1,Math.floor(12000/L.W)), items=[]; L.pw=e.pw;
  for(let y=0;y<L.H;y+=rows) items.push({tag,W:L.W,y0row:y,rows:Math.min(rows,L.H-y),...g,maxIt:L.maxIt,needD:!!L.S,...engMsg(e),...extra});
  if(front) queue.unshift(...items); else queue.push(...items);
}
// one-shot renders (backdrop, thumbnails)
const renders=new Map(); let rid=0;
function render(tag,v,W,H,maxIt,e,withS,done){
  const id=++rid, L=newLayer(v,W,H,maxIt,withS); renders.set(id,{L,done});
  strips(L,v,tag,{id},e,true); pump(); return id;
}
function cancel(id){ if(!id) return; renders.delete(id); queue=queue.filter(q=>q.id!==id || q.tag==='main'); }

/* ---------- progressive render jobs for the map ---------- */
const PASSES=[8,3,1];
let job=0, cur=null, dirty=true, lastStart=0, roughMs=150, base=null, home=null, homeId=0, stats=null;
function startJob(){
  job++; queue=queue.filter(q=>q.tag!=='main'); dirty=false; lastStart=performance.now();
  const v= back ? backView(performance.now()+Math.min(500,Math.max(50,roughMs*1.15))) : {...view}, maxIt=itFor(v.w), div=cmp()?2:1, d=needD();
  cur={id:job,v,maxIt,passes:[]};
  (back?[6]:PASSES).forEach((ds,p)=>{
    const L=newLayer(v,Math.ceil(Wd/(ds*div)),Math.ceil(Hd/(ds*div)),maxIt,d); L.ds=ds; cur.passes.push(L);
    strips(L,v,'main',{job,pass:p},eng,false);
  });
  pump();
}
function onStrip(e){
  idle.push(e.target);
  const m=e.data;
  if(m.tag==='main') mainStrip(m);
  else { const R=renders.get(m.id); if(R){ fill(R.L,m); if(R.L.left<=0){ renders.delete(m.id); R.done(R.L); } } }
  pump();
}
function mainStrip(m){
  if(!cur || m.job!==cur.id) return;
  const L=cur.passes[m.pass]; fill(L,m);
  if(L.left>0) return;
  if(m.pass===0) roughMs=0.6*roughMs+0.4*(performance.now()-lastStart);
  if(!cfg.iter){
    if(L.minN<1e9){ lastMin=L.minN; boost=1; }
    else if(!back){
      if(cur.maxIt<CAP){ boost*=3; dirty=true; }
      else if(m.pass===0){ queue=queue.filter(q=>!(q.tag==='main' && q.job===cur.id)); cur.passes.forEach(p=>p.left=0); }
    }
  }
  if(!base || base.job!==cur.id || base.pass<m.pass){
    L.job=cur.id; L.pass=m.pass; paintLayer(L); base=L; needDraw=true;
    if(m.pass===cur.passes.length-1 && !back){ stats=measure(L); writeHash(); if(infoOpen) fillInfo(); }
  }
}
function renderHome(){ // the whole universe as a backdrop, wide enough to fill the corners of a turned, zoomed-out view
  cancel(homeId); home=null;
  const w=3*HOME.w*Math.max(1,Hd/Wd), v={cx:eng.cxm===undefined?HOME.cx:eng.cxm,cy:HOME.cy,w,a:0};
  homeId=render('home',v,440,440,cfg.iter||300,eng,true,L=>{ home=L; paintLayer(L); needDraw=true; });
}

/* ---------- from numbers to colour ---------- */
// spatial gradient by central differences, in steps per pixel (one-sided at the border and next to pixels that did not escape)
function gradient(L,smooth){
  const key=smooth?'mu':'t'; if(L.g[key]) return L.g[key];
  const {W,H,T,F}=L, G=new Float32Array(W*H), val=i=>smooth?T[i]+F[i]:T[i];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=y*W+x; if(T[i]===NO){ G[i]=-1; continue; }
    const c=val(i); let l=c,r=c,u=c,d=c,nx=0,ny=0;
    if(x>0 && T[i-1]!==NO){ l=val(i-1); nx++; } if(x<W-1 && T[i+1]!==NO){ r=val(i+1); nx++; }
    if(y>0 && T[i-W]!==NO){ u=val(i-W); ny++; } if(y<H-1 && T[i+W]!==NO){ d=val(i+W); ny++; }
    const gx=nx?(r-l)/nx:0, gy=ny?(d-u)/ny:0;
    G[i]=Math.sqrt(gx*gx+gy*gy);
  }
  return L.g[key]=G;
}
function rangeOf(N,get,lo,hi){ // percentiles of a sample, so a few extreme pixels do not flatten the contrast
  const step=Math.max(1,Math.floor(N/40000)), buf=new Float32Array(Math.ceil(N/step)+1); let n=0;
  for(let i=0;i<N;i+=step){ const v=get(i); if(v===v && v!==Infinity && v!==-Infinity) buf[n++]=v; }
  if(!n) return [0,1];
  const a=buf.subarray(0,n).sort(), r=[a[Math.min(n-1,Math.floor(n*lo))], a[Math.min(n-1,Math.floor(n*hi))]];
  if(!(r[1]>r[0])) r[1]=r[0]+1e-9; return r;
}
function paint(L,mode){
  const {W,H,T,F,S}=L, N=W*H;
  if((mode==='sens'||mode==='flat') && !S) return null;
  const img=new ImageData(W,H), o=new Uint32Array(img.data.buffer), P=PALETTES[cfg.palette], C=P.cyc, Q=P.seq;
  if(mode==='binary'){ for(let i=0;i<N;i++) o[i]=T[i]===NO?BLACK:WHITE; }
  else if(mode==='escape'){
    // 0.5288 = −log₂ ln 2: keeps the colours of the existing maps, which use ln instead of log₂ inside μ
    for(let i=0;i<N;i++){ if(T[i]===NO){ o[i]=BLACK; continue; } const mu=T[i]+F[i]+0.5288; o[i]=C[((Math.sqrt(mu>0?mu:0)*90)|0)&1023]; }
  } else {
    let get, lo=0.01, hi=0.99;
    if(mode==='sens') get=i=>T[i]===NO?NaN:S[i];
    else if(mode==='flat'){ // F = 1 − log_p log₂|z| gives |z| back, so the overshoot past the escape radius can be divided out
      const lp=Math.log(L.pw), off=Math.log(lp);
      get=i=>{ if(T[i]===NO) return NaN; const lz=Math.LN2*Math.exp((1-F[i])*lp); return Math.log(Math.expm1(S[i]))-lz-Math.log(lz)-off; }; }
    else { const G=gradient(L,mode==='gradmu');
      if(mode==='gradt'){ get=i=>G[i]<0?NaN:Math.log(1+G[i]); lo=0; hi=0.995; }
      else get=i=>G[i]>0?Math.log(G[i]/L.sx):NaN; }
    const rng=rangeOf(N,get,lo,hi); if(mode==='gradt') rng[0]=0;
    const k=1023/(rng[1]-rng[0]), floor=Q[0];
    for(let i=0;i<N;i++){ const v=get(i); if(v!==v){ o[i]=T[i]===NO?BLACK:floor; continue; } const t=(v-rng[0])*k; o[i]=Q[t<0?0:t>1023?1023:t|0]; }
    L.rng[mode]=rng;
  }
  const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').putImageData(img,0,0); return c;
}
const shown=()=>cmp()?cfg.panels:[cfg.mode];
function paintLayer(L){ L.imgs=shown().map((m,k)=>paint(L,m) || L.imgs[k] || paint(L,'escape')); }
function repaint(){ if(home) paintLayer(home); if(base) paintLayer(base); needDraw=true; }

// descriptive numbers of the finished frame (recomputed for every frame: they depend on the grid)
function corr(n,sa,sb,saa,sbb,sab){ const va=saa-sa*sa/n, vb=sbb-sb*sb/n; return n>2&&va>0&&vb>0 ? (sab-sa*sb/n)/Math.sqrt(va*vb) : NaN; }
function measure(L){
  const {W,H,T,S}=L, N=W*H; let esc=0,tmin=1e9,tmax=0, st=0,ss=0,stt=0,sss=0,sts=0, sr=0,srr=0,str=0, pairs=0,edge=0,multi=0;
  for(let i=0;i<N;i++){
    const t=T[i]; if(t===NO) continue; esc++; if(t<tmin) tmin=t; if(t>tmax) tmax=t;
    if(S){ const s=S[i], r=t?s/t:0; st+=t; ss+=s; stt+=t*t; sss+=s*s; sts+=t*s; sr+=r; srr+=r*r; str+=t*r; }
    if((i+1)%W && T[i+1]!==NO){ pairs++; const d=Math.abs(T[i+1]-t); if(d){ edge++; if(d>1) multi++; } }
  }
  return {W,H,N,esc,tmin,tmax,maxIt:L.maxIt,pix:L.sx, rTS:S?corr(esc,st,ss,stt,sss,sts):NaN, rTR:S?corr(esc,st,sr,stt,srr,str):NaN,
    edge:pairs?edge/pairs:0, multi:pairs?multi/pairs:0};
}
