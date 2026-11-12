'use strict';
/* Boundary Release Lab, part 1: the Geometry Engine.
   Every boundary is described the same way: a signed distance function sdf(x, y) on the domain [-0.5, 0.5]²
   (negative inside the obstacle), outline paths for drawing, and its symmetry group.
   The wave engine only ever sees the sdf, so a new geometry is one more entry in build() and in LIBRARY.
   No DOM here: the same file runs in the page and in the Node validation script. */
(function(root){
const TAU=Math.PI*2, SUB='₀₁₂₃₄₅₆₇₈₉';
const sub=n=>String(n).split('').map(d=>SUB[+d]).join('');

/* ---------- the library: what the configuration screen offers, and which parameters each shape really has ---------- */
const LIBRARY=[
  {v:'circle',   t:'Circle',          params:['size','eps','k','rot']},
  {v:'ellipse',  t:'Ellipse',         params:['size','aspect','rot']},
  {v:'annulus',  t:'Annulus',         params:['size','inner']},
  {v:'polygon',  t:'Regular polygon', params:['n','size','round','rot']},
  {v:'rect',     t:'Rectangle',       params:['size','aspect','round','rot']},
  {v:'star',     t:'Star',            params:['n','size','depth','rot']},
  {v:'pair',     t:'Two circles',     params:['size','sep','rot']},
  {v:'combination', t:'Combination · fractal research', params:[]}
];
// slider ranges; `when` hides a control that would do nothing
const PARAMS={
  size:  {t:'Size',                 min:0.06, max:0.42, step:0.01,  fmt:v=>Math.round(v*100)+' %', note:'Radius (or half-width) as a fraction of the domain width.'},
  eps:   {t:'Deformation ε',        min:0,    max:0.3,  step:0.005, fmt:v=>v.toFixed(3), note:'r(θ) = R [1 + ε cos(kθ)]. ε = 0 is the perfect circle.'},
  k:     {t:'Lobes k',              min:1,    max:12,   step:1,     fmt:v=>String(v), when:g=>g.eps>0},
  aspect:{t:'Aspect ratio',         min:0.2,  max:1,    step:0.01,  fmt:v=>v.toFixed(2)},
  inner: {t:'Inner radius',         min:0.2,  max:0.9,  step:0.01,  fmt:v=>Math.round(v*100)+' % of outer'},
  n:     {t:'Sides / points',       min:3,    max:12,   step:1,     fmt:v=>String(v)},
  round: {t:'Corner rounding',      min:0,    max:0.9,  step:0.01,  fmt:v=>Math.round(v*100)+' %'},
  depth: {t:'Inner radius',         min:0.2,  max:0.9,  step:0.01,  fmt:v=>Math.round(v*100)+' % of outer'},
  sep:   {t:'Distance between centres', min:0.1, max:0.7, step:0.01, fmt:v=>Math.round(v*100)+' %'},
  rot:   {t:'Rotation',             min:-180, max:180,  step:1,     fmt:v=>v+'°', when:g=>!(g.type==='circle'&&!(g.eps>0))},
  x:     {t:'Position x',           min:-0.3, max:0.3,  step:0.01,  fmt:v=>(v>0?'+':'')+v.toFixed(2)},
  y:     {t:'Position y',           min:-0.3, max:0.3,  step:0.01,  fmt:v=>(v>0?'+':'')+v.toFixed(2)}
};
const DEFAULT_GEOM={type:'circle', x:0, y:0, size:0.32, rot:0, eps:0, k:5, aspect:0.6, inner:0.6, n:3, round:0, depth:0.5, sep:0.4};

/* ---------- symmetry groups ---------- */
const O2={group:'O(2)', order:Infinity, continuous:true, text:'continuous: every rotation about the centre and every mirror line through it'};
function dihedral(n){
  if(n<=1) return {group:'D'+sub(1), order:2, continuous:false, text:'discrete: one mirror line and nothing else'};
  return {group:'D'+sub(n), order:2*n, continuous:false, text:'discrete: '+n+' rotations (multiples of '+(+(360/n).toFixed(2))+'°) and '+n+' mirror lines'};
}

/* ---------- distance functions ---------- */
// exact signed distance to a closed polygon [[x, y], …]
function polySDF(P){
  const n=P.length;
  return (x,y)=>{ let d=Infinity, s=1;
    for(let i=0,j=n-1;i<n;j=i,i++){
      const ex=P[j][0]-P[i][0], ey=P[j][1]-P[i][1], wx=x-P[i][0], wy=y-P[i][1];
      const t=Math.max(0,Math.min(1,(wx*ex+wy*ey)/(ex*ex+ey*ey))), bx=wx-ex*t, by=wy-ey*t; d=Math.min(d,bx*bx+by*by);
      const c1=y>=P[i][1], c2=y<P[j][1], c3=ex*wy>ey*wx; if((c1&&c2&&c3)||(!c1&&!c2&&!c3)) s=-s; }
    return s*Math.sqrt(d); };
}
// distance to a smooth closed curve c(t): Newton's method on (c(t) − p)·c′(t) = 0 from a few starting parameters, nearest result kept.
// curve(t, Q) writes c, c′, c″ into Q; starts(x, y, T) writes the starting parameters and returns how many; inside(x, y) gives the sign.
const Q=new Float64Array(6), T=[0,0,0];
function curveSDF(curve,starts,inside,maxStep){
  return (x,y)=>{ const n=starts(x,y,T); let best=Infinity;
    for(let s=0;s<n;s++){ let t=T[s];
      for(let i=0;i<10;i++){ curve(t,Q); const ex=Q[0]-x, ey=Q[1]-y, g=ex*Q[2]+ey*Q[3], h=Q[2]*Q[2]+Q[3]*Q[3]+ex*Q[4]+ey*Q[5];
        let dt=h>1e-14?-g/h:(g>0?-maxStep:maxStep); if(dt>maxStep) dt=maxStep; else if(dt<-maxStep) dt=-maxStep; t+=dt; if(dt<1e-11&&dt>-1e-11) break; }
      curve(t,Q); const d=Math.hypot(Q[0]-x,Q[1]-y); if(d<best) best=d; }
    return inside(x,y)?-best:best; };
}
const ring=(r,ox,oy,n)=>{ const p=[]; n=n||240; for(let i=0;i<n;i++){ const a=TAU*i/n; p.push([(ox||0)+r*Math.cos(a),(oy||0)+r*Math.sin(a)]); } return p; };
// outline of a shape that is star-shaped about its centre: where each ray crosses sdf = 0
function trace(f,n){ const p=[]; n=n||720;
  for(let i=0;i<n;i++){ const a=TAU*i/n, c=Math.cos(a), s=Math.sin(a); let lo=0, hi=1.5;
    for(let k=0;k<40;k++){ const m=(lo+hi)/2; if(f(m*c,m*s)<0) lo=m; else hi=m; }
    p.push([lo*c,lo*s]); }
  return p; }
// vertices of a regular n-gon with one vertex pointing up
const ngon=(n,R)=>{ const p=[]; for(let i=0;i<n;i++){ const a=Math.PI/2+TAU*i/n; p.push([R*Math.cos(a),R*Math.sin(a)]); } return p; };

/* ---------- build one geometry ---------- */
function build(g){
  g=Object.assign({},DEFAULT_GEOM,g);
  const R=g.size, rot=g.rot*Math.PI/180, cr=Math.cos(rot), sr=Math.sin(rot);
  let f, exact=true, paths, sym, name, formula='';
  switch(g.type){
    case 'combination': {
      // Research extension point. No fractal seeds or boundary data have been defined yet.
      // Deliberately do not substitute a circle or fabricate a fractal mask.
      f=()=>1; paths=[]; exact=false;
      sym={group:'undetermined',order:null,continuous:false,text:'awaiting a computed fractal boundary and field'};
      name='Combination · fractal research';
      formula='No initial positions or fractal field supplied yet';
      break;
    }
    case 'ellipse': { const a=R, b=R*g.aspect;
      if(g.aspect>=0.999){ f=(x,y)=>Math.hypot(x,y)-R; sym=O2; }
      else { f=curveSDF((t,o)=>{ const c=Math.cos(t), s=Math.sin(t); o[0]=a*c; o[1]=b*s; o[2]=-a*s; o[3]=b*c; o[4]=-a*c; o[5]=-b*s; },
          (x,y,o)=>{ const t=Math.atan2(y/b,x/a); o[0]=t; o[1]=t+0.5; o[2]=t-0.5; return 3; }, (x,y)=>(x*x)/(a*a)+(y*y)/(b*b)<1, 0.4); sym=dihedral(2); }
      paths=[ring(1).map(p=>[p[0]*a,p[1]*b])]; name='Ellipse'; formula='(x/a)² + (y/b)² = 1,  b/a = '+g.aspect.toFixed(2); break; }
    case 'annulus': { const Rm=R*(1+g.inner)/2, w=R*(1-g.inner)/2;
      f=(x,y)=>Math.abs(Math.hypot(x,y)-Rm)-w; sym=O2; paths=[ring(R),ring(R*g.inner)]; name='Annulus'; formula='R·'+g.inner.toFixed(2)+' ≤ r ≤ R'; break; }
    case 'polygon': { const n=Math.round(g.n), ap=R*Math.cos(Math.PI/n), rho=g.round*ap;
      const core=polySDF(ngon(n,(ap-rho)/Math.cos(Math.PI/n))); f=rho>0?(x,y)=>core(x,y)-rho:core;
      sym=g.round>=0.999?O2:dihedral(n); paths=[rho>0?trace(f):ngon(n,R)];
      name=({3:'Equilateral triangle',4:'Square',5:'Regular pentagon',6:'Regular hexagon'})[n]||('Regular '+n+'-gon'); formula=n+' equal sides, circumradius R'; break; }
    case 'rect': { const hx=R, hy=R*g.aspect, rho=g.round*Math.min(hx,hy);
      f=(x,y)=>{ const qx=Math.abs(x)-hx+rho, qy=Math.abs(y)-hy+rho; return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-rho; };
      sym=g.aspect>=0.999?dihedral(4):dihedral(2); paths=[rho>0?trace(f):[[hx,hy],[-hx,hy],[-hx,-hy],[hx,-hy]]]; name=g.aspect>=0.999?'Square':'Rectangle'; formula='half-sides R × '+g.aspect.toFixed(2)+'R'; break; }
    case 'star': { const n=Math.round(g.n), P=[];
      for(let i=0;i<2*n;i++){ const a=Math.PI/2+Math.PI*i/n, r=i%2?R*g.depth:R; P.push([r*Math.cos(a),r*Math.sin(a)]); }
      f=polySDF(P); sym=dihedral(n); paths=[P]; name=n+'-pointed star'; formula='tips at R, notches at '+g.depth.toFixed(2)+'R'; break; }
    case 'pair': { const h=Math.max(g.sep/2,R*1.05);   // kept apart: two separate obstacles
      f=(x,y)=>Math.min(Math.hypot(x-h,y),Math.hypot(x+h,y))-R; sym=dihedral(2); paths=[ring(R,h,0),ring(R,-h,0)]; name='Two circles'; formula='radius R, centres '+(2*h).toFixed(2)+' apart'; break; }
    default: { const e=g.eps, k=Math.round(g.k);
      if(!(e>0)){ f=(x,y)=>Math.hypot(x,y)-R; sym=O2; paths=[ring(R)]; name='Circle'; formula='r = R'; }
      else {
        f=curveSDF((t,o)=>{ const c=Math.cos(t), s=Math.sin(t), ck=Math.cos(k*t), sk=Math.sin(k*t), Rt=R*(1+e*ck), R1=-R*e*k*sk, R2=-R*e*k*k*ck;
            o[0]=Rt*c; o[1]=Rt*s; o[2]=R1*c-Rt*s; o[3]=R1*s+Rt*c; o[4]=R2*c-2*R1*s-Rt*c; o[5]=R2*s+2*R1*c-Rt*s; },
          (x,y,o)=>{ const t=Math.atan2(y,x), w=1.9/k; o[0]=t; o[1]=t+w; o[2]=t-w; return 3; },
          (x,y)=>Math.hypot(x,y)<R*(1+e*Math.cos(k*Math.atan2(y,x))), 0.5/k);
        sym=dihedral(k); name='Deformed circle'; formula='r(θ) = R [1 + '+e.toFixed(3)+' cos('+k+'θ)]';
        const p=[]; for(let i=0;i<720;i++){ const th=TAU*i/720, r=R*(1+e*Math.cos(k*th)); p.push([r*Math.cos(th),r*Math.sin(th)]); } paths=[p]; } }
  }
  const world=p=>[g.x+p[0]*cr-p[1]*sr, g.y+p[0]*sr+p[1]*cr];
  return {
    type:g.type, name, formula, exact, symmetry:sym, centre:[g.x,g.y], params:g,
    sdf:(x,y)=>{ const dx=x-g.x, dy=y-g.y; return f(dx*cr+dy*sr,-dx*sr+dy*cr); },
    paths:paths.map(p=>p.map(world))
  };
}

const api={LIBRARY, PARAMS, DEFAULT_GEOM, build, polySDF, dihedral, O2};
root.BRLGeometry=api;
if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
