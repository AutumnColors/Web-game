'use strict';
/* Independent fundamental-sector inspector. Does not alter the existing Julia viewer. */
(()=>{
const $=id=>document.getElementById(id),panel=$('sectorViewer'),canvas=$('sectorCanvas'),ctx=canvas.getContext('2d',{alpha:false});
let mode='linear',zoom=1,radialOffset=0,renderId=0;
const buttons={wedge:$('sectorWedge'),linear:$('sectorLinear'),log:$('sectorLog')};
function open(){if(cfg.fractal!=='julia'||!Number.isInteger(cfg.juliaPower)||cfg.juliaPower<2){$('primeStatus').textContent='Generate a polynomial Julia set first.';return;}panel.hidden=false;panel.style.display='flex';zoom=1;radialOffset=0;render();}
function close(){panel.hidden=true;panel.style.display='none';renderId++;}
$('sectorOpen').onclick=open;$('sectorClose').onclick=close;
Object.entries(buttons).forEach(([m,b])=>b.onclick=()=>{mode=m;zoom=1;radialOffset=0;render();});
function render(){
const token=++renderId,d=cfg.juliaPower,cr=cfg.seed.re,ci=cfg.seed.im;
const rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.min(850,Math.floor(rect.width))),h=Math.max(1,Math.min(900,Math.floor(rect.height)));
canvas.width=w;canvas.height=h;
Object.entries(buttons).forEach(([m,b])=>{b.style.background=m===mode?'#d7c0f5':'#263245';b.style.color=m===mode?'#111':'#fff';});
$('sectorInfo').textContent='Degree '+d+' · sector angle '+(360/d).toPrecision(7)+'° · '+(mode==='log'?'horizontal axis = log radius':mode==='linear'?'horizontal axis = radius':'true angular wedge')+' · scroll / pinch-free wheel to zoom';
const image=ctx.createImageData(w,h),data=image.data,maxR=2.05,logMin=-9,logMax=Math.log(maxR);
let y=0;
function batch(){
if(token!==renderId)return;
for(let end=Math.min(h,y+Math.max(2,Math.floor(16000/w)));y<end;y++){
for(let x=0;x<w;x++){
let r,theta,valid=true;
if(mode==='wedge'){
const px=(x+.5-w/2)/Math.min(w,h)*2.25,py=(h/2-y-.5)/Math.min(w,h)*2.25;
r=Math.hypot(px,py)/zoom;theta=Math.atan2(py,px);
valid=theta>=0&&theta<2*Math.PI/d;
}else{
const u=(x+.5)/w,v=(y+.5)/h;
r=mode==='log'?Math.exp(logMin+(logMax-logMin)*u/zoom+radialOffset):maxR*u/zoom;
theta=2*Math.PI*v/d;
}
const idx=(y*w+x)*4;
if(!valid){data[idx]=10;data[idx+1]=12;data[idx+2]=22;data[idx+3]=255;continue;}
let zr=r*Math.cos(theta),zi=r*Math.sin(theta),iter=0,escaped=false;
for(;iter<140;iter++){
const rr=Math.hypot(zr,zi);
if(rr>8){escaped=true;break;}
if(!Number.isFinite(rr)){escaped=true;break;}
const a=Math.atan2(zi,zr)*d,mag=Math.pow(rr,d);
zr=mag*Math.cos(a)+cr;zi=mag*Math.sin(a)+ci;
}
if(!escaped){data[idx]=8;data[idx+1]=11;data[idx+2]=25;}
else{const t=iter/140;data[idx]=Math.floor(35+200*Math.pow(t,.55));data[idx+1]=Math.floor(24+135*Math.sin(Math.PI*t));data[idx+2]=Math.floor(70+155*Math.pow(t,.35));}
data[idx+3]=255;
}}
ctx.putImageData(image,0,0);
if(y<h)setTimeout(batch,0);
}
batch();
}
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.5,Math.min(500,zoom*(e.deltaY<0?1.2:1/1.2)));render();},{passive:false});
let touchStart=null;
canvas.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY,offset:radialOffset};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',()=>touchStart=null);
canvas.addEventListener('pointermove',e=>{if(!touchStart||mode!=='log')return;radialOffset=touchStart.offset+(touchStart.x-e.clientX)/Math.max(1,canvas.clientWidth)*(logMax-logMin)/zoom;render();});
window.addEventListener('resize',()=>{if(!panel.hidden)render();});
})();
