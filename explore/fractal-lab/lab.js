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
  const [wx,wy]=toWorld(px,py), m=minW(); let w=view.w/f;
  if(w<m){ w=m; const now=performance.now(); if(f>1.0005 && now-limitT>2500){ limitT=now; toast('Zoom limit: depth '+cfg.depth); } }   // the limit stops zooming in only
  view.w=w; pinTo(px,py,wx,wy); clampView(); dirty=true; needDraw=true;
}
function rotateAt(px,py,dA){ const [wx,wy]=toWorld(px,py); view.a=wrap(view.a+dA); pinTo(px,py,wx,wy); clampView(); dirty=true; needDraw=true; }
function panBy(dx,dy){
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
const P=e=>mapPt(e.clientX*DPR,e.clientY*DPR,gOrigin);
function endGesture(){ ptrs.clear(); cv.classList.remove('drag'); blocked=true; }
cv.addEventListener('pointerdown',e=>{
  e.preventDefault(); closePop();
  if(back) return;
  if(blocked && ptrs.size===0) blocked=false;
  if(blocked) return;
  cv.setPointerCapture(e.pointerId);
  if(ptrs.size===0) gOrigin=panelOf(e.clientX*DPR,e.clientY*DPR);
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
    if(twisting){ twisting=false; snapNorth(); }
    if(moved<12){
      const rx=e.clientX*DPR, ry=e.clientY*DPR, [x,y]=mapPt(rx,ry,gOrigin);
      if(!cfg.clean){
        if(hitCompass(rx,ry)){ northUp(); tapT=0; return; }
        if(hit(labelBox,rx,ry)){ copyPin(); tapT=0; return; }
        const tg=tagBoxes.find(b=>hit(b,rx,ry));
        if(tg){ const order=MODES.filter(m=>m.v!=='compare').map(m=>m.v); cfg.panels[tg.k]=order[(order.indexOf(cfg.panels[tg.k])+1)%order.length]; repaint(); writeHash(); tapT=0; return; }
      }
      if(now-tapT<320 && Math.hypot(x-tapX,y-tapY)<40*DPR*(cmp()?2:1)){ clearTimeout(pinTimer); glide={px:tapX,py:tapY,f:2.5,t0:now,dur:280,done:1}; tapT=0; }
      else { tapT=now; tapX=x; tapY=y; clearTimeout(pinTimer);
        pinTimer=setTimeout(()=>{ if(back||cfg.clean) return; if(secTool) sectionTap(tapX,tapY); else placePin(tapX,tapY); },300); }
    } else if(now-lastMove<60 && Math.hypot(vel.x,vel.y)>0.15){ glide={fling:true}; }
  } else if(was>=2){ vel.x=vel.y=0; }
}
cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',e=>{
  e.preventDefault(); if(back) return;
  const d=e.deltaMode===1?16:1, rx=e.clientX*DPR, ry=e.clientY*DPR, [x,y]=mapPt(rx,ry,panelOf(rx,ry));
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
  else if(k>='1' && k<='7') setMode(MODES[+k-1].v);
});
['gesturestart','gesturechange','contextmenu'].forEach(t=>document.addEventListener(t,e=>{ if(!e.target.closest || !e.target.closest('.sheet,#sec')) e.preventDefault(); }));

/* ---------- quick switches (same camera, same numbers) ---------- */
function setMode(m){
  const was=cmp(); cfg.mode=m; document.body.classList.toggle('cmp',cmp());
  if(cmp()!==was || (needD() && base && !base.S)) dirty=true;   // the comparison renders at panel resolution; sensitivity needs the derivative
  repaint(); updateChip(); syncQuick(); writeHash();
}
function setPalette(p){ cfg.palette=p; repaint(); syncQuick(); writeHash(); }
function setClean(on){ cfg.clean=on; document.body.classList.toggle('clean',on); closePop(); if(on){ closeSec(); setSecTool(false); toast('Clean view. Press and hold the map to bring the tools back.',3200); } needDraw=true; syncQuick(); writeHash(); }
function updateChip(){ $('chipT').textContent=eng.name+' · '+eng.rule; $('chipS').textContent=modeOf(cfg.mode).t+(cfg.fractal==='julia'?' · c = '+cText(cfg.seed.re,cfg.seed.im,6):''); }
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
function syncQuick(){ syncGroups($('pop')); $('qClean').classList.toggle('on',cfg.clean); }
const closePop=()=>{ $('pop').classList.remove('on'); $('bView').classList.remove('on'); };
$('bView').onclick=()=>{ const on=!$('pop').classList.contains('on'); $('pop').classList.toggle('on',on); $('bView').classList.toggle('on',on); syncQuick(); };
$('qClean').onclick=()=>setClean(!cfg.clean);
$('bHome').onclick=()=>{ closePop(); release(true); };
$('chip').onclick=()=>openInfo(); $('bInfo').onclick=()=>{ closePop(); openInfo(); };

/* ---------- applying a configuration ---------- */
function applyConfig(next,cam){
  const world=!started || next.fractal!==cfg.fractal || (next.fractal==='multibrot' && next.power!==cfg.power) || (next.fractal==='julia' && (next.seed.re!==cfg.seed.re || next.seed.im!==cfg.seed.im));
  const numeric=next.radius!==cfg.radius || next.iter!==cfg.iter;
  cfg=clone(next); eng=engineOf(cfg); started=true;
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
group($('gFractal'),FR,()=>draft.fractal,v=>{ draft.fractal=v; syncCfg(); });
group($('gPower'),[3,4,5,6,7,8].map(v=>({v,t:'n = '+v})),()=>draft.power,v=>{ draft.power=v; syncCfg(); thumbs(); });
group($('gMode'),MODES,()=>draft.mode,v=>{ draft.mode=v; syncCfg(); });
group($('gDepth'),[{v:0,t:'Unlimited'},{v:3,t:'3 levels',s:'× 8'},{v:10,t:'10 levels',s:'× 1,024'},{v:25,t:'25 levels',s:'× 33 million'}],()=>draft.depth,v=>{ draft.depth=v; syncCfg(); });
group($('gPal'),Object.keys(PALETTES).map(v=>({v,t:PALETTES[v].t})),()=>draft.palette,v=>{ draft.palette=v; syncCfg(); thumbs(); });
group($('gIter'),[{v:0,t:'Auto'},{v:400,t:'400'},{v:1600,t:'1,600'},{v:6400,t:'6,400'},{v:25600,t:'25,600'}],()=>draft.iter,v=>{ draft.iter=v; syncCfg(); });
group($('gRad'),[{v:2,t:'2'},{v:16,t:'16'}],()=>draft.radius,v=>{ draft.radius=v; syncCfg(); });
$('gClean').onclick=()=>{ draft.clean=!draft.clean; syncCfg(); };
SEEDS.forEach(([name,re,im])=>{ const b=document.createElement('button'); b.type='button'; b.textContent=name; b.onclick=()=>{ draft.seed={re,im}; $('cin').value=cText(re,im,15).replace(/−/g,'-'); $('cin').classList.remove('bad'); thumbs(); }; $('seeds').append(b); });
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
$('cin').addEventListener('input',()=>{ const c=parseC($('cin').value); $('cin').classList.toggle('bad',!c); if(c){ draft.seed=c; thumbs(); } });
function syncCfg(){
  syncGroups($('cfg')); $('gClean').classList.toggle('on',draft.clean);
  $('pJulia').classList.toggle('on',draft.fractal==='julia'); $('pMulti').classList.toggle('on',draft.fractal==='multibrot');
  const g=$('palPrev').getContext('2d'), lut=PALETTES[draft.palette].cyc, img=g.createImageData(600,1), o=new Uint32Array(img.data.buffer);
  for(let x=0;x<600;x++) o[x]=lut[(x*1024/300|0)&1023];
  for(let y=0;y<18;y++) g.putImageData(img,0,y);
}
const thumbIds=[];
function thumbs(){ // each library card shows its own universe, computed by the same worker
  thumbIds.forEach(cancel); thumbIds.length=0;
  FR.forEach(f=>{ const c={...draft,fractal:f.v,radius:16}, e=engineOf(c), w=e.span?e.span*4/3:3.5, v={cx:e.span?0:-0.65,cy:0,w,a:0};
    thumbIds.push(render('thumb',v,160,120,220,e,false,L=>{ const keep=cfg.palette; cfg.palette=draft.palette; const img=paint(L,'escape'); cfg.palette=keep; f.cv.getContext('2d').drawImage(img,0,0); })); });
}
function openCfg(){ draft=clone(cfg); $('cin').value=cText(draft.seed.re,draft.seed.im,15).replace(/−/g,'-'); $('cin').classList.remove('bad'); closePop(); closeSec(); setSecTool(false);
  $('cfg').classList.add('on'); $('cfg').firstElementChild.scrollTop=0; syncCfg(); thumbs(); }
$('bSetup').onclick=openCfg;
$('useCfg').onclick=()=>{ $('cfg').classList.remove('on'); applyConfig(draft); if(cfg.clean) toast('Clean view. Press and hold the map to bring the tools back.',3200); };
const WAVE={cx:-0.7274552961, cy:0.3586441332, w:0.000000519, a:-70*Math.PI/180};
$('preWave').onclick=()=>{ $('cfg').classList.remove('on'); applyConfig({...clone(DEFAULTS),mode:'compare',iter:1600,radius:2,palette:draft.palette},WAVE); };

/* ---------- information ---------- */
let infoOpen=false;
function snapshot(){ // everything needed to reproduce this frame
  const a=view.a*180/Math.PI;
  return {viewer:'Fractal Universe Lab', version:1,
    config:{fractal:cfg.fractal, rule:asciiRule(), power:eng.pw, seed:cfg.fractal==='julia'?{...cfg.seed}:null, measurement:cfg.mode, panels:cmp()?[...cfg.panels]:null,
      palette:cfg.palette, iterations:{mode:cfg.iter?'fixed':'auto', limit:itFor(view.w)}, escapeRadius:Math.sqrt(eng.R2), maxDepth:cfg.depth||null, cleanView:cfg.clean},
    camera:{centre:{re:view.cx, im:view.cy}, width:view.w, cameraAngleDeg:a, planeTurnDeg:-a, depth:depthOf(view.w), homeWidth:HOME.w},
    render: stats ? {width:stats.W, height:stats.H, pixelSize:stats.pix, escaped:stats.esc, pixels:stats.N, Tmin:stats.esc?stats.tmin:null, Tmax:stats.esc?stats.tmax:null,
      r_T_S:isFinite(stats.rTS)?stats.rTS:null, r_T_stretchRate:isFinite(stats.rTR)?stats.rTR:null, neighboursSkippingABand:stats.multi} : null,
    pin: pin ? {re:pin.re, im:pin.im, orbit:pin.r.kind, steps:pin.r.n, period:pin.r.period||null, multiplier:pin.r.lam==null?null:pin.r.lam} : null,
    sections: sections.map(s=>({a:{re:s.a[0],im:s.a[1]}, b:{re:s.b[0],im:s.b[1]}, samples:s.n})),
    link:location.href, taken:new Date().toISOString()};
}
function fillInfo(){
  const d=digitsFor(view.w/Wd*DPR), D=depthOf(view.w), deg=view.a*180/Math.PI, s=stats, sg=x=>(x>0?'+':x<0?'−':'')+Math.abs(x).toFixed(1).replace(/\.0$/,'')+'°';
  const what= eng.kind ? 'pixel = z₀, c fixed' : 'pixel = c, z₀ = 0';
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
    ['Iteration limit', num(itFor(view.w))+' <i>· '+(cfg.iter?'fixed':'auto, rises with depth')+'</i>'],
    ['Escape radius', String(+Math.sqrt(eng.R2).toFixed(4))],
    s ? ['Image', num(s.W)+' × '+num(s.H)+' px'+(cmp()?' <i>per panel</i>':'')+' <i>· pixel</i> '+sci(s.pix,3)] : null,
    s ? ['Escaped', (100*s.esc/s.N).toFixed(s.esc===s.N?0:2)+' % <i>of '+num(s.N)+' pixels. Black means no escape detected in '+num(s.maxIt)+' steps, not proven membership.</i>'] : null,
    s&&s.esc ? ['Escape step T', num(s.tmin)+' … '+num(s.tmax)] : null,
    s&&s.esc ? ['Resolution check', (100*s.multi).toFixed(1)+' % <i>of neighbouring pixels differ by more than one step: fine structure there is below the pixel grid</i>'] : null,
    s&&isFinite(s.rTS) ? ['r(T, S)', r3(s.rTS)+' <i>escape step vs sensitivity, this frame</i>'] : null,
    s&&isFinite(s.rTR) ? ['r(T, S/T)', r3(s.rTR)+' <i>escape step vs stretch per step</i>'] : null,
    pin ? ['Pin', cFixed(pin.re,pin.im,pin.d)+'<br><i>'+orbitText(pin.r)+'</i>'] : null
  ].filter(Boolean);
  $('infoT').innerHTML=rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  $('pinJulia').style.display = cfg.fractal==='mandelbrot' && pin ? '' : 'none';
  $('infoNote').textContent = (s&&isFinite(s.rTS) ? '' : 'Correlations appear in the two sensitivity views and in Comparison, where the derivative is computed. ')
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
    const q={f:cfg.fractal, m:cfg.mode, pal:cfg.palette, it:cfg.iter, R:cfg.radius, d:cfg.depth, x:view.cx, y:view.cy, w:view.w, r:+(view.a*180/Math.PI).toFixed(4)};
    if(cfg.fractal==='multibrot') q.n=cfg.power; if(cfg.fractal==='julia') q.c=cfg.seed.re+','+cfg.seed.im;
    if(cmp()) q.ps=cfg.panels.join('.'); if(cfg.clean) q.clean=1;
    try{ history.replaceState(null,'','#'+Object.entries(q).map(([k,v])=>k+'='+v).join('&')); }catch(_){}
  },250);
}
function readHash(){
  const q={}; location.hash.replace(/^#/,'').split('&').forEach(p=>{ const i=p.indexOf('='); if(i>0) q[p.slice(0,i)]=decodeURIComponent(p.slice(i+1)); });
  if(!q.f || !FRACTALS.some(f=>f.v===q.f)) return null;
  const c=clone(DEFAULTS); c.fractal=q.f;
  if(MODES.some(m=>m.v===q.m)) c.mode=q.m; if(PALETTES[q.pal]) c.palette=q.pal;
  if([0,400,1600,6400,25600].includes(+q.it)) c.iter=+q.it; if(+q.R===2||+q.R===16) c.radius=+q.R; if([0,3,10,25].includes(+q.d)) c.depth=+q.d;
  if(+q.n>=3 && +q.n<=8) c.power=Math.round(+q.n);
  if(q.c){ const s=parseC(q.c); if(s) c.seed=s; }
  if(q.ps){ const ps=q.ps.split('.'); if(ps.length===4 && ps.every(p=>MODES.some(m=>m.v===p&&p!=='compare'))) c.panels=ps; }
  c.clean=q.clean==='1';
  const cam= isFinite(+q.x)&&isFinite(+q.y)&&+q.w>0 ? {cx:+q.x, cy:+q.y, w:+q.w, a:(+q.r||0)*Math.PI/180} : null;
  return {c,cam};
}

/* ---------- capture: the picture with labels, the picture alone, and the configuration inside both files ---------- */
let shotWanted=0, shots=null, shotLabels=true, shotURL='', shotName='';
$('shot').onclick=()=>{ closePop(); requestShot(); };
function requestShot(){ if(back||shotWanted) return; shotWanted=performance.now(); $('shot').classList.add('busy'); }
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
  shotWanted=0; $('shot').classList.remove('busy');
  const meta=JSON.stringify(snapshot()), full=grab(true), clean=grab(false); needDraw=true;
  const [a,b]=await Promise.all([toBlob(full),toBlob(clean)]);
  if(!a||!b){ toast('Could not make the image'); return; }
  shots={full:await withText(a,'Comment',meta), clean:await withText(b,'Comment',meta)};
  shotName=`${cfg.fractal}-${cfg.mode}-${stamp()}.png`; shotLabels=!cfg.clean; showShot();
  $('cap').classList.add('on');
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
    const k=m.config||{}; if(FRACTALS.some(f=>f.v===k.fractal)) c.fractal=k.fractal;
    if(k.fractal==='multibrot' && k.power>=3 && k.power<=8) c.power=k.power; if(k.seed) c.seed={re:+k.seed.re,im:+k.seed.im};
    if(MODES.some(x=>x.v===k.measurement)) c.mode=k.measurement; if(Array.isArray(k.panels)&&k.panels.length===4) c.panels=k.panels;
    if(PALETTES[k.palette]) c.palette=k.palette; if(k.iterations&&k.iterations.mode==='fixed') c.iter=k.iterations.limit;
    c.radius=k.escapeRadius<4?2:16; c.depth=k.maxDepth||0;
    return {c,cam:{cx:m.camera.centre.re, cy:m.camera.centre.im, w:m.camera.width, a:m.camera.cameraAngleDeg*Math.PI/180}};
  }
  if(m.seed){ c.fractal='julia'; c.seed={re:+m.seed.re,im:+m.seed.im}; }
  return {c,cam:{cx:m.centre.re, cy:m.centre.im, w:m.width, a:-(m.rotationDeg||0)*Math.PI/180}};
}
$('openCap').onclick=()=>$('capFile').click();
$('capFile').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const got=fromMeta(readText(await f.arrayBuffer()));
  if(!got){ toast('No stored configuration in this image',2600); return; }
  $('cfg').classList.remove('on'); applyConfig(got.c,got.cam); toast('Capture restored');
};
$('capSave').onclick=()=>{ const a=document.createElement('a'); a.href=shotURL; a.download=shotName; document.body.append(a); a.click(); a.remove(); };
$('capShare').onclick=()=>{ const f=new File([shotLabels?shots.full:shots.clean],shotName,{type:'image/png'}); navigator.share({files:[f],title:eng.name}).catch(()=>{}); };
$('capLabels').onclick=()=>{ shotLabels=!shotLabels; showShot(); };
$('capClose').onclick=()=>$('cap').classList.remove('on');
$('cap').addEventListener('click',e=>{ if(e.target.id==='cap') e.currentTarget.classList.remove('on'); });

/* ---------- loop ---------- */
let lastT=performance.now();
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
  if(needDraw) draw();
  if(shotWanted && (settled() || now-shotWanted>20000)) takeShot();
  else if(shotWanted && back){ shotWanted=0; $('shot').classList.remove('busy'); }
  requestAnimationFrame(frame);
}
addEventListener('resize',resize);
resize(); updateChip(); syncQuick(); syncCfg(); thumbs();
(function(){ const h=readHash(); if(h){ $('cfg').classList.remove('on'); applyConfig(h.c,h.cam); } })();   // a link opens straight into its simulation
requestAnimationFrame(frame);
