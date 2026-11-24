'use strict';
/* 3D terrain for the Fractal Universe Lab (formerly the separate Terrain Fractal page).
   Loaded on demand by lab-addons.js; talks to the lab only through window.FractalLab.
   The 3D renderer itself is ../fractal-atlas/terrain.html. It is opened full screen with the current
   view (centre and width) and seed, and the 2D lab stays exactly as it was underneath. */
(()=>{
const FL=window.FractalLab, cfg=()=>FL.cfg, $=id=>document.getElementById(id);
const st=document.createElement('style');
st.textContent=`
#terrainPanel{position:fixed;left:calc(64px + env(safe-area-inset-left));bottom:calc(12px + env(safe-area-inset-bottom));width:min(300px,calc(100vw - 80px));max-height:calc(100dvh - 40px);overflow:auto;z-index:3;padding:12px;border-radius:16px;display:none}
#terrainPanel.on{display:block}
body.clean #terrainPanel,body.cmp #terrainPanel{display:none}
#terrainPanel .trBtns{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 2px}
#terrainPanel .trBtns button{flex:1;min-width:0;font-size:13px;padding:8px 10px;border-radius:18px;border:1.5px solid rgba(255,255,255,.4);background:#151515;color:#fff;cursor:pointer}
#terrainPanel .trBtns button.on,#terrainPanel .trBtns button.main{background:#fff;color:#000;border-color:#fff}
#terrainPanel .trBtns button.main{font-weight:650}
#terrainPanel .trNote{font-size:12px;color:#8d8d95;line-height:1.4;margin:6px 2px 0}
#terrainOverlay{position:fixed;inset:0;background:#080e18;z-index:30;display:none}
#terrainOverlay.on{display:block}
#terrainOverlay iframe{width:100%;height:100%;border:0}
#terrainBack{position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;z-index:32;border-radius:20px;padding:10px 16px;background:#132538;color:#fff;border:1px solid #8ba4ba;font-size:14px;cursor:pointer}`;
document.head.append(st);

const panel=document.createElement('div'); panel.id='terrainPanel'; panel.className='glass';
panel.innerHTML=`<div class="lbl">3D terrain</div>
<div class="trNote">Turns the current view into a landscape: the same centre and width, the boundary as coastline and mountains.</div>
<div class="lbl" style="margin-top:12px">Resolution</div>
<div class="trBtns"><button type="button" data-res="120" class="on">Fast · 120²</button><button type="button" data-res="200">Detailed · 200²</button></div>
<div class="trBtns" style="margin-top:12px"><button id="terrainGo" class="main" type="button">Generate 3D</button></div>
<div class="trNote" id="terrainS"></div>`;
document.body.append(panel);
const overlay=document.createElement('div'); overlay.id='terrainOverlay';
overlay.innerHTML='<button id="terrainBack" type="button">← Back to fractal</button><iframe id="terrainFrame" title="3D fractal terrain"></iframe>';
document.body.append(overlay);

let res='120', open=false;
panel.querySelectorAll('[data-res]').forEach(b=>b.onclick=()=>{ res=b.dataset.res; panel.querySelectorAll('[data-res]').forEach(x=>x.classList.toggle('on',x===b)); });
const btn=$('bTerrain'), say=t=>$('terrainS').textContent=t;
function why(){   // the 3D renderer knows z² + c only, in the ordinary (x, y) plane
  const k=cfg();
  if(k.fractal!=='mandelbrot'&&k.fractal!=='julia') return '3D terrain works for the Mandelbrot set and Julia sets.';
  if(k.fractal==='julia'&&k.juliaPower!==2) return '3D terrain is built for z² + c. This Julia set has degree '+k.juliaPower+'.';
  if(k.polar||k.bottcher) return 'Switch the coordinate system to Cartesian (x, y) first.';
  return '';
}
function refresh(){ const w=why(); say(w||'Uses the centre and width of this view. Rotation is not carried over.'); }
function setOpen(v){ open=v; panel.classList.toggle('on',v); if(btn) btn.classList.toggle('on',v); if(v){ FL.closePop(); refresh(); } }
const tools=$('tools'); if(tools) tools.addEventListener('click',e=>{ if(open&&!e.target.closest('#bTerrain')) setOpen(false); },true);

$('terrainGo').onclick=()=>{
  const w=why(); if(w){ say(w); return; }
  const k=cfg(), v=FL.view;
  const q=new URLSearchParams({world:k.fractal,cr:String(k.seed.re),ci:String(k.seed.im),cx:String(v.cx),cy:String(v.cy),span:String(v.w),res});
  $('terrainFrame').src='../fractal-atlas/terrain.html?'+q.toString();
  overlay.classList.add('on'); setOpen(false);
};
$('terrainBack').onclick=()=>{ overlay.classList.remove('on'); $('terrainFrame').src='about:blank'; };

FL.onConfig.push(()=>{ if(open) refresh(); });

window.FractalTerrain={ toggle:()=>setOpen(!open) };
})();
