'use strict';
/* Open a separate Dynamics Atlas workspace; the Universal Lab remains untouched. */
(()=>{
const btn=document.createElement('button');
btn.className='glass';btn.type='button';btn.title='Open Dynamics Atlas';btn.setAttribute('aria-label','Open Dynamics Atlas');
btn.style.cssText='width:44px;height:44px;border-radius:50%;font-size:25px';
btn.textContent='◎';
const tools=document.getElementById('tools');
tools?.insertBefore(btn,document.getElementById('shot'));
btn.onclick=()=>{
const c=window.FractalLab?.cfg||cfg;
const v=window.FractalLab?.view||view;
const q=new URLSearchParams({
p:String(c.fractal==='multibrot'?c.power:c.juliaPower||2),
cr:String(c.fractal==='julia'?c.seed.re:-1),
ci:String(c.fractal==='julia'?c.seed.im:0),
cx:String(c.fractal==='julia'?v.cx:0),
cy:String(c.fractal==='julia'?v.cy:0),
w:String(c.fractal==='julia'?v.w:4.2),
a:String(c.fractal==='julia'?v.a:0)
});
location.href='dynamics/?'+q;
};
})();