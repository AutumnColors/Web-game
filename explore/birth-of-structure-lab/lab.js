'use strict';
/* Fractal Universe Lab, part 3: moving the camera, the configuration screen, information, links, capture and the loop.
   Loaded after engine.js and overlays.js. */

/* ---------- letting go: drift back to the whole set (at the precision limit, or the reset button) ---------- */
let back=null;
function release(quick){
  if(back) return;
  endGesture(); vel.x=vel.y=0; rotAnim=null;
  const from={...view}, to={...HOME}, decades=Math.abs(Math.log10(to.w/from.w));
  back={from,to,t0:performance.now(),dur:Math.min(8000,Math.max(quick?700:3000,decades*520))};
}
function backView(now){
  const {from,to,t0,dur}=back, t=Math.min(1,(now-t0)/dur), s=t*t*(3-2*t);
  const w=from.w*Math.pow(to.w/from.w,s), k=to.w===from.w?s:(w-from.w)/(to.w-from.w);
  return {w, cx:from.cx+(to.cx-from.cx)*k, cy:from.cy+(to.cy-from.cy)*k, a:wrap(from.a)*(1-s), t};
}
function stepBack(now,dt){
  let b=backView(now);
  if(b.t<1 && base && b.w>base.w*1.08){ back.t0+=dt; b=backView(now); }
  view.w=b.w; view.cx=b.cx; view.cy=b.cy; view.a=b.a; dirty=true; needDraw=true;
  if(b.t>=1){ Object.assign(view,back.to); back=null; lastMin=0; boost=1; }
}

/* ---------- moving the camera ---------- */
const minW=()=>cfg.depth?HOME.w/Math.pow(2,cfg.depth):0;
let limitT=0;
function clampView(){
  view.w=Math.max(minW(),Math.min(view.w,HOME.w*2.2));
  const mx=eng.cxm===undefined?eng.hx:eng.cxm;
  view.cx=Math.max(mx-eng.bx,Math.min(mx+eng.bx,view.cx)); view.cy=Math.max(eng.hy-eng.by,Math.min(eng.hy+eng.by,view.cy));
  if(atLimit(view)) release();
}
function zoomAt(px,py,f){
  if(cfg.bottcher){const mid=Math.sqrt(cfg.bottcherGMin*cfg.bottcherGMax),half=Math.log(cfg.bottcherGMax/cfg.bottcherGMin)/(2*f);cfg.bottcherGMin=Math.max(1e-5,mid*Math.exp(-half));cfg.bottcherGMax=Math.min(8,mid*Math.exp(half));dirty=true;needDraw=true;return;}
  if(cfg.polar){if(cfg.logPolar)cfg.logSpan=Math.max(.05,Math.min(36,cfg.logSpan/f));else view.w=Math.max(1e-12,Math.min(HOME.w*2.2,view.w/f));dirty=true;needDraw=true;return;}
  const [wx,wy]=toWorld(px,py), m=minW(); let w=view.w/f;
  if(w<m){ w=m; const now=performance.now(); if(f>1.0005 && now-limitT>2500){ limitT=now; toast('Zoom limit: depth '+cfg.depth); } }   // the limit stops zooming in only
  view.w=w; pinTo(px,py,wx,wy); clampView(); dirty=true; needDraw=true;
}
function rotateAt(px,py,dA){if(cfg.bottcher){view.a=wrap(view.a+dA);dirty=true;needDraw=true;return;}if(cfg.polar){view.a=wrap(view.a+dA);dirty=true;needDraw=true;return;} const [wx,wy]=toWorld(px,py); view.a=wrap(view.a+dA); pinTo(px,py,wx,wy); clampView(); dirty=true; needDraw=true; }
function panBy(dx,dy){
  if(cfg.bottcher){view.a=wrap(view.a-TAU*dx/Wd);const factor=Math.exp(dy/Hd*Math.log(cfg.bottcherGMax/cfg.bottcherGMin));cfg.bottcherGMin=Math.max(1e-5,Math.min(8,cfg.bottcherGMin*factor));cfg.bottcherGMax=Math.max(cfg.bottcherGMin*1.01,Math.min(8,cfg.bottcherGMax*factor));dirty=true;needDraw=true;return;}
  if(cfg.polar){view.a=wrap(view.a-TAU*dx/Wd);if(cfg.logPolar)cfg.logOuter=Math.max(-32,Math.min(32,cfg.logOuter+dy/Hd*cfg.logSpan));else view.w=Math.max(1e-12,Math.min(HOME.w*2.2,view.w*(1+dy/Hd*2)));dirty=true;needDraw=true;return;}
  const s=view.w/Wd, c=Math.cos(view.a), n=Math.sin(view.a);
  view.cx-=s*(dx*c+dy*n); view.cy-=s*(dx*n-dy*c); clampView(); dirty=true; needDraw=true;
}
let rotAnim=null;
function northUp(){ if(back||Math.abs(view.a)<1e-9) return; rotAnim={from:view.a,t0:performance.now(),dur:Math.min(600,250+Math.abs(view.a)*200),done:0}; }
function snapNorth(){ if(Math.abs(view.a)<3*Math.PI/180 && view.a!==0) northUp(); }

// in the comparison every panel shows the whole view at half size: a finger in a panel acts on the shared camera
let gOrigin=[0,0];
const panelOf=(x,y)=>cmp()?[x>=Wd/2?Wd/2:0, y>=Hd/2?Hd/2:0]:[0,0];
const mapPt=(x,y,o)=>cmp()?[(x-o[0])*2,(y-o[1])*2]:[x,y];
const ptrs=new Map(); let blocked=false;
const vel={x:0,y:0}; let lastMove=0, tapT=0, tapX=0, tapY=0, moved=0, glide=null, twist=0, twisting=false, pinTimer=0, holdT=0;
const P=e=>mapPt((e.clientX-cv.getBoundingClientRect().left)*DPR,(e.clientY-cv.getBoundingClientRect().top)*DPR,gOrigin);
function endGesture(){ ptrs.clear(); cv.classList.remove('drag'); blocked=true; }
cv.addEventListener('pointerdown',e=>{
  e.preventDefault(); closePop();
  if(back) return;
  if(blocked && ptrs.size===0) blocked=false;
  if(blocked) return;
  cv.setPointerCapture(e.pointerId);
  if(ptrs.size===0) gOrigin=panelOf((e.clientX-cv.getBoundingClientRect().left)*DPR,(e.clientY-cv.getBoundingClientRect().top)*DPR);
  ptrs.set(e.pointerId,P(e)); cv.classList.add('drag');
  glide=null; rotAnim=null; vel.x=vel.y=0; lastMove=performance.now();
  if(ptrs.size===1){ moved=0; twist=0; twisting=false;
    clearTimeout(holdT); if(cfg.clean) holdT=setTimeout(()=>{ if(cfg.clean && moved<12 && ptrs.size===1){ endGesture(); setClean(false); toast('Tools are back'); } },650); }
});
cv.addEventListener('pointermove',e=>{
  if(!ptrs.has(e.pointerId) || back || blocked) return;
  const ids=[...ptrs.keys()].slice(0,2), before=ids.map(id=>ptrs.get(id));
  ptrs.set(e.pointerId,P(e));
  const after=ids.map(id=>ptrs.get(id)), now=performance.now();
  if(ptrs.size===1){
    const dx=after[0][0]-before[0][0], dy=after[0][1]-before[0][1]; moved+=Math.abs(dx)+Math.abs(dy);
    panBy(dx,dy);
    const dt=Math.max(1,now-lastMove), a=0.75; vel.x=a*dx/dt+(1-a)*vel.x; vel.y=a*dy/dt+(1-a)*vel.y; lastMove=now;
  } else {
    if(!ids.includes(e.pointerId)) return;
    const mid=q=>[(q[0][0]+q[1][0])/2,(q[0][1]+q[1][1])/2], dist=q=>Math.hypot(q[0][0]-q[1][0],q[0][1]-q[1][1]), ang=q=>Math.atan2(q[1][1]-q[0][1],q[1][0]-q[0][0]);
    const m0=mid(before), m1=mid(after), d0=dist(before), d1=dist(after);
    moved+=99; vel.x=vel.y=0;
    panBy(m1[0]-m0[0], m1[1]-m0[1]);
    if(d0>2 && d1>2 && !back) zoomAt(m1[0],m1[1],d1/d0);
    if(d0>20*DPR && d1>20*DPR && !back){
      const dA=wrap(ang(after)-ang(before));
      if(twisting) rotateAt(m1[0],m1[1],dA);
      else { twist+=dA; if(Math.abs(twist)>0.14){ twisting=true; rotateAt(m1[0],m1[1],twist); } }
    }
  }
});
const hit=(b,px,py)=>{ const x=px/DPR, y=py/DPR; return b && x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h; };
function hitCompass(px,py){ const [x,y]=compassPos(); return Math.hypot(px/DPR-x,py/DPR-y)<COMPASS_R+8; }
function up(e){
  if(!ptrs.has(e.pointerId)) return;
  const was=ptrs.size; ptrs.delete(e.pointerId); clearTimeout(holdT);
  const now=performance.now();
  if(was===1){
    cv.classList.remove('drag');
    if(twisting){ twisting=false; if(!cfg.polar)snapNorth(); }
    if(moved<12){
      const rx=(e.clientX-cv.getBoundingClientRect().left)*DPR, ry=(e.clientY-cv.getBoundingClientRect().top)*DPR, [x,y]=mapPt(rx,ry,gOrigin);
      if(!cfg.clean){
        if(hitCompass(rx,ry)){if(cfg.polar){view.a=0;dirty=true;needDraw=true;}else northUp();tapT=0;return;}
        if(hit(labelBox,rx,ry)){ copyPin(); tapT=0; return; }
        const tg=tagBoxes.find(b=>hit(b,rx,ry));
        if(tg){ const order=MODES.filter(m=>m.v!=='compare').map(m=>m.v); const next=clone(cfg); next.panels[tg.k]=order[(order.indexOf(cfg.panels[tg.k])+1)%order.length]; applyConfig(next,{...view}); tapT=0; return; }
      }
      if(now-tapT<320 && Math.hypot(x-tapX,y-tapY)<40*DPR*(cmp()?2:1)){ clearTimeout(pinTimer); glide={px:tapX,py:tapY,f:2.5,t0:now,dur:280,done:1}; tapT=0; }
      else { tapT=now; tapX=x; tapY=y; clearTimeout(pinTimer);
        pinTimer=setTimeout(()=>{ if(back||cfg.clean) return; if(secTool) sectionTap(tapX,tapY); else placePin(tapX,tapY); },300); }
    } else if(!cfg.polar && now-lastMove<60 && Math.hypot(vel.x,vel.y)>0.15){ glide={fling:true}; }
  } else if(was>=2){ vel.x=vel.y=0; }
}
cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',e=>{
  e.preventDefault(); if(back) return;
  const d=e.deltaMode===1?16:1, rx=(e.clientX-cv.getBoundingClientRect().left)*DPR, ry=(e.clientY-cv.getBoundingClientRect().top)*DPR, [x,y]=mapPt(rx,ry,panelOf(rx,ry));
  if(e.shiftKey || e.altKey){ rotateAt(x,y,(e.deltaY||e.deltaX)*d*0.0025); clearTimeout(cv._snap); cv._snap=setTimeout(snapNorth,250); return; }
  zoomAt(x,y,Math.exp(-e.deltaY*d*0.0018));
},{passive:false});
const anySheet=()=>document.querySelector('.sheet.on');
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if(e.key==='Escape'){ if($('cap').classList.contains('on')) $('cap').classList.remove('on'); else if(infoOpen) closeInfo(); else if(cfg.clean) setClean(false); else if($('cfg').classList.contains('on')&&started) $('cfg').classList.remove('on'); else { closePop(); closeSec(); setSecTool(false); } return; }
  if(back || anySheet()) return;
  const k=e.key.toLowerCase();
  if(k==='q') rotateAt(Wd/2,Hd/2,-Math.PI/36);
  else if(k==='e') rotateAt(Wd/2,Hd/2,Math.PI/36);
  else if(k==='n') northUp();
  else if(k==='p') requestShot();
  else if(k==='h') setClean(!cfg.clean);
  else if(k==='i') openInfo();
  else if(k>='1' && k<=String(Math.min(9,MODES.length))) setMode(MODES[+k-1].v);
});
['gesturestart','gesturechange','contextmenu'].forEach(t=>document.addEventListener(t,e=>{ if(!e.target.closest || !e.target.closest('.sheet,#sec')) e.preventDefault(); }));

/* ---------- quick switches (same camera, same numbers) ---------- */
// The phase views need a centre: a quadratic Julia set whose critical point 0 returns exactly to itself (superattracting cycle).
const phaseCap=()=>eng.centre?eng.centre.cap:40;
const PHASE_NEEDS='Stable and Normalized phase need a centre: a quadratic Julia set whose critical point 0 returns exactly to itself, like the Basilica, Rabbit, Airplane or any c from the Feigenbaum cascade. This c is not one.';
// A message next to where it was caused: inside the View popover when that is open (a toast would cover it), else a toast.
function notify(t,ms=5000){
  if(!$('pop').classList.contains('on')){ toast(t,ms); return; }
  let el=$('popMsg'); if(!el){ el=document.createElement('div'); el.id='popMsg'; el.setAttribute('role','status'); el.style.cssText='margin:2px 2px 8px;padding:8px 10px;border-radius:10px;background:#3a2a12;color:#ffd9a0;font-size:12.5px;line-height:1.35'; $('pop').prepend(el); }
  el.textContent=t; el.hidden=false; $('pop').scrollTop=0; clearTimeout(notify.t); notify.t=setTimeout(()=>{ el.hidden=true; },ms);
}
function setMode(m){
  if(!layerAllowed(cfg.fractal,m)){notify('This measurement is not defined for the selected fractal.');return;}
  // Coordinate choice remains independent of measurement.
  if(diffMode(m)&&(cfg.polar||cfg.bottcher)){notify('Differential tests require Cartesian coordinates');return;}
  const wasStable=cfg.mode; if(m==='coherence'&&cfg.fractal!=='julia'){notify('Rotation coherence is defined here for Julia orbits.');return;} if(['stablephase','normphase'].includes(m)&&!eng.centre){notify(PHASE_NEEDS);return;} if(['stablephase','normphase'].includes(m)&&(cfg.iter===0||cfg.iter>phaseCap()))cfg.iter=phaseCap();   // phase views report no escape step, so Auto iterations would keep restarting
  const was=cmp(), wasWaves=cfg.mode==='waves'; cfg.mode=m; document.body.classList.toggle('cmp',cmp());
  if((wasStable!==m&&(wasStable==='coherence'||m==='coherence'))||(wasStable!==m&&(['stablephase','normphase'].includes(wasStable)||['stablephase','normphase'].includes(m)))||wasWaves!==(m==='waves') || cmp()!==was || (needD() && base && !base.S) || (m==='dld' && base && !base.DLD)) dirty=true;   // the comparison renders at panel resolution; sensitivity needs the derivative
  repaint(); updateChip(); syncQuick(); writeHash();
}
const coordOf=c=>c.bottcher?'bottcher':c.polar?(c.logPolar?'logpolar':'polar'):'cartesian';
function setCoord(c,type){
  if(type==='bottcher'&&((c.fractal!=='julia'&&c.fractal!=='mandelbrot')||(c.fractal==='julia'&&c.juliaPower!==2))){toast('Böttcher coordinates require a quadratic Julia or Mandelbrot set',2700);return false;}
  c.bottcher=type==='bottcher';c.polar=type==='polar'||type==='logpolar';c.logPolar=type==='logpolar';
  if(type==='logpolar'&&!(c.logSpan>0)){c.logOuter=Math.log(Math.max(1e-12,view.w/2));c.logSpan=Math.log(10000);}
  return true;
}
function syncCoordPickers(){
  const options=['cartesian','polar','logpolar','bottcher'];
  for(const id of ['coordPicker','coordPickerQuick']){
    const el=$(id);if(!el)continue;
    const c=id==='coordPicker'?draft:cfg;
    el.value=coordOf(c);
    el.querySelector('option[value="bottcher"]').disabled=c.fractal!=='julia'&&c.fractal!=='mandelbrot';
  }
  $('coordHelp').textContent=draft.bottcher?'Exterior only: Julia dynamical plane or Mandelbrot parameter plane. The interior is not represented.':draft.polar?'Angle runs horizontally; radius vertically.':'Original complex-plane view.';
  $('coordHelpQuick').textContent=cfg.bottcher?'Exterior only; drag to shift angle/potential.':cfg.polar?'Drag to change angle and radial range.':'Original complex-plane view.';
}
function syncPolarButton(){syncCoordPickers();}
$('coordPicker').onchange=e=>{if(setCoord(draft,e.target.value))syncCfg();else syncCoordPickers();};
$('coordPickerQuick').onchange=e=>{
  if(!setCoord(cfg,e.target.value)){syncCoordPickers();return;}
  if(cfg.bottcher)view.a=0;
  syncCoordPickers();updateChip();dirty=true;needDraw=true;closePop();writeHash();
};

function setPalette(p){ cfg.palette=p; repaint(); syncQuick(); writeHash(); }
function setClean(on){ cfg.clean=on; document.body.classList.toggle('clean',on); closePop(); if(on){ closeSec(); setSecTool(false); toast('Clean view. Press and hold the map to bring the tools back.',3200); } needDraw=true; syncQuick(); writeHash(); }
function updateChip(){ $('chipT').textContent=eng.name+' · '+eng.rule; $('chipS').textContent=(cfg.bottcher?'BÖTTCHER · ':cfg.polar?(cfg.logPolar?'LOG-POLAR · ':'POLAR · '):'')+modeOf(cfg.mode).t+(cfg.fractal==='julia'?' · c = '+cText(cfg.seed.re,cfg.seed.im,6):''); }
function group(el,items,get,set){
  el.replaceChildren(); el._get=get;
  items.forEach(it=>{ const b=document.createElement('button'); b.type='button'; b.className='opt'; b._v=it.v;
    if(it.thumb){ const c=document.createElement('canvas'); c.width=160; c.height=120; b.append(c); it.cv=c; }
    const t=document.createElement('b'); t.textContent=it.t; b.append(t);
    if(it.s){ const s=document.createElement('small'); s.textContent=it.s; b.append(s); }
    b.onclick=()=>set(it.v); el.append(b); });
}
function syncGroups(root){ root.querySelectorAll('.grp').forEach(g=>[...g.children].forEach(b=>b.classList.toggle('on',b._v===g._get()))); }
group($('qMode'),MODES,()=>cfg.mode,v=>setMode(v));
group($('qPal'),Object.keys(PALETTES).map(v=>({v,t:PALETTES[v].t})),()=>cfg.palette,v=>setPalette(v));
function syncQuick(){for(const b of $('qMode').children)b.hidden=!layerAllowed(cfg.fractal,b._v);$('qVector').hidden=!!eng.geometry;$('qContours').hidden=!!eng.geometry; $('dldOptions').style.display=cfg.mode==='dld'?'block':'none'; $('dldContrast').value=cfg.dldContrast; $('dldContrastOut').textContent=cfg.dldContrast.toFixed(1)+'×'; $('dldIterations').value=String(cfg.dldIterations); $('qVector').querySelector('b').textContent='Vector arrows: '+(vectorOverlay.enabled?'on':'off'); $('qVector').classList.toggle('on',vectorOverlay.enabled); $('vectorOptions').style.display=vectorOverlay.enabled?'block':'none'; syncPolarButton(); syncGroups($('pop')); $('qClean').classList.toggle('on',cfg.clean); $('qContours').classList.toggle('on',cfg.contours); }
const closePop=()=>{ $('pop').classList.remove('on'); $('bView').classList.remove('on'); };
$('dldContrast').oninput=ev=>{cfg.dldContrast=+ev.target.value; $('dldContrastOut').textContent=cfg.dldContrast.toFixed(1)+'×';repaint();};
$('dldContrast').onchange=()=>writeHash();
$('dldIterations').onchange=ev=>{cfg.dldIterations=+ev.target.value;dirty=true;needDraw=true;writeHash();};
$('bView').onclick=()=>{ const on=!$('pop').classList.contains('on'); $('pop').classList.toggle('on',on); $('bView').classList.toggle('on',on); syncQuick(); };
$('qVector').onclick=()=>{vectorOverlay.enabled=!vectorOverlay.enabled;if(vectorOverlay.enabled&&vectorOverlay.source==='sens'&&base&&!base.S)dirty=true;needDraw=true;syncQuick();};
$('vectorSource').onchange=e=>{vectorOverlay.source=e.target.value;if(vectorOverlay.enabled&&vectorOverlay.source==='sens'&&base&&!base.S)dirty=true;needDraw=true;};
$('vectorSign').onclick=()=>{vectorOverlay.sign*=-1;$('vectorSign').textContent='Direction: '+(vectorOverlay.sign<0?'−∇':'+∇');needDraw=true;};
$('vectorDensity').onclick=()=>{vectorOverlay.density=vectorOverlay.density===12?20:vectorOverlay.density===20?8:12;$('vectorDensity').textContent='Density: '+vectorOverlay.density;needDraw=true;};
$('qClean').onclick=()=>setClean(!cfg.clean);
$('qContours').onclick=()=>{cfg.contours=!cfg.contours;syncContourSettings(cfg);repaint();syncQuick();writeHash();};
$('bHome').onclick=()=>{ closePop(); release(true); };
$('chip').onclick=()=>openInfo(); $('bInfo').onclick=()=>{ closePop(); openInfo(); };

/* ---------- applying a configuration ---------- */
function applyConfig(next,cam){
  if(isGeometry(next.fractal)){next={...next,mode:layerAllowed(next.fractal,next.mode)?next.mode:'construction',bottcher:false};vectorOverlay.enabled=false;}else if(next.mode==='construction')next={...next,mode:'escape'};
  if(next.bottcher && next.fractal!=='julia' && next.fractal!=='mandelbrot')next.bottcher=false;
  if(next.bottcher && next.fractal==='julia' && next.juliaPower!==2)next.bottcher=false;
  if(next.bottcher&&next.fractal!=='julia'&&next.fractal!=='mandelbrot')next.bottcher=false;
  const world=!started || next.fractal!==cfg.fractal || (isGeometry(next.fractal)&&next.geometryDepth!==cfg.geometryDepth) || (next.fractal==='multibrot' && next.power!==cfg.power) || (next.fractal==='julia' && (next.seed.re!==cfg.seed.re || next.seed.im!==cfg.seed.im || next.juliaPower!==cfg.juliaPower));
  const numeric=next.radius!==cfg.radius || next.iter!==cfg.iter || next.stopMode!==cfg.stopMode || next.bottcher!==cfg.bottcher || next.bottcherGMin!==cfg.bottcherGMin || next.bottcherGMax!==cfg.bottcherGMax || next.polar!==cfg.polar || next.logPolar!==cfg.logPolar;
  cfg=clone(next); eng=engineOf(cfg); started=true; syncContourSettings(cfg); syncCoordPickers();
  if(cfg.mode==='coherence'&&cfg.fractal!=='julia')cfg.mode='escape';
  if(['stablephase','normphase'].includes(cfg.mode)&&!eng.centre){ cfg.mode='phase'; setTimeout(()=>notify(PHASE_NEEDS+' Showing Rotation phase instead.'),0); }
  if(['stablephase','normphase'].includes(cfg.mode)&&(cfg.iter===0||cfg.iter>phaseCap())) cfg.iter=phaseCap();
  document.body.classList.toggle('cmp',cmp()); document.body.classList.toggle('clean',cfg.clean);
  fitHome();
  if(world){ pin=null; sections=[]; secSel=-1; closeSec(); base=null; back=null; rotAnim=null; glide=null; lastMin=0; boost=1; stats=null; Object.assign(view,HOME); }
  if(cam){ view.cx=cam.cx; view.cy=cam.cy; view.w=cam.w; view.a=wrap(cam.a||0); lastMin=0; boost=1; }
  if(world||numeric){ renderHome(); if(pin) pin.r=classify(pin.re,pin.im,eng); }
  clampView(); dirty=true; repaint(); updateChip(); syncQuick(); writeHash();
}

/* ---------- configuration screen: edits a draft, nothing changes until "Use this configuration" ---------- */
let draft=clone(cfg);
const FR=FRACTALS.map(f=>({...f,thumb:true}));
group($('gFractal'),FR,()=>draft.fractal,v=>{ if(v!==draft.fractal){draft.fractal=v;draft.geometryDepth=0;}if(isGeometry(v)){draft.mode='construction';draft.bottcher=false;window.chooseGeometryExplore?.();}else if(draft.mode==='construction')draft.mode='escape';syncCfg(); });
const JULIA_EXPONENTS=[2,3,4,5,6,7,8,9,10,-1,-2,-3,-4,-5,-6,-7,-8,0.5,0.75,0.9,1,1.001,1.01,1.1,1.25,1.5,Math.E,Math.PI];
const juliaPowerLabel=p=>p===Math.PI?'π':p===Math.E?'e':String(p);
group($('gJuliaPower'),JULIA_EXPONENTS.map(v=>({v,t:juliaPowerLabel(v)})),()=>draft.juliaPower,v=>{draft.juliaPower=v;syncCfg();thumbs();});
group($('gPower'),[3,4,5,6,7,8].map(v=>({v,t:'n = '+v})),()=>draft.power,v=>{ draft.power=v; syncCfg(); thumbs(); });
const CONTROL_LAYER_IDS=['construction','binary','escape','potential','sens','sgrad','vdiv','vcurl','phase','coherence'];
const CONTROL_LAYERS=CONTROL_LAYER_IDS.map(v=>MODES.find(m=>m.v===v)).filter(Boolean);
group($('gMode'),CONTROL_LAYERS,()=>draft.mode,v=>{ draft.mode=v; syncCfg(); });
group($('gPal'),Object.keys(PALETTES).map(v=>({v,t:PALETTES[v].t})),()=>draft.palette,v=>{ draft.palette=v; syncCfg(); thumbs(); });
$('gClean').onclick=()=>{ draft.clean=!draft.clean; syncCfg(); };
function syncContourSettings(c){
  $('contourOn').checked=c.contours;
  $('contourLevels').value=c.contourLevels;
  $('contourOpacity').value=c.contourOpacity;
  $('contourColor').value=c.contourColor;
  $('contourLevelsOut').textContent=c.contourLevels;
  $('contourOpacityOut').textContent=c.contourOpacity+'%';
}
$('contourOn').onchange=()=>{draft.contours=$('contourOn').checked;syncContourSettings(draft);};
$('contourLevels').oninput=()=>{draft.contourLevels=+$('contourLevels').value;syncContourSettings(draft);};
$('contourOpacity').oninput=()=>{draft.contourOpacity=+$('contourOpacity').value;syncContourSettings(draft);};
$('contourColor').onchange=()=>{draft.contourColor=$('contourColor').value;syncContourSettings(draft);};
syncContourSettings(draft);
const SEED_VALUES=[-2,-1.5,-1,-0.75,-0.5,-0.25,0,0.25,0.5,0.75,1,1.5,2,Math.PI,Math.E];
const SEED_QUICK=[['0',0,0],['1',1,0],['−1',-1,0],['i',0,1],['−i',0,-1],['i²',-1,0],['i³',0,-1],['1+i',1,1],['1−i',1,-1],['−1+i',-1,1],['−1−i',-1,-1],['½i',0,.5],['−½i',0,-.5],['π',Math.PI,0],['e',Math.E,0]];
let seedTab='known';
function setSeedTab(tab){
  seedTab=tab; $('seedKnownPanel').hidden=tab!=='known';$('seedNumbersPanel').hidden=tab!=='numbers';
  $('seedKnown').classList.toggle('on',tab==='known');$('seedNumbers').classList.toggle('on',tab==='numbers');
}
$('seedKnown').onclick=()=>setSeedTab('known');
$('seedNumbers').onclick=()=>setSeedTab('numbers');
function syncSeedPicker(){
  const c=draft.seed;
  $('seedCurrent').textContent='c = '+cText(c.re,c.im,10)+' · fixed parameter; each pixel is an initial z₀';
  for(const [id,value] of [['seedReal',c.re],['seedImag',c.im]]){
    const el=$(id),key=String(value);
    if(![...el.options].some(o=>o.value===key)){const o=document.createElement('option');o.value=key;o.textContent=key+' (custom)';el.append(o);}
    el.value=key;
  }
}
function chooseSeed(re,im){
  draft.seed={re,im};$('cin').value=cText(re,im,15).replace(/−/g,'-');
  $('cin').classList.remove('bad');syncSeedPicker();thumbs();
}
for(const id of ['seedReal','seedImag']){
  const sel=$(id);for(const v of SEED_VALUES){const o=document.createElement('option');o.value=String(v);o.textContent=v===Math.PI?'π':v===Math.E?'e':String(v);sel.append(o);}
  sel.onchange=()=>chooseSeed(+$('seedReal').value,+$('seedImag').value);
}
SEED_QUICK.forEach(([name,re,im])=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>chooseSeed(re,im);$('seedQuick').append(b);});
SEEDS.forEach(([name,re,im])=>{ const b=document.createElement('button'); b.type='button'; b.textContent=name; b.onclick=()=>{ chooseSeed(re,im); }; $('seeds').append(b); });
function parseC(s){ // "−0.8 + 0.156i", "-0.8, 0.156", "i", "-0.5i", "0.25"
  s=String(s).trim().replace(/[−–—]/g,'-').replace(/^c\s*=\s*/i,'').replace(/\*/g,'').replace(/j/gi,'i');
  const n='(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?', ok=(a,b)=>isFinite(a)&&isFinite(b)&&Math.hypot(a,b)<=10?{re:a,im:b}:null;
  let m=s.match(new RegExp('^([+-]?'+n+')\\s*[,;\\s]\\s*([+-]?'+n+')$','i')); if(m) return ok(+m[1],+m[2]);
  s=s.replace(/\s+/g,'');
  m=s.match(new RegExp('^([+-]?'+n+')?(?:([+-])('+n+')?i)?$','i'));
  if(m && (m[1]!==undefined || m[2]!==undefined)) return ok(m[1]===undefined?0:+m[1], m[2]===undefined?0:(m[2]==='-'?-1:1)*(m[3]===undefined?1:+m[3]));
  m=s.match(new RegExp('^([+-]?)('+n+')?i$','i')); if(m) return ok(0,(m[1]==='-'?-1:1)*(m[2]===undefined?1:+m[2]));
  return null;
}
$('cin').addEventListener('input',()=>{ const c=parseC($('cin').value); $('cin').classList.toggle('bad',!c); if(c){ draft.seed=c; syncSeedPicker(); thumbs(); } });
function syncCfg(){ syncSeedPicker(); syncCoordPickers();
  const geo=isGeometry(draft.fractal);if(!layerAllowed(draft.fractal,draft.mode))draft.mode=geo?'construction':'escape';$('pGeometry').classList.toggle('on',geo);if(geo){const g=GEOMETRIC[draft.fractal];$('geometryDepth').max=g.max;$('geometryDepth').value=geometryDepth(draft);$('geometryDepthOut').textContent=geometryDepth(draft);}for(const b of $('gMode').children)b.hidden=!layerAllowed(draft.fractal,b._v);
  syncGroups($('cfg')); $('gClean').classList.toggle('on',draft.clean);
  $('pJulia').classList.toggle('on',draft.fractal==='julia'); $('juliaPowerNote').textContent=Number.isInteger(draft.juliaPower)&&draft.juliaPower>=2?'Polynomial Julia set (degree '+draft.juliaPower+').':Number.isInteger(draft.juliaPower)&&draft.juliaPower<0?'Rational map with a pole at zero. First-threshold stopping is an experiment, not a reliable Julia membership test.':'Principal-branch complex power; cut on the negative real axis. First-threshold stopping is a finite-orbit diagnostic, not a classical polynomial Julia set.'; $('pMulti').classList.toggle('on',draft.fractal==='multibrot');
  const g=$('palPrev').getContext('2d'), lut=PALETTES[draft.palette].cyc, img=g.createImageData(600,1), o=new Uint32Array(img.data.buffer);
  for(let x=0;x<600;x++) o[x]=lut[(x*1024/300|0)&1023];
  for(let y=0;y<18;y++) g.putImageData(img,0,y);
}
$('geometryDepth').oninput=e=>{draft.geometryDepth=+e.target.value;$('geometryDepthOut').textContent=e.target.value;};
const thumbIds=[];
function thumbs(){ // each library card shows its own universe, computed by the same worker
  thumbIds.forEach(cancel); thumbIds.length=0;
  FR.forEach(f=>{ const c={...draft,fractal:f.v,radius:2}, e=engineOf(c), w=e.span?e.span*4/3:3.5, v={cx:e.span?0:-0.65,cy:0,w,a:0};
    thumbIds.push(render('thumb',v,160,120,220,e,false,L=>{ const keep=cfg.palette; cfg.palette=draft.palette; const img=paint(L,e.geometry?'construction':'escape'); cfg.palette=keep; f.cv.getContext('2d').drawImage(img,0,0); })); });
}
function openCfg(){ draft=clone(cfg); draft.depth=0; if(!CONTROL_LAYER_IDS.includes(draft.mode))draft.mode='escape'; $('cin').value=cText(draft.seed.re,draft.seed.im,15).replace(/−/g,'-'); $('cin').classList.remove('bad'); closePop(); closeSec(); setSecTool(false);
  $('cfg').classList.add('on'); $('cfg').firstElementChild.scrollTop=0; syncCfg(); thumbs(); }
$('bSetup').onclick=openCfg;
$('useCfg').onclick=()=>{ $('cfg').classList.remove('on'); draft.depth=0; applyConfig(draft); if(cfg.clean) toast('Clean view. Press and hold the map to bring the tools back.',3200); };
const WAVE={cx:-0.7274552961, cy:0.3586441332, w:0.000000519, a:-70*Math.PI/180};
$('preWave').onclick=()=>{ $('cfg').classList.remove('on'); applyConfig({...clone(DEFAULTS),mode:'compare',iter:1600,radius:2,palette:draft.palette},WAVE); };

/* ---------- information ---------- */
let infoOpen=false;
function snapshot(){ // everything needed to reproduce this frame
  const a=view.a*180/Math.PI;
  return {viewer:'Fractal Universe Lab', version:1,
    config:{fractal:cfg.fractal, geometryDepth:eng.geometry?eng.geometryDepth:null, rule:asciiRule(), power:eng.pw, seed:cfg.fractal==='julia'?{...cfg.seed}:null, measurement:cfg.mode, panels:cmp()?[...cfg.panels]:null,
      palette:cfg.palette, layerSettings:globalThis.birthLayerSettings?.(), contours:{show:cfg.contours,levels:cfg.contourLevels,opacity:cfg.contourOpacity,color:cfg.contourColor}, iterations:{mode:cfg.iter?'fixed':'auto', limit:itFor(view.w)}, escapeRadius:Math.sqrt(eng.R2), stopMode:cfg.stopMode, maxDepth:cfg.depth||null, cleanView:cfg.clean},
    camera:{centre:{re:view.cx, im:view.cy}, width:view.w, cameraAngleDeg:a, planeTurnDeg:-a, depth:depthOf(view.w), homeWidth:HOME.w},
    render: stats ? {width:stats.W, height:stats.H, pixelSize:stats.pix, escaped:stats.esc, pixels:stats.N, Tmin:stats.esc?stats.tmin:null, Tmax:stats.esc?stats.tmax:null,
      r_T_S:isFinite(stats.rTS)?stats.rTS:null, r_T_stretchRate:isFinite(stats.rTR)?stats.rTR:null, neighboursSkippingABand:stats.multi} : null,
    pin: pin ? {re:pin.re, im:pin.im, orbit:pin.r.kind, steps:pin.r.n, period:pin.r.period||null, multiplier:pin.r.lam==null?null:pin.r.lam} : null,
    sections: sections.map(s=>({a:{re:s.a[0],im:s.a[1]}, b:{re:s.b[0],im:s.b[1]}, samples:s.n})),
    link:location.href, taken:new Date().toISOString()};
}
function fillInfo(){
  const d=digitsFor(view.w/Wd*DPR), D=depthOf(view.w), deg=view.a*180/Math.PI, s=stats, sg=x=>(x>0?'+':x<0?'−':'')+Math.abs(x).toFixed(1).replace(/\.0$/,'')+'°';
  const what= eng.geometry?'finite recursive construction':eng.kind ? 'pixel = z₀, c fixed' : 'pixel = c, z₀ = 0';
  const rows=[
    ['Fractal', eng.name],
    ['Rule', eng.rule+' <i>· '+what+'</i>'],
    cfg.fractal==='julia' ? ['Seed c', cText(cfg.seed.re,cfg.seed.im,15)] : cfg.fractal==='multibrot' ? ['Power n', String(cfg.power)] : null,
    ['Measurement', modeOf(cfg.mode).t+(cmp()?' <i>· '+cfg.panels.map(p=>modeOf(p).tag).join(' · ')+'</i>':' <i>· '+modeOf(cfg.mode).s+'</i>')],
    ['Colour scheme', PALETTES[cfg.palette].t],
    ['Centre', fixed(view.cx,d)+'<br>'+(view.cy<0?'− ':'+ ')+Math.abs(view.cy).toFixed(d)+' i'],
    ['Width', sci(view.w,4)],
    ['Rotation', 'camera '+sg(deg)+' <i>· the plane appears turned '+sg(-deg)+'</i>'],
    ['Zoom depth', 'D = '+minus(D.toFixed(2))+' <i>· ×'+sci(Math.pow(2,D),3)+' · limit '+(cfg.depth||'none')+'</i>'],
    [eng.geometry?'Construction depth':'Iteration limit', num(itFor(view.w))+' <i>· '+(cfg.iter?'fixed':'auto, rises with depth')+'</i>'],
    eng.geometry?null:['Escape radius', String(+Math.sqrt(eng.R2).toFixed(4))],
    s ? ['Image', num(s.W)+' × '+num(s.H)+' px'+(cmp()?' <i>per panel</i>':'')+' <i>· pixel</i> '+sci(s.pix,3)] : null,
    eng.geometry&&s?['Covered pixels',(100*s.esc/s.N).toFixed(2)+'% · finite construction']:s ? ['Escaped', (100*s.esc/s.N).toFixed(s.esc===s.N?0:2)+' % <i>of '+num(s.N)+' pixels. Black means no escape detected in '+num(s.maxIt)+' steps, not proven membership.</i>'] : null,
    !eng.geometry&&s&&s.esc ? ['Escape step T', num(s.tmin)+' … '+num(s.tmax)] : null,
    !eng.geometry&&s&&s.esc ? ['Resolution check', (100*s.multi).toFixed(1)+' % <i>of neighbouring pixels differ by more than one step: fine structure there is below the pixel grid</i>'] : null,
    s&&isFinite(s.rTS) ? ['r(T, S)', r3(s.rTS)+' <i>escape step vs sensitivity, this frame</i>'] : null,
    s&&isFinite(s.rTR) ? ['r(T, S/T)', r3(s.rTR)+' <i>escape step vs stretch per step</i>'] : null,
    pin ? ['Pin', cFixed(pin.re,pin.im,pin.d)+'<br><i>'+orbitText(pin.r)+'</i>'] : null
  ].filter(Boolean);
  $('infoT').innerHTML=rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  $('pinJulia').style.display = cfg.fractal==='mandelbrot' && pin ? '' : 'none';
  $('infoNote').textContent = eng.geometry?'Finite recursive geometry; white in binary mode marks the construction. No complex orbit is evaluated.':(s&&isFinite(s.rTS) ? '' : 'Correlations appear in the two sensitivity views and in Comparison, where the derivative is computed. ')
    +'Correlations are descriptive: they belong to this grid, this frame and this iteration limit, and say nothing about cause. '
    +'S rises by ln(2R) at every escape band, so bands in the sensitivity view follow the escape radius; the bands-removed view divides that step out.';
}
function openInfo(){ infoOpen=true; fillInfo(); $('info').classList.add('on'); }
function closeInfo(){ infoOpen=false; $('info').classList.remove('on'); }
$('infoX').onclick=closeInfo;
$('copyLink').onclick=()=>{ writeHash(); copyText(location.href,'Link copied'); };
$('copyJson').onclick=()=>copyText(JSON.stringify(snapshot(),null,1),'Copied as JSON');
$('pinJulia').onclick=()=>{ if(!pin) return; closeInfo(); applyConfig({...clone(cfg),fractal:'julia',seed:{re:pin.re,im:pin.im}}); };

/* ---------- link: the whole configuration and camera in the address ---------- */
let hashT=0;
function writeHash(){
  if(!started) return; clearTimeout(hashT);
  hashT=setTimeout(()=>{
    const q={f:cfg.fractal, m:cfg.mode, pal:cfg.palette, it:cfg.iter, R:cfg.radius, sm:cfg.stopMode, d:cfg.depth, x:view.cx, y:view.cy, w:view.w, r:+(view.a*180/Math.PI).toFixed(4), polar:+cfg.polar, bt:+cfg.bottcher, bg0:cfg.bottcherGMin, bg1:cfg.bottcherGMax, lp:+cfg.logPolar, lo:+cfg.logOuter.toFixed(9), ls:+cfg.logSpan.toFixed(9), co:+cfg.contours, cn:cfg.contourLevels, ca:cfg.contourOpacity, cc:cfg.contourColor};
    if(eng.geometry)q.gd=eng.geometryDepth; if(cfg.fractal==='multibrot') q.n=cfg.power; if(cfg.fractal==='julia'){q.c=cfg.seed.re+','+cfg.seed.im;q.jp=cfg.juliaPower;}
    if(cmp()) q.ps=cfg.panels.join('.'); if(cfg.clean) q.clean=1;
    try{ history.replaceState(null,'','#'+Object.entries(q).map(([k,v])=>k+'='+v).join('&')); }catch(_){}
  },250);
}
function readHash(){
  const q={}; location.hash.replace(/^#/,'').split('&').forEach(p=>{ const i=p.indexOf('='); if(i>0) q[p.slice(0,i)]=decodeURIComponent(p.slice(i+1)); });
  if(!q.f || !FRACTALS.some(f=>f.v===q.f)) return null;
  const c=clone(DEFAULTS); c.fractal=q.f; if(isGeometry(c.fractal))c.geometryDepth=+q.gd||0; c.polar=q.polar==='1'; c.bottcher=q.bt==='1'&&(c.fractal==='julia'||c.fractal==='mandelbrot'); if(+q.bg0>=1e-5&&+q.bg0<8)c.bottcherGMin=+q.bg0; if(+q.bg1>c.bottcherGMin&&+q.bg1<=8)c.bottcherGMax=+q.bg1; c.logPolar=c.polar&&q.lp==='1'; if(q.lo!==undefined&&Number.isFinite(+q.lo)&&+q.lo>=-32&&+q.lo<=32)c.logOuter=+q.lo; if(q.ls!==undefined&&Number.isFinite(+q.ls)&&+q.ls>=.05&&+q.ls<=36)c.logSpan=+q.ls;
  if(MODES.some(m=>m.v===q.m)) c.mode=q.m; if(PALETTES[q.pal]) c.palette=q.pal;
  if(Number.isInteger(+q.it)&&+q.it>=0&&+q.it<=40000) c.iter=+q.it; if(Number.isFinite(+q.R)&&+q.R>=0.01&&+q.R<=1000000)c.radius=+q.R; if(['outward','inward','fixed'].includes(q.sm))c.stopMode=q.sm; if([0,3,10,25].includes(+q.d)) c.depth=+q.d;
  if(+q.n>=3 && +q.n<=8) c.power=Math.round(+q.n);
  if(q.c){ const s=parseC(q.c); if(s) c.seed=s; }
  if(q.jp!==undefined && JULIA_EXPONENTS.includes(+q.jp))c.juliaPower=+q.jp;
  if(c.fractal==='julia'&&c.juliaPower!==2)c.bottcher=false;
  if(q.ps){ const ps=q.ps.split('.'); if(ps.length===4 && ps.every(p=>MODES.some(m=>m.v===p&&p!=='compare'))) c.panels=ps; }
  if(q.co!==undefined)c.contours=q.co==='1';
  if(+q.cn>=1&&+q.cn<=20)c.contourLevels=+q.cn;
  if(q.ca!==undefined&&+q.ca>=0&&+q.ca<=100)c.contourOpacity=+q.ca;
  if(['white','black','colored'].includes(q.cc))c.contourColor=q.cc;
  c.clean=q.clean==='1';
  const cam= isFinite(+q.x)&&isFinite(+q.y)&&+q.w>0 ? {cx:+q.x, cy:+q.y, w:+q.w, a:(+q.r||0)*Math.PI/180} : null;
  return {c,cam};
}

/* ---------- capture: the picture with labels, the picture alone, and the configuration inside both files ---------- */
let shotWanted=0, shotTaking=false, shots=null, shotLabels=true, shotURL='', shotName='';
$('shot').onclick=()=>{ closePop(); requestShot(); };
function shotBusy(on){for(const b of [$('shot'),document.querySelector('#tools.unified-tools button[aria-label="Picture"]')]){if(b){b.classList.toggle('busy',on);b.setAttribute('aria-busy',String(on));}}}
function requestShot(){if(shotWanted||shotTaking){toast('Picture capture in progress');return;}shotWanted=performance.now();shotBusy(true);toast('Capturing picture…',2000);}
function settled(){ return !dirty && cur && cur.passes.every(p=>p.left<=0) && !glide && !rotAnim && !back && ptrs.size===0; }
function grab(overlays){
  draw(overlays);
  const c=document.createElement('canvas'); c.width=Wd; c.height=Hd; const g=c.getContext('2d'); g.drawImage(cv,0,0);
  if(!overlays) return c;
  const d=digitsFor(view.w/Wd*DPR), deg=Math.round(view.a*180/Math.PI);
  const lines=[eng.name+'  '+eng.rule+(cfg.fractal==='julia'?'   c = '+cText(cfg.seed.re,cfg.seed.im,12):''),
    modeOf(cfg.mode).t+' · '+PALETTES[cfg.palette].t+' · '+num(itFor(view.w))+' it · R '+(+Math.sqrt(eng.R2).toFixed(3)),
    'centre  '+cFixed(view.cx,view.cy,d), 'width  '+sci(view.w,3)+'   camera  '+(deg>0?'+':deg<0?'−':'')+Math.abs(deg)+'°   '+depthText()];
  g.save(); g.scale(DPR,DPR);
  const mono='12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fonts=['600 12px system-ui,sans-serif','11px system-ui,sans-serif',mono,mono];
  let maxW=0; lines.forEach((t,i)=>{ g.font=fonts[i]; maxW=Math.max(maxW,g.measureText(t).width); });
  const cw=Wd/DPR, room=cw-28-SA.l-SA.r-2*COMPASS_R-14, bw=Math.min(maxW+20,cw-28), x0=14+SA.l;
  const y0= cmp() ? Hd/DPR/2-lines.length*8.5-6 : (bw>room ? 16+SA.t+2*COMPASS_R+26 : 14+SA.t);     // centred in the comparison, else top left (under the compass if it would not fit beside it)
  const bx= cmp() ? (cw-bw)/2 : x0;
  g.fillStyle='rgba(0,0,0,.62)'; roundRect(bx,y0,bw,lines.length*17+12,8,g); g.fill();
  g.save(); g.beginPath(); g.rect(bx,y0,bw-8,lines.length*17+12); g.clip();
  lines.forEach((t,i)=>{ g.font=fonts[i]; g.fillStyle=i?'rgba(255,255,255,.9)':'#fff'; g.textAlign='left'; g.textBaseline='alphabetic'; g.fillText(t,bx+10,y0+19+i*17); });
  g.restore(); g.restore();
  return c;
}
const toBlob=c=>new Promise(res=>c.toBlob(res,'image/png'));
async function takeShot(){
  shotWanted=0;shotTaking=true;
  try{const renderedCamera=base?{cx:base.cx,cy:base.cy,w:base.w,a:base.a||0}:null,displayCamera={cx:view.cx,cy:view.cy,w:view.w,a:view.a||0},reprojected=!!renderedCamera&&Object.keys(displayCamera).some(k=>displayCamera[k]!==renderedCamera[k]),ready=!!settled()&&!window.birthPreviewQuality&&!reprojected,meta=JSON.stringify({...snapshot(),captureQuality:ready?'settled':'current-preview',renderedCamera,displayCamera,reprojected,renderedResolution:base?{width:base.W,height:base.H}:null,outputResolution:{width:Wd,height:Hd},previewDivisor:window.birthPreviewQuality?.divisor??null}),name=`${cfg.fractal}-${cfg.mode}-${stamp()}.png`,labels=!cfg.clean,full=grab(true),clean=grab(false);needDraw=true;
  const [a,b]=await Promise.all([toBlob(full),toBlob(clean)]);if(!a||!b)throw Error('Could not make the image');
  shots={full:await withText(a,'Comment',meta),clean:await withText(b,'Comment',meta)};shotName=name;shotLabels=labels;showShot();$('cap').classList.add('on');if(!ready)toast('Captured current preview frame');
  }catch(e){toast('Picture capture failed: '+e.message,5000);}finally{shotTaking=false;shotBusy(false);needDraw=true;}
}
function showShot(){
  if(shotURL) URL.revokeObjectURL(shotURL);
  const blob=shotLabels?shots.full:shots.clean; shotURL=URL.createObjectURL(blob); $('capImg').src=shotURL;
  $('capLabels').textContent='Labels: '+(shotLabels?'on':'off');
  const f=new File([blob],shotName,{type:'image/png'});
  $('capShare').style.display=(navigator.canShare && navigator.canShare({files:[f]}))?'':'none';
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
function readText(buf){ // the JSON stored by this Lab, the Survey Map or the Julia Lab
  const u=new Uint8Array(buf), dv=new DataView(buf); let p=8;
  while(p+12<=u.length){ const len=dv.getUint32(p), type=String.fromCharCode(u[p+4],u[p+5],u[p+6],u[p+7]);
    if(type==='tEXt'){ const s=new TextDecoder('latin1').decode(u.subarray(p+8,p+8+len)), i=s.indexOf('\0'); if(s.slice(0,i)==='Comment'){ try{ return JSON.parse(s.slice(i+1)); }catch(_){ return null; } } }
    if(type==='IEND') break; p+=12+len; }
  return null;
}
function fromMeta(m){
  if(!m || !m.centre && !m.camera) return null;
  const c=clone(DEFAULTS);
  if(m.viewer==='Fractal Universe Lab'){
    const k=m.config||{}; if(FRACTALS.some(f=>f.v===k.fractal)) c.fractal=k.fractal; if(isGeometry(c.fractal))c.geometryDepth=+k.geometryDepth||0;
    if(k.fractal==='multibrot' && k.power>=3 && k.power<=8) c.power=k.power; if(k.fractal==='julia' && JULIA_EXPONENTS.includes(+k.power))c.juliaPower=+k.power; if(k.seed) c.seed={re:+k.seed.re,im:+k.seed.im};
    if(MODES.some(x=>x.v===k.measurement)) c.mode=k.measurement; if(Array.isArray(k.panels)&&k.panels.length===4) c.panels=k.panels;
    if(k.contours){c.contours=!!k.contours.show;c.contourLevels=Math.max(1,Math.min(20,+k.contours.levels||8));c.contourOpacity=Math.max(0,Math.min(100,+k.contours.opacity));if(['white','black','colored'].includes(k.contours.color))c.contourColor=k.contours.color;}
    if(PALETTES[k.palette]) c.palette=k.palette; if(k.iterations&&k.iterations.mode==='fixed') c.iter=k.iterations.limit; if(['outward','inward','fixed'].includes(k.stopMode))c.stopMode=k.stopMode;
    c.radius=Number.isFinite(+k.escapeRadius)&&+k.escapeRadius>=0.01?+k.escapeRadius:2; c.depth=k.maxDepth||0;
    return {c,layerSettings:k.layerSettings,cam:{cx:m.camera.centre.re, cy:m.camera.centre.im, w:m.camera.width, a:m.camera.cameraAngleDeg*Math.PI/180}};
  }
  if(m.seed){ c.fractal='julia'; c.seed={re:+m.seed.re,im:+m.seed.im}; }
  return {c,cam:{cx:m.centre.re, cy:m.centre.im, w:m.width, a:-(m.rotationDeg||0)*Math.PI/180}};
}
$('openCap').onclick=()=>$('capFile').click();
$('capFile').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const got=fromMeta(readText(await f.arrayBuffer()));
  if(!got){ toast('No stored configuration in this image',2600); return; }
  $('cfg').classList.remove('on'); if(got.layerSettings)globalThis.birthRestoreLayerSettings?.(got.layerSettings); applyConfig(got.c,got.cam); toast('Capture restored');
};
$('capSave').onclick=()=>{ const a=document.createElement('a'); a.href=shotURL; a.download=shotName; document.body.append(a); a.click(); a.remove(); };
$('capShare').onclick=()=>{ const f=new File([shotLabels?shots.full:shots.clean],shotName,{type:'image/png'}); navigator.share({files:[f],title:eng.name}).catch(()=>{}); };
$('capLabels').onclick=()=>{ shotLabels=!shotLabels; showShot(); };
$('capClose').onclick=()=>$('cap').classList.remove('on');
$('cap').addEventListener('click',e=>{ if(e.target.id==='cap') e.currentTarget.classList.remove('on'); });

/* ---------- loop ---------- */
let lastT=performance.now();
// Spatial preview: reproject the last computed layer at display cadence.
let spatialKeyframeAt=-Infinity,spatialKeyframeWidth=null;
window.birthSpatialCamera=(cam,first=false)=>{
  Object.assign(view,cam); view.a=wrap(cam.a||0); needDraw=true;
  const now=performance.now();
  if(first||spatialKeyframeWidth===null){spatialKeyframeAt=now;spatialKeyframeWidth=cam.w;return;}
  const scaleChange=Math.abs(Math.log(cam.w/spatialKeyframeWidth));
  if(scaleChange>=Math.log(1.25)&&now-spatialKeyframeAt>=250&&!dirty&&cur&&cur.passes.every(p=>p.left<=0)){spatialKeyframeAt=now;spatialKeyframeWidth=cam.w;dirty=true;}
};
function frame(now){
  const dt=Math.min(50,now-lastT); lastT=now;
  if(back) stepBack(now,dt);
  else {
    if(glide){
      if(glide.fling){ panBy(vel.x*dt,vel.y*dt); const k=Math.pow(0.994,dt); vel.x*=k; vel.y*=k; if(Math.hypot(vel.x,vel.y)<0.02) glide=null; }
      else { const t=Math.min(1,(now-glide.t0)/glide.dur), e=1-Math.pow(1-t,3), target=Math.pow(glide.f,e); zoomAt(glide.px,glide.py,target/glide.done); glide.done=target; if(t>=1) glide=null; }
    }
    if(rotAnim && !back){
      const t=Math.min(1,(now-rotAnim.t0)/rotAnim.dur), e=1-Math.pow(1-t,3), target=-rotAnim.from*e;
      rotateAt(Wd/2,Hd/2,target-rotAnim.done); rotAnim.done=target; if(t>=1){ view.a=0; rotAnim=null; }
    }
  }
  const roughDone=cur && cur.passes[0].left<=0;
  if(dirty && (!cur || roughDone || (!back && now-lastStart>140))) startJob();
  if(!window.birthPreviewQuality?.spatial)spatialKeyframeWidth=null;
  if(needDraw && (!window.birthPreviewQuality || window.birthPreviewQuality.spatial || settled())){ draw(); } window.birthRecordFrame?.(now);
  if(shotWanted && (settled() || (window.birthExpeditionActive?.() && base) || now-shotWanted>3000)){if(base)takeShot();else{shotWanted=0;shotBusy(false);toast('Picture unavailable: wait for the first rendered frame and try again',4000);}}
  requestAnimationFrame(frame);
}
addEventListener('resize',resize);
resize(); updateChip(); syncQuick(); syncCfg(); thumbs();
(function(){ const h=readHash(); if(h){ $('cfg').classList.remove('on'); applyConfig(h.c,h.cam); } })();   // a link opens straight into its simulation
requestAnimationFrame(frame);

(function(){const items=[['sens','1 Sensitivity'],['sgrad','2 Gradient'],['vdiv','3 Divergence'],['vcurl','4 Curl'],['jointmag','Combined magnitude'],['jointphase','Combined phase'],['shess','5 Hessian'],['waves','Hide Set'],['maskdiff','Difference'],['phase','Rotation phase'],['stablephase','Stable phase'],['normphase','Normalized phase'],['scurl','Curl control']];const notes={normphase:'Local Böttcher angle after entry near zero · black = unavailable · entry bands may differ',stablephase:'Any centre c · no convergence stop · up to 20 periods · fine windings may alias',jointmag:'Joint strength √(div² + curl²) · 99th percentile scale',jointphase:'Hue = atan2(curl, divergence) · black = zero joint strength',phase:'Hue = rotation angle; black = zero derivative',vdiv:'Complex derivative field divergence · blue negative, orange positive',vcurl:'Complex derivative field curl · blue negative, orange positive',sens:'Original escape sensitivity',sgrad:'Gradient magnitude; arrows show direction',sdiv:'Blue negative · orange positive · dark zero',scurl:'Expected zero (discrete mixed partials commute); fixed ±1e−8 scale',shess:'Magnitude of Hessian, including escape-band discontinuities',waves:'Unmasked sensitivity · shared scale',maskdiff:'Absolute mask difference · fixed scale 0–10'};const bar=$('experimentButtons');for(const [m,t] of items){const b=document.createElement('button');b.className='opt';b.style.cssText='width:100%;min-width:0;min-height:34px;padding:6px 2px;font-size:12px;text-align:center;color:white;background:#263044;border-radius:7px';b.textContent=t;b.onclick=()=>{if(cfg.polar||cfg.bottcher){setCoord(cfg,'cartesian');dirty=true;}setMode(m);if(m==='sgrad'){vectorOverlay.enabled=true;vectorOverlay.source='sens';vectorOverlay.sign=1;}else vectorOverlay.enabled=false;needDraw=true;syncQuick();};bar.append(b);}const refresh=()=>{$('experimentNote').textContent=notes[cfg.mode]||'Choose a test';$('experiment').style.display=cfg.clean||$('experiment').dataset.collapsed==='true'?'none':'block';[...bar.children].forEach((b,i)=>b.style.background=items[i]?.[0]===cfg.mode?'#526b9c':'#263044');requestAnimationFrame(refresh);};refresh();})();
$('maskIterations').onchange=e=>{cfg.iter=+e.target.value;if(['stablephase','normphase'].includes(cfg.mode)&&cfg.iter>phaseCap()){cfg.iter=phaseCap();e.target.value=String(phaseCap());}dirty=true;writeHash();};let maskLast=null,fieldLast=null,fieldMode=null,reportMode=null;function maskReport(){if(reportMode!==cfg.mode){reportMode=cfg.mode;maskLast=null;$('maskStats').textContent='Calculating…';}if(['vcurl','vdiv'].includes(cfg.mode)){if(base&&base.A&&base.maxIt===cfg.iter&&(base!==fieldLast||cfg.mode!==fieldMode)){fieldLast=base;fieldMode=cfg.mode;const q=complexFieldStats(base,cfg.mode);$('maskStats').textContent=q.n?'Field RMS '+q.rms.toExponential(2)+' · max '+q.max.toExponential(2):'No smooth samples';}maskLast=null;requestAnimationFrame(maskReport);return;}fieldMode=null;if(['stablephase','normphase'].includes(cfg.mode))$('maskStats').textContent='Phase test · max '+phaseCap();if(cfg.mode!=='stablephase'&&base&&base.S&&base!==maskLast&&base.maxIt===cfg.iter){maskLast=base;let n=0,sum=0,max=0;for(let i=0;i<base.S.length;i++){if(base.T[i]!==NO||!Number.isFinite(base.S[i]))continue;const v=base.S[i];n++;sum+=v*v;max=Math.max(max,v);} $('maskStats').textContent=n?'RMS '+Math.sqrt(sum/n).toExponential(2)+' · max '+max.toExponential(2):'No bounded samples';}requestAnimationFrame(maskReport);}maskReport();
;(()=>{
const button=document.createElement('button');button.className='opt';button.textContent='Resolution test';button.style.cssText='background:#263044;color:white;border-radius:7px;min-height:34px';$('experimentButtons').append(button);
const panel=document.createElement('dialog');panel.style.cssText='background:#161c2d;color:white;width:min(94vw,850px);max-height:85vh;overflow:auto;border-radius:12px;padding:12px';panel.innerHTML='<button style="float:right">Close</button><h3>Phase resolution test</h3><p id="resNote"></p><p id="resLive"></p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div><p>RMS compares coarse phase with circular mean of four finer samples. Rapid % counts pixels with adjacent wrapped phase differences above π/2; this is a warning, not proof of aliasing. Low RMS alone cannot rule out undersampling.</p>';document.body.append(panel);
let token=0,id=0;panel.querySelector('button').onclick=()=>panel.close();panel.onclose=()=>{token++;cancel(id);};
button.onclick=async()=>{const mode=cfg.mode;if(!['normphase','stablephase','phase','jointphase'].includes(mode)){toast('Select Stable phase, Rotation phase or Combined phase first');return;}if(cfg.polar||cfg.bottcher){toast('Use Cartesian coordinates');return;}const v={...view},e={...eng},n=(mode==='stablephase'||mode==='normphase')?Math.min(phaseCap(),itFor(v.w)):itFor(v.w),ratio=Hd/Wd,run=++token,grid=panel.querySelector('div');grid.replaceChildren();panel.querySelector('#resNote').textContent=mode+' · '+n+' iterations · center '+v.cx.toPrecision(9)+', '+v.cy.toPrecision(9)+' · width '+v.w.toPrecision(7)+' · live layer '+(base?base.W+' × '+base.H:'pending');panel.showModal();let prev=null;
for(const W of [256,512,1024,2048]){if(run!==token)return;const H=Math.max(2,Math.round(256*ratio))*W/256;panel.querySelector('#resLive').textContent='Calculating '+W+' × '+H;const L=await new Promise(resolve=>{id=render('resolution',v,W,H,n,e,true,resolve);});if(run!==token)return;
const A=new Float32Array(W*H);if(mode==='jointphase'){const D=complexDifferential(L,'vdiv'),C=complexDifferential(L,'vcurl');for(let i=0;i<A.length;i++)A[i]=Math.hypot(D[i],C[i])>0?Math.atan2(C[i],D[i]):NaN;}else for(let i=0;i<A.length;i++)A[i]=mode==='stablephase'||L.S[i]>0?L.A[i]:NaN;
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));let sum=0,count=0,warn=0,valid=0;const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.style.cssText='width:100%;height:auto';const ctx=canvas.getContext('2d'),img=ctx.createImageData(W,H),pixels=new Uint32Array(img.data.buffer);for(let i=0;i<A.length;i++){const a=A[i];if(!Number.isFinite(a)){pixels[i]=BLACK;continue;}valid++;const bad=(i%W<W-1&&Math.abs(wrap(a-A[i+1]))>Math.PI/2)||(i+W<A.length&&Math.abs(wrap(a-A[i+W]))>Math.PI/2);if(bad)warn++;pixels[i]=PALETTES.hue.cyc[Math.max(0,Math.min(1023,Math.floor((a+Math.PI)/(2*Math.PI)*1023)))];}ctx.putImageData(img,0,0);
if(prev){for(let y=0;y<prev.H;y++)for(let x=0;x<prev.W;x++){const a=prev.A[y*prev.W+x],j=2*y*W+2*x,b=[A[j],A[j+1],A[j+W],A[j+W+1]];if(!Number.isFinite(a)||!b.every(Number.isFinite))continue;const c=b.reduce((s,t)=>s+Math.cos(t),0),d=b.reduce((s,t)=>s+Math.sin(t),0);if(Math.hypot(c,d)<1e-6)continue;sum+=wrap(a-Math.atan2(d,c))**2;count++;}}
const cell=document.createElement('div'),label=document.createElement('p');label.style.fontSize='12px';label.textContent=W+' × '+H+' · rapid '+(valid?100*warn/valid:0).toFixed(1)+'%'+(prev?' · RMS '+(count?Math.sqrt(sum/count).toFixed(3)+' rad':'N/A')+' ('+count+' samples)':'');cell.append(canvas,label);grid.append(cell);prev={A,W,H};await new Promise(r=>setTimeout(r,20));}panel.querySelector('#resLive').textContent='Complete';};
})();

;(()=>{
const old=$('maskIterations'),slider=document.createElement('input'),out=document.createElement('output');slider.type='range';slider.id=old.id;slider.min='1';slider.max='1000';slider.step='1';slider.style.cssText='width:100%;min-width:0;accent-color:#809bd0';out.style.minWidth='32px';const row=old.parentElement;row.style.flexWrap='wrap';old.replaceWith(slider,out);$('maskStats').style.flexBasis='100%';let dragging=false;slider.oninput=()=>{dragging=true;out.textContent=slider.value;};slider.onchange=()=>{dragging=false;cfg.iter=+slider.value;dirty=true;needDraw=true;writeHash();};function sync(){slider.max=['stablephase','normphase'].includes(cfg.mode)?String(phaseCap()):'1000';if(!dragging){slider.value=String(cfg.iter||itFor(view.w));out.textContent=slider.value;}requestAnimationFrame(sync);}sync();
})();

;(()=>{const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center;margin-top:6px;font-size:12px';row.innerHTML='<span>Render resolution</span><select style="background:#263044;color:white"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><span></span>'; $('experiment').append(row);const sel=row.querySelector('select');sel.onchange=()=>{const scale=+sel.value;const cap=Math.sqrt(8000000/(cv.clientWidth*cv.clientHeight));DPR=Math.min(Math.min(devicePixelRatio||1,2)*scale,cap);Wd=Math.round(cv.clientWidth*DPR);Hd=Math.round(cv.clientHeight*DPR);cv.width=Wd;cv.height=Hd;dirty=true;needDraw=true;};function report(){row.lastElementChild.textContent=Wd+' × '+Hd;requestAnimationFrame(report);}report();})();
