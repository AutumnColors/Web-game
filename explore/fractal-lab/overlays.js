'use strict';
/* Fractal Universe Lab, part 2: what is drawn over the numbers - the map itself, scale, compass, pin and cross-sections.
   The universe (engine, worker, numbers, colour) is in engine.js, loaded first; gestures and panels are in lab.js. */

/* ---------- drawing ---------- */
let needDraw=true;
function blit(L,k){
  const img=L.imgs[k]; if(!img) return;
  const [sx,sy]=toScreen(L.cx,L.cy), s=L.sx/(view.w/Wd);
  ctx.save(); ctx.translate(sx,sy); ctx.rotate(view.a-L.a); ctx.scale(s,s); ctx.drawImage(img,-L.W/2,-L.H/2); ctx.restore();
}
function draw(overlays=!cfg.clean){
  needDraw=false;
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#000'; ctx.fillRect(0,0,Wd,Hd);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  const four=cmp(), n=four?4:1, under=home && (!base || view.w>base.w*0.6);
  for(let k=0;k<n;k++){
    ctx.save();
    if(four){ const ox=(k&1)*Wd/2, oy=(k>>1)*Hd/2; ctx.beginPath(); ctx.rect(ox,oy,Wd/2,Hd/2); ctx.clip(); ctx.translate(ox,oy); ctx.scale(.5,.5); }
    if(under) blit(home,k);
    if(base) blit(base,k);
    ctx.restore();
  }
  if(four){ ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(Wd/2-DPR/2,0,DPR,Hd); ctx.fillRect(0,Hd/2-DPR/2,Wd,DPR); }
  tagBoxes=[]; labelBox=null;
  if(!overlays) return;
  ctx.save(); ctx.scale(DPR,DPR);
  drawSections(); drawPin(); if(four) drawTags(); drawCompass(); drawScale();
  ctx.restore();
}
// where a point of the plane appears, in CSS pixels: once, or once per panel in the comparison
function spots(wx,wy){
  const [sx,sy]=toScreen(wx,wy), x=sx/DPR, y=sy/DPR, cw=Wd/DPR, ch=Hd/DPR;
  if(!cmp()) return [{x,y,x0:0,y0:0,w:cw,h:ch}];
  return [0,1,2,3].map(k=>({x:(k&1)*cw/2+x/2, y:(k>>1)*ch/2+y/2, x0:(k&1)*cw/2, y0:(k>>1)*ch/2, w:cw/2, h:ch/2}));
}
const inBox=p=>p.x>=p.x0-10&&p.y>=p.y0-10&&p.x<=p.x0+p.w+10&&p.y<=p.y0+p.h+10;
function clipTo(p){ ctx.beginPath(); ctx.rect(p.x0,p.y0,p.w,p.h); ctx.clip(); }

/* ---------- number formatting ---------- */
const minus=s=>s.replace(/^-/,'−');
function digitsFor(pix){ return Math.max(2,Math.min(17,Math.ceil(-Math.log10(pix))+1)); }
function fixed(x,d){ return minus((x<0||Object.is(x,-0)?'-':'')+Math.abs(x).toFixed(d)); }
function sci(x,sig=2){
  if(x===0) return '0'; if(!isFinite(x)) return '–';
  const k=Math.floor(Math.log10(Math.abs(x))), m=x/Math.pow(10,k);
  if(k>=-3 && k<=4) return minus(String(+x.toPrecision(sig)));
  const ms=String(+m.toPrecision(sig));
  return minus((ms==='1'?'':ms+' × ')+'10'+sup(k));
}
const trim=(x,d)=>String(+Math.abs(x).toFixed(d));
const cText=(re,im,d)=>minus((re<0?'-':'')+trim(re,d))+' '+(im<0?'−':'+')+' '+trim(im,d)+'i';
const cFixed=(re,im,d)=>fixed(re,d)+' '+(im<0?'−':'+')+' '+Math.abs(im).toFixed(d)+' i';
const num=n=>n.toLocaleString('en-US');
const r3=r=>isFinite(r)?minus(r.toFixed(3)):'–';

/* ---------- scale bar and depth (bottom right) ---------- */
function niceLen(target){ const k=Math.floor(Math.log10(target)), b=Math.pow(10,k); for(const m of [5,2,1]) if(m*b<=target) return m*b; return b; }
function line(a,b,c,d,g=ctx){ g.beginPath(); g.moveTo(a,b); g.lineTo(c,d); g.stroke(); }
function textShadow(t,x,y,font,align,col='#fff'){
  ctx.font=font; ctx.textAlign=align; ctx.textBaseline='alphabetic';
  ctx.lineJoin='round'; ctx.lineWidth=3.5; ctx.strokeStyle='rgba(0,0,0,.65)'; ctx.strokeText(t,x,y); ctx.fillStyle=col; ctx.fillText(t,x,y);
}
function depthText(){ const D=depthOf(view.w); return 'depth '+minus((Math.abs(D)<0.05?0:D).toFixed(1))+(cfg.depth?' / '+cfg.depth:''); }
function drawScale(){
  const cssW=Wd/DPR, perPx=view.w/cssW*(cmp()?2:1), L=niceLen(perPx*(cmp()?90:130)), len=L/perPx;
  const right=cssW-16-SA.r, bottom=Hd/DPR-18-SA.b, left=right-len;
  ctx.lineCap='round';
  ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=5; line(left,bottom,right,bottom); line(left,bottom-7,left,bottom+1); line(right,bottom-7,right,bottom+1);
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; line(left,bottom,right,bottom); line(left,bottom-7,left,bottom+1); line(right,bottom-7,right,bottom+1);
  textShadow(sci(L,1), right, bottom-12, '600 13px system-ui,sans-serif','right');
  textShadow(depthText(), right, bottom+14, '11px system-ui,sans-serif','right','rgba(255,255,255,.8)');
}

/* ---------- compass (top right): the needle points to +i ---------- */
const COMPASS_R=25;
function compassPos(){ return [Wd/DPR-16-SA.r-COMPASS_R, 16+SA.t+COMPASS_R]; }
function drawCompass(){
  const [x,y]=compassPos(), R=COMPASS_R, a=view.a;
  ctx.save(); ctx.translate(x,y);
  ctx.beginPath(); ctx.arc(0,0,R,0,TAU); ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.stroke();
  ctx.rotate(a); ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1;
  for(let i=0;i<8;i++){ const t=i*TAU/8, r0=i%2?R-4:R-6; line(Math.sin(t)*r0,-Math.cos(t)*r0,Math.sin(t)*(R-1.5),-Math.cos(t)*(R-1.5)); }
  ctx.beginPath(); ctx.moveTo(0,-R+7); ctx.lineTo(5,0); ctx.lineTo(-5,0); ctx.closePath(); ctx.fillStyle='#ff4a3d'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0,R-7); ctx.lineTo(5,0); ctx.lineTo(-5,0); ctx.closePath(); ctx.fillStyle='#e8e8e8'; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,2,0,TAU); ctx.fillStyle='#000'; ctx.fill();
  ctx.save(); ctx.translate(0,-R-9); ctx.rotate(-a); textShadow('+i',0,4,'700 11px system-ui,sans-serif','center'); ctx.restore();
  ctx.restore();
  const deg=Math.round(-view.a*180/Math.PI);
  if(deg!==0) textShadow((deg>0?'+':'−')+Math.abs(deg)+'°', x, y+R+17, '600 11px system-ui,sans-serif','center');
}

/* ---------- panel tags in the comparison: tap one to change what that panel measures ---------- */
let tagBoxes=[];
function drawTags(){
  const cw=Wd/DPR, ch=Hd/DPR;
  cfg.panels.forEach((m,k)=>{
    const t=modeOf(m).tag+'  ▾'; ctx.font='600 11.5px system-ui,sans-serif';
    const w=ctx.measureText(t).width+16, x=(k&1)*cw/2+8+(k&1?0:SA.l), y=(k>>1)*ch/2+8+(k>>1?0:SA.t);
    ctx.fillStyle='rgba(0,0,0,.62)'; roundRect(x,y,w,24,12); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(t,x+8,y+12.5);
    tagBoxes.push({x,y,w,h:24,k});
  });
}
function roundRect(x,y,w,h,r,g=ctx){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

/* ---------- pin: tap a point, read its coordinates and what its orbit does ---------- */
let pin=null, labelBox=null;
const PIN_LIMIT=200000, PIN_PMAX=1024;
// escape, inside (an attracting cycle of period p, multiplier |λ| < 1) or undecided. Independent of the zoom and of the frame's limit.
function classify(pr,pq,e){
  let zr,zi,cr,ci,n=0; const pw=e.pw;
  if(e.kind){ zr=pr; zi=pq; cr=e.kr; ci=e.ki; } else { cr=pr; ci=pq; zr=0; zi=0; }
  let lr=1, li=0;
  const step=track=>{ let wr=1, wi=0; for(let k=1;k<pw;k++){ const t=wr*zr-wi*zi; wi=wr*zi+wi*zr; wr=t; }   // w = z^(p−1)
    if(track){ const tr=pw*(lr*wr-li*wi), ti=pw*(lr*wi+li*wr); lr=tr; li=ti; }                            // multiplier of the cycle: Π p·z^(p−1)
    const t=wr*zr-wi*zi+cr; zi=wr*zi+wi*zr+ci; zr=t; n++; return zr*zr+zi*zi>e.R2; };
  if(zr*zr+zi*zi>e.R2) return {kind:'escape',n:0};
  while(n<PIN_LIMIT){
    for(let k=0;k<1000;k++) if(step()) return {kind:'escape',n};
    const ar=zr, ai=zi;
    for(let p=1;p<=PIN_PMAX;p++){
      if(step()) return {kind:'escape',n};
      if(Math.abs(zr-ar)+Math.abs(zi-ai)<1e-10){
        lr=1; li=0; for(let k=0;k<p;k++) step(true);
        const lam=Math.hypot(lr,li); if(lam<1) return {kind:'inside',period:p,lam,n};
        break;
      }
    }
  }
  return {kind:'open',n};
}
function placePin(px,py){
  if(pin){ const [sx,sy]=toScreen(pin.re,pin.im); if(Math.hypot(sx-px,sy-py)<26*DPR*(cmp()?2:1)){ pin=null; needDraw=true; return; } }
  const [re,im]=toWorld(px,py), pix=view.w/Wd*DPR*(cmp()?2:1);
  pin={re,im,d:digitsFor(pix),r:classify(re,im,eng)}; needDraw=true;
}
function orbitText(r){
  if(r.kind==='escape') return 'escapes after '+num(r.n)+' steps';
  if(r.kind==='inside') return 'inside · period-'+r.period+' cycle · |λ| '+(r.lam<0.995?r.lam.toFixed(2):r.lam.toFixed(4));
  return 'undecided after '+num(r.n)+' steps';
}
function cross(x,y){
  ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.6)';
  ctx.beginPath(); ctx.arc(x,y,7,0,TAU); ctx.stroke(); line(x-13,y,x-9,y); line(x+9,y,x+13,y); line(x,y-13,x,y-9); line(x,y+9,x,y+13);
  ctx.lineWidth=1.6; ctx.strokeStyle='#fff';
  ctx.beginPath(); ctx.arc(x,y,7,0,TAU); ctx.stroke(); line(x-13,y,x-9,y); line(x+9,y,x+13,y); line(x,y-13,x,y-9); line(x,y+9,x,y+13);
  ctx.beginPath(); ctx.arc(x,y,1.6,0,TAU); ctx.fillStyle='#fff'; ctx.fill();
}
function drawPin(){
  if(!pin) return;
  const S=spots(pin.re,pin.im), cw=Wd/DPR;
  S.forEach(p=>{ if(inBox(p)){ ctx.save(); clipTo(p); cross(p.x,p.y); ctx.restore(); } });
  const p=S.find(inBox); if(!p){ if(!cmp()) drawOffscreen(S[0].x,S[0].y); return; }
  const f1='600 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', f2='11px system-ui,sans-serif';
  const t1=fixed(pin.re,pin.d), t2=(pin.im<0?'− ':'+ ')+Math.abs(pin.im).toFixed(pin.d)+' i', t3=orbitText(pin.r);
  ctx.font=f1; const w1=Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width);
  ctx.font=f2; const w2=ctx.measureText(t3).width, bw=Math.max(w1,w2)+20, bh=62;
  let bx=p.x+16, by=p.y-bh-10;
  if(bx+bw>cw-8) bx=p.x-16-bw; if(bx<8) bx=Math.max(8,Math.min(cw-8-bw,p.x-bw/2));
  const cr=$('chip').getBoundingClientRect();
  if(by<8+SA.t || (cr.width && by<cr.bottom+6 && bx<cr.right && bx+bw>cr.left)) by=p.y+18;
  ctx.fillStyle='rgba(0,0,0,.7)'; roundRect(bx,by,bw,bh,9); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.lineWidth=1; ctx.stroke();
  ctx.textAlign='left'; ctx.textBaseline='alphabetic'; ctx.fillStyle='#fff';
  ctx.font=f1; ctx.fillText(t1,bx+10,by+20); ctx.fillText(t2,bx+10,by+37);
  ctx.font=f2; ctx.fillStyle='rgba(255,255,255,.7)'; ctx.fillText(t3,bx+10,by+53);
  labelBox={x:bx,y:by,w:bw,h:bh};
}
function drawOffscreen(x,y){
  const cw=Wd/DPR, ch=Hd/DPR, cx=cw/2, cy=ch/2, ang=Math.atan2(y-cy,x-cx);
  const m=26, t=Math.min(Math.abs((cw/2-m)/Math.cos(ang)||1e9), Math.abs((ch/2-m)/Math.sin(ang)||1e9));
  ctx.save(); ctx.translate(cx+Math.cos(ang)*t,cy+Math.sin(ang)*t); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,-7); ctx.lineTo(-6,7); ctx.closePath();
  ctx.fillStyle='#fff'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=3; ctx.stroke(); ctx.fill(); ctx.restore();
}
function copyText(s,msg){ const ok=()=>toast(msg); if(navigator.clipboard) navigator.clipboard.writeText(s).then(ok,()=>toast(s)); else toast(s); }
function copyPin(){ copyText(pin.re.toFixed(pin.d)+' '+(pin.im<0?'-':'+')+' '+Math.abs(pin.im).toFixed(pin.d)+'i','Copied  '+cFixed(pin.re,pin.im,pin.d)); }
let toastT=0;
function toast(t,ms=1900){ const el=$('toast'); el.textContent=t; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),ms); }

/* ---------- cross-sections: a line A → B, sampled directly (not from the pixel grid) ---------- */
let sections=[], secTool=false, secA=null, secSel=-1, secOpen=false;
const SEC_COL=['#ffd25a','#7fe0ff','#ff8fb1','#a8f08c','#c9a6ff','#ffab6b'];
function median(a){ if(!a.length) return NaN; const s=[...a].sort((x,y)=>x-y), m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function pearson(a,b){ let n=0,sa=0,sb=0,saa=0,sbb=0,sab=0; for(let i=0;i<a.length;i++){ const x=a[i],y=b[i]; if(!(isFinite(x)&&isFinite(y))) continue; n++; sa+=x; sb+=y; saa+=x*x; sbb+=y*y; sab+=x*y; } return corr(n,sa,sb,saa,sbb,sab); }
// local maxima that stand at least minProm above the higher of the two valleys beside them
function peaks(v,minProm,step=1){
  const xs=[]; for(let i=0;i<v.length;i+=step) xs.push(i);
  const out=[];
  for(let j=1;j<xs.length-1;j++){
    const a=v[xs[j]]; if(!(a>v[xs[j-1]] && a>=v[xs[j+1]])) continue;
    let lm=a, k=j-1; while(k>=0 && v[xs[k]]<=a){ if(v[xs[k]]<lm) lm=v[xs[k]]; k--; }
    let rm=a; k=j+1; while(k<xs.length && v[xs[k]]<=a){ if(v[xs[k]]<rm) rm=v[xs[k]]; k++; }
    if(a-Math.max(lm,rm)>=minProm) out.push(xs[j]);
  }
  return out;
}
function computeSection(s){
  const N=s.n, maxIt=itFor(view.w), e=eng, dx=s.b[0]-s.a[0], dy=s.b[1]-s.a[1], len=Math.hypot(dx,dy), ds=len/(N-1);
  const T=new Int32Array(N), mu=new Float64Array(N), aD=new Float64Array(N), S=new Float64Array(N), an=new Float64Array(N), fd=new Float64Array(N).fill(NaN), rate=new Float64Array(N);
  let esc=0, late=0;
  for(let k=0;k<N;k++){
    const t=k/(N-1), o=orbit(s.a[0]+dx*t, s.a[1]+dy*t, maxIt, e);
    if(o.esc){ esc++; T[k]=o.n; mu[k]=o.mu; aD[k]=o.absD; S[k]=o.S; an[k]=o.an; rate[k]=o.n?o.S/o.n:NaN; }
    else { T[k]=-1; mu[k]=aD[k]=S[k]=an[k]=rate[k]=NaN; if(!o.cycle && orbit(s.a[0]+dx*t, s.a[1]+dy*t, maxIt*4, e).esc) late++; }
  }
  let jumps=0, pairs=0;
  for(let k=0;k<N;k++){
    if(k>0 && T[k]>=0 && T[k-1]>=0){ pairs++; if(Math.abs(T[k]-T[k-1])>1) jumps++; }
    if(k>0 && k<N-1 && T[k-1]>=0 && T[k+1]>=0 && T[k]>=0) fd[k]=Math.abs(mu[k+1]-mu[k-1])/(2*ds);
  }
  // peaks of the escape time along the line (a sample that never escapes counts as the highest value)
  let lo=Infinity, hi=-Infinity; for(let k=0;k<N;k++) if(T[k]>=0){ if(mu[k]<lo) lo=mu[k]; if(mu[k]>hi) hi=mu[k]; }
  if(!(hi>=lo)){ lo=0; hi=1; }
  const top=hi+(hi-lo)*0.5+1, v=Float64Array.from(mu,(x,k)=>T[k]<0?top:x);
  const prom=Math.max(0.5,(hi-lo)*0.08), pk=peaks(v,prom), pk2=peaks(v,prom,2);
  const gaps=pk.slice(1).map((p,i)=>(p-pk[i])*ds), ratios=gaps.slice(1).map((g,i)=>g/gaps[i]);
  const gm=gaps.reduce((a,b)=>a+b,0)/(gaps.length||1), cvGap=gaps.length>1?Math.sqrt(gaps.reduce((a,b)=>a+(b-gm)*(b-gm),0)/gaps.length)/gm:NaN;
  const rm=median(ratios), rspread=ratios.length>1?median(ratios.map(r=>Math.abs(r-rm)))/rm:NaN;
  let verdict;
  if(pk.length<4) verdict='too few peaks to test spacing';
  else if(pk.length!==pk2.length) verdict='more peaks appear at finer sampling ('+pk2.length+' at half, '+pk.length+' here): the line is not resolved, so no spacing pattern can be read from it yet';
  else if(cvGap<0.15) verdict='even spacing (periodic-like)';
  else if(rspread<0.15 && Math.abs(rm-1)>0.1) verdict='spacing changes by a steady factor ≈ '+rm.toFixed(2)+' (self-similar scaling, not a fixed period)';
  else verdict='no regular spacing found';
  const lnfd=Float64Array.from(fd,x=>x>0?Math.log(x):NaN), lnan=Float64Array.from(an,x=>x>0?Math.log(x):NaN);
  Object.assign(s,{len,ds,maxIt,T,mu,aD,S,an,fd,rate,esc,late,jumps:pairs?jumps/pairs:0,pk,pk2:pk2.length,gm,cvGap,rm,rspread,verdict,
    rMuS:pearson(mu,S), rTR:pearson(Float64Array.from(T,t=>t<0?NaN:t),rate), rSfd:pearson(S,lnfd), rAnFd:pearson(lnan,lnfd), key:secKey()});
}
const secKey=()=>[cfg.fractal,cfg.power,cfg.seed.re,cfg.seed.im,cfg.radius,itFor(view.w)].join();
function addSection(a,b){
  if(sections.length>=6){ toast('Six lines at most. Delete one first.'); return; }
  const s={a,b,n:+$('secN').value}; computeSection(s); sections.push(s); secSel=sections.length-1; setSecTool(false); openSec();
}
function sectionTap(px,py){
  const p=toWorld(px,py);
  if(!secA){ secA=p; needDraw=true; toast('Point A set. Tap point B.'); }
  else { const a=secA; secA=null; if(Math.hypot(p[0]-a[0],p[1]-a[1])>view.w/Wd*4) addSection(a,p); needDraw=true; }
}
function setSecTool(on){ secTool=on; secA=null; $('bSec').classList.toggle('on',on); cv.classList.toggle('aim',on); needDraw=true;
  if(on) toast(sections.length?'Tap two points for another line':'Tap two points to draw a line across the branches',2600); }
function drawSections(){
  const dot=(p,c,t)=>{ ctx.beginPath(); ctx.arc(p.x,p.y,4.5,0,TAU); ctx.fillStyle=c; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='rgba(0,0,0,.7)'; ctx.stroke();
    if(t) textShadow(t,p.x+8,p.y-7,'700 12px system-ui,sans-serif','left',c); };
  sections.forEach((s,i)=>{
    const A=spots(s.a[0],s.a[1]), B=spots(s.b[0],s.b[1]), c=SEC_COL[i%6];
    A.forEach((p,k)=>{ const q=B[k]; ctx.save(); clipTo(p);
      ctx.lineCap='round'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=i===secSel?5:4; line(p.x,p.y,q.x,q.y);
      ctx.strokeStyle=c; ctx.lineWidth=i===secSel?2.4:1.4; line(p.x,p.y,q.x,q.y);
      dot(p,c,(i+1)+'A'); dot(q,c,'B'); ctx.restore(); });
  });
  if(secA) spots(secA[0],secA[1]).forEach(p=>{ ctx.save(); clipTo(p); dot(p,'#fff','A'); ctx.restore(); });
}
function openSec(){ secOpen=true; $('sec').classList.add('on'); fillSec(); }
function closeSec(){ secOpen=false; $('sec').classList.remove('on'); }
function fillSec(){
  const tabs=$('secTabs'); tabs.replaceChildren();
  sections.forEach((s,i)=>{ const b=document.createElement('button'); b.type='button'; b.textContent=i+1; b.style.borderColor=SEC_COL[i%6]; b.classList.toggle('on',i===secSel);
    b.onclick=()=>{ secSel=i; fillSec(); needDraw=true; }; tabs.append(b); });
  const s=sections[secSel], T=$('secT');
  if(!s){ T.innerHTML=''; $('secNote').textContent='No lines yet. Close this panel and tap two points on the map.'; drawPlot(); return; }
  if(fillSec.resample){ s.n=+$('secN').value; computeSection(s); }
  else if(s.key!==secKey()) computeSection(s);      // the fractal, radius or iteration limit changed since this line was sampled
  fillSec.resample=false; $('secN').value=String(s.n);
  const d=digitsFor(s.ds), pct=x=>(100*x).toFixed(x<0.1?1:0)+' %';
  const rows=[
    ['Line '+(secSel+1), 'A '+cFixed(s.a[0],s.a[1],d)+'<br>B '+cFixed(s.b[0],s.b[1],d)],
    ['Length · step', sci(s.len,3)+' · '+sci(s.ds,2)+' <i>('+num(s.n)+' samples)</i>'],
    ['Escaped', num(s.esc)+' of '+num(s.n)+' <i>at '+num(s.maxIt)+' iterations</i>'+(s.esc<s.n?'<br>'+num(s.late)+' more escape at '+num(s.maxIt*4)+' <i>(the rest: no escape detected)</i>':'')],
    ['Under-sampled', pct(s.jumps)+' <i>of steps skip a whole escape band</i>'],
    ['Peaks of μ', s.pk.length+' <i>at this resolution</i> · '+s.pk2+' <i>at half</i>'],
    ['Peak spacing', s.pk.length>1 ? sci(s.gm,2)+' <i>mean · variation</i> '+(isFinite(s.cvGap)?pct(s.cvGap):'–') : '–'],
    ['Spacing ratio', isFinite(s.rm) ? s.rm.toFixed(3)+' <i>median of consecutive gaps · spread</i> '+(isFinite(s.rspread)?pct(s.rspread):'–') : '–'],
    ['Spacing test', '<i>'+s.verdict+'</i>'],
    ['r(μ, S)', r3(s.rMuS)+' <i>escape time vs sensitivity</i>'],
    ['r(T, S/T)', r3(s.rTR)+' <i>escape time vs stretch per step</i>'],
    ['r(S, ln|dμ/ds|)', r3(s.rSfd)+' <i>sensitivity vs measured slope</i>'],
    ['r(chain rule, measured)', r3(s.rAnFd)+' <i>ln of |D|/(|z| ln|z| ln p) vs ln|dμ/ds|; below 1 where the line is under-sampled</i>']
  ];
  T.innerHTML=rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  $('secNote').textContent='All of these are descriptive numbers for this line, this sample count and this iteration limit. They change with any of the three; a correlation is not a cause.';
  drawPlot();
}
function drawPlot(){
  const c=$('plot'), r=c.getBoundingClientRect(), D=Math.min(window.devicePixelRatio||1,2); if(!r.width) return;
  c.width=Math.round(r.width*D); c.height=Math.round(r.height*D);
  const g=c.getContext('2d'); g.scale(D,D); g.clearRect(0,0,r.width,r.height);
  const s=sections[secSel]; if(!s) return;
  const col=SEC_COL[secSel%6], x0=8, x1=r.width-8, ph=(r.height-22)/3, X=k=>x0+(x1-x0)*k/(s.n-1);
  const panel=(row,title,series)=>{
    const top=row*ph+15, bot=(row+1)*ph-3; let lo=Infinity, hi=-Infinity;
    series.forEach(q=>{ for(const v of q.v) if(isFinite(v)){ if(v<lo) lo=v; if(v>hi) hi=v; } });
    if(!(hi>lo)){ hi=lo+1; }
    const Y=v=>bot-(bot-top)*(v-lo)/(hi-lo);
    g.strokeStyle='rgba(255,255,255,.12)'; g.lineWidth=1; line(x0,bot+.5,x1,bot+.5,g);
    series.forEach(q=>{ g.strokeStyle=q.c; g.lineWidth=q.w||1.2; g.beginPath(); let pen=false;
      for(let k=0;k<s.n;k++){ const v=q.v[k]; if(!isFinite(v)){ pen=false; continue; } const x=X(k), y=Y(v); if(pen) g.lineTo(x,y); else { g.moveTo(x,y); pen=true; } }
      g.stroke(); });
    g.font='600 11px system-ui,sans-serif'; g.textAlign='left'; g.textBaseline='alphabetic'; g.fillStyle='#fff'; g.fillText(title,x0,top-4);
    g.font='10px ui-monospace,Menlo,monospace'; g.textAlign='right'; g.fillStyle='rgba(255,255,255,.6)'; g.fillText(sci(lo,3)+' … '+sci(hi,3),x1,top-4);
    return {top,bot,Y};
  };
  const p1=panel(0,'Escape time  μ (smooth), T (steps, grey)',[{v:Float64Array.from(s.T,t=>t<0?NaN:t),c:'rgba(255,255,255,.35)',w:1},{v:s.mu,c:col,w:1.4}]);
  g.fillStyle='#fff'; s.pk.forEach(k=>{ if(isFinite(s.mu[k])){ g.beginPath(); g.arc(X(k),p1.Y(s.mu[k]),2.4,0,TAU); g.fill(); } });
  panel(1,'Sensitivity  S = ln(1 + |D|)',[{v:s.S,c:col,w:1.3}]);
  panel(2,'Slope  ln|dμ/ds| measured (colour), chain rule (white)',[{v:Float64Array.from(s.an,x=>x>0?Math.log(x):NaN),c:'rgba(255,255,255,.75)',w:1},{v:Float64Array.from(s.fd,x=>x>0?Math.log(x):NaN),c:col,w:1.2}]);
  g.font='10px ui-monospace,Menlo,monospace'; g.fillStyle='rgba(255,255,255,.6)'; g.textBaseline='alphabetic';
  g.textAlign='left'; g.fillText('A  0',x0,r.height-3); g.textAlign='right'; g.fillText(sci(s.len,3)+'  B',x1,r.height-3);
}
function csvOf(list){
  const p=x=>isFinite(x)?x.toPrecision(17):'', q=x=>isFinite(x)?x.toPrecision(10):'';
  const head=['# Fractal Universe Lab cross-section export','# '+eng.name+'  '+asciiRule()+(cfg.fractal==='julia'?'  c = '+cfg.seed.re+' '+(cfg.seed.im<0?'-':'+')+' '+Math.abs(cfg.seed.im)+'i':''),
    '# escape radius '+Math.sqrt(eng.R2)+', iteration limit '+list[0].maxIt+', D = '+(eng.kind?'dz_n/dz_0':'dz_n/dc'),
    '# mu = n + 1 - log_p(log_2|z_n|); S = ln(1 + |D_n|); stretch_rate = S / T; dmu_ds_measured: central difference along the line;',
    '# grad_mu_chain_rule = |D_n| / (|z_n| ln|z_n| ln p); escaped = 0 means no escape detected within the limit (not a proof of membership)',
    ...list.map(s=>'# line '+(sections.indexOf(s)+1)+': A = '+s.a[0].toPrecision(17)+' , '+s.a[1].toPrecision(17)+'  B = '+s.b[0].toPrecision(17)+' , '+s.b[1].toPrecision(17)+'  samples = '+s.n),
    'line,index,distance,re,im,escaped,T,mu,abs_D,S,stretch_rate,dmu_ds_measured,grad_mu_chain_rule'];
  const out=[head.join('\n')];
  list.forEach(s=>{ const id=sections.indexOf(s)+1, dx=s.b[0]-s.a[0], dy=s.b[1]-s.a[1];
    for(let k=0;k<s.n;k++){ const t=k/(s.n-1), e=s.T[k]>=0;
      out.push([id,k,q(k*s.ds),p(s.a[0]+dx*t),p(s.a[1]+dy*t),e?1:0,e?s.T[k]:'',p(s.mu[k]),q(s.aD[k]),q(s.S[k]),q(s.rate[k]),q(s.fd[k]),q(s.an[k])].join(',')); } });
  return out.join('\n')+'\n';
}
function stamp(){ const t=new Date(), p=n=>String(n).padStart(2,'0'); return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}`; }
function download(blob,name){ const u=URL.createObjectURL(blob), a=document.createElement('a'); a.href=u; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); }
$('secCsv').onclick=()=>{ const s=sections[secSel]; if(s) download(new Blob([csvOf([s])],{type:'text/csv'}),`section-${secSel+1}-${stamp()}.csv`); };
$('secAll').onclick=()=>{ if(sections.length) download(new Blob([csvOf(sections)],{type:'text/csv'}),`sections-${stamp()}.csv`); };
$('secDel').onclick=()=>{ if(secSel<0) return; sections.splice(secSel,1); secSel=Math.min(secSel,sections.length-1); needDraw=true; fillSec(); };
$('secAdd').onclick=()=>{ closeSec(); setSecTool(true); };
$('secN').onchange=()=>{ fillSec.resample=true; fillSec(); };
$('secX').onclick=closeSec;
$('bSec').onclick=()=>{ closePop(); if(secOpen){ closeSec(); return; } if(secTool){ setSecTool(false); if(sections.length) openSec(); } else setSecTool(true); };
