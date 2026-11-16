'use strict';
/* Atlas-only extension. Universal lab files remain byte-for-byte copies. */
(()=>{
const by=id=>document.getElementById(id);
by('atlasSettings').onclick=()=>{const p=by('atlasConfig');p.style.display=p.style.display==='block'?'none':'block'};
by('atlasGenerate').onclick=()=>{
 const q=new URLSearchParams({world:cfg.fractal==='mandelbrot'?'mandelbrot':'julia',cr:String(cfg.seed.re),ci:String(cfg.seed.im),cx:String(view.cx),cy:String(view.cy),span:String(view.w),res:by('atlasResolution').value});
 by('atlasFrame').src='terrain.html?'+q.toString();by('atlasOverlay').classList.add('open');by('atlasConfig').style.display='none';
};
by('atlasClose').onclick=()=>{by('atlasOverlay').classList.remove('open');by('atlasFrame').src='about:blank'};
})();