/* Shared page footer in normal document flow, with clean-view support. */
(()=>{'use strict';
if(document.getElementById('site-common-chrome'))return;
const root=document.createElement('div');root.id='site-common-chrome';
const style=document.createElement('style');style.textContent=`
#site-common-chrome{position:relative;display:block;clear:both;width:100%;box-sizing:border-box;pointer-events:auto;z-index:1;font:12px system-ui,-apple-system,sans-serif;color:#e8f1ff}
#site-common-chrome .site-bottom{position:relative;display:flex;justify-content:center;align-items:center;gap:9px;margin:0 auto;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #ffffff24;background:#101927;box-sizing:border-box;min-width:0;flex-wrap:wrap}\n#site-common-chrome a{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #ffffff36;border-radius:999px;background:#101927b8;color:#edf5ff;text-decoration:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 9px #0003}
#site-common-chrome .site-home{display:inline-flex;position:static}
#site-common-chrome .site-credit{position:static;padding:0;background:none;color:#dce6f4;font-size:11px;letter-spacing:.02em;white-space:nowrap}
body.clean #site-common-chrome,html.clean #site-common-chrome,body.clean-view #site-common-chrome,html.clean-view #site-common-chrome,body.presentation #site-common-chrome,body.hide-ui #site-common-chrome,body.no-ui #site-common-chrome,body:fullscreen #site-common-chrome,html:fullscreen #site-common-chrome{display:none!important}
@media(max-width:600px){#site-common-chrome a{padding:6px 9px;font-size:11px}#site-common-chrome .site-credit{font-size:10px}}
`;
const base=new URL(document.currentScript.src);const home=new URL('./',base).href;
const onHome=location.pathname.replace(/index\.html$/,'').replace(/\/+$/,'')===new URL(home).pathname.replace(/\/+$/,'');
root.innerHTML='<div class="site-bottom">'+(onHome?'':'<a class="site-home" href="'+home+'" aria-label="Back to main menu">⌂ <span>Home</span></a>')+'<span class="site-credit">Roman Kesler</span></div>';
(document.head||document.documentElement).appendChild(style);
(document.body||document.documentElement).appendChild(root);
function sync(){const hidden=document.fullscreenElement||new URLSearchParams(location.search).has('clean')||document.body?.classList.contains('clean')||document.documentElement.classList.contains('clean')||document.body?.classList.contains('clean-view')||document.body?.classList.contains('hide-ui')||document.body?.classList.contains('no-ui');root.style.display=hidden?'none':''}
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
if(document.body)new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('fullscreenchange',sync);sync();
/* Pages under legacy/ are archives: a red ribbon that stays on (even in clean view) says so and points to the current app. */
const rel=decodeURIComponent(location.pathname).slice(decodeURIComponent(new URL(home).pathname).length);
if(/^legacy(\/|$)/.test(rel)&&!document.getElementById('legacy-ribbon')){
  const NEXT={'fractal-lab':['explore/stopping-lab/','Fractal Universe Lab'],'dual-reconstruction-lab':['explore/stopping-lab/','Fractal Universe Lab'],
    'fractal-atlas-terrain':['explore/fractal-atlas/','Terrain Fractal'],'fractal-geography':['explore/fractal-atlas/','Terrain Fractal']};
  const n=NEXT[rel.split('/')[1]]||['','apps'];
  const bar=document.createElement('div');bar.id='legacy-ribbon';bar.setAttribute('role','alert');
  bar.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px 12px;padding:calc(7px + env(safe-area-inset-top,0px)) 12px 7px;background:#b3261e;color:#fff;font:600 13px/1.3 system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 2px 10px #0008;pointer-events:auto';
  bar.innerHTML='<span>⚠ ARCHIVE · NOT MAINTAINED · may show wrong results. Kept for history only.</span><a href="'+home+n[0]+'" style="color:#fff;background:#0004;border:1px solid #fff8;border-radius:999px;padding:4px 10px;text-decoration:none;white-space:nowrap">Use the current '+n[1]+' →</a>';
  (document.body||document.documentElement).appendChild(bar);
  if(!/^\[ARCHIVE\]/.test(document.title))document.title='[ARCHIVE] '+document.title;
}
})();
