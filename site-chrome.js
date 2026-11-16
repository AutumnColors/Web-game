/* Shared lightweight site chrome. Safe for standalone canvases and fullscreen labs. */
(()=>{'use strict';
if(document.getElementById('site-common-chrome'))return;
const root=document.createElement('div');root.id='site-common-chrome';
const style=document.createElement('style');style.textContent=`
#site-common-chrome{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:12px system-ui,-apple-system,sans-serif;color:#e8f1ff}
#site-common-chrome a{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #ffffff36;border-radius:999px;background:#101927b8;color:#edf5ff;text-decoration:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 9px #0003}
#site-common-chrome .site-home{position:absolute;top:calc(8px + env(safe-area-inset-top,0px));left:calc(8px + env(safe-area-inset-left,0px))}
#site-common-chrome .site-credit{position:absolute;bottom:calc(7px + env(safe-area-inset-bottom,0px));right:calc(9px + env(safe-area-inset-right,0px));padding:4px 8px;border-radius:999px;background:#101927a8;color:#dce6f4;font-size:11px;letter-spacing:.02em}
body.clean #site-common-chrome,html.clean #site-common-chrome,body.clean-view #site-common-chrome,html.clean-view #site-common-chrome,body.presentation #site-common-chrome,body.hide-ui #site-common-chrome,body.no-ui #site-common-chrome,body:fullscreen #site-common-chrome,html:fullscreen #site-common-chrome{display:none!important}
@media(max-width:600px){#site-common-chrome a{padding:6px 9px;font-size:11px}#site-common-chrome .site-credit{font-size:10px}}
`;
const base=new URL(document.currentScript.src);const home=new URL('./',base).href;
const onHome=location.pathname.replace(/index\.html$/,'').replace(/\/+$/,'')===new URL(home).pathname.replace(/\/+$/,'');
root.innerHTML=(onHome?'':'<a class="site-home" href="'+home+'" aria-label="Back to main menu">⌂ <span>Main menu</span></a>')+'<span class="site-credit">Roman Kes</span>';
(document.head||document.documentElement).appendChild(style);
(document.body||document.documentElement).appendChild(root);
function sync(){const hidden=document.fullscreenElement||new URLSearchParams(location.search).has('clean')||document.body?.classList.contains('clean')||document.documentElement.classList.contains('clean')||document.body?.classList.contains('clean-view')||document.body?.classList.contains('hide-ui')||document.body?.classList.contains('no-ui');root.style.display=hidden?'none':''}
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
if(document.body)new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('fullscreenchange',sync);sync();
})();