'use strict';
/* One canonical Julia Dynamics Map, available as standalone page or embedded full-screen workspace. */
(()=>{
const btn=document.createElement('button');btn.className='glass';btn.type='button';btn.title='Open Julia Dynamics Map';btn.setAttribute('aria-label','Open Julia Dynamics Map');btn.style.cssText='width:44px;height:44px;border-radius:50%;font-size:25px';btn.textContent='◎';
document.getElementById('tools')?.insertBefore(btn,document.getElementById('shot'));
let frame=null,wrap=null;
function close(){wrap?.remove();wrap=null;frame=null;document.body.style.overflow='';}
btn.onclick=()=>{
 if(wrap){close();return;}
 const c=window.FractalLab?.cfg||window.cfg;
 const q=new URLSearchParams();
 if(c?.fractal==='julia'){q.set('p',String(c.juliaPower||2));q.set('cr',String(c.seed?.re??-1));q.set('ci',String(c.seed?.im??0));}
 wrap=document.createElement('div');wrap.id='dynamics-map-overlay';wrap.style.cssText='position:fixed;inset:0;z-index:10000;background:#08111e;display:flex;flex-direction:column';
 frame=document.createElement('iframe');frame.title='Julia Dynamics Map';frame.style.cssText='border:0;width:100%;height:100%;flex:1';frame.src='dynamics-map/'+(q.size?'?'+q:'');
 wrap.append(frame);document.body.append(wrap);
};
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='close-dynamics-map')close();});
})();