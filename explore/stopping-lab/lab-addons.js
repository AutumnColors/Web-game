'use strict';
/* The Universal Lab's knobs for add-ons, plus the ♫ button that loads music-addon.js on demand.
   Loaded after lab.js. It wraps three of the lab's functions (paintLayer, draw, writeHash) without changing them:
   with no add-on hooked in, every wrapper simply calls the original. Anything an add-on does is caught here,
   so a broken add-on cannot stop the lab. */
(()=>{
const initialMu=(location.hash.match(/(?:^#|&)(mu=[^&]*)/)||[])[1]||'';   // read now: the lab rewrites the link right after start

const FL=window.FractalLab={
  hooks:{},            // paint(layer): after a layer is coloured · view(): {zoom, turn, overlays} for one frame
  hashExtra:'',        // kept at the end of the link (e.g. mu=… for the music)
  initialMu,
  get cfg(){ return cfg; }, view, canvas:cv,
  size:()=>[Wd,Hd], layers:()=>[home,base].filter(Boolean), shown:()=>shown(),
  paint:(L,m)=>paint(L,m), palettes:PALETTES, contours:(c,L)=>drawGreenContours(c,L),
  redraw:()=>{ needDraw=true; }, draw:o=>draw(o), repaint:()=>repaint(), settled:()=>settled(),
  writeHash:()=>writeHash(), toast:(t,ms)=>toast(t,ms), name:()=>eng.name
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

// 3. the link: the lab writes its own parameters; the add-on's part is added after them
const writeHash0=writeHash; let extraT=0;
writeHash=function(){ writeHash0(); clearTimeout(extraT); extraT=setTimeout(()=>{
  const h=location.hash.replace(/&mu=[^&]*/,''); if(!/^#f=/.test(h)) return;
  try{ history.replaceState(null,'',h+(FL.hashExtra?'&'+FL.hashExtra:'')); }catch(_){}
},320); };

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
})();
