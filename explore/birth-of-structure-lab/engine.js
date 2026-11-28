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
  {v:'multibrot',  t:'Multibrot',  s:'z → zⁿ + c'},
  ...Object.entries(GEOMETRIC).map(([v,g])=>({v,t:g.name,s:g.rule}))
];
const MODES=[
 {v:'coherence',t:'Rotation coherence',s:'Mean resultant length of local derivative rotations; fixed range 0–1. For Cartesian integer degree and c=0, average the complex resultant over a Gaussian pixel-angle aperture.',tag:'Rotation coherence'},
{v:'normphase',t:'Normalized phase',s:'Böttcher angle of the superattracting cycle (any centre c)',tag:'Normalized phase'},
{v:'stablephase',t:'Stable phase',s:'arg of the derivative without convergence stopping (any centre c)',tag:'Stable phase'},
{v:'jointmag',t:'Combined magnitude',s:'Hypot of divergence and curl',tag:'Joint magnitude'},
{v:'jointphase',t:'Combined phase',s:'Angle of divergence + i curl',tag:'Joint phase'},
{v:'phase',t:'Rotation phase',s:'arg D at stopping point',tag:'Rotation'},
{v:'vdiv',t:'Complex field divergence',s:'Divergence of log-compressed complex derivative',tag:'Vector divergence'},
{v:'vcurl',t:'Complex field curl',s:'Curl of log-compressed complex derivative',tag:'Vector curl'},
{v:'maskdiff',t:'Mask difference',s:'Absolute raw sensitivity removed by masking',tag:'Mask difference'},
{"v":"sgrad","t":"Scalar gradient","s":"Magnitude of ∇S; arrows optional","tag":"2 · Gradient"},
{"v":"sdiv","t":"Scalar Laplacian","s":"Laplacian of S; signed expansion/compression","tag":"3 · Divergence"},
{"v":"scurl","t":"Gradient curl (zero check)","s":"Mixed partial difference; expected zero","tag":"4 · Curl control"},
{"v":"shess","t":"Scalar Hessian","s":"Frobenius norm of second derivative matrix","tag":"5 · Hessian"},
  {v:'waves',t:'Hide Set · stability field',s:'Log derivative magnitude at orbit stopping point; no membership mask',tag:'Unmasked sensitivity'},
  {v:'escape', t:'Escape time',       s:'smooth μ = n + 1 − log₂ log₂|zₙ|',          tag:'Escape time μ'},
  {v:'binary', t:'Black / white',     s:'white: escaped · black: no escape detected', tag:'Escape / no escape'},
  {v:'ridges',t:'Sensitivity ridges',s:'Local maxima across opposite sampled neighbors of raw log derivative; fixed minimum prominence, no smoothing',tag:'Sensitivity ridges'},
  {v:'sens',   t:'Orbit sensitivity', s:'S = ln(1 + |dzₙ/dc|) at escape',            tag:'Sensitivity S'},
  {v:'dld',t:'Discrete Lagrangian Descriptor',s:'DLD = Σ |Δwⱼ|^(1/64), Riemann sphere, up to 256 steps',tag:'DLD orbit movement'},
  {v:'potential', t:"Green's potential", s:'Exterior potential G ≈ log|zₙ| / pⁿ; colors show log G (finite-escape estimate)', tag:'Green potential (estimated)'},
  {v:'flat',   t:'Sensitivity, bands removed', s:'ln(|D| / (|z| ln|z|)): exact |∇μ| by the chain rule', tag:'S, bands removed'},
];
MODES.push({v:'scalar',t:'Scalar field',s:'Display the selected scalar source',tag:'Scalar field'},{v:'distance',t:'Distance to set',s:'Distance to nearest sampled member in this view; black if unavailable',tag:'Sampled distance'});
MODES.push({v:'construction',t:'Construction depth',s:'Colour by finite construction or removal generation',tag:'Construction depth'});
const modeOf=v=>MODES.find(m=>m.v===v)||MODES[0];
const SEEDS=[['Rabbit',-0.122561166876654,0.744861766619744],['Basilica',-1,0],['Dendrite',0,1],['Siegel disk',-0.390540870218399,-0.586787907346969],
  ['Cauliflower',0.25,0],['Airplane',-1.754877666246693,0],['Spiral',-0.8,0.156],['Galaxy',0.285,0.01],['Seahorse',-0.745,0.113],['Dust',0.3,0.5]];
const DEFAULTS={scalarSource:'auto',geometryDepth:0,fractal:'mandelbrot', power:3, juliaPower:2, seed:{re:SEEDS[0][1],im:SEEDS[0][2]}, mode:'escape', panels:['escape','sens','gradt','flat'],
  depth:0, polar:false, bottcher:false, bottcherGMin:0.02, bottcherGMax:0.6, logPolar:false, logDomain:'fundamental', logAngleSpan:2*Math.PI, logOuter:Math.log(2), logSpan:Math.log(10000), palette:'classic', dldIterations:1000, dldContrast:2.5, iter:0, radius:2, stopMode:'outward', clean:false, contours:true, contourLevels:8, contourOpacity:70, contourColor:'white'};
const clone=c=>({...c, seed:{...c.seed}, panels:[...c.panels]});
let cfg=clone(DEFAULTS), started=false;
const SUP={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
const sup=n=>String(n).split('').map(ch=>SUP[ch]).join('');

// Is c a centre (0 on a superattracting p-cycle)? Smallest p with f^p(0) = 0, refined by Newton; null otherwise.
// Returns the refined centre, the cycle w_0 = 0, w_1 = c, …, w_{p-1}, and a = (f^{p-1})'(c) = Π_{j=1}^{p-1} 2 w_j, so f^p(z) = a z² + … near 0.
function centreOf(cr,ci){
  let zr=0,zi=0,low=Infinity; const cand=[];
  for(let k=1;k<=4096;k++){ const t=zr*zr-zi*zi+cr; zi=2*zr*zi+ci; zr=t; const r=Math.hypot(zr,zi); if(!(r<=4)) return null; if(r<low){ low=r; if(r<1e-6) cand.push(k); } }
  for(const p of cand){
    let a=cr,b=ci,good=false;
    for(let i=0;i<60;i++){
      let x=0,y=0,vr=0,vi=0;
      for(let k=0;k<p;k++){ const nv=2*(x*vr-y*vi)+1; vi=2*(x*vi+y*vr); vr=nv; const t=x*x-y*y+a; y=2*x*y+b; x=t; }
      const d=vr*vr+vi*vi; if(!(d>0)) break;
      const sr=(x*vr+y*vi)/d, si=(y*vr-x*vi)/d; a-=sr; b-=si;
      if(Math.hypot(sr,si)<1e-14*Math.max(1,Math.hypot(a,b))){ good=true; break; }
    }
    if(!good||Math.hypot(a-cr,b-ci)>1e-9*Math.max(1,Math.hypot(cr,ci))) continue;
    const w=new Float64Array(2*p); let x=0,y=0,lnA=0,argA=0,early=false;
    for(let k=1;k<p;k++){ const t=x*x-y*y+a; y=2*x*y+b; x=t; w[2*k]=x; w[2*k+1]=y; const r=Math.hypot(x,y); if(r<1e-9){ early=true; break; } lnA+=Math.log(2*r); argA+=Math.atan2(y,x); }
    if(early||lnA>600) continue;
    return {p,cr:a,ci:b,w,lnA,argA:Math.atan2(Math.sin(argA),Math.cos(argA)),rho:Math.min(0.125,0.25*Math.exp(-lnA)),cap:Math.min(40000,20*p)};
  }
  return null;
}
// the mathematical universe: what the worker needs, the home frame and how far the camera may wander
function engineOf(c){
  const R=c.radius;
  if(isGeometry(c.fractal)){const g=GEOMETRIC[c.fractal];return {kind:2,geometry:c.fractal,geometryDepth:geometryDepth(c),geometryParams:geometryParameters(c),pw:2,kr:0,ki:0,R2:R*R,name:g.name,rule:geometryRule(c),hx:0,hy:0,span:c.fractal==='tree'&&geometryParameters(c).treeRatio>.65?3.4:g.span,bx:2,by:2};}
  if(c.fractal==='julia'){
    const m=Math.hypot(c.seed.re,c.seed.im), rad=(1+Math.sqrt(1+4*m))/2;   // the filled Julia set lies within this radius
    return {kind:1,pw:c.juliaPower,kr:c.seed.re,ki:c.seed.im,centre:c.juliaPower===2?centreOf(c.seed.re,c.seed.im):null,R2:R*R,name:'Julia set',rule:'z → z^'+Number(c.juliaPower.toPrecision(7))+' + c',hx:0,hy:0,span:2*rad*1.04,bx:rad+0.8,by:rad+0.8};
  }
  if(c.fractal==='multibrot')
    return {kind:0,pw:c.power,kr:0,ki:0,R2:R*R,name:'Multibrot '+c.power,rule:'z → z'+sup(c.power)+' + c',hx:0,hy:0,span:3,bx:2,by:2};
  return {kind:0,pw:2,kr:0,ki:0,R2:R*R,name:'Mandelbrot set',rule:'z → z² + c',hx:-0.75,hy:0,span:0,cxm:-0.6,bx:2,by:1.6};
}
let eng=engineOf(cfg);
const asciiRule=()=>eng.geometry?eng.rule:'z -> z^'+eng.pw+' + c';
const diffMode=m=>['sgrad','sdiv','scurl','shess'].includes(m);
const complexMode=m=>['normphase','stablephase','phase','vdiv','vcurl','jointmag','jointphase'].includes(m);
const activeScalarSource=()=>scalarSourceFor(cfg.fractal,cfg.scalarSource);
const distanceActive=()=>cfg.mode==='distance'||(scalarMode(cfg.mode)&&activeScalarSource()==='distance');
const needD=()=>cfg.mode==='ridges'||cfg.mode==='coherence'||complexMode(cfg.mode)||cfg.mode==='maskdiff'||(scalarMode(cfg.mode)&&cfg.mode!=='distance'&&activeScalarSource()==='sensitivity')||cfg.mode==='waves'||cfg.mode==='sens'||cfg.mode==='flat'||cfg.mode==='compare'||(typeof vectorOverlay!=='undefined'&&vectorOverlay.enabled&&vectorOverlay.source==='sens');
const cmp=()=>cfg.mode==='compare';

/* ---------- worker: one strip of rows on a rotated grid. kind 0: the pixel is c and z₀ = 0 (parameter plane);
   kind 1: the pixel is z₀ and c is fixed (dynamical plane). Returns numbers, not colours:
   T = first n with |zₙ| > R (65535: no escape detected), F = μ − T, S = ln(1 + |Dₙ|) with D = dz/dc (kind 0) or dz/dz₀ (kind 1). ---------- */
const WORKER_SRC=`

// Principal branch: z^p = exp(p (ln|z| + i Arg(z))), Arg in (-pi,pi].
// For noninteger p this map is discontinuous across the negative real axis.
function principalPower(zr,zi,p){
  const m=Math.hypot(zr,zi);
  if(m===0) return p>0?[0,0]:[NaN,NaN];
  const a=p*Math.atan2(zi,zr), r=Math.pow(m,p);
  return [r*Math.cos(a),r*Math.sin(a)];
}

// Escape potential normalized for the dynamical plane, or for c in the parameter plane.
// Stop once the remaining logarithmic correction is negligible. Zero means no escape detected.
function bottcherPotential(zr,zi,cr,ci,d){
  const cutoff=Math.log1p(Math.hypot(cr,ci))+40;
  let weight=1;
  for(let n=0;n<2048;n++){
    const r=Math.hypot(zr,zi);
    if(r>1&&d*Math.log(r)>=cutoff)return weight*Math.log(r);
    const a=d*Math.atan2(zi,zr),m=Math.pow(r,d);
    zr=m*Math.cos(a)+cr;zi=m*Math.sin(a)+ci;weight/=d;
    if(!Number.isFinite(zr)||!Number.isFinite(zi))return NaN;
    if(weight===0)return 0;
  }
  return 0;
}
// Lift a fixed-angle radial path from infinity. At every inverse level choose the root
// continuous with its previous value, never the root closest to the asymptotic angle alone.
function bottcherInverse(u,theta,cr,ci,d=2,critical=0,state=null){
  const fail=[NaN,NaN],TAU=2*Math.PI;
  if(!(u>0)||!Number.isFinite(u)||!Number.isInteger(d)||d<2||u<=critical)return fail;
  if(cr===0&&ci===0)return [Math.exp(u)*Math.cos(theta),Math.exp(u)*Math.sin(theta)];
  const cutoff=Math.log1p(Math.hypot(cr,ci))+40;
  let g=Math.max(u,cutoff/d),angles=[theta],prev=[],step=.45,attempts=0;
  function lift(v,old){
    let k=0,h=v;
    while(d*h<cutoff&&k<64){h*=d;k++;if(angles[k]===undefined)angles[k]=Math.atan2(Math.sin(d*angles[k-1]),Math.cos(d*angles[k-1]));}
    if(h>700||k===64)return null;
    const a=angles[k],m=Math.exp(h),out=[];
    let x=m*Math.cos(a),y=m*Math.sin(a);
    out[k]=[x,y];
    for(let j=k-1;j>=0;j--){
      const xr=x-cr,yi=y-ci,r=Math.hypot(xr,yi);
      if(!(r>0)||!Number.isFinite(r))return null;
      const arg=Math.atan2(yi,xr),ref=old[j]?Math.atan2(old[j][1],old[j][0]):angles[j];
      const t=(arg+TAU*Math.round((d*ref-arg)/TAU))/d;
      const change=Math.abs(Math.atan2(Math.sin(t-ref),Math.cos(t-ref)));
      if(change>Math.PI/(3*d))return null;
      const mag=Math.pow(r,1/d);x=mag*Math.cos(t);y=mag*Math.sin(t);out[j]=[x,y];
    }
    return out;
  }
  if(state&&state.g>=u&&state.prev){g=state.g;prev=state.prev;angles=state.angles;}else{prev=lift(g,[]);if(!prev)return fail;}
  while(g>u*(1+1e-14)&&attempts++<512){
    const next=Math.max(u,g*Math.exp(-step)),q=lift(next,prev);
    if(!q){step/=2;if(step<1e-7)return fail;continue;}
    prev=q;g=next;step=Math.min(.45,step*1.35);
  }
  if(g>u*(1+1e-14))return fail;
  const z=prev[0],check=bottcherPotential(z[0],z[1],cr,ci,d);
  if(!Number.isFinite(check)||Math.abs(check-u)>Math.max(2e-12,u*2e-5))return fail;
  if(state){state.g=g;state.prev=prev;state.angles=angles;}
  return z;
}

// Numerical parameter-plane uniformization for z -> z²+c.
// Phi_M(c) = c * product_{k>=1}(1+c/z_k²)^(1/2^k), z_1=c.
// Principal logarithms are continued locally with a damped Newton solve.
// Return NaN on nonconvergence; do not silently display incorrect coordinates.
function parameterLogPhi(cr,ci){
 let zr=cr,zi=ci,dr=1,di=0,lr=0,li=0,ar=0,ai=0,weight=.5;
 const cm=cr*cr+ci*ci;if(cm<1e-24)return null;
 const cmag=Math.sqrt(cm);lr=Math.log(cmag);li=Math.atan2(ci,cr);
 ar=cr/cm;ai=-ci/cm;
 for(let k=1;k<=34;k++){
   if(2*Math.log(Math.hypot(zr,zi))>=Math.log1p(Math.hypot(cr,ci))+40)break;
   const qr=zr*zr-zi*zi,qi=2*zr*zi,den=qr*qr+qi*qi;
   if(!(den>1e-290))return null;
   const vr=(cr*qr+ci*qi)/den,vi=(ci*qr-cr*qi)/den;
   const tr=1+vr,ti=vi,tm=Math.hypot(tr,ti);
   if(!(tm>1e-280))return null;
   lr+=weight*Math.log(tm);li+=weight*Math.atan2(ti,tr);
   // derivative of c/z² = 1/z² - 2c z'/z³
   const invr=qr/den,invi=-qi/den;
   const d1r=dr*invr-di*invi,d1i=dr*invi+di*invr;
   const pr=cr*d1r-ci*d1i,pi=cr*d1i+ci*d1r;
   const vrp=invr-2*(pr*invr-pi*invi),vip=invi-2*(pr*invi+pi*invr);
   const tden=tr*tr+ti*ti;
   ar+=weight*(vrp*tr+vip*ti)/tden;
   ai+=weight*(vip*tr-vrp*ti)/tden;
   const nr=qr+cr,ni=qi+ci;
   const ndr=2*(zr*dr-zi*di)+1,ndi=2*(zr*di+zi*dr);
   zr=nr;zi=ni;dr=ndr;di=ndi;
   weight*=.5;
   if(!Number.isFinite(zr)||!Number.isFinite(dr)||weight<1e-11)break;
 }
 return [lr,li,ar,ai];
}
function parameterInverseFar(u,theta){
 const wr=Math.exp(u)*Math.cos(theta),wi=Math.exp(u)*Math.sin(theta);
 let cr=wr-.5,ci=wi;
 for(let n=0;n<28;n++){
   const a=parameterLogPhi(cr,ci);if(!a)return [NaN,NaN];
   const er=a[0]-u,ei=Math.atan2(Math.sin(a[1]-theta),Math.cos(a[1]-theta));
   if(Math.hypot(er,ei)<2e-6)return [cr,ci];
   const den=a[2]*a[2]+a[3]*a[3];if(!(den>1e-22))break;
   let sr=(er*a[2]+ei*a[3])/den,si=(ei*a[2]-er*a[3])/den;
   const maxStep=Math.max(.025,Math.hypot(cr,ci)*.35),m=Math.hypot(sr,si);
   if(m>maxStep){sr*=maxStep/m;si*=maxStep/m;}
   cr-=sr;ci-=si;
 }
 return [NaN,NaN];
}

// Continue a parameter ray using dc/d(log G)=G/(Phi'_M/Phi_M).
// The logarithmic derivative is single-valued even where an argument branch is not.
function parameterRaySlope(cr,ci){
  let x=cr,y=ci,dx=1,dy=0,w=1;
  const cutoff=Math.log1p(Math.hypot(cr,ci))+40;
  for(let k=0;k<80;k++){
    const m=Math.hypot(x,y),l=Math.log(m);
    if(2*l>=cutoff){
      const den=dx*dx+dy*dy;if(!(den>0)||!Number.isFinite(den))return null;
      return [l*(x*dx+y*dy)/den,l*(y*dx-x*dy)/den,w*l];
    }
    const nr=x*x-y*y+cr,ni=2*x*y+ci,dr=2*(x*dx-y*dy)+1,di=2*(x*dy+y*dx);
    x=nr;y=ni;dx=dr;dy=di;w*=.5;
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return null;
  }
  return null;
}
function parameterInverse(u,theta,state=null){
  const fail=[NaN,NaN];if(!(u>0)||!Number.isFinite(u))return fail;
  const reuse=state&&state.g>=u&&state.z,start=reuse?state.g:Math.max(3,u),z=reuse?state.z:parameterInverseFar(start,theta);
  if(!Number.isFinite(z[0]))return fail;
  let x=z[0],y=z[1],g=Math.log(start),end=Math.log(u),h=.18,tries=0;
  function rk(x,y,h){
    const a=parameterRaySlope(x,y);if(!a)return null;
    const b=parameterRaySlope(x+h*a[0]/2,y+h*a[1]/2);if(!b)return null;
    const c=parameterRaySlope(x+h*b[0]/2,y+h*b[1]/2);if(!c)return null;
    const d=parameterRaySlope(x+h*c[0],y+h*c[1]);if(!d)return null;
    return [x+h*(a[0]+2*b[0]+2*c[0]+d[0])/6,y+h*(a[1]+2*b[1]+2*c[1]+d[1])/6];
  }
  while(g>end+1e-13&&tries++<3000){
    const step=-Math.min(h,g-end),a=rk(x,y,step),b=rk(x,y,step/2),c=b&&rk(b[0],b[1],step/2);
    const err=a&&c?Math.hypot(a[0]-c[0],a[1]-c[1]):Infinity,tol=2e-8*Math.max(1,Math.hypot(x,y));
    if(err>tol){h/=2;if(h<1e-7)return fail;continue;}
    const nx=c[0]+(c[0]-a[0])/15,ny=c[1]+(c[1]-a[1])/15,q=parameterRaySlope(nx,ny);
    const goal=Math.exp(g+step);
    if(!q||Math.abs(q[2]-goal)>Math.max(2e-7,goal*2e-5)){h/=2;if(h<1e-7)return fail;continue;}
    x=nx;y=ny;g+=step;h=Math.min(.3,h*(err<tol/16?1.6:1.15));
  }
  if(g>end+1e-13)return fail;
  if(state){state.g=u;state.z=[x,y];}
  return [x,y];
}


// One whole period from a point z near 0, given in log-polar form (lr = ln|z|, t = arg z), computed without cancellation:
// z_j = w_j + s·η_j with s = z², η_1 = 1, η_{j+1} = 2 w_j η_j + s η_j²  (exact rearrangement of z_{j+1} = z_j² + c).
// Returns f^p(z) = s·η_p in log-polar form and (f^p)'(z) = 2z·Π_{j≥1} 2 z_j as ln|·| and arg.
function periodFromZero(lr,t,C){
  const w=C.w, p=C.p, e=Math.exp(2*lr), sr=e*Math.cos(2*t), si=e*Math.sin(2*t);   // s underflows to 0 when z² is below 1e-308: then η is linear, exactly
  let er=1,ei=0,lP=0,aP=0;
  for(let j=1;j<p;j++){
    const zr=w[2*j]+sr*er-si*ei, zi=w[2*j+1]+sr*ei+si*er;                       // z_j = w_j + s η_j
    lP+=Math.log(2*Math.hypot(zr,zi)); aP+=Math.atan2(zi,zr);
    const qr=er*er-ei*ei, qi=2*er*ei, nr=2*(w[2*j]*er-w[2*j+1]*ei)+sr*qr-si*qi, ni=2*(w[2*j]*ei+w[2*j+1]*er)+sr*qi+si*qr;
    er=nr; ei=ni; if(!Number.isFinite(er)||!Number.isFinite(ei)) return null;
  }
  const lE=Math.log(Math.hypot(er,ei)), aE=Math.atan2(ei,er);
  return {lr:2*lr+lE, t:2*t+aE, lD:Math.LN2+lr+lP, aD:t+aP, aEta:aE};
}
const wrapA=t=>Math.atan2(Math.sin(t),Math.cos(t));
// Normalized phase: the Böttcher angle of the superattracting cycle, φ(f^p z) = φ(z)²:
// arg φ(z) = arg(a z) + Σ_k 2^-(k+1) arg(η_p(z_k)/a), taken at the first entry into |z| < ρ.
function normalizedCentre(x,y,N,R2,C){
 let n=0;
 while(Math.hypot(x,y)>=C.rho && n<N){ if(x*x+y*y>R2)return [NaN,0,n]; const t=x*x-y*y+C.cr; y=2*x*y+C.ci; x=t; n++; }
 if(Math.hypot(x,y)>=C.rho || (x===0&&y===0))return [NaN,0,n];
 let lr=Math.log(Math.hypot(x,y)), t=Math.atan2(y,x), res=C.argA+t, weight=.5;
 while(n+C.p<=N && 2*lr>-80){                         // below |z|² = 1e-35 the remaining corrections vanish in double precision
  const q=periodFromZero(lr,t,C); if(!q) return [NaN,0,n];
  res+=weight*wrapA(q.aEta-C.argA); weight*=.5; lr=q.lr; t=wrapA(q.t); n+=C.p;
 }
 n+=C.p*Math.floor((N-n)/C.p);
 return [wrapA(res),1,n];
}
// Stable phase: arg (f^N)'(z0) and ln|(f^N)'(z0)| with no convergence stopping. Ordinary steps until the orbit is within ρ of 0;
// from there whole periods by periodFromZero (nothing cancels or underflows), and the last partial period the same way.
function stableCentre(x,y,N,R2,C){
 let n=0, phase=0, logD=0; const top=0.5*Math.log(R2);
 while(n<N){
  const r=Math.hypot(x,y);
  if(r===0) return [NaN,-Infinity,n+1];
  if(Math.log(r)>top) break;
  if(r<C.rho){
   let lr=Math.log(r), t=Math.atan2(y,x);
   while(n+C.p<=N){ const q=periodFromZero(lr,t,C); if(!q) return [NaN,-Infinity,n]; phase=wrapA(phase+q.aD); logD+=q.lD; lr=q.lr; t=wrapA(q.t); n+=C.p; }
   if(n<N){                                                // partial period: steps 0 … N−n−1 from z near 0
    const w=C.w, e=Math.exp(2*lr), sr=e*Math.cos(2*t), si=e*Math.sin(2*t); let er=1,ei=0;
    phase=wrapA(phase+t); logD+=Math.LN2+lr; n++;
    for(let j=1;n<N;j++,n++){ const zr=w[2*j]+sr*er-si*ei, zi=w[2*j+1]+sr*ei+si*er;   // j = steps since the point near 0
      phase=wrapA(phase+Math.atan2(zi,zr)); logD+=Math.LN2+Math.log(Math.hypot(zr,zi));
      const qr=er*er-ei*ei, qi=2*er*ei, nr=2*(w[2*j]*er-w[2*j+1]*ei)+sr*qr-si*qi, ni=2*(w[2*j]*ei+w[2*j+1]*er)+sr*qi+si*qr; er=nr; ei=ni; }
   }
   return [phase,logD,n];
  }
  phase=wrapA(phase+Math.atan2(y,x)); logD+=Math.LN2+Math.log(r);
  const t=x*x-y*y+C.cr; y=2*x*y+C.ci; x=t; n++;
 }
 return [phase,logD,n];
}
// Monomial calibration: exact angular dynamics, independent of radial underflow.
// The Gaussian angular aperture is a local model of a finite pixel, not a change
// to the orbit. Average the complex resultant before taking its magnitude.
function monomialCoherence(x,y,d,N,R2,stopMode,sigma){
  const radius=Math.hypot(x,y);
  if(!(radius>0)||!Number.isFinite(radius))return NaN;
  let count=N, logRadius=Math.log(radius), logR=.5*Math.log(R2);
  if(stopMode!=='fixed'){
    count=0;
    while(count<N&&(stopMode==='inward'?logRadius>=logR:logRadius<=logR)){
      count++;logRadius*=d;
    }
  }
  if(count<2)return NaN;
  const theta=Math.atan2(y,x);
  let phase=(d-1)*theta,frequency=d-1,re=0,im=0;
  for(let n=0;n<count;n++){
    const q=frequency*sigma;
    // Remaining Gaussian weights are negligible at this bound.
    if(q>=9)break;
    const weight=Math.exp(-.5*q*q);
    re+=weight*Math.cos(phase);im+=weight*Math.sin(phase);
    phase=(phase*d)%(2*Math.PI);frequency*=d;
  }
  return Math.min(1,Math.hypot(re,im)/count);
}
onmessage=e=>{
  const m=e.data, {W,y0row,rows,or,oi,exr,exi,eyr,eyi,maxIt,kind,pw,kr,ki,R2,stopMode,needD,needDLD,dldIterations,polar,polarCx,polarCy,polarRadius,polarH,polarAngle,logPolar,logAngleSpan,logOuter,logSpan,bottcher,bottcherGMin,bottcherGMax,bottcherCritical}=m;
  const N=W*rows, T=new Uint16Array(N), F=new Float32Array(N), S=needD?new Float64Array(N):null, DLD=needDLD?new Float32Array(N):null, A=needD?new Float64Array(N):null, C=m.coherence?new Float64Array(N):null;
  const G=bottcher?new Float64Array(N).fill(NaN):null;
  const julia=kind===1, eps=julia?1e-13:0, quick=!julia&&pw===2, add=julia?0:1, ilp=pw>1?1/Math.log(pw):0;
  let minN=1e9;
  const monomial=m.coherence&&julia&&!polar&&!bottcher&&kr===0&&ki===0&&Number.isInteger(pw)&&pw>=2;
  const pixelStep=Math.max(Math.hypot(exr,exi),Math.hypot(eyr,eyi));
  const rayStates=bottcher?Array.from({length:W},()=>({})):null;
  for(let r=0;r<rows;r++){
    const Rw=y0row+r, rr=or+Rw*eyr, ri=oi+Rw*eyi;
    for(let x=0;x<W;x++){
      let pr=rr+x*exr, pq=ri+x*exi; const i=r*W+x;
      if(bottcher){
        const t=(Rw+0.5)/polarH;
        const u=Math.exp(Math.log(bottcherGMax)*(1-t)+Math.log(bottcherGMin)*t);
        const theta=polarAngle+2*Math.PI*((x+0.5)/W-0.5);
        [pr,pq]=kind===1?bottcherInverse(u,theta,kr,ki,pw,bottcherCritical||0,rayStates[x]):pw===2?parameterInverse(u,theta,rayStates[x]):[NaN,NaN];
        if(Number.isFinite(pr)&&Number.isFinite(pq)){const measured=kind===1?bottcherPotential(pr,pq,kr,ki,pw):bottcherPotential(pr,pq,pr,pq,2);if(measured>0&&Number.isFinite(measured))G[i]=Math.log(measured);}
      } else if(polar){ const theta=polarAngle+(logPolar?(logAngleSpan||2*Math.PI):2*Math.PI)*((x+0.5)/W-0.5), radius=logPolar?Math.exp(logOuter-logSpan*(Rw+0.5)/polarH):polarRadius*(Rw+0.5)/polarH; pr=polarCx+radius*Math.cos(theta); pq=polarCy+radius*Math.sin(theta); }
      if(!Number.isFinite(pr)||!Number.isFinite(pq)){T[i]=65535;F[i]=NaN;if(S)S[i]=NaN;if(A)A[i]=NaN;if(DLD)DLD[i]=NaN;continue;}
      if(m.geometry){const q=geometrySample(m.geometry,pr,pq,m.geometryDepth,m.geometryParams);T[i]=q[0]?q[1]:65535;F[i]=q[1];if(q[0])minN=Math.min(minN,q[1]);if(S)S[i]=NaN;if(A)A[i]=NaN;if(C)C[i]=NaN;if(DLD)DLD[i]=NaN;continue;}
      if(m.normalizedPhase){const q=normalizedCentre(pr,pq,Math.min(maxIt,m.centre.cap),Math.max(4,R2),m.centre);A[i]=q[0];S[i]=q[1];T[i]=q[2];continue;}
      if(m.stablePhase){const q=stableCentre(pr,pq,Math.min(maxIt,m.centre.cap),Math.max(4,R2),m.centre);A[i]=q[0];S[i]=Math.max(0,q[1]);T[i]=q[2];continue;}
      let zr,zi,cr,ci,dr,di;
      if(julia){ zr=pr; zi=pq; cr=kr; ci=ki; dr=1; di=0; }
      else {
        cr=pr; ci=pq; zr=0; zi=0; dr=0; di=0;
        if(quick && !needD && !needDLD && stopMode==='outward' && R2>=4){ const xr=cr-0.25, q=xr*xr+ci*ci; if(q*(q+xr)<=0.25*ci*ci || (cr+1)*(cr+1)+ci*ci<=0.0625){ T[i]=65535; continue; } }
      }
      let sumCos=0,sumSin=0,phaseCount=0;
      const angularSigma=monomial?Math.max(16*Number.EPSILON,pixelStep/(Math.sqrt(12)*Math.hypot(pr,pq))):0;
      const calibrated=monomial?monomialCoherence(pr,pq,pw,maxIt,R2,stopMode,angularSigma):NaN;
       let zr2=zr*zr, zi2=zi*zi, n=0, qr=zr, qi=zi, lim=8, cnt=0, inside=false;
      if(needDLD){
        let x=zr,y=zi,total=0;
        const sphere=(x,y)=>{
          const scale=Math.max(1,Math.abs(x),Math.abs(y)),u=x/scale,v=y/scale,t=1/scale,d=u*u+v*v+t*t;
          return [2*u*t/d,2*v*t/d,(u*u+v*v-t*t)/d];
        };
        let prev=sphere(x,y);
        for(let step=0;step<dldIterations;step++){
          let wr,wi;
          if(pw===2){wr=x*x-y*y;wi=2*x*y;}
          else if(!Number.isInteger(pw)||pw<2){[wr,wi]=principalPower(x,y,pw);}
          else {wr=x;wi=y;for(let q=2;q<pw;q++){const t=wr*x-wi*y;wi=wr*y+wi*x;wr=t;}}
          x=wr+cr;y=wi+ci;
          if(!Number.isFinite(x)||!Number.isFinite(y))break;
          const next=sphere(x,y);
          const dx=Math.abs(next[0]-prev[0]),dy=Math.abs(next[1]-prev[1]),dz=Math.abs(next[2]-prev[2]);
          total+=Math.pow(dx,1/64)+Math.pow(dy,1/64)+Math.pow(dz,1/64);
          prev=next;
          if(dx+dy+dz<1e-12 && Math.hypot(x,y)>10)break;
        }
        DLD[i]=total;
      }
      while(stopMode==='fixed' ? n<maxIt : stopMode==='inward' ? zr2+zi2>=R2 : zr2+zi2<=R2){
        if(n>=maxIt){ if(stopMode!=='fixed')inside=true; break; }
        if(m.coherence&&!monomial&&julia&&pw>0&&(zr!==0||zi!==0)){const a=(pw-1)*Math.atan2(zi,zr);sumCos+=Math.cos(a);sumSin+=Math.sin(a);phaseCount++;}
         if(pw===2){
          if(needD){ const t=2*(zr*dr-zi*di)+add; di=2*(zr*di+zi*dr); dr=t; }
          zi=2*zr*zi+ci; zr=zr2-zi2+cr;
        } else if(!Number.isInteger(pw) || pw<2){
          const [wr,wi]=principalPower(zr,zi,pw);
          if(needD){ const [ar,ai]=principalPower(zr,zi,pw-1); const t=pw*(ar*dr-ai*di)+add; di=pw*(ar*di+ai*dr); dr=t; }
          zr=wr+cr; zi=wi+ci;
        } else {
          let wr=zr, wi=zi; for(let k=2;k<pw;k++){ const t=wr*zr-wi*zi; wi=wr*zi+wi*zr; wr=t; }
          if(needD){ const t=pw*(wr*dr-wi*di)+add; di=pw*(wr*di+wi*dr); dr=t; }
          const t=wr*zr-wi*zi+cr; zi=wr*zi+wi*zr+ci; zr=t;
        }
        zr2=zr*zr; zi2=zi*zi; n++;
        if(!Number.isFinite(zr2+zi2)){ if(Number.isNaN(zr2+zi2)){inside=true;} break; }
        if(!m.coherence && stopMode==='outward' && Math.abs(zr-qr)+Math.abs(zi-qi)<=eps){ inside=true; break; }
        if(++cnt===lim){ cnt=0; lim<<=1; qr=zr; qi=zi; }
      }
      if(needD){S[i]=Math.log1p(Math.hypot(dr,di));A[i]=(dr===0&&di===0)?NaN:Math.atan2(di,dr);if(C)C[i]=monomial?calibrated:phaseCount>=2?Math.min(1,Math.hypot(sumCos,sumSin)/phaseCount):NaN;}
      if(inside){ T[i]=65535; continue; }
      if(n<minN) minN=n;
      T[i]=n; F[i]=stopMode==='outward' && pw>1 ? 1-Math.log(Math.max(1e-300,Math.log2(Math.max(1.000001,zr2+zi2))*0.5))*ilp : 0;
      if(needD){S[i]=Math.log1p(Math.hypot(dr,di));A[i]=(dr===0&&di===0)?NaN:Math.atan2(di,dr);if(C)C[i]=monomial?calibrated:phaseCount>=2?Math.min(1,Math.hypot(sumCos,sumSin)/phaseCount):NaN;}
    }
  }
  postMessage({tag:m.tag,id:m.id,job:m.job,pass:m.pass,y0row,rows,T,F,S,A,C,DLD,G,minN},[T.buffer,F.buffer,...(G?[G.buffer]:[]),...(S?[S.buffer,A.buffer]:[]),...(C?[C.buffer]:[]),...(DLD?[DLD.buffer]:[])]);
};`;
// Principal branch: z^p = exp(p (ln|z| + i Arg(z))), Arg in (-pi,pi].
// For noninteger p this map is discontinuous across the negative real axis.
function principalPower(zr,zi,p){
  const m=Math.hypot(zr,zi);
  if(m===0) return p>0?[0,0]:[NaN,NaN];
  const a=p*Math.atan2(zi,zr), r=Math.pow(m,p);
  return [r*Math.cos(a),r*Math.sin(a)];
}
const NW=Math.max(2,Math.min(8,(navigator.hardwareConcurrency||4)));
const workerURL=URL.createObjectURL(new Blob([geometrySample.toString(),'\n',WORKER_SRC],{type:'text/javascript'}));
const idle=[]; let queue=[];
for(let i=0;i<NW;i++){ const w=new Worker(workerURL); w.onmessage=onStrip; idle.push(w); }
function pump(){ while(idle.length && queue.length){ idle.pop().postMessage(queue.shift()); } }
// Green potential always uses its own outward escape calculation, independent of the experimental stop mode.
const engMsg=e=>({coherence:cfg.mode==='coherence'||(cfg.mode==='compare'&&cfg.panels.includes('coherence')),normalizedPhase:cfg.mode==='normphase'&&!!e.centre,stablePhase:cfg.mode==='stablephase'&&!!e.centre,centre:(cfg.mode==='normphase'||cfg.mode==='stablephase')&&e.centre?e.centre:null,geometry:e.geometry,geometryDepth:e.geometryDepth,geometryParams:e.geometryParams,kind:e.kind,pw:e.pw,kr:e.kr,ki:e.ki,R2:cfg.mode==='potential'?256:distanceActive()&&!e.geometry?Math.max(e.R2,4,(Math.hypot(e.kr,e.ki)+1)**2):e.R2,stopMode:cfg.mode==='potential'||distanceActive()?'outward':cfg.stopMode});

// the same orbit on the main thread, for single points (pin, cross-sections)
function orbit(pr,pq,maxIt,e){
  let zr,zi,cr,ci,dr,di; const pw=e.pw, add=e.kind?0:1, eps=e.kind?1e-13:0;
  if(e.kind){ zr=pr; zi=pq; cr=e.kr; ci=e.ki; dr=1; di=0; } else { cr=pr; ci=pq; zr=0; zi=0; dr=0; di=0; }
  let n=0, qr=zr, qi=zi, lim=8, cnt=0;
  while(zr*zr+zi*zi<=e.R2){
    if(n>=maxIt) return {esc:false,n};
    if(pw===2){ const t=2*(zr*dr-zi*di)+add; di=2*(zr*di+zi*dr); dr=t; const u=zr*zr-zi*zi+cr; zi=2*zr*zi+ci; zr=u; }
    else if(!Number.isInteger(pw)||pw<2){const [wr,wi]=principalPower(zr,zi,pw);const [ar,ai]=principalPower(zr,zi,pw-1);const t=pw*(ar*dr-ai*di)+add;di=pw*(ar*di+ai*dr);dr=t;zr=wr+cr;zi=wi+ci;}
    else { let wr=zr, wi=zi; for(let k=2;k<pw;k++){ const t=wr*zr-wi*zi; wi=wr*zi+wi*zr; wr=t; }
      const t=pw*(wr*dr-wi*di)+add; di=pw*(wr*di+wi*dr); dr=t; const u=wr*zr-wi*zi+cr; zi=wr*zi+wi*zr+ci; zr=u; }
    n++;
    if(!Number.isFinite(zr)||!Number.isFinite(zi))return {esc:!Number.isNaN(zr+zi),n};
    if(Math.abs(zr-qr)+Math.abs(zi-qi)<=eps) return {esc:false,n,cycle:true};
    if(++cnt===lim){ cnt=0; lim<<=1; qr=zr; qi=zi; }
  }
  const m=Math.hypot(zr,zi), ad=Math.hypot(dr,di), lp=Math.log(pw);
  if(pw<=1)return {esc:true,n,mu:n,absD:ad,S:Math.log1p(ad),an:NaN};
  // an = |∇μ| from the chain rule: μ = const − log_p G, G ≈ p⁻ⁿ ln|zₙ|  ⇒  |∇μ| = |D| / (|z| ln|z| ln p)
  return {esc:true,n,mu:n+1-Math.log(Math.log2(m))/lp,absD:ad,S:Math.log(1+ad),an:ad/(m*Math.log(m)*lp)};
}

/* ---------- camera: centre, width (complex units across the screen), angle ---------- */
// Escape potential normalized for the dynamical plane, or for c in the parameter plane.
// Stop once the remaining logarithmic correction is negligible. Zero means no escape detected.
function bottcherPotential(zr,zi,cr,ci,d){
  const cutoff=Math.log1p(Math.hypot(cr,ci))+40;
  let weight=1;
  for(let n=0;n<2048;n++){
    const r=Math.hypot(zr,zi);
    if(r>1&&d*Math.log(r)>=cutoff)return weight*Math.log(r);
    const a=d*Math.atan2(zi,zr),m=Math.pow(r,d);
    zr=m*Math.cos(a)+cr;zi=m*Math.sin(a)+ci;weight/=d;
    if(!Number.isFinite(zr)||!Number.isFinite(zi))return NaN;
    if(weight===0)return 0;
  }
  return 0;
}
// Lift a fixed-angle radial path from infinity. At every inverse level choose the root
// continuous with its previous value, never the root closest to the asymptotic angle alone.
function bottcherInverse(u,theta,cr,ci,d=2,critical=0,state=null){
  const fail=[NaN,NaN],TAU=2*Math.PI;
  if(!(u>0)||!Number.isFinite(u)||!Number.isInteger(d)||d<2||u<=critical)return fail;
  if(cr===0&&ci===0)return [Math.exp(u)*Math.cos(theta),Math.exp(u)*Math.sin(theta)];
  const cutoff=Math.log1p(Math.hypot(cr,ci))+40;
  let g=Math.max(u,cutoff/d),angles=[theta],prev=[],step=.45,attempts=0;
  function lift(v,old){
    let k=0,h=v;
    while(d*h<cutoff&&k<64){h*=d;k++;if(angles[k]===undefined)angles[k]=Math.atan2(Math.sin(d*angles[k-1]),Math.cos(d*angles[k-1]));}
    if(h>700||k===64)return null;
    const a=angles[k],m=Math.exp(h),out=[];
    let x=m*Math.cos(a),y=m*Math.sin(a);
    out[k]=[x,y];
    for(let j=k-1;j>=0;j--){
      const xr=x-cr,yi=y-ci,r=Math.hypot(xr,yi);
      if(!(r>0)||!Number.isFinite(r))return null;
      const arg=Math.atan2(yi,xr),ref=old[j]?Math.atan2(old[j][1],old[j][0]):angles[j];
      const t=(arg+TAU*Math.round((d*ref-arg)/TAU))/d;
      const change=Math.abs(Math.atan2(Math.sin(t-ref),Math.cos(t-ref)));
      if(change>Math.PI/(3*d))return null;
      const mag=Math.pow(r,1/d);x=mag*Math.cos(t);y=mag*Math.sin(t);out[j]=[x,y];
    }
    return out;
  }
  if(state&&state.g>=u&&state.prev){g=state.g;prev=state.prev;angles=state.angles;}else{prev=lift(g,[]);if(!prev)return fail;}
  while(g>u*(1+1e-14)&&attempts++<512){
    const next=Math.max(u,g*Math.exp(-step)),q=lift(next,prev);
    if(!q){step/=2;if(step<1e-7)return fail;continue;}
    prev=q;g=next;step=Math.min(.45,step*1.35);
  }
  if(g>u*(1+1e-14))return fail;
  const z=prev[0],check=bottcherPotential(z[0],z[1],cr,ci,d);
  if(!Number.isFinite(check)||Math.abs(check-u)>Math.max(2e-12,u*2e-5))return fail;
  if(state){state.g=g;state.prev=prev;state.angles=angles;}
  return z;
}

// Numerical parameter-plane uniformization for z -> z²+c.
// Phi_M(c) = c * product_{k>=1}(1+c/z_k²)^(1/2^k), z_1=c.
// Principal logarithms are continued locally with a damped Newton solve.
// Return NaN on nonconvergence; do not silently display incorrect coordinates.
function parameterLogPhi(cr,ci){
 let zr=cr,zi=ci,dr=1,di=0,lr=0,li=0,ar=0,ai=0,weight=.5;
 const cm=cr*cr+ci*ci;if(cm<1e-24)return null;
 const cmag=Math.sqrt(cm);lr=Math.log(cmag);li=Math.atan2(ci,cr);
 ar=cr/cm;ai=-ci/cm;
 for(let k=1;k<=34;k++){
   if(2*Math.log(Math.hypot(zr,zi))>=Math.log1p(Math.hypot(cr,ci))+40)break;
   const qr=zr*zr-zi*zi,qi=2*zr*zi,den=qr*qr+qi*qi;
   if(!(den>1e-290))return null;
   const vr=(cr*qr+ci*qi)/den,vi=(ci*qr-cr*qi)/den;
   const tr=1+vr,ti=vi,tm=Math.hypot(tr,ti);
   if(!(tm>1e-280))return null;
   lr+=weight*Math.log(tm);li+=weight*Math.atan2(ti,tr);
   // derivative of c/z² = 1/z² - 2c z'/z³
   const invr=qr/den,invi=-qi/den;
   const d1r=dr*invr-di*invi,d1i=dr*invi+di*invr;
   const pr=cr*d1r-ci*d1i,pi=cr*d1i+ci*d1r;
   const vrp=invr-2*(pr*invr-pi*invi),vip=invi-2*(pr*invi+pi*invr);
   const tden=tr*tr+ti*ti;
   ar+=weight*(vrp*tr+vip*ti)/tden;
   ai+=weight*(vip*tr-vrp*ti)/tden;
   const nr=qr+cr,ni=qi+ci;
   const ndr=2*(zr*dr-zi*di)+1,ndi=2*(zr*di+zi*dr);
   zr=nr;zi=ni;dr=ndr;di=ndi;
   weight*=.5;
   if(!Number.isFinite(zr)||!Number.isFinite(dr)||weight<1e-11)break;
 }
 return [lr,li,ar,ai];
}
function parameterInverseFar(u,theta){
 const wr=Math.exp(u)*Math.cos(theta),wi=Math.exp(u)*Math.sin(theta);
 let cr=wr-.5,ci=wi;
 for(let n=0;n<28;n++){
   const a=parameterLogPhi(cr,ci);if(!a)return [NaN,NaN];
   const er=a[0]-u,ei=Math.atan2(Math.sin(a[1]-theta),Math.cos(a[1]-theta));
   if(Math.hypot(er,ei)<2e-6)return [cr,ci];
   const den=a[2]*a[2]+a[3]*a[3];if(!(den>1e-22))break;
   let sr=(er*a[2]+ei*a[3])/den,si=(ei*a[2]-er*a[3])/den;
   const maxStep=Math.max(.025,Math.hypot(cr,ci)*.35),m=Math.hypot(sr,si);
   if(m>maxStep){sr*=maxStep/m;si*=maxStep/m;}
   cr-=sr;ci-=si;
 }
 return [NaN,NaN];
}

// Continue a parameter ray using dc/d(log G)=G/(Phi'_M/Phi_M).
// The logarithmic derivative is single-valued even where an argument branch is not.
function parameterRaySlope(cr,ci){
  let x=cr,y=ci,dx=1,dy=0,w=1;
  const cutoff=Math.log1p(Math.hypot(cr,ci))+40;
  for(let k=0;k<80;k++){
    const m=Math.hypot(x,y),l=Math.log(m);
    if(2*l>=cutoff){
      const den=dx*dx+dy*dy;if(!(den>0)||!Number.isFinite(den))return null;
      return [l*(x*dx+y*dy)/den,l*(y*dx-x*dy)/den,w*l];
    }
    const nr=x*x-y*y+cr,ni=2*x*y+ci,dr=2*(x*dx-y*dy)+1,di=2*(x*dy+y*dx);
    x=nr;y=ni;dx=dr;dy=di;w*=.5;
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return null;
  }
  return null;
}
function parameterInverse(u,theta,state=null){
  const fail=[NaN,NaN];if(!(u>0)||!Number.isFinite(u))return fail;
  const reuse=state&&state.g>=u&&state.z,start=reuse?state.g:Math.max(3,u),z=reuse?state.z:parameterInverseFar(start,theta);
  if(!Number.isFinite(z[0]))return fail;
  let x=z[0],y=z[1],g=Math.log(start),end=Math.log(u),h=.18,tries=0;
  function rk(x,y,h){
    const a=parameterRaySlope(x,y);if(!a)return null;
    const b=parameterRaySlope(x+h*a[0]/2,y+h*a[1]/2);if(!b)return null;
    const c=parameterRaySlope(x+h*b[0]/2,y+h*b[1]/2);if(!c)return null;
    const d=parameterRaySlope(x+h*c[0],y+h*c[1]);if(!d)return null;
    return [x+h*(a[0]+2*b[0]+2*c[0]+d[0])/6,y+h*(a[1]+2*b[1]+2*c[1]+d[1])/6];
  }
  while(g>end+1e-13&&tries++<3000){
    const step=-Math.min(h,g-end),a=rk(x,y,step),b=rk(x,y,step/2),c=b&&rk(b[0],b[1],step/2);
    const err=a&&c?Math.hypot(a[0]-c[0],a[1]-c[1]):Infinity,tol=2e-8*Math.max(1,Math.hypot(x,y));
    if(err>tol){h/=2;if(h<1e-7)return fail;continue;}
    const nx=c[0]+(c[0]-a[0])/15,ny=c[1]+(c[1]-a[1])/15,q=parameterRaySlope(nx,ny);
    const goal=Math.exp(g+step);
    if(!q||Math.abs(q[2]-goal)>Math.max(2e-7,goal*2e-5)){h/=2;if(h<1e-7)return fail;continue;}
    x=nx;y=ny;g+=step;h=Math.min(.3,h*(err<tol/16?1.6:1.15));
  }
  if(g>end+1e-13)return fail;
  if(state){state.g=u;state.z=[x,y];}
  return [x,y];
}

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
  Wd=Math.max(2,Math.round(cv.clientWidth*DPR)); Hd=Math.max(2,Math.round(cv.clientHeight*DPR));
  cv.width=Wd; cv.height=Hd; readSafe();
  const first=!resize.done; resize.done=true;
  fitHome(); if(first){ Object.assign(view,HOME); renderHome(); } else if(typeof clampView==='function')clampView();
  dirty=true; needDraw=true; if(secOpen) drawPlot();
}
let lastMin=0, boost=1;
const CAP=40000;
function itFor(w){
  if(eng.geometry)return geometryDepth(cfg,w,Wd);
  if(cfg.iter) return cfg.iter;
  if(engMsg(eng).coherence)return Math.round(Math.min(CAP,Math.max(400,150+260*Math.max(0,Math.log10(HOME.w/w)))));
  const byDepth=150+260*Math.max(0,Math.log10(HOME.w/w));
  return Math.round(Math.min(CAP, Math.max(byDepth, lastMin*1.8+400)*boost));
}
const depthOf=w=>Math.log2(HOME.w/w);
function precisionWidth(v){return Math.max(2,Wd)*2.5e-15*Math.max(1,Math.abs(v.cx),Math.abs(v.cy));}
function atLimit(v){return v.w<=precisionWidth(v)*(1+1e-9);}
function toWorld(px,py,v=view){
  if(cfg.bottcher && (eng.kind===1 || eng.pw===2)){const u=Math.exp(Math.log(cfg.bottcherGMax)*(1-py/Hd)+Math.log(cfg.bottcherGMin)*py/Hd);return eng.kind===1?bottcherInverse(u,v.a+TAU*(px/Wd-.5),eng.kr,eng.ki,eng.pw,bottcherCriticalPotential()):parameterInverse(u,v.a+TAU*(px/Wd-.5));}
  if(cfg.polar){const theta=v.a+(cfg.logPolar?(cfg.logAngleSpan||TAU):TAU)*(px/Wd-.5),r=cfg.logPolar?Math.exp(cfg.logOuter-cfg.logSpan*py/Hd):v.w/2*py/Hd;return [v.cx+r*Math.cos(theta),v.cy+r*Math.sin(theta)];}
  const s=v.w/Wd, ux=(px-Wd/2)*s, uy=-(py-Hd/2)*s, c=Math.cos(v.a), n=Math.sin(v.a);
  return [v.cx+ux*c-uy*n, v.cy+ux*n+uy*c];
}
function toScreen(wx,wy,v=view){
  if(cfg.polar&&!cfg.bottcher){const dx=wx-v.cx,dy=wy-v.cy,r=Math.hypot(dx,dy),angle=wrap(Math.atan2(dy,dx)-v.a);return [Wd*(angle/(cfg.logPolar?(cfg.logAngleSpan||TAU):TAU)+.5),cfg.logPolar?Hd*(cfg.logOuter-Math.log(r))/cfg.logSpan:Hd*r/(v.w/2)];}
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
  return {W,H,sx:v.w/W,cx:v.cx,cy:v.cy,a:v.a||0,w:v.w,maxIt,ring:!!(cfg.polar||cfg.bottcher),bottcher:!!cfg.bottcher,bottcherGMin:cfg.bottcherGMin,bottcherGMax:cfg.bottcherGMax,logPolar:!!cfg.logPolar,logAngleSpan:cfg.logAngleSpan||TAU,logOuter:cfg.logOuter,logSpan:cfg.logSpan,left:H,minN:1e9,T:new Uint16Array(W*H),F:new Float32Array(W*H),G:cfg.bottcher?new Float64Array(W*H).fill(NaN):null,S:withS?new Float64Array(W*H):null,A:withS?new Float64Array(W*H):null,C:(cfg.mode==='coherence'||(cfg.mode==='compare'&&cfg.panels.includes('coherence')))?new Float64Array(W*H):null,DLD:cfg.mode==='dld'?new Float32Array(W*H):null,imgs:[],rng:{},g:{}};
}
function fill(L,m){ L.T.set(m.T,m.y0row*L.W); L.F.set(m.F,m.y0row*L.W);if(L.G&&m.G)L.G.set(m.G,m.y0row*L.W); if(L.S&&m.S) L.S.set(m.S,m.y0row*L.W);if(L.A&&m.A)L.A.set(m.A,m.y0row*L.W);if(L.C&&m.C)L.C.set(m.C,m.y0row*L.W);if(L.DLD&&m.DLD)L.DLD.set(m.DLD,m.y0row*L.W); L.left-=m.rows; if(m.minN<L.minN) L.minN=m.minN; }
function strips(L,v,tag,extra,e,front){
  const g=gridFor(v,L.W,L.H,L.sx), polarExtra=(tag==='main'&&(cfg.polar||cfg.bottcher))?{bottcher:!!cfg.bottcher,bottcherGMin:cfg.bottcherGMin,bottcherGMax:cfg.bottcherGMax,bottcherCritical:cfg.bottcher?bottcherCriticalPotential():0,polar:true,polarCx:v.cx,polarCy:v.cy,polarRadius:v.w/2,polarH:L.H,polarAngle:v.a||0,logPolar:!!cfg.logPolar,logAngleSpan:cfg.logAngleSpan||TAU,logOuter:cfg.logOuter,logSpan:cfg.logSpan}:{}, rows=cfg.bottcher&&tag==='main'?Math.max(8,Math.ceil(L.H/(NW*2))):Math.max(1,Math.floor(12000/L.W)), items=[]; L.pw=e.pw;L.geometry=e.geometry;L.geometryDepth=e.geometryDepth;
  for(let y=0;y<L.H;y+=rows) items.push({tag,W:L.W,y0row:y,rows:Math.min(rows,L.H-y),...g,...polarExtra,maxIt:L.maxIt,needD:!!L.S,needDLD:!!L.DLD,dldIterations:cfg.dldIterations,...engMsg(e),...extra});
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
let job=0, cur=null, dirty=true, lastStart=0, roughMs=150, base=null, under=null, home=null, homeId=0, stats=null;
// Rough passes are rendered 1.3× larger than the screen, so a pan or turn never shows an empty edge before the next pass.
// The final pass is exactly the screen: it dominates the cost (1.69× more pixels otherwise) and its numbers are what ⓘ measures.
// Polar and Böttcher views map the whole layer onto the screen (360° across), so they are never overscanned.
const OVERSCAN=1.3;
function startJob(){
  job++; queue=queue.filter(q=>q.tag!=='main'); dirty=false; lastStart=performance.now();
  const v= back ? backView(performance.now()+Math.min(500,Math.max(50,roughMs*1.15))) : {...view}, coherence=engMsg(eng).coherence, budget=itFor(v.w), maxIt=window.birthPreviewQuality?Math.min(budget,window.birthPreviewQuality.iterations):budget, div=cmp()?2:1, d=needD();
  if(eng.geometry)eng.geometryDepth=budget;
  cur={id:job,v,maxIt,coherence,passes:[]};
  const passes=window.birthPreviewQuality?[window.birthPreviewQuality.divisor]:back?[6]:PASSES, ring=cfg.polar||cfg.bottcher;
  passes.forEach((ds,p)=>{
    const overscan=ring?1:(back||p<passes.length-1)?OVERSCAN:1;
    const cap=cfg.bottcher?Math.max(1,Math.max(Wd,Hd)/(eng.kind===1?900:640)):1,eff=Math.max(ds,cap);const tw=Math.ceil(Wd*overscan/(eff*div)), th=Math.ceil(Hd*overscan/(eff*div));
    const tileView={...v,w:v.w*tw*ds*div/Wd};
    const L=newLayer(tileView,tw,th,maxIt,d); L.ds=ds; cur.passes.push(L);
    strips(L,tileView,'main',{job,pass:p},eng.geometry?{...eng,geometryDepth:budget}:eng,false);
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
  if(!cfg.bottcher&&!eng.geometry&&!cfg.iter&&!window.birthPreviewQuality&&!cur.coherence&&!distanceActive()&&m.pass===cur.passes.length-1){
    if(L.minN<1e9){ lastMin=L.minN; boost=1; }
    else if(!back){
      if(cur.maxIt<CAP){ boost*=3; dirty=true; }
      
    }
  }
  if(!base || base.job!==cur.id || base.pass<m.pass){
    if(m.pass===cur.passes.length-1 && base && base.job===cur.id && !back) under=base;   // keep the overscanned rough pass beneath the sharp one
    L.job=cur.id; L.pass=m.pass; paintLayer(L); base=L; needDraw=true;
    if(m.pass===cur.passes.length-1 && !back && !window.birthPreviewQuality?.spatial){ stats=measure(L); writeHash(); if(infoOpen) fillInfo(); }
  }
}
function renderHome(){ if(window.birthPreviewQuality)return; // the whole universe as a backdrop, wide enough to fill the corners of a turned, zoomed-out view
  cancel(homeId); home=null;
  const w=3*HOME.w*Math.max(1,Hd/Wd), v={cx:eng.cxm===undefined?HOME.cx:eng.cxm,cy:HOME.cy,w,a:0};
  homeId=render('home',v,440,440,cfg.iter||300,eng.geometry?{...eng,geometryDepth:geometryDepth(cfg,w,440)}:eng,true,L=>{ L.ring=false; home=L; paintLayer(L); needDraw=true; });   // always a flat (Cartesian) picture
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
function stabilityDifferentials(L,mode){return scalarDifferential(L,mode,scalarField(L,activeScalarSource()));}
function complexDifferential(L,mode){const {W,H,S,A,sx}=L,V=new Float64Array(W*H);V.fill(NaN);if(L.ring)return V;const angle=L.a||0;const u=i=>S[i]===0?0:S[i]*Math.cos(A[i]-angle),v=i=>S[i]===0?0:S[i]*Math.sin(A[i]-angle);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x,a=i-1,b=i+1,c=i-W,d=i+W;V[i]=mode==='vdiv'?(u(b)-u(a)+v(c)-v(d))/(2*sx):(v(b)-v(a)-u(c)+u(d))/(2*sx);}return V;}
function complexFieldStats(L,mode){const V=complexDifferential(L,mode);let n=0,sum=0,max=0;for(let i=0;i<V.length;i++){const v=V[i];if(!Number.isFinite(v))continue;const x=i%L.W,y=Math.floor(i/L.W);if(x===0||y===0||x===L.W-1||y===L.H-1)continue;if(L.T[i]!==L.T[i-1]||L.T[i]!==L.T[i+1]||L.T[i]!==L.T[i-L.W]||L.T[i]!==L.T[i+L.W])continue;n++;sum+=v*v;max=Math.max(max,Math.abs(v));}return {n,rms:n?Math.sqrt(sum/n):NaN,max:n?max:NaN};}
// Use the independently evaluated exterior potential, not the experimental stopping orbit.
function greenLogAt(L,i){return L.bottcher&&L.G?L.G[i]:L.T[i]===NO?NaN:Math.log(Math.LN2)+(1-L.F[i]-L.T[i])*Math.log(L.pw);}
function paint(L,mode){
  const {W,H,T,F,S,DLD}=L, N=W*H;
  if(L.geometry&&!scalarMode(mode)){const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),img=ctx.createImageData(W,H),o=new Uint32Array(img.data.buffer),lut=(globalThis.birthLayerPalette?.(mode)||PALETTES[cfg.palette]).seq;for(let i=0;i<N;i++){const inside=T[i]!==NO;if(mode==='binary'){o[i]=inside?WHITE:BLACK;continue;}if(inside)o[i]=lut[Math.round(550+473*Math.min(1,(T[i]+1)/(L.geometryDepth+1)))];else if(F[i]>0)o[i]=lut[Math.round(80+280*F[i]/L.geometryDepth)];else o[i]=BLACK;}ctx.putImageData(img,0,0);return c;}
  if(mode==='maskdiff'&&!S)return null;
  if((mode==='waves'||mode==='sens'||mode==='flat'||mode==='ridges') && !S) return null;
  if(mode==='dld'&&!DLD)return null;
  const img=new ImageData(W,H), o=new Uint32Array(img.data.buffer), override=globalThis.birthLayerPalette?.(mode), P=override||PALETTES[cfg.palette], C=P.cyc, Q=P.seq;
  if(mode==='ridges'){o.fill(BLACK);const wrapped=!!L.ring&&(!L.logPolar||L.logAngleSpan>=TAU-1e-9);for(let y=1;y<H-1;y++)for(let x=wrapped?0:1;x<(wrapped?W:W-1);x++){const i=y*W+x,v=S[i];if(!Number.isFinite(v))continue;const l=(x+W-1)%W,r=(x+1)%W;const pairs=[[y*W+l,y*W+r],[(y-1)*W+x,(y+1)*W+x],[(y-1)*W+l,(y+1)*W+r],[(y-1)*W+r,(y+1)*W+l]];if(pairs.some(([a,b])=>Number.isFinite(S[a])&&Number.isFinite(S[b])&&v>=S[a]&&v>=S[b]&&v-(S[a]+S[b])/2>=.02))o[i]=WHITE;}L.rng[mode]=[0,1];}else if(mode==='scalar'||mode==='distance'){const V=scalarField(L,mode==='distance'?'distance':activeScalarSource());if(!V)return null;const r=rangeOf(N,i=>V[i],0,.99),min=mode==='distance'||activeScalarSource()==='distance'?0:r[0],max=Math.max(min+1e-15,r[1]);for(let i=0;i<N;i++)o[i]=!Number.isFinite(V[i])?BLACK:Q[Math.round(1023*Math.max(0,Math.min(1,(V[i]-min)/(max-min))))];L.rng[mode]=[min,max];}else if(mode==='coherence'){if(!L.C)return null;const lut=override?Q:PALETTES.gray.seq;for(let i=0;i<N;i++)o[i]=Number.isFinite(L.C[i])?lut[Math.round(1023*Math.max(0,Math.min(1,L.C[i])))]:BLACK;L.rng[mode]=[0,1];}else if(complexMode(mode)){if(!L.A||!S)return null;const A=L.A; if(mode==='phase'||mode==='stablephase'||mode==='normphase'){for(let i=0;i<N;i++)o[i]=Number.isFinite(A[i])&&(mode==='stablephase'||S[i]>0)?(override?C:PALETTES.hue.cyc)[Math.floor((A[i]+Math.PI)/(2*Math.PI)*1023)]:BLACK;}else if(mode==='jointmag'||mode==='jointphase'){const D=complexDifferential(L,'vdiv'),C=complexDifferential(L,'vcurl');const V=Float64Array.from(D,(d,i)=>Math.hypot(d,C[i]));const max=Math.max(1e-12,rangeOf(N,i=>V[i],0,.99)[1]);for(let i=0;i<N;i++){const r=V[i];o[i]=!Number.isFinite(r)||r===0?BLACK:mode==='jointmag'?Q[Math.round(1023*Math.min(1,r/max))]:(override?C:PALETTES.hue.cyc)[Math.min(1023,Math.floor((Math.atan2(C[i],D[i])+Math.PI)/(2*Math.PI)*1023))];}L.rng[mode]=mode==='jointmag'?[0,max]:[-Math.PI,Math.PI];}else{const V=complexDifferential(L,mode);const other=complexDifferential(L,mode==='vcurl'?'vdiv':'vcurl');const max=Math.max(1e-12,rangeOf(N,i=>Math.hypot(V[i],other[i]),0,.99)[1]);const lut=override?Q:ramp([[35,85,200],[30,30,35],[245,125,45]],false);for(let i=0;i<N;i++)o[i]=Number.isFinite(V[i])?lut[Math.round(511.5*(1+Math.max(-1,Math.min(1,V[i]/max))))]:BLACK;L.rng[mode]=[-max,max];}}else if(mode==='maskdiff'){for(let i=0;i<N;i++){const v=T[i]===NO?S[i]:0;o[i]=Number.isFinite(v)?Q[Math.round(1023*Math.min(1,Math.max(0,v)/10))]:BLACK;}L.rng[mode]=[0,10];} else if(diffMode(mode)){
 const V=stabilityDifferentials(L,mode), signed=mode==='sdiv'||mode==='scurl';
 const range=rangeOf(N,i=>Math.abs(V[i]),0,.99), max=mode==='scurl'?1e-8:Math.max(1e-12,range[1]);
 const diverge=ramp([[35,85,200],[30,30,35],[245,125,45]],false);
 for(let i=0;i<N;i++){const v=V[i];if(!Number.isFinite(v)){o[i]=BLACK;continue;}const t=signed?.5+.5*Math.max(-1,Math.min(1,v/max)):Math.min(1,v/max);o[i]=(signed&&!override?diverge:Q)[Math.round(t*1023)];}L.rng[mode]=signed?[-max,max]:[0,max];
 } else if(mode==='binary'){ for(let i=0;i<N;i++) o[i]=T[i]===NO?BLACK:WHITE; }
  else if(mode==='escape'){
    // 0.5288 = −log₂ ln 2: keeps the colours of the existing maps, which use ln instead of log₂ inside μ
    for(let i=0;i<N;i++){ if(T[i]===NO){ o[i]=BLACK; continue; } const mu=T[i]+F[i]+0.5288; o[i]=C[((Math.sqrt(mu>0?mu:0)*90)|0)&1023]; }
  } else {
    let get, lo=0.01, hi=0.99;
    if(mode==='potential'){ // Finite-escape approximation to the exterior Green function.
      // F = 1 - log_p(log_2|z_T|), hence ln G_T = ln(ln 2) + (1-F-T) ln p.
      // Work in log space to avoid underflow at high iteration counts.
      const lp=Math.log(L.pw);
      get=i=>greenLogAt(L,i);
    }
    else if(mode==='waves') get=i=>scalarField(L,'sensitivity')?.[i]??NaN;
    else if(mode==='sens') get=i=>T[i]===NO?NaN:scalarField(L,'sensitivity')?.[i]??NaN;
    else if(mode==='dld')get=i=>DLD[i];
    else if(mode==='flat'){ // F = 1 − log_p log₂|z| gives |z| back, so the overshoot past the escape radius can be divided out
      const lp=Math.log(L.pw), off=Math.log(lp);
      get=i=>{ if(T[i]===NO) return NaN; const lz=Math.LN2*Math.exp((1-F[i])*lp); return Math.log(Math.expm1(S[i]))-lz-Math.log(lz)-off; }; }
    else { const G=gradient(L,mode==='gradmu');
      if(mode==='gradt'){ get=i=>G[i]<0?NaN:Math.log(1+G[i]); lo=0; hi=0.995; }
      else get=i=>G[i]>0?Math.log(G[i]/L.sx):NaN; }
    if(mode==='dld'){
      // DLD spans radically different ranges for escaping and bounded trajectories.
      // Normalize the two populations independently; otherwise it looks binary.
      const interior=i=>T[i]===NO&&Number.isFinite(DLD[i])?DLD[i]:NaN;
      const exterior=i=>T[i]!==NO&&Number.isFinite(DLD[i])?DLD[i]:NaN;
      const ir=rangeOf(N,interior,.01,.99),er=rangeOf(N,exterior,.01,.99);
      const scale=(v,r)=>Math.max(0,Math.min(1,(v-r[0])/(r[1]-r[0])));
      for(let i=0;i<N;i++){
        const v=DLD[i];
        if(!Number.isFinite(v)){o[i]=BLACK;continue;}
        const inside=T[i]===NO;
        // Bounded and escaping regions use separate contrast windows.
        const raw=scale(v,inside?ir:er);
        const strength=Math.max(0.25,cfg.dldContrast);
        const t=Math.max(0,Math.min(1,.5+.5*Math.tanh(strength*(raw-.5))/Math.tanh(strength*.5)));
        o[i]=Q[Math.min(1023,Math.max(0,Math.round((inside?.28+.72*t:.06+.72*t)*1023)))];
      }
      L.rng[mode]=[ir,er];
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
      canvas.getContext('2d').putImageData(img,0,0);return canvas;
    }
    const rng=(mode==='waves'||mode==='sens')?rangeOf(N,i=>T[i]!==NO?S[i]:NaN,lo,hi):rangeOf(N,get,lo,hi); if(mode==='waves'||mode==='sens')rng[0]=0; if(mode==='gradt') rng[0]=0;
    const k=1023/(rng[1]-rng[0]), floor=Q[0];
    for(let i=0;i<N;i++){ const v=get(i); if(v!==v){ o[i]=(mode==='waves'||mode==='sens')?floor:T[i]===NO?BLACK:floor; continue; } const t=(v-rng[0])*k; o[i]=Q[t<0?0:t>1023?1023:t|0]; }
    L.rng[mode]=rng;
  }
  if(L.bottcher)for(let i=0;i<N;i++)if(!Number.isFinite(mode==='potential'?L.G?.[i]:F[i]))o[i]=BLACK;
  const c=document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').putImageData(img,0,0); if(mode==='potential')drawGreenContours(c,L); return c;
}

function drawGreenContours(canvas,L){
  if(!cfg.contours)return;
  const {W,H,T,F,pw}=L, N=W*H, v=new Float64Array(N), samples=[];
  const lp=Math.log(pw), offset=Math.log(Math.LN2);
  for(let i=0;i<N;i++){
    v[i]=greenLogAt(L,i);
    if(Number.isFinite(v[i]))samples.push(v[i]);
  }
  if(samples.length<8)return;
  samples.sort((a,b)=>a-b);
  const low=samples[Math.floor(samples.length*.02)], high=samples[Math.floor(samples.length*.98)];
  if(!(high>low))return;
  const ctx=canvas.getContext('2d');
  ctx.save();ctx.strokeStyle=cfg.contourColor==='black'?'#000':cfg.contourColor==='colored'?'#50e5de':'#fff';
  ctx.globalAlpha=cfg.contourOpacity/100;ctx.lineWidth=1;
  for(let k=1;k<=cfg.contourLevels;k++){
    const level=low+(high-low)*k/(cfg.contourLevels+1);
    ctx.beginPath();
    for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++){
      const i=y*W+x, a=[v[i],v[i+1],v[i+W+1],v[i+W]];
      if(!a.every(Number.isFinite))continue;
      const p=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]], cross=[];
      for(let j=0;j<4;j++){
        const t=(j+1)%4;
        if((a[j]<level)===(a[t]<level))continue;
        const f=(level-a[j])/(a[t]-a[j]);
        cross.push([p[j][0]+f*(p[t][0]-p[j][0]),p[j][1]+f*(p[t][1]-p[j][1]),j]);
      }
      const line=(a,b)=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);};
      if(cross.length===2)line(cross[0],cross[1]);
      else if(cross.length===4){
        const mid=(a[0]+a[1]+a[2]+a[3])/4;
        const edge=j=>cross.find(q=>q[2]===j);
        if((a[0]>=level)===(mid>=level)){line(edge(0),edge(1));line(edge(2),edge(3));}
        else{line(edge(0),edge(3));line(edge(1),edge(2));}
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

const shown=()=>cmp()?cfg.panels:[cfg.mode];
function paintLayer(L){ L.imgs=shown().map((m,k)=>paint(L,m) || L.imgs[k] || paint(L,'escape')); }
function repaint(){ if(home) paintLayer(home); if(under) paintLayer(under); if(base) paintLayer(base); needDraw=true; }

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
