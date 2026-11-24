'use strict';
/* The Universal Lab's knobs for add-ons, plus the ♫ button that loads music-addon.js on demand.
   Loaded after lab.js. It wraps three of the lab's functions (paintLayer, draw, writeHash) without changing them:
   with no add-on hooked in, every wrapper simply calls the original. Anything an add-on does is caught here,
   so a broken add-on cannot stop the lab. */
(()=>{
const initialMu=(location.hash.match(/(?:^#|&)(mu=[^&]*)/)||[])[1]||'';   // read now: the lab rewrites the link right after start
const initialCy=(location.hash.match(/(?:^#|&)cy=([^&]*)/)||[])[1]||'';

const FL=window.FractalLab={
  hooks:{},            // paint(layer): after a layer is coloured · view(): {zoom, turn, overlays} for one frame
  onConfig:[],         // functions called after every configuration change (any number of add-ons)
  hashExtra:'',        // kept at the end of the link (e.g. mu=… for the music)
  hashParts:{},        // more add-on parts of the link, by key (e.g. {cy:'13,13'} for the cycle tools)
  initialCy,
  initialMu,
  get cfg(){ return cfg; }, view, canvas:cv,
  size:()=>[Wd,Hd], layers:()=>[...new Set([home,under,base])].filter(Boolean), shown:()=>shown(),
  paint:(L,m)=>paint(L,m), palettes:PALETTES, contours:(c,L)=>drawGreenContours(c,L),
  redraw:()=>{ needDraw=true; }, draw:o=>draw(o), repaint:()=>repaint(), settled:()=>settled(),
  writeHash:()=>writeHash(), toast:(t,ms)=>toast(t,ms), name:()=>eng.name,
  apply:(c,cam)=>applyConfig(c,cam), clone:o=>clone(o), get draft(){ return draft; }, syncCfg:()=>syncCfg(),
  chooseSeed:(re,im)=>chooseSeed(re,im), cText:(re,im,d)=>cText(re,im,d), closePop:()=>closePop(),
  toWorld:(x,y)=>toWorld(x,y), toScreen:(x,y)=>toScreen(x,y)
};
const warn=(where,e)=>console.warn('Fractal Lab add-on ('+where+'):',e);

// 1. after a layer is coloured
const paintLayer0=paintLayer;
paintLayer=function(L){ paintLayer0(L); const h=FL.hooks.paint; if(h) try{ h(L); }catch(e){ warn('paint',e); } };

// 2. one frame's camera: zoom > 1 pushes in, turn rotates (radians); the view is restored right after drawing
const draw0=draw;
draw=function(overlays=!cfg.clean){
  const h=FL.hooks.view; let t=null;
  if(h) try{ t=h(); }catch(e){ warn('view',e); }
  if(!t) return draw0(overlays);
  const keep={w:view.w,a:view.a};
  if(t.zoom>0) view.w/=t.zoom; if(t.turn) view.a=wrap(view.a+t.turn);
  try{ draw0(t.overlays===false?false:overlays); } finally{ view.w=keep.w; view.a=keep.a; }
};

// 3. the link: the lab writes its own parameters; the add-ons' parts are added after them
const writeHash0=writeHash; let extraT=0;
writeHash=function(){ writeHash0(); clearTimeout(extraT); extraT=setTimeout(()=>{
  const h=location.hash.replace(/&(mu|cy)=[^&]*/g,''); if(!/^#f=/.test(h)) return;
  const parts=Object.entries(FL.hashParts).filter(([,v])=>v).map(([k,v])=>k+'='+v);
  if(FL.hashExtra) parts.unshift(FL.hashExtra);
  try{ history.replaceState(null,'',h+parts.map(p=>'&'+p).join('')); }catch(_){}
},320); };

// 4. after every configuration change (new fractal, seed, degree, coordinates…)
const applyConfig0=applyConfig;
applyConfig=function(next,cam){ applyConfig0(next,cam); for(const h of FL.onConfig) try{ h(); }catch(e){ warn('config',e); } updateButtons(); };

// ♫ button and the on-demand loader
const btn=document.createElement('button');
btn.id='bMusic'; btn.className='glass'; btn.type='button'; btn.title='Music: play a song and let the colours dance'; btn.setAttribute('aria-label','Music');
btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
const tools=document.getElementById('tools'), shot=document.getElementById('shot');
if(tools) tools.insertBefore(btn,shot&&shot.parentNode===tools?shot:null);
let loading=null;
function loadMusic(){
  if(loading) return loading;
  return loading=new Promise(res=>{
    const s=document.createElement('script'); s.src='music-addon.js';
    s.onload=()=>res(window.FractalMusic?FractalMusic.ready.catch(e=>{ warn('music',e); return null; }):null);
    s.onerror=()=>res(null); document.head.append(s);
  }).then(m=>{ if(!m){ loading=null; btn.classList.remove('on'); toast('Music could not load. The lab works as usual.',2600); } return m; });
}
btn.onclick=()=>{ btn.classList.add('on'); loadMusic().then(m=>m&&m.toggle()); };
if(initialMu) loadMusic().then(m=>m&&m.show());   // a music link opens with its song and mapping

// Cycle tools: a Cycle tab on the setup sheet and a button that appears only with a Julia set.
// The search and the panel live in cycle-addon.js, loaded only when one of them is opened.
const cBtn=document.createElement('button');
cBtn.id='bCycle'; cBtn.className='glass'; cBtn.type='button'; cBtn.title='Julia cycle: regenerate c, earlier results, one sector'; cBtn.setAttribute('aria-label','Julia cycle');
cBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5V8h-3.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>';
const view0=document.getElementById('bView');
if(tools) tools.insertBefore(cBtn,view0&&view0.parentNode===tools?view0.nextSibling:null);

// 3D terrain: a button that appears with the Mandelbrot set or a Julia set; terrain-addon.js loads when it is tapped.
const tBtn=document.createElement('button');
tBtn.id='bTerrain'; tBtn.className='glass'; tBtn.type='button'; tBtn.title='3D terrain from this view'; tBtn.setAttribute('aria-label','3D terrain');
tBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19l6-9 4 6 3-4 5 7z"/><path d="M7.5 12.3l1.5 1.2 1.6-1.1"/></svg>';
if(tools) tools.insertBefore(tBtn,cBtn.nextSibling);
function updateButtons(){ cBtn.style.display=cfg.fractal==='julia'?'':'none'; tBtn.style.display=cfg.fractal==='julia'||cfg.fractal==='mandelbrot'?'':'none'; }
updateButtons();
let terrainLoading=null;
function loadTerrain(){
  if(terrainLoading) return terrainLoading;
  return terrainLoading=new Promise(res=>{
    const s=document.createElement('script'); s.src='terrain-addon.js';
    s.onload=()=>res(window.FractalTerrain||null); s.onerror=()=>res(null); document.head.append(s);
  }).then(m=>{ if(!m){ terrainLoading=null; toast('3D terrain could not load. The lab works as usual.',2600); } return m; });
}
tBtn.onclick=()=>loadTerrain().then(m=>m&&m.toggle());
let cycleLoading=null;
function loadCycle(){
  if(cycleLoading) return cycleLoading;
  return cycleLoading=new Promise(res=>{
    const s=document.createElement('script'); s.src='cycle-addon.js';
    s.onload=()=>res(window.FractalCycle||null); s.onerror=()=>res(null); document.head.append(s);
  }).then(m=>{ if(!m){ cycleLoading=null; cBtn.classList.remove('on'); toast('Cycle tools could not load. The lab works as usual.',2600); } return m; });
}
FL.loadCycle=loadCycle;
cBtn.onclick=()=>loadCycle().then(m=>m&&m.toggle());
// The Cycle tab sits next to "Named Julia sets" and "Numbers & i" on the setup sheet.
const known=document.getElementById('seedKnown'), knownPanel=document.getElementById('seedKnownPanel'), numbersPanel=document.getElementById('seedNumbersPanel');
const seedCycle=document.createElement('button'); seedCycle.className='opt'; seedCycle.id='seedCycle'; seedCycle.type='button'; seedCycle.textContent='Cycle';
const cyclePanel=document.createElement('div'); cyclePanel.id='seedCyclePanel'; cyclePanel.hidden=true; cyclePanel.innerHTML='<div class="note">Loading the cycle search…</div>';
if(known&&numbersPanel){
  known.parentNode.append(seedCycle); numbersPanel.after(cyclePanel);
  const setSeedTab0=setSeedTab;
  setSeedTab=function(tab){
    const cyc=tab==='cycle'; setSeedTab0(cyc?'known':tab);
    if(cyc){ knownPanel.hidden=true; known.classList.remove('on'); }
    cyclePanel.hidden=!cyc; seedCycle.classList.toggle('on',cyc);
  };
  seedCycle.onclick=()=>{ setSeedTab('cycle'); loadCycle().then(m=>{ if(m) m.mountSetup(); else cyclePanel.innerHTML='<div class="note">The cycle search could not load. The other tabs work as usual.</div>'; }); };
}

// Links and captures: any whole degree d ≥ 2 is a polynomial Julia set, even without its own chip
// (the Cycle tab can give d = 12, 23, …). The lab itself only accepts the chips, so it is corrected here.
const okDegree=p=>Number.isInteger(p)&&p>=2&&p<=1000;
const fromMeta0=fromMeta;
fromMeta=function(m){ const got=fromMeta0(m); try{ const k=m&&m.config||{}; if(got&&got.c&&got.c.fractal==='julia'&&okDegree(+k.power)) got.c.juliaPower=+k.power; }catch(e){ warn('capture',e); } return got; };
const linkDegree=+((location.hash.match(/(?:^#|&)jp=([^&]*)/)||[])[1]);
if(cfg.fractal==='julia'&&okDegree(linkDegree)&&cfg.juliaPower!==linkDegree){
  const n=clone(cfg); n.juliaPower=linkDegree; applyConfig(n,{cx:view.cx,cy:view.cy,w:view.w,a:view.a});
}
if(initialCy && cfg.fractal==='julia') loadCycle().then(m=>m&&m.restore(initialCy));   // a cycle link remembers where its c came from
})();
