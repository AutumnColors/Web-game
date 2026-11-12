'use strict';
/* Boundary Release Lab, part 3: the Experiment Controller, Field Renderer, Measurement Engine and the page.
   Loaded after geometry.js (obstacles) and wave.js (the numbers). Nothing here changes the simulation state
   except through sim.step(), sim.release() and sim.reset().
   The page parts (configuration sheet first, option groups, glass tool buttons, toast, capture sheet with the
   configuration stored inside the PNG, links in the address) follow the Fractal Universe Lab next door. */
const G=window.BRLGeometry, W=window.BRLWave;
const $=id=>document.getElementById(id);
const clone=o=>JSON.parse(JSON.stringify(o));
const RATE0=0.12;                       // playback 1× = 0.12 time units per second of watching
const CAP=4096;                         // samples kept per time series; when full, every other one is dropped
const dpr=()=>Math.min(window.devicePixelRatio||1,2);
let rscale=0, slow=0;                   // picture resolution: device pixels per CSS pixel; lowered once if the device cannot keep up
const rs=()=>rscale||dpr();
const minus=s=>String(s).replace(/-/g,'−');

const DEFAULTS={
  geom:clone(G.DEFAULT_GEOM), field:clone(W.DEFAULTS.field), phys:clone(W.DEFAULTS.phys),
  release:{mode:'instant', duration:0.25, at:-1}, num:clone(W.DEFAULTS.num),
  view:{mode:'contours', gain:1, levels:1, profile:'mean'}, play:{rate:1}, film:false
};
const SECTIONS=['geom','field','phys','release','num','view','play'];
function merge(base,patch){ const o=clone(base); if(!patch) return o;
  SECTIONS.forEach(k=>{ if(patch[k]&&typeof patch[k]==='object') Object.keys(patch[k]).forEach(p=>{ if(p in o[k] && typeof patch[k][p]===typeof o[k][p]) o[k][p]=patch[k][p]; }); });
  if(typeof patch.film==='boolean') o.film=patch.film;
  // a link or a file may carry anything: keep every value inside what the controls offer
  const lim=(k,p,a,b)=>{ o[k][p]=Math.max(a,Math.min(b,+o[k][p]||0)); }, one=(k,p,list)=>{ if(!list.includes(o[k][p])) o[k][p]=DEFAULTS[k][p]; };
  one('geom','type',G.LIBRARY.map(l=>l.v)); Object.keys(G.PARAMS).forEach(p=>lim('geom',p,G.PARAMS[p].min,G.PARAMS[p].max)); o.geom.n=Math.round(o.geom.n); o.geom.k=Math.round(o.geom.k);
  one('field','kind',W.FIELDS.map(f=>f.v)); one('field','follow',['boundary','radial']); lim('field','density',2,30); lim('field','amp',0.1,2); lim('field','phase',-180,180); lim('field','angle',-180,180);
  lim('field','taper',0,0.15); lim('field','dist',0.02,0.3); lim('field','width',0.008,0.08); lim('field','px',-0.45,0.45); lim('field','py',-0.45,0.45);
  lim('phys','c',0.25,3); lim('phys','damping',0,3); one('phys','obstacle',['fixed','free']); one('phys','outer',['fixed','reflect','absorb','periodic']); one('phys','domain',['wide','disc','square']);
  if(o.phys.domain!=='square'&&o.phys.outer==='periodic') o.phys.outer='reflect';
  one('release','mode',['instant','gradual','none']); lim('release','duration',0.05,1); one('release','at',[-1,0.25,0.5,1,2]);
  one('num','N',[128,192,256,384,512]); one('num','stencil',['iso9','five']); one('num','courant',[0.25,0.5,0.65]);
  one('view','mode',MODES.map(m=>m.v)); one('view','gain',[1,2,4,8,16]); one('view','levels',[1,0.5,0.25]); one('view','profile',['mean','ray']); one('play','rate',[0.25,0.5,1,2,4]);
  return o; }
function diff(c){ const o={}; SECTIONS.forEach(k=>Object.keys(c[k]).forEach(p=>{ if(c[k][p]!==DEFAULTS[k][p]){ (o[k]=o[k]||{})[p]=c[k][p]; } })); if(c.film) o.film=true; return o; }

const PRESETS=[
  {v:'circle',   t:'Circular boundary', s:'standing wave release', patch:{}},
  {v:'deformed', t:'Deformed circle',   s:'ε = 0.05, five lobes',  patch:{geom:{eps:0.05,k:5}}},
  {v:'triangle', t:'Triangle',          s:'D₃ on a D₄ grid',       patch:{geom:{type:'polygon',n:3,size:0.34}}},
  {v:'square',   t:'Square',            s:'D₄, aligned with the grid', patch:{geom:{type:'polygon',n:4,rot:45,size:0.36}}},
  {v:'hexagon',  t:'Hexagon',           s:'D₆',                    patch:{geom:{type:'polygon',n:6,size:0.32}}},
  {v:'pair',     t:'Two circles',       s:'two separate obstacles', patch:{geom:{type:'pair',size:0.13,sep:0.4}}},
  {v:'box',      t:'Square box',        s:'the edge breaks the symmetry', patch:{phys:{domain:'square'}}},
  {v:'open',     t:'Open space',        s:'what leaves never returns', patch:{phys:{outer:'absorb'}}},
  {v:'combination',t:'Combination · Mandelbrot',s:'computed escape contours → release',patch:{geom:{type:'combination',variant:0},num:{N:256}}},
  {v:'valley',t:'Mandelbrot · valley',s:'screenshot A · actual orbit contours',patch:{geom:{type:'combination',variant:1}}},
  {v:'branches',t:'Mandelbrot · branches',s:'screenshot B · actual orbit contours',patch:{geom:{type:'combination',variant:2}}},
  {v:'pulse',    t:'One pulse',         s:'a single ring moving inward', patch:{field:{kind:'pulse'}}}
];
const MODES=[
  {v:'contours',  t:'Contours',         s:'lines of equal displacement'},
  {v:'field',     t:'Continuous field', s:'signed displacement u'},
  {v:'amplitude', t:'Amplitude',        s:'|u|'},
  {v:'energy',    t:'Energy',           s:'½ v² + ½ c² |∇u|²'},
  {v:'gradient',  t:'Gradient',         s:'|∇u|'}
];

let toastT=0;
function toast(msg,ms){ const t=$('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),ms||1800); }

/* ---------- state ---------- */
let cfg=clone(DEFAULTS), draft=clone(DEFAULTS), geom=null, sim=null, started=false;
let playing=false, everPlayed=false, acc=0, needDraw=true, plotsDirty=true, clockDirty=true, msStep=0.5;
let rec=null, marks=[], gsym=null, refG=1, refE=1, radMax=1, cenMax=1, cenPeak={v:0,t:0}, prof=null;
const view={x:0,y:0,z:1};
const active=()=>started && !$('cfg').classList.contains('on');

/* ---------- experiment controller ---------- */
function build(){
  geom=G.build(cfg.geom); sim=new W.Sim(cfg,geom); prof=new Float64Array(sim.nb);
  afterReset();
}
function afterReset(){
  playing=false; everPlayed=false; acc=0; marks=[];
  rec={n:0, stride:4, t:new Float64Array(CAP), c:new Float64Array(CAP), e:new Float64Array(CAP), k:new Float64Array(CAP)};
  record();
  // reference scales for the energy and gradient views: the largest values in the initial state
  const {M,u,up,kind,dx,dt,c}=sim; let mg=0, me=0;
  for(let j=1;j<M-1;j++) for(let q=j*M+1;q<j*M+M-1;q++){ if(kind[q]||kind[q-1]||kind[q+1]||kind[q-M]||kind[q+M]) continue;
    const gx=(u[q+1]-u[q-1])/(2*dx), gy=(u[q+M]-u[q-M])/(2*dx), g2=gx*gx+gy*gy, v=(u[q]-up[q])/dt, e=0.5*v*v+0.5*c*c*g2; if(g2>mg) mg=g2; if(e>me) me=e; }
  refG=Math.sqrt(mg)||1; refE=me||1;
  gsym=sim.gridSymmetry();
  radMax=cenMax=Math.max(0.2,1.15*cfg.field.amp); cenPeak={v:0,t:0};
  needDraw=plotsDirty=clockDirty=true; fillSym(); drawMarks(); ui();
}
function record(){
  const r=rec;
  if(r.n===CAP){ for(let i=0;i<CAP/2;i++){ r.t[i]=r.t[2*i]; r.c[i]=r.c[2*i]; r.e[i]=r.e[2*i]; r.k[i]=r.k[2*i]; } r.n=CAP/2; r.stride*=2; if(sim.steps%r.stride) return; }
  const E=sim.energy(), c=sim.centre();
  r.t[r.n]=sim.t; r.c[r.n]=c; r.e[r.n]=E.total; r.k[r.n]=E.kin; r.n++;
  if(Math.abs(c)>Math.abs(cenPeak.v)) cenPeak={v:c,t:sim.t};
}
function advance(n){
  const t0=performance.now();
  for(let i=0;i<n;i++){
    if(cfg.release.at>=0 && !sim.released && !sim.releasing && cfg.release.mode!=='none' && sim.t>=cfg.release.at){ sim.release(); ui(); }
    const was=sim.releasing; sim.step(1); if(was&&!sim.releasing) ui();
    if(sim.steps%rec.stride===0) record();
  }
  if(n>0) msStep=0.8*msStep+0.2*(performance.now()-t0)/n;
  needDraw=plotsDirty=clockDirty=true;
}
function doRelease(){ const ok=sim.release(); playing=true; everPlayed=true; needDraw=true; ui(); return ok; }
function setPlaying(p){ playing=p; if(p) everPlayed=true; acc=0; ui(); wake(film.on&&p); }
function stepOnce(){ playing=false; everPlayed=true; advance(Math.max(1,Math.round(0.01/sim.dt))); ui(); }
function resetSim(){ sim.reset(); afterReset(); }

function ui(){
  if(!sim) return;
  const R=$('bRelease'), none=cfg.release.mode==='none'||!sim.hasObstacle;
  R.textContent=none?'No release':sim.releasing?'Releasing…':sim.released?'Released':'Release wall';
  R.disabled=none||sim.released||sim.releasing;
  $('bPlay').textContent=playing?'Pause':everPlayed?'Resume':'Play';
  const wall=!sim.hasObstacle?'no obstacle':none?'permanent obstacle':sim.releasing?'wall receding since t = '+sim.releaseT.toFixed(3):sim.released?'released at t = '+sim.releaseT.toFixed(3):'wall present';
  $('status').textContent=wall+' · '+(playing?'running':'paused');
  $('fPlay').innerHTML=playing
    ?'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
$('bRelease').onclick=doRelease;
$('bPlay').onclick=()=>setPlaying(!playing);
$('bStep').onclick=stepOnce;
$('bReset').onclick=()=>{ resetSim(); toast('Back to t = 0'); };
$('bMark').onclick=()=>{ marks.push(sim.t); drawMarks(); plotsDirty=true; toast('Marked t = '+sim.t.toFixed(3)); };
function drawMarks(){ const el=$('marks'); el.innerHTML='';
  marks.forEach((t,i)=>{ const b=document.createElement('button'); b.type='button'; b.textContent='t = '+t.toFixed(3)+'  ×'; b.onclick=()=>{ marks.splice(i,1); drawMarks(); plotsDirty=true; }; el.append(b); });
  $('marksNote').style.display=marks.length?'none':''; }

/* ---------- field renderer: WebGL2 (bicubic sampling of the grid, colour computed per pixel) ---------- */
const stage=$('stage'), ov=$('ov'), og=ov.getContext('2d');
// Session-only comparison. Never persisted in experiment settings, links, or captures.
let signedComparison=false;
const effectiveViewMode=()=>signedComparison?'field':cfg.view.mode;
const signedButton=document.createElement('button');
signedButton.type='button';
signedButton.title='Toggle signed displacement: orange/pink = positive, blue = negative. Display only; physics unchanged.';
signedButton.style.cssText='position:absolute;left:12px;bottom:12px;z-index:20;background:#17102bed;color:#f1eaff;border:1px solid #8165ad;border-radius:9px;padding:10px 12px;font:13px system-ui;cursor:pointer';
stage.appendChild(signedButton);
const signedConfigButton=document.createElement('button');
signedConfigButton.type='button';
signedConfigButton.className='pill';
signedConfigButton.style.cssText='width:100%;margin:8px 0;padding:12px';
const updateSignedButtons=()=>{
  signedButton.textContent=signedComparison?'Signed ± ON · show contours':'Signed ± OFF · show signs';
  signedConfigButton.textContent=signedComparison?'Signed displacement: ON (blue − / pink +)':'Signed displacement: OFF (contours)';
};
const toggleSigned=()=>{signedComparison=!signedComparison;updateSignedButtons();needDraw=true;};
signedButton.onclick=toggleSigned;signedConfigButton.onclick=toggleSigned;
$('gMode').parentElement.insertBefore(signedConfigButton,$('gMode').nextSibling);
updateSignedButtons();
let showReleasedBoundary=false;
const boundaryToggle=document.createElement('button');
boundaryToggle.type='button';
boundaryToggle.textContent='Show old boundary';
boundaryToggle.title='Optional reference overlay; never changes the wave simulation';
boundaryToggle.style.cssText='position:absolute;right:12px;bottom:12px;z-index:20;background:#17102bdc;color:#e9d8ff;border:1px solid #8165ad;border-radius:9px;padding:9px 12px;font:12px system-ui;cursor:pointer;display:none';
stage.appendChild(boundaryToggle);
boundaryToggle.onclick=()=>{showReleasedBoundary=!showReleasedBoundary;boundaryToggle.textContent=showReleasedBoundary?'Hide old boundary':'Show old boundary';needDraw=true;};
let cv=$('gl'), gl=null, U=null, tex=null, texM=0, fbuf=null, c2d=null, off=null, offImg=null;
const FRAG=`#version 300 es
precision highp float;
uniform highp sampler2D uF;
uniform vec2 uRes; uniform vec3 uCam;
uniform float uN,uPad,uGain,uDelta,uRefG,uRefE,uC,uPx,uRd;
uniform int uMode,uM;
out vec4 o;
vec4 cw(float t){ float a=t*t,b=a*t; return vec4(-.5*b+a-.5*t,1.5*b-2.5*a+1.,-1.5*b+2.*a+.5*t,.5*b-.5*a); }
vec4 dw(float t){ float a=t*t; return vec4(-1.5*a+2.*t-.5,4.5*a-5.*t,-4.5*a+4.*t+.5,1.5*a-t); }
void main(){
  vec2 d=(gl_FragCoord.xy-.5*uRes)/uCam.z+uCam.xy;
  vec3 bg=vec3(.020,.008,.043);
  float e=uRd>0.?length(d)-uRd:max(abs(d.x),abs(d.y))-.5;
  if(e>0.){ o=vec4(bg*.4,1.); return; }
  vec2 g=(d+.5)*uN+uPad-.5, fl=floor(g), f=g-fl; ivec2 b=ivec2(fl);
  vec4 wx=cw(f.x), wy=cw(f.y), dx=dw(f.x), dy=dw(f.y);
  float u=0.,v=0.,ux=0.,uy=0.;
  for(int j=0;j<4;j++) for(int i=0;i<4;i++){
    vec2 t=texelFetch(uF,clamp(b+ivec2(i-1,j-1),ivec2(0),ivec2(uM-1)),0).rg;
    u+=wx[i]*wy[j]*t.r; v+=wx[i]*wy[j]*t.g; ux+=dx[i]*wy[j]*t.r; uy+=wx[i]*dy[j]*t.r; }
  float a=u*uGain, gr=length(vec2(ux,uy));
  vec3 col=bg;
  if(uMode==0){
    vec3 hi=a>0.?vec3(.84,.60,1.):vec3(.50,.42,1.);
    float s=a/uDelta, gs=gr*uGain/uDelta*uN/uCam.z, dp=abs(fract(s)-.5)/max(gs,1e-6);
    float line=1.-smoothstep(uPx*.55,uPx*1.55,dp), glow=exp(-dp/(uPx*4.));
    col+=hi*(1.-exp(-abs(a)*1.2))*.14+hi*glow*.30+vec3(.93,.80,1.)*line*.9;
  } else if(uMode==1){
    float t=1.-exp(-abs(a)*1.3); col+=(a>0.?vec3(.95,.42,1.):vec3(.20,.62,1.))*t;
  } else if(uMode==2){
    float t=1.-exp(-abs(a)*1.3); col=mix(bg,vec3(.74,.50,1.),t)+vec3(.3)*t*t*t;
  } else if(uMode==3){
    float en=.5*v*v+.5*uC*uC*gr*gr*uN*uN, t=1.-exp(-en/uRefE*uGain*uGain*1.6); col=mix(bg,vec3(.80,.48,1.),t)+vec3(.35)*t*t*t;
  } else {
    float t=1.-exp(-gr*uN/uRefG*uGain*1.6); col=mix(bg,vec3(.62,.52,1.),t)+vec3(.3)*t*t*t;
  }
  o=vec4(col,1.);
}`;
function initGL(){
  try{ gl=cv.getContext('webgl2',{antialias:false,alpha:false}); }catch(_){ gl=null; }
  if(gl){
    const sh=(type,src)=>{ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null; };
    const vs=sh(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }');
    const fs=sh(gl.FRAGMENT_SHADER,FRAG), p=gl.createProgram();
    if(vs&&fs){ gl.attachShader(p,vs); gl.attachShader(p,fs); gl.linkProgram(p); }
    if(vs&&fs&&gl.getProgramParameter(p,gl.LINK_STATUS)){
      gl.useProgram(p); U={}; ['uF','uRes','uCam','uN','uPad','uGain','uDelta','uRefG','uRefE','uC','uPx','uMode','uM','uRd'].forEach(n=>U[n]=gl.getUniformLocation(p,n));
      tex=null; texM=0; return;
    }
    gl=null; const c=document.createElement('canvas'); c.id='gl'; cv.replaceWith(c); cv=c;     // the shader did not compile: use the plain canvas
  }
  c2d=cv.getContext('2d');
}
cv.addEventListener('webglcontextlost',e=>{ e.preventDefault(); gl=null; });
cv.addEventListener('webglcontextrestored',()=>{ initGL(); needDraw=true; });
function shade(u,v,gr,px,sc){ // the same colours as the shader, on the processor (fallback without WebGL2). gr: |∇u| per cell
  const a=u*cfg.view.gain, m=effectiveViewMode(), N=sim.N; let r=0.020, g=0.008, b=0.043;
  const mix=(c,t,w)=>{ r=r+(c[0]-r)*t+w*t*t*t; g=g+(c[1]-g)*t+w*t*t*t; b=b+(c[2]-b)*t+w*t*t*t; };
  if(m==='contours'){ const hi=a>0?[.84,.60,1]:[.50,.42,1], D=cfg.view.levels*cfg.field.amp, s=a/D, gs=gr*cfg.view.gain/D*N/sc, dp=Math.abs(s-Math.floor(s)-.5)/Math.max(gs,1e-6);
    const x=Math.max(0,Math.min(1,(dp-px*.55)/px)), line=1-x*x*(3-2*x), k=(1-Math.exp(-Math.abs(a)*1.2))*.14+Math.exp(-dp/(px*4))*.30;
    r+=hi[0]*k+.93*line*.9; g+=hi[1]*k+.80*line*.9; b+=hi[2]*k+line*.9; }
  else if(m==='field'){ const t=1-Math.exp(-Math.abs(a)*1.3), c=a>0?[.95,.42,1]:[.20,.62,1]; r+=c[0]*t; g+=c[1]*t; b+=c[2]*t; }
  else if(m==='amplitude') mix([.74,.50,1],1-Math.exp(-Math.abs(a)*1.3),.3);
  else if(m==='energy') mix([.80,.48,1],1-Math.exp(-(.5*v*v+.5*sim.c*sim.c*gr*gr*N*N)/refE*cfg.view.gain*cfg.view.gain*1.6),.35);
  else mix([.62,.52,1],1-Math.exp(-gr*N/refG*cfg.view.gain*1.6),.3);
  return [r,g,b];
}
function draw2D(Wp,Hp,sc){
  const N=sim.N, M=sim.M, pad=sim.pad, u=sim.u, up=sim.up, idt=1/sim.dt;
  if(!off||off.width!==N){ off=document.createElement('canvas'); off.width=off.height=N; offImg=off.getContext('2d').createImageData(N,N); }
  const px=Math.max(1,N/sc*1.2), d=offImg.data;
  for(let j=0;j<N;j++) for(let i=0;i<N;i++){ const q=(j+pad)*M+i+pad, o=((N-1-j)*N+i)*4;
    const x=(i+.5)/N-.5, y=(j+.5)/N-.5;
    if(sim.disc && Math.hypot(x,y)>sim.Rd){ d[o]=2; d[o+1]=1; d[o+2]=4; d[o+3]=255; continue; }
    const c=shade(u[q],(u[q]-up[q])*idt,Math.hypot(u[q+1]-u[q-1],u[q+M]-u[q-M])/2,px,N);
    d[o]=Math.min(255,c[0]*255); d[o+1]=Math.min(255,c[1]*255); d[o+2]=Math.min(255,c[2]*255); d[o+3]=255; }
  off.getContext('2d').putImageData(offImg,0,0);
  c2d.fillStyle='#020104'; c2d.fillRect(0,0,Wp,Hp); c2d.imageSmoothingEnabled=true; c2d.imageSmoothingQuality='high';
  c2d.drawImage(off,Wp/2-(0.5+view.x)*sc,Hp/2-(0.5-view.y)*sc,sc,sc);
}
function draw(){
  needDraw=false; if(!sim) return;
  const Wp=cv.width, Hp=cv.height, sc=Math.min(Wp,Hp)*view.z;
  if(gl){
    const M=sim.M, n=M*M, u=sim.u, up=sim.up, idt=1/sim.dt;
    if(texM!==M){ if(tex) gl.deleteTexture(tex); tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texStorage2D(gl.TEXTURE_2D,1,gl.RG32F,M,M);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      texM=M; fbuf=new Float32Array(2*n); }
    for(let q=0;q<n;q++){ fbuf[2*q]=u[q]; fbuf[2*q+1]=(u[q]-up[q])*idt; }
    gl.bindTexture(gl.TEXTURE_2D,tex); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,M,M,gl.RG,gl.FLOAT,fbuf);
    gl.viewport(0,0,Wp,Hp);
    gl.uniform1i(U.uF,0); gl.uniform2f(U.uRes,Wp,Hp); gl.uniform3f(U.uCam,view.x,view.y,sc);
    gl.uniform1f(U.uN,sim.N); gl.uniform1f(U.uPad,sim.pad); gl.uniform1f(U.uGain,cfg.view.gain); gl.uniform1f(U.uDelta,cfg.view.levels*cfg.field.amp);
    gl.uniform1f(U.uRefG,refG); gl.uniform1f(U.uRefE,refE); gl.uniform1f(U.uC,sim.c); gl.uniform1f(U.uPx,rs());
    gl.uniform1i(U.uMode,MODES.findIndex(m=>m.v===effectiveViewMode())); gl.uniform1i(U.uM,M); gl.uniform1f(U.uRd,sim.disc?sim.Rd:0);
    gl.drawArrays(gl.TRIANGLES,0,3);
  } else if(c2d) draw2D(Wp,Hp,sc);
  drawOverlay(og,Wp,Hp);
}
// the obstacle: solid with an outline while it stands, a thin dashed outline once it is gone
function drawOverlay(g,Wp,Hp){
  g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,Wp,Hp);
  const sc=Math.min(Wp,Hp)*view.z, X=x=>Wp/2+(x-view.x)*sc, Y=y=>Hp/2-(y-view.y)*sc, d=rs();
  if(sim.disc){ g.beginPath(); g.arc(X(0),Y(0),sim.Rd*sc,0,7); g.strokeStyle='rgba(215,190,255,.28)'; g.lineWidth=d; g.stroke(); }
  boundaryToggle.style.display=geom.mask&&sim.released?'block':'none';
  if(!sim.hasObstacle && !(geom.mask&&sim.released&&showReleasedBoundary)) return;
  if(geom.mask){
    const n=geom.maskN, mask=geom.mask;
    if(!geom._wallCanvas){
      const make=(edge)=>{const c=document.createElement('canvas');c.width=c.height=n;
        const ctx=c.getContext('2d'),img=ctx.createImageData(n,n);
        for(let j=0;j<n;j++)for(let i=0;i<n;i++){const q=j*n+i,v=mask[q],boundary=i>0&&i<n-1&&j>0&&j<n-1&&(v!==mask[q-1]||v!==mask[q+1]||v!==mask[q-n]||v!==mask[q+n]);
          const k=q*4;if(edge?boundary:v){img.data[k]=edge?220:15;img.data[k+1]=edge?180:8;img.data[k+2]=edge?255:30;img.data[k+3]=edge?185:245;}}
        ctx.putImageData(img,0,0);return c;};
      geom._wallCanvas=make(false);geom._edgeCanvas=make(true);
    }
    const size=sc, xx=X(-0.5),yy=Y(0.5);
    g.imageSmoothingEnabled=false;
    if(!sim.released)g.drawImage(geom._wallCanvas,xx,yy,size,size);
    if(!sim.released||showReleasedBoundary){
      g.globalAlpha=sim.released?0.45:0.95;
      g.drawImage(geom._edgeCanvas,xx,yy,size,size);g.globalAlpha=1;
    }
    return;
  }
  g.beginPath(); geom.paths.forEach(p=>{ p.forEach((q,i)=>i?g.lineTo(X(q[0]),Y(q[1])):g.moveTo(X(q[0]),Y(q[1]))); g.closePath(); });
  g.lineJoin='round';
  if(!sim.released){
    const left=sim.releasing?1-sim.obstPtr/sim.obstList.length:1;
    g.fillStyle='rgba(15,8,30,'+(0.96*left).toFixed(3)+')'; g.fill('evenodd');
    if(!sim.releasing){ g.setLineDash([]); g.lineWidth=1.5*d; g.strokeStyle='rgba(214,188,255,.9)'; g.stroke(); return; }
  }
  g.setLineDash([5*d,5*d]); g.lineWidth=d; g.strokeStyle='rgba(222,200,255,.6)'; g.stroke(); g.setLineDash([]);
}
function resize(){
  const r=stage.getBoundingClientRect(), d=rs(), w=Math.max(2,Math.round(r.width*d)), h=Math.max(2,Math.round(r.height*d));
  [cv,ov].forEach(c=>{ if(c.width!==w||c.height!==h){ c.width=w; c.height=h; } });
  clampView(); needDraw=plotsDirty=true;
}

/* ---------- camera: pinch, drag, wheel, double tap ---------- */
function clampView(){ view.z=Math.max(1,Math.min(16,view.z)); const m=0.5*(1-1/view.z); view.x=Math.max(-m,Math.min(m,view.x)); view.y=Math.max(-m,Math.min(m,view.y)); }
const scaleCss=()=>{ const r=stage.getBoundingClientRect(); return Math.min(r.width,r.height)*view.z; };
function zoomAt(px,py,f){
  const r=stage.getBoundingClientRect(), s0=scaleCss(), wx=(px-r.width/2)/s0+view.x, wy=-(py-r.height/2)/s0+view.y;
  view.z=Math.max(1,Math.min(16,view.z*f)); const s1=scaleCss();
  view.x=wx-(px-r.width/2)/s1; view.y=wy+(py-r.height/2)/s1; clampView(); needDraw=true;
}
const ptrs=new Map(); let moved=0, downT=0, tapT=0, tapX=0, tapY=0;
const local=e=>{ const r=stage.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; };
stage.addEventListener('pointerdown',e=>{
  if(e.target.closest('#filmBar')) return;
  e.preventDefault(); closePop(); try{ stage.setPointerCapture(e.pointerId); }catch(_){}
  ptrs.set(e.pointerId,local(e)); if(ptrs.size===1){ moved=0; downT=performance.now(); }
});
stage.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId)) return;
  const ids=[...ptrs.keys()].slice(0,2), before=ids.map(id=>ptrs.get(id)); ptrs.set(e.pointerId,local(e)); const after=ids.map(id=>ptrs.get(id));
  if(ptrs.size===1){ const dx=after[0][0]-before[0][0], dy=after[0][1]-before[0][1]; moved+=Math.abs(dx)+Math.abs(dy);
    const s=scaleCss(); view.x-=dx/s; view.y+=dy/s; clampView(); needDraw=true; }
  else if(ids.includes(e.pointerId)){ moved+=99;
    const mid=q=>[(q[0][0]+q[1][0])/2,(q[0][1]+q[1][1])/2], dist=q=>Math.hypot(q[0][0]-q[1][0],q[0][1]-q[1][1]);
    const m0=mid(before), m1=mid(after), d0=dist(before), d1=dist(after), s=scaleCss();
    view.x-=(m1[0]-m0[0])/s; view.y+=(m1[1]-m0[1])/s; if(d0>2&&d1>2) zoomAt(m1[0],m1[1],d1/d0); else { clampView(); needDraw=true; } }
});
function pointerEnd(e){
  if(!ptrs.has(e.pointerId)) return;
  const was=ptrs.size, p=ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  if(was!==1 || e.type==='pointercancel' || moved>10 || performance.now()-downT>450) return;
  const now=performance.now();
  if(now-tapT<320 && Math.hypot(p[0]-tapX,p[1]-tapY)<40){ tapT=0; if(view.z>1.05){ view.x=view.y=0; view.z=1; needDraw=true; } else zoomAt(p[0],p[1],2.5); return; }   // double tap: zoom in, or back to the whole domain
  tapT=now; tapX=p[0]; tapY=p[1];
  if(film.on) filmBar(!$('filmBar').classList.contains('on'));
}
stage.addEventListener('pointerup',pointerEnd); stage.addEventListener('pointercancel',pointerEnd);
stage.addEventListener('wheel',e=>{ e.preventDefault(); const p=local(e); zoomAt(p[0],p[1],Math.exp(-e.deltaY*(e.deltaMode===1?16:1)*0.0016)); },{passive:false});
['gesturestart','gesturechange','contextmenu'].forEach(t=>stage.addEventListener(t,e=>e.preventDefault()));

/* ---------- measurement engine: plots below the image ---------- */
function plot(c,o){
  if(!c.clientWidth) return;
  const d=dpr(), w=Math.round(c.clientWidth*d), h=Math.round(c.clientHeight*d); if(c.width!==w||c.height!==h){ c.width=w; c.height=h; }
  const g=c.getContext('2d'), L=8*d, R=8*d, T=9*d, B=9*d;
  const X=x=>L+(x-o.x0)/((o.x1-o.x0)||1)*(w-L-R), Y=y=>T+(o.y1-y)/((o.y1-o.y0)||1)*(h-T-B);
  g.clearRect(0,0,w,h); g.lineWidth=d;
  if(o.y0<0&&o.y1>0){ g.strokeStyle='rgba(215,190,255,.22)'; g.beginPath(); g.moveTo(L,Y(0)); g.lineTo(w-R,Y(0)); g.stroke(); }
  (o.v||[]).forEach(v=>{ if(v.x<o.x0||v.x>o.x1) return; g.strokeStyle=v.c; g.setLineDash(v.dash?[4*d,4*d]:[]); g.beginPath(); g.moveTo(X(v.x),T); g.lineTo(X(v.x),h-B); g.stroke(); });
  g.setLineDash([]); g.lineJoin='round';
  o.lines.forEach(l=>{ if(l.n<1) return; g.strokeStyle=l.c; g.lineWidth=(l.w||1.6)*d; g.beginPath();
    for(let i=0;i<l.n;i++){ const x=X(l.x(i)), y=Y(Math.max(o.y0-1e9,Math.min(o.y1+1e9,l.y(i)))); i?g.lineTo(x,y):g.moveTo(x,y); } g.stroke(); });
  g.font=(10.5*d)+'px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'; g.fillStyle='rgba(190,170,220,.75)';
  g.textBaseline='top'; g.textAlign='left'; g.fillText(o.top,L,2*d);
  g.textBaseline='bottom'; g.fillText(o.bottom,L,h-1*d); g.textAlign='right'; g.fillText(o.right,w-R,h-1*d);
}
const nice=x=>{ const a=Math.abs(x); return minus(a>=100?x.toFixed(0):a>=10?x.toFixed(1):x.toFixed(2)); };
function drawPlots(){
  plotsDirty=false; if(!sim||film.on) return;
  const dev=sim.radial(prof), ray=cfg.view.profile==='ray'; if(ray) sim.ray(prof);
  let m=0; for(let b=0;b<sim.nb;b++){ const a=Math.abs(prof[b]); if(a>m) m=a; } radMax=Math.max(m*1.08,radMax*0.985,1.15*cfg.field.amp);
  const h=sim.dx/3, circ=geom.type==='circle'&&!(cfg.geom.eps>0)&&cfg.geom.x===0&&cfg.geom.y===0;
  plot($('pRad'),{x0:0,x1:0.5,y0:-radMax,y1:radMax,top:'u  ±'+nice(radMax),bottom:'r = 0',right:'r = 0.5',
    v:circ?[{x:cfg.geom.size,c:'rgba(222,200,255,.5)',dash:!(!sim.released&&!sim.releasing)}]:[],
    lines:[{n:sim.nb,x:b=>(b+0.5)*h,y:b=>prof[b],c:'#c9a3ff'}]});
  $('radMode').textContent=ray?'Ray θ = 0':'Mean over angle';
  $('radT').textContent=circ?'Radial cross-section':'Profile about the centre';
  $('radRead').innerHTML=(ray?'u along the ray from the centre towards +x.':'Mean of u over each circle about the centre of the domain.')+(circ?' Vertical line: the boundary at r = '+cfg.geom.size.toFixed(2)+(sim.released?' (released).':'.'):'');
  const r=rec, tmax=Math.max(sim.t,0.05), vl=[];
  if(sim.releaseT!==null) vl.push({x:sim.releaseT,c:'rgba(222,200,255,.55)',dash:true});
  marks.forEach(t=>vl.push({x:t,c:'rgba(255,214,120,.8)'}));
  cenMax=Math.max(cenMax,Math.abs(cenPeak.v)*1.08);
  plot($('pCen'),{x0:0,x1:tmax,y0:-cenMax,y1:cenMax,top:'u  ±'+nice(cenMax),bottom:'t = 0',right:'t = '+sim.t.toFixed(2),v:vl,lines:[{n:r.n,x:i=>r.t[i],y:i=>r.c[i],c:'#c9a3ff'}]});
  $('cenRead').innerHTML='now <b>'+minus(sim.centre().toFixed(4))+'</b> · velocity <b>'+minus(sim.centreVelocity().toFixed(2))+'</b> · largest |u| so far <b>'+Math.abs(cenPeak.v).toFixed(3)+'</b> at t = '+cenPeak.t.toFixed(3);
  const E0=sim.E0||1; let em=1; for(let i=0;i<r.n;i++){ if(r.e[i]/E0>em) em=r.e[i]/E0; }
  plot($('pEn'),{x0:0,x1:tmax,y0:0,y1:em*1.12,top:'E / E₀  '+(em*1.12).toFixed(2),bottom:'0',right:'t = '+sim.t.toFixed(2),v:vl,
    lines:[{n:r.n,x:i=>r.t[i],y:i=>r.k[i]/E0,c:'rgba(120,170,255,.75)',w:1.1},{n:r.n,x:i=>r.t[i],y:i=>(r.e[i]-r.k[i])/E0,c:'rgba(255,140,220,.7)',w:1.1},{n:r.n,x:i=>r.t[i],y:i=>r.e[i]/E0,c:'#f1eaff',w:1.8}]});
  const E=r.n?r.e[r.n-1]:sim.E0, K=r.n?r.k[r.n-1]:0, ch=E/E0-1, closed=sim.outer!=='absorb'&&!(cfg.phys.damping>0);
  const loose=(sim.outer==='reflect'||sim.outer==='periodic')&&(sim.released||cfg.phys.obstacle==='free'||!sim.hasObstacle), mean=loose?sim.mean():null;
  $('enRead').innerHTML='E / E₀ = <b>'+(E/E0).toFixed(6)+'</b> · change <b>'+minus(ch.toExponential(1))+'</b> · <span style="color:#86b0ff">kinetic '+Math.round(100*K/(E||1))+' %</span> · <span style="color:#ff9bdc">potential '+Math.round(100*(1-K/(E||1)))+' %</span>'
    +'<br>'+(closed?'Closed and undamped: the scheme should keep E constant to rounding error.':'Energy leaves through '+(sim.outer==='absorb'?'the absorbing edge':'')+(sim.outer==='absorb'&&cfg.phys.damping>0?' and ':'')+(cfg.phys.damping>0?'damping':'')+'.')
    +(sim.releaseT!==null?' Added by the release: <b>'+minus((sim.releaseJump/E0).toExponential(1))+'</b> E₀.':'')
    +(loose?'<br>Nothing is fixed here, so the whole sheet may drift: mean u = <b>'+minus(mean[0].toFixed(3))+'</b>, moving at <b>'+minus(mean[1].toFixed(3))+'</b> per time unit. That is the model, not an instability.':'');
  const a=$('symDev'); if(a) a.textContent=(100*dev).toFixed(2)+' %';
}
function fillSym(){
  const s=geom.symmetry;
  $('symT').innerHTML=
    '<tr><td>Obstacle</td><td>'+s.group+' <i>'+s.text+'</i></td></tr>'
   +'<tr><td>Whole experiment, on this grid</td><td>'+gsym.group+' <i>'+gsym.order+' of the grid’s 8 symmetries leave the initial state unchanged: '+gsym.kept.join(', ')+'</i></td></tr>'
   +'<tr><td>Departure from radial symmetry, now</td><td><span id="symDev">0 %</span> <i>rms of u minus its mean over each circle, r &lt; 0.5. 0 % is perfectly radial.</i></td></tr>';
}
$('radMode').onclick=()=>{ cfg.view.profile=cfg.view.profile==='mean'?'ray':'mean'; radMax=Math.max(0.2,1.15*cfg.field.amp); plotsDirty=true; };

/* ---------- small builders ---------- */
function group(el,items,get,set){
  el._get=get; el.innerHTML='';
  items.forEach(it=>{ const b=document.createElement('button'); b.type='button'; b.className='opt'; b._v=it.v;
    if(it.thumb){ const c=document.createElement('canvas'); c.width=c.height=132; b.append(c); it.cv=c; }
    const t=document.createElement('b'); t.textContent=it.t; b.append(t);
    if(it.s){ const s=document.createElement('small'); s.textContent=it.s; b.append(s); }
    b.onclick=()=>set(it.v); el.append(b); });
}
function syncGroups(root){ root.querySelectorAll('.grp').forEach(g=>[...g.children].forEach(b=>b.classList.toggle('on',b._v===g._get()))); }
function slider(el,o){
  const w=document.createElement('label'); w.className='sl';
  const s=document.createElement('span'), out=document.createElement('output'), i=document.createElement('input');
  s.textContent=o.t; i.type='range'; i.min=o.min; i.max=o.max; i.step=o.step; i.value=o.get(); out.textContent=o.fmt(+i.value);
  i.oninput=()=>{ o.set(+i.value); out.textContent=o.fmt(+i.value); syncCfg(true); };
  i.onchange=()=>syncCfg();
  w.append(s,out,i); el.append(w);
}
function thumb(c,g){ // the obstacle alone, in the domain square
  const x=c.getContext('2d'), n=c.width, o=G.build(g); x.clearRect(0,0,n,n); x.fillStyle='#07030e'; x.fillRect(0,0,n,n);
  if(o.mask){const N=o.maskN,im=x.createImageData(n,n);
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const sx=Math.min(N-1,Math.floor((i+0.5)*N/n)),sy=Math.min(N-1,Math.floor((j+0.5)*N/n)),q=(j*n+i)*4;
      if(o.mask[sy*N+sx]){im.data[q]=115;im.data[q+1]=70;im.data[q+2]=175;im.data[q+3]=255;}}
    x.putImageData(im,0,0);return;}
  x.beginPath(); o.paths.forEach(p=>{ p.forEach((q,i)=>{ const a=(q[0]+0.5)*n, b=(0.5-q[1])*n; i?x.lineTo(a,b):x.moveTo(a,b); }); x.closePath(); });
  x.fillStyle='rgba(185,140,255,.2)'; x.fill('evenodd'); x.strokeStyle='#cba6ff'; x.lineWidth=2; x.lineJoin='round'; x.stroke();
}

/* ---------- quick switches in the viewer: none of them touches the simulation ---------- */
group($('qMode'),MODES.map(m=>({v:m.v,t:m.t})),()=>cfg.view.mode,v=>{ cfg.view.mode=v; syncQuick(); needDraw=true; });
group($('qGain'),[1,2,4,8,16].map(v=>({v,t:v+'×'})),()=>cfg.view.gain,v=>{ cfg.view.gain=v; syncQuick(); needDraw=true; });
group($('qLev'),[{v:1,t:'A'},{v:0.5,t:'A / 2'},{v:0.25,t:'A / 4'}],()=>cfg.view.levels,v=>{ cfg.view.levels=v; syncQuick(); needDraw=true; });
group($('qRate'),[0.25,0.5,1,2,4].map(v=>({v,t:v+'×'})),()=>cfg.play.rate,v=>{ cfg.play.rate=v; syncQuick(); });
function syncQuick(){ syncGroups($('pop')); const c=effectiveViewMode()==='contours'; $('qLev').style.display=$('qLevL').style.display=c?'':'none'; }
const closePop=()=>{ $('pop').classList.remove('on'); $('bView').classList.remove('on'); };
$('bView').onclick=()=>{ const on=!$('pop').classList.contains('on'), p=$('pop'); p.classList.toggle('on',on); $('bView').classList.toggle('on',on); syncQuick();
  if(on){ const r=$('panel').getBoundingClientRect(); p.style.left=(r.left+8)+'px'; p.style.width=Math.min(360,r.width-16)+'px'; p.style.maxHeight=Math.max(160,r.height-10)+'px'; } };   // over the instruments, never over the picture
document.addEventListener('pointerdown',e=>{ if($('pop').classList.contains('on') && !e.target.closest('#pop,#bView')) closePop(); },true);

/* ---------- configuration screen: edits a draft; nothing is computed until Start ---------- */
const LIB=G.LIBRARY.map(l=>({v:l.v,t:l.t,thumb:true}));
const PRE=PRESETS.map(p=>({v:p.v,t:p.t,s:p.s,thumb:true}));
const presetOf=d=>{ const j=JSON.stringify(diff(Object.assign(clone(d),{film:false,view:DEFAULTS.view,play:DEFAULTS.play}))); const p=PRESETS.find(p=>JSON.stringify(diff(merge(DEFAULTS,p.patch)))===j); return p?p.v:null; };
group($('gPreset'),PRE,()=>presetOf(draft),v=>{ const keep={view:draft.view,play:draft.play,film:draft.film}; draft=Object.assign(merge(DEFAULTS,PRESETS.find(p=>p.v===v).patch),keep); syncCfg(); });
group($('gGeom'),LIB,()=>draft.geom.type,v=>{ draft.geom.type=v; if(v==='pair'&&draft.geom.size>0.2) draft.geom.size=0.13; if(v==='star'&&draft.geom.n<5) draft.geom.n=5; syncCfg(); });
group($('gField'),W.FIELDS,()=>draft.field.kind,v=>{ draft.field.kind=v; syncCfg(); });
group($('gFollow'),[{v:'boundary',t:'The boundary',s:'distance from the obstacle'},{v:'radial',t:'Circles',s:'distance from its centre'}],()=>draft.field.follow,v=>{ draft.field.follow=v; syncCfg(); });
group($('gObs'),[{v:'fixed',t:'Fixed',s:'Dirichlet, u = 0'},{v:'free',t:'Free',s:'Neumann, ∂u/∂n = 0'}],()=>draft.phys.obstacle,v=>{ draft.phys.obstacle=v; syncCfg(); });
group($('gOuter'),[{v:'fixed',t:'Fixed',s:'clamped rim, u = 0 (Dirichlet)'},{v:'reflect',t:'Free',s:'reflecting, ∂u/∂n = 0 (Neumann)'},{v:'absorb',t:'Absorbing',s:'open space'},{v:'periodic',t:'Periodic',s:'square domain only'}],
  ()=>draft.phys.outer,v=>{ draft.phys.outer=v; if(v==='periodic') draft.phys.domain='square'; syncCfg(); });
group($('gDomain'),[{v:'wide',t:'Circular, wide',s:'edge beyond the frame · O(2)'},{v:'disc',t:'Circular',s:'edge inside the frame · O(2)'},{v:'square',t:'Square',s:'the frame itself · D₄'}],
  ()=>draft.phys.domain,v=>{ draft.phys.domain=v; if(v!=='square'&&draft.phys.outer==='periodic') draft.phys.outer='reflect'; syncCfg(); });
group($('gRel'),[{v:'instant',t:'Instant',s:'all at once'},{v:'gradual',t:'Gradual',s:'recedes inward'},{v:'none',t:'Permanent',s:'control: no release'}],()=>draft.release.mode,v=>{ draft.release.mode=v; syncCfg(); });
group($('gAt'),[{v:-1,t:'On the button'},{v:0.25,t:'t = 0.25'},{v:0.5,t:'t = 0.5'},{v:1,t:'t = 1'},{v:2,t:'t = 2'}],()=>draft.release.at,v=>{ draft.release.at=v; syncCfg(); });
group($('gMode'),MODES,()=>draft.view.mode,v=>{ draft.view.mode=v; syncCfg(); });
group($('gN'),[128,192,256,384,512].map(v=>({v,t:v+'²'})),()=>draft.num.N,v=>{ draft.num.N=v; syncCfg(); });
group($('gSten'),[{v:'iso9',t:'9-point',s:'isotropic error'},{v:'five',t:'5-point',s:'classic'}],()=>draft.num.stencil,v=>{ draft.num.stencil=v; syncCfg(); });
group($('gCour'),[0.25,0.5,0.65].map(v=>({v,t:String(v)})),()=>draft.num.courant,v=>{ draft.num.courant=v; syncCfg(); });
$('filmT').onclick=()=>{ draft.film=!draft.film; syncCfg(true); };

let paramKey='';
function syncCfg(light){
  syncGroups($('cfg'));
  const g=draft.geom, f=draft.field, built=G.build(g), lib=G.LIBRARY.find(l=>l.v===g.type);
  const awaitingFractalSeed=g.type==='combination';
  // only the parameters this shape and this field really have
  const gp=lib.params.filter(p=>!G.PARAMS[p].when||G.PARAMS[p].when(g)).concat(['x','y']);
  const wave=['standing','inward','outward','plane'].includes(f.kind);
  const fp=(wave?['density','amp','phase']:['amp']).concat(f.kind==='plane'?['angle']:[],f.kind==='pulse'?['dist','width']:[],f.kind==='gauss'?['px','py','width']:[],['taper']);
  const key=g.type+'|'+gp.join()+'|'+f.kind+'|'+draft.release.mode;
  if(!light && key!==paramKey || !light && !$('pGeom').children.length){
    paramKey=key;
    const pg=$('pGeom'); pg.innerHTML=''; gp.forEach(p=>{ const o=G.PARAMS[p]; slider(pg,{t:o.t,min:o.min,max:o.max,step:o.step,fmt:o.fmt,get:()=>draft.geom[p],set:v=>draft.geom[p]=v}); });
    const FP={density:{t:'Wave density',min:2,max:30,step:1,fmt:v=>v+' across the domain · λ = '+(1/v).toFixed(3)}, amp:{t:'Amplitude A',min:0.1,max:2,step:0.05,fmt:v=>v.toFixed(2)},
      phase:{t:'Phase φ',min:-180,max:180,step:5,fmt:v=>minus(v)+'°'}, angle:{t:'Direction',min:-180,max:180,step:5,fmt:v=>minus(v)+'°'},
      dist:{t:'Distance from the boundary',min:0.02,max:0.3,step:0.005,fmt:v=>v.toFixed(3)}, width:{t:'Width',min:0.008,max:0.08,step:0.001,fmt:v=>v.toFixed(3)},
      px:{t:'Position x',min:-0.45,max:0.45,step:0.01,fmt:v=>minus(v.toFixed(2))}, py:{t:'Position y',min:-0.45,max:0.45,step:0.01,fmt:v=>minus(v.toFixed(2))},
      taper:{t:'Fade towards the outer edge',min:0,max:0.15,step:0.01,fmt:v=>v?v.toFixed(2):'off'}};
    const pf=$('pField'); pf.innerHTML=''; fp.forEach(p=>slider(pf,Object.assign({get:()=>draft.field[p],set:v=>draft.field[p]=v},FP[p])));
    const pp=$('pPhys'); pp.innerHTML='';
    slider(pp,{t:'Wave speed c',min:0.25,max:3,step:0.05,fmt:v=>v.toFixed(2)+'× (domain widths per time unit)',get:()=>draft.phys.c,set:v=>draft.phys.c=v});
    slider(pp,{t:'Damping γ',min:0,max:3,step:0.05,fmt:v=>v?v.toFixed(2):'none',get:()=>draft.phys.damping,set:v=>draft.phys.damping=v});
    const pr=$('pRel'); pr.innerHTML='';
    if(draft.release.mode==='gradual') slider(pr,{t:'Duration',min:0.05,max:1,step:0.05,fmt:v=>v.toFixed(2)+' time units',get:()=>draft.release.duration,set:v=>draft.release.duration=v});
  }
  $('gFollow').style.display=$('gFollow').previousElementSibling.style.display=(awaitingFractalSeed||f.kind==='gauss'||f.kind==='plane')?'none':'';
  $('gField').style.display=awaitingFractalSeed?'none':'';
  $('pField').style.display=awaitingFractalSeed?'none':'';
  $('gAt').style.display=$('gAt').previousElementSibling.style.display=draft.release.mode==='none'?'none':'';
  // thumbnails
  LIB.forEach(l=>thumb(l.cv,Object.assign({},G.DEFAULT_GEOM,l.v===g.type?g:{type:l.v,size:l.v==='pair'?0.13:0.32,n:l.v==='star'?5:3,x:0,y:0})));
  PRE.forEach(p=>thumb(p.cv,merge(DEFAULTS,PRESETS.find(q=>q.v===p.v).patch).geom));
  // what the choices mean
  const s=built.symmetry;
  $('symCfg').innerHTML='<tr><td>Shape</td><td>'+built.name+' <i>'+built.formula+'</i></td></tr><tr><td>Symmetry group</td><td>'+s.group+' <i>'+s.text+'</i></td></tr>'
    +(built.exact?'':'<tr><td>Distance field</td><td><i>The outline is exact; distances away from it are a first-order approximation. Contours that follow this boundary are therefore approximate offsets.</i></td></tr>');
  const dx=1/draft.num.N, lim=W.LIMIT[draft.num.stencil], C=Math.min(draft.num.courant,0.95*lim), cells=draft.num.N/f.density;
  $('sGeom').textContent=built.name+' · '+s.group;
  $('sField').textContent=awaitingFractalSeed?'Mandelbrot escape contours · initial velocity 0':W.FIELDS.find(x=>x.v===f.kind).t+(wave?' · density '+f.density:'');
  $('sPhys').textContent='c = '+draft.phys.c.toFixed(2)+' · '+({wide:'wide circular',disc:'circular',square:'square'})[draft.phys.domain]+', '+draft.phys.outer+' edge';
  $('sRel').textContent=({instant:'Instant',gradual:'Gradual, '+draft.release.duration.toFixed(2),none:'Permanent obstacle'})[draft.release.mode]+(draft.release.mode!=='none'&&draft.release.at>=0?' at t = '+draft.release.at:'');
  $('sVis').textContent=MODES.find(m=>m.v===draft.view.mode).t;
  $('sNum').textContent=draft.num.N+'² · C = '+C.toFixed(2);
  $('numNote').innerHTML='Δx = 1/'+draft.num.N+' · Δt = C Δx / c = '+(C*dx/draft.phys.c).toExponential(3)+' · stability limit for this stencil: C ≤ '+lim.toFixed(3)+'.'
    +(wave?' One wavelength spans '+cells.toFixed(1)+' cells'+(cells<10?' — <b style="color:#ffb46b">too few: expect visible numerical dispersion. Raise the grid or lower the density.</b>':'.'):'')
    +' The time step is fixed; playback speed only changes how many steps are shown per second.';
  $('filmT').textContent='Film Session: '+(draft.film?'on':'off'); $('filmT').classList.toggle('on',draft.film); $('filmT').setAttribute('aria-pressed',draft.film);
  $('start').textContent=started?'Start new':'Start';
  $('start').disabled=false;
  $('start').title='';
  if(awaitingFractalSeed) $('symCfg').innerHTML+='<tr><td>Initial field</td><td>Computed Mandelbrot smooth escape-time contours, sampled from a precomputed 160² grid. Zero initial velocity. After release, a separate scalar wave equation evolves the displacement. This is not fluid dynamics and escape contours are not physical waves.</td></tr>';
  $('resume').style.display=started?'':'none';
  let last=null; try{ last=localStorage.getItem('brl.last'); }catch(_){}
  $('useLast').style.display=last&&last!==JSON.stringify(diff(draft))?'':'none';
}
function openCfg(){ setPlaying(false); if(film.on) exitFilm(); closePop(); draft=clone(cfg); paramKey=''; $('cfg').classList.add('on'); $('cfg').firstElementChild.scrollTop=0; syncCfg(); disarm(); }
$('bSetup').onclick=openCfg;
$('start').onclick=()=>{
  signedComparison=false;updateSignedButtons();
  cfg=clone(draft); try{ localStorage.setItem('brl.last',JSON.stringify(diff(cfg))); }catch(_){}
  $('cfg').classList.remove('on'); started=true; view.x=view.y=0; view.z=1;
  build(); syncQuick(); writeHash(); arm();
  if(cfg.film) enterFilm(true); else resize();
};
$('useLast').onclick=()=>{ try{ draft=merge(DEFAULTS,JSON.parse(localStorage.getItem('brl.last'))); paramKey=''; syncCfg(); toast('Previous experiment restored'); }catch(_){} };

/* ---------- film session: the image alone, playing by itself; tap for the controls ---------- */
const film={on:false, timer:0, hide:0, lock:null};
function enterFilm(fromStart){
  film.on=true; cfg.film=true; document.body.classList.add('film'); closePop(); fullscreen(true); resize();
  if(fromStart || (sim.steps===0&&!sim.released)) filmRun(false); else setPlaying(true);
  filmBar(true,2600); toast('Film session · tap the screen for controls',2600);
}
// the film: a short look at the boundary and its waves, then the release, then it simply keeps playing
function filmRun(reset){
  clearTimeout(film.timer); if(reset) resetSim(); playing=false; ui();
  film.timer=setTimeout(()=>{ if(!film.on||!active()) return; if(!sim.released&&!sim.releasing&&!(cfg.release.at>0)) doRelease(); else setPlaying(true); wake(true); },1400);   // a release moment set in the configuration is kept
}
function exitFilm(){ film.on=false; cfg.film=false; clearTimeout(film.timer); clearTimeout(film.hide); document.body.classList.remove('film'); $('filmBar').classList.remove('on'); wake(false); fullscreen(false); resize(); }
function filmBar(on,ms){ const b=$('filmBar'); b.classList.toggle('on',on); clearTimeout(film.hide); if(on) film.hide=setTimeout(()=>b.classList.remove('on'),ms||3800); }
$('bFilm').onclick=()=>enterFilm(false);
$('fPlay').onclick=()=>{ clearTimeout(film.timer); if(!playing&&!sim.released&&!sim.releasing&&sim.steps===0&&!(cfg.release.at>0)) doRelease(); else setPlaying(!playing); filmBar(true); };
$('fRestart').onclick=()=>{ filmRun(true); filmBar(true); toast('Film restarted'); };
$('fFull').onclick=()=>{ fullscreen(!isFull()); filmBar(true); };
$('fExit').onclick=exitFilm;
const isFull=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function fullscreen(on){ const el=document.documentElement;
  try{ if(on&&!isFull()){ const f=el.requestFullscreen||el.webkitRequestFullscreen; if(f){ const p=f.call(el); if(p&&p.catch) p.catch(()=>{}); } }
       else if(!on&&isFull()){ const f=document.exitFullscreen||document.webkitExitFullscreen; if(f){ const p=f.call(document); if(p&&p.catch) p.catch(()=>{}); } } }catch(_){} }
if(!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen)) $('fFull').style.display='none';
['fullscreenchange','webkitfullscreenchange'].forEach(t=>document.addEventListener(t,()=>setTimeout(resize,60)));
// keep the screen awake while a film is playing (where the browser offers it)
function wake(on){ try{
  if(on && !film.lock && navigator.wakeLock && document.visibilityState==='visible') navigator.wakeLock.request('screen').then(l=>{ film.lock=l; l.addEventListener('release',()=>{ if(film.lock===l) film.lock=null; }); if(!film.on||!playing) wake(false); }).catch(()=>{});
  else if(!on && film.lock){ const l=film.lock; film.lock=null; l.release().catch(()=>{}); } }catch(_){} }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&film.on&&playing) wake(true); });

/* ---------- the Back button ----------
   Start adds ONE history entry. While a simulation is on screen, Back lands on the entry underneath it, which is
   this same page: nothing is rebuilt, the simulation keeps running, an open sheet closes, and a note says how to leave.
   The entry is put back at the next touch or key (an entry added without a user gesture is one Chrome's Back
   button would skip anyway). So the stack never grows beyond that single entry, a second Back in a row leaves the
   page as usual, and the address bar, links, tab close and the Forward button are untouched. */
const guard={armed:!!(history.state&&history.state.brl), skip:false};
function arm(){ if(guard.armed||!active()) return; try{ history.pushState({brl:1},''); guard.armed=true; }catch(_){} }
function disarm(){ if(!guard.armed) return; guard.armed=false; guard.skip=true; try{ history.back(); }catch(_){ guard.skip=false; } }   // going to the configuration on purpose: take the entry away again
addEventListener('popstate',e=>{
  const on=!!(e.state&&e.state.brl);
  if(guard.skip){ guard.skip=false; guard.armed=on; return; }
  guard.armed=on;
  if(on||!active()) return;
  const sheet=document.querySelector('#info.on,#cap.on');
  if(sheet) sheet.classList.remove('on'); else if($('pop').classList.contains('on')) closePop();
  else { toast('Still in the simulation · press Back again to leave',2800); if(film.on) filmBar(true); }
});
['pointerup','click','keydown'].forEach(t=>addEventListener(t,()=>{ if(!guard.armed&&active()) arm(); },true));
addEventListener('pageshow',()=>{ guard.armed=!!(history.state&&history.state.brl); });

/* ---------- information ---------- */
function snapshot(){
  const E=sim.energy();
  return {viewer:'Boundary Release Lab', version:1, config:clone(cfg),
    model:'d2u/dt2 + gamma du/dt = c^2 Laplacian(u); second-order leapfrog; released cells start with u = 0 at rest',
    numerics:{grid:sim.N, computed:sim.M, dx:sim.dx, dt:sim.dt, courant:sim.courant, stencil:sim.iso?'9-point isotropic':'5-point', stabilityLimit:W.LIMIT[sim.iso?'iso9':'five']},
    state:{t:sim.t, steps:sim.steps, released:sim.released, releaseTime:sim.releaseT, energy:E.total, initialEnergy:sim.E0, energyAddedByRelease:sim.releaseJump, centre:sim.centre()},
    symmetry:{obstacle:geom.symmetry.group, experimentOnGrid:gsym.group, keptGridSymmetries:gsym.kept},
    marks:marks.slice(), link:location.href, taken:new Date().toISOString()};
}
const TAG={fact:'<em>fact</em>', num:'<em>numerical</em>', model:'<em>model</em>', vis:'<em>display</em>'};
function fillInfo(){
  const f=cfg.field, lam=1/f.density, wave=['standing','inward','outward','plane'].includes(f.kind), E=sim.energy(), lim=W.LIMIT[sim.iso?'iso9':'five'];
  const rows=[
    ['Obstacle', geom.name+' <i>'+geom.formula+(geom.exact?'':' · distance field approximate')+'</i>'],
    ['Its symmetry', TAG.fact+geom.symmetry.group+' <i>'+geom.symmetry.text+'</i>'],
    ['Whole experiment', TAG.num+gsym.group+' <i>measured on the initial state: obstacle, field, outer edge and the square grid together</i>'],
    ['Model', TAG.model+'∂²u/∂t² '+(cfg.phys.damping>0?'+ '+cfg.phys.damping+' ∂u/∂t ':'')+'= c² ∇²u <i>a scalar wave. It can resemble water; it is not a fluid simulation</i>'],
    ['Initial field', W.FIELDS.find(x=>x.v===f.kind).t+' <i>'+W.FIELDS.find(x=>x.v===f.kind).s+(wave?' · λ = '+lam.toFixed(4)+' · period λ/c = '+(lam/sim.c).toFixed(4):'')+' · A = '+f.amp+'</i>'],
    ['Wave speed', 'c = '+sim.c+' <i>domain widths per time unit</i>'],
    ['Walls', 'obstacle '+cfg.phys.obstacle+', outer edge '+sim.outer+' <i>'+(sim.disc?'circular domain of radius '+sim.Rd+(sim.Rd>0.5?' (the frame shows −0.5 … 0.5)':''):'square domain, the frame itself')+'</i>'],
    ['Release', ({instant:'instant',gradual:'gradual over '+cfg.release.duration,none:'never (control)'})[cfg.release.mode]+' <i>rule: a released cell starts at rest with u = 0</i>'],
    ['Grid', TAG.num+sim.N+' × '+sim.N+(sim.M>sim.N+2?' <i>in the frame, '+sim.M+' × '+sim.M+' computed</i>':'')+' <i>Δx = '+sim.dx.toExponential(3)+(wave?' · '+(sim.N/f.density).toFixed(1)+' cells per wavelength':'')+'</i>'],
    ['Time step', TAG.num+'Δt = '+sim.dt.toExponential(4)+' <i>Courant number '+sim.courant.toFixed(3)+', limit '+lim.toFixed(3)+' · '+(sim.iso?'9-point isotropic':'5-point')+' stencil</i>'],
    ['Time', 't = '+sim.t.toFixed(4)+' <i>'+sim.steps.toLocaleString('en')+' steps</i>'],
    ['Energy', TAG.num+'E = '+E.total.toExponential(6)+' <i>E₀ = '+sim.E0.toExponential(6)+' · relative change '+minus(((E.total/(sim.E0||1))-1).toExponential(2))+'</i>'],
    ['Playback', TAG.vis+cfg.play.rate+'× <i>= '+(RATE0*cfg.play.rate).toFixed(3)+' time units per second; '+msStep.toFixed(2)+' ms per step on this device</i>'],
    ['Picture', TAG.vis+MODES.find(m=>m.v===cfg.view.mode).t+' <i>'+(cfg.view.mode==='contours'?'lines where u = ±(k + ½) × '+(cfg.view.levels*f.amp/cfg.view.gain).toPrecision(3)+'; a contour is a level line, not a material surface':'sensitivity '+cfg.view.gain+'×')+' · '+(gl?'bicubic interpolation between grid cells':'drawn at grid resolution (no WebGL2)')+'</i>']
  ];
  $('infoT').innerHTML=rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  $('infoNote').innerHTML='What is known and what is not. <b>Facts</b>: the symmetry groups and the equation. <b>Numerical</b>: everything measured on the grid, with its resolution; a square grid has only D₄ symmetry, so small fourfold patterns around a circle can come from the grid. <b>Display</b>: choices that change the picture only. '
    +'A late feature is worth believing when it survives a finer grid, the other stencil, and a different outer edge. Until then it is a hypothesis.';
}
$('bInfo').onclick=()=>{ closePop(); fillInfo(); $('info').classList.add('on'); };
$('infoX').onclick=()=>$('info').classList.remove('on');

/* ---------- link, files ---------- */
function writeHash(){ const d=diff(cfg), s=Object.keys(d).length?'#cfg='+encodeURIComponent(JSON.stringify(d)):location.pathname+location.search; try{ history.replaceState(history.state,'',s); }catch(_){} }
function readHash(){ const m=location.hash.match(/^#cfg=(.+)$/); if(!m) return null; try{ return merge(DEFAULTS,JSON.parse(decodeURIComponent(m[1]))); }catch(_){ return null; } }
function copyText(t,msg){ const done=()=>toast(msg); if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done,()=>toast('Could not copy')); else { const a=document.createElement('textarea'); a.value=t; document.body.append(a); a.select(); try{ document.execCommand('copy'); done(); }catch(_){ toast('Could not copy'); } a.remove(); } }
function download(blob,name){ const a=document.createElement('a'), u=URL.createObjectURL(blob); a.href=u; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); }
const stamp=()=>new Date().toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
$('xLink').onclick=()=>{ writeHash(); copyText(location.href,'Link copied'); };
$('xJson').onclick=()=>download(new Blob([JSON.stringify(snapshot(),null,1)],{type:'application/json'}),'boundary-release-'+stamp()+'.json');
$('xCsv').onclick=()=>{
  const r=rec, L=['# Boundary Release Lab · time series (every '+r.stride+' steps, Δt = '+sim.dt+')','# '+JSON.stringify(snapshot()),'t,centre_u,energy_total,energy_kinetic,energy_potential'];
  for(let i=0;i<r.n;i++) L.push([r.t[i],r.c[i],r.e[i],r.k[i],r.e[i]-r.k[i]].join(','));
  marks.forEach(t=>L.push('# mark,'+t));
  download(new Blob([L.join('\n')+'\n'],{type:'text/csv'}),'boundary-release-'+stamp()+'.csv');
};

/* ---------- capture: the picture, with the whole configuration stored inside the PNG ---------- */
let shots=null, shotLabels=true, shotURL='', shotName='';
function grab(labels){
  draw();
  const c=document.createElement('canvas'), Wp=cv.width, Hp=cv.height; c.width=Wp; c.height=Hp; const g=c.getContext('2d'); g.drawImage(cv,0,0); g.drawImage(ov,0,0);
  if(!labels) return c;
  const d=rs(), f=cfg.field, lines=['Boundary Release Lab · '+geom.name+' · '+geom.symmetry.group,
    't = '+sim.t.toFixed(3)+(sim.releaseT!==null?'   released at '+sim.releaseT.toFixed(3):'   wall present'),
    W.FIELDS.find(x=>x.v===f.kind).t+'   c = '+sim.c+'   '+sim.N+'²   '+sim.outer+' edge'];
  g.save(); g.scale(d,d); const fonts=['600 12px system-ui,sans-serif','12px ui-monospace,Menlo,Consolas,monospace','11px system-ui,sans-serif'];
  let mw=0; lines.forEach((t,i)=>{ g.font=fonts[i]; mw=Math.max(mw,g.measureText(t).width); });
  g.fillStyle='rgba(5,2,11,.7)'; g.beginPath(); g.rect(10,10,Math.min(mw+20,Wp/d-20),lines.length*17+12); g.fill();
  lines.forEach((t,i)=>{ g.font=fonts[i]; g.fillStyle=i?'rgba(235,225,255,.9)':'#fff'; g.textBaseline='alphabetic'; g.fillText(t,20,29+i*17); });
  g.restore(); return c;
}
const toBlob=c=>new Promise(res=>c.toBlob(res,'image/png'));
$('bShot').onclick=async()=>{
  closePop(); const meta=JSON.stringify(snapshot()), full=grab(true), clean=grab(false); needDraw=true;
  const [a,b]=await Promise.all([toBlob(full),toBlob(clean)]); if(!a||!b){ toast('Could not make the image'); return; }
  shots={full:await withText(a,'Comment',meta), clean:await withText(b,'Comment',meta)};
  shotName='boundary-release-'+cfg.geom.type+'-t'+sim.t.toFixed(3)+'-'+stamp()+'.png'; shotLabels=true; showShot(); $('cap').classList.add('on');
};
function showShot(){
  if(shotURL) URL.revokeObjectURL(shotURL);
  const blob=shotLabels?shots.full:shots.clean; shotURL=URL.createObjectURL(blob); $('capImg').src=shotURL; $('capLabels').textContent='Labels: '+(shotLabels?'on':'off');
  let can=false; try{ can=navigator.canShare&&navigator.canShare({files:[new File([blob],shotName,{type:'image/png'})]}); }catch(_){}
  $('capShare').style.display=can?'':'none';
}
// a tEXt chunk (keyword + JSON) right after the PNG header, so the configuration travels with the file
async function withText(blob,key,text){
  try{
    const src=new Uint8Array(await blob.arrayBuffer());
    const data=new TextEncoder().encode(key+'\0'+text.replace(/[^\x20-\x7e]/g,'?')), type=new TextEncoder().encode('tEXt');
    const chunk=new Uint8Array(12+data.length), dv=new DataView(chunk.buffer);
    dv.setUint32(0,data.length); chunk.set(type,4); chunk.set(data,8); dv.setUint32(8+data.length,crc32(chunk.subarray(4,8+data.length)));
    const at=33, out=new Uint8Array(src.length+chunk.length); out.set(src.subarray(0,at)); out.set(chunk,at); out.set(src.subarray(at),at+chunk.length);
    return new Blob([out],{type:'image/png'});
  }catch(_){ return blob; }
}
let CRC=null;
function crc32(u){
  if(!CRC){ CRC=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; CRC[n]=c>>>0; } }
  let c=0xFFFFFFFF; for(let i=0;i<u.length;i++) c=CRC[(c^u[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0;
}
function readText(buf){
  const u=new Uint8Array(buf), dv=new DataView(buf); let p=8;
  while(p+12<=u.length){ const len=dv.getUint32(p), type=String.fromCharCode(u[p+4],u[p+5],u[p+6],u[p+7]);
    if(type==='tEXt'){ const s=new TextDecoder('latin1').decode(u.subarray(p+8,p+8+len)), i=s.indexOf('\0'); if(s.slice(0,i)==='Comment'){ try{ return JSON.parse(s.slice(i+1)); }catch(_){ return null; } } }
    if(type==='IEND') break; p+=12+len; }
  return null;
}
$('openCap').onclick=()=>$('capFile').click();
$('capFile').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  let m=null; try{ m=/json$/i.test(f.name)||f.type==='application/json'?JSON.parse(await f.text()):readText(await f.arrayBuffer()); }catch(_){}
  if(!m||m.viewer!=='Boundary Release Lab'||!m.config){ toast('No Boundary Release Lab configuration in this file',2800); return; }
  draft=merge(DEFAULTS,m.config); draft.film=false; paramKey=''; syncCfg(); toast('Configuration restored · press Start');
};
$('capSave').onclick=()=>{ const a=document.createElement('a'); a.href=shotURL; a.download=shotName; document.body.append(a); a.click(); a.remove(); };
$('capShare').onclick=()=>{ navigator.share({files:[new File([shotLabels?shots.full:shots.clean],shotName,{type:'image/png'})],title:'Boundary Release Lab'}).catch(()=>{}); };
$('capLabels').onclick=()=>{ shotLabels=!shotLabels; showShot(); };
$('capClose').onclick=()=>$('cap').classList.remove('on');
$('cap').addEventListener('click',e=>{ if(e.target.id==='cap') e.currentTarget.classList.remove('on'); });

/* ---------- keys ---------- */
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA') return;
  if(e.key==='Escape'){ const s=document.querySelector('#info.on,#cap.on'); if(s) s.classList.remove('on'); else if(film.on&&!isFull()) exitFilm(); else closePop(); return; }
  if(!active()||document.querySelector('.sheet.on')) return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); setPlaying(!playing); }
  else if(k==='r'){ if(!$('bRelease').disabled) doRelease(); }
  else if(k==='s') stepOnce();
  else if(k==='m') $('bMark').click();
  else if(k==='f'){ if(film.on) exitFilm(); else enterFilm(false); }
  else if(k>='1'&&k<='5'){ cfg.view.mode=MODES[+k-1].v; syncQuick(); needDraw=true; }
});

/* ---------- loop: fixed time steps, drawn at the display's own pace ---------- */
let lastT=performance.now(), plotT=0;
function frame(now){
  const dt=Math.min(0.1,(now-lastT)/1000); lastT=now;
  if(sim && playing && active()){
    acc+=dt*RATE0*cfg.play.rate;
    let n=Math.floor(acc/sim.dt); const cap=Math.max(1,Math.min(96,Math.floor(11/Math.max(msStep,0.02))));   // never spend more than about 11 ms of a frame on the numbers
    if(n>cap){ n=cap; acc=0; } else acc-=n*sim.dt;
    if(n>0) advance(n);
    // a device that cannot draw the full-resolution picture in time gets a coarser picture instead of a stuttering one
    if(dt>0.034) slow++; else slow=Math.max(0,slow-2);
    if(slow>45 && rs()>1){ rscale=Math.max(1,rs()-0.5); slow=0; resize(); }
  }
  if(sim && active()){
    if(needDraw) draw();
    if(clockDirty){ clockDirty=false; const t='t = '+sim.t.toFixed(3); $('tNow').textContent=t; $('fTime').textContent=t; }
    if(plotsDirty && now-plotT>90){ plotT=now; drawPlots(); }
  }
  requestAnimationFrame(frame);
}
addEventListener('resize',resize);
if(window.visualViewport) window.visualViewport.addEventListener('resize',resize);

/* ---------- start-up ---------- */
(function(){
  const more=document.createElement('button'); more.className='pill small'; more.id='resume'; more.type='button'; more.textContent='Back to the running experiment';
  more.onclick=()=>{ $('cfg').classList.remove('on'); arm(); resize(); }; $('useLast').before(more);
  initGL();
  const h=readHash(); if(h) draft=h;
  syncCfg(); resize();
  requestAnimationFrame(frame);
})();
// for tests and the console
window.BRL={get sim(){ return sim; }, get cfg(){ return cfg; }, get guard(){ return guard; }, get film(){ return film; }, get rec(){ return rec; }, advance, snapshot, usesWebGL:()=>!!gl};
