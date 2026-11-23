'use strict';
/* Non-destructive fundamental-sector mask over the original Julia canvas. */
(()=>{
const mask=document.getElementById('sectorMask'),button=document.getElementById('sectorOpen'),ctx=mask.getContext('2d');
let enabled=false,sectorIndex=0,lastKey='',raf=0;
function valid(){return cfg.fractal==='julia'&&Number.isInteger(cfg.juliaPower)&&cfg.juliaPower>=2&&!cfg.polar&&!cfg.bottcher;}
function chooseSector(){const d=cfg.juliaPower,angle=Math.atan2(view.cy,view.cx);sectorIndex=((Math.floor((angle+Math.PI*2)/(Math.PI*2/d))%d)+d)%d;}
function toggle(){
if(enabled){enabled=false;mask.style.display='none';button.textContent='Show one sector';return;}
if(!valid()){document.getElementById('primeStatus').textContent='Generate a polynomial Julia set in Cartesian view first.';return;}
chooseSector();enabled=true;mask.style.display='block';button.textContent='Show full set';lastKey='';}
button.addEventListener('click',toggle);
function draw(){
raf=requestAnimationFrame(draw);
if(!enabled)return;
if(!valid()){enabled=false;mask.style.display='none';button.textContent='Show one sector';return;}
const d=cfg.juliaPower,ratio=Math.min(devicePixelRatio||1,3),w=Math.round(innerWidth*ratio),h=Math.round(innerHeight*ratio);
const key=[w,h,d,sectorIndex,view.cx,view.cy,view.w,view.a].join('|');if(key===lastKey)return;lastKey=key;
if(mask.width!==w||mask.height!==h){mask.width=w;mask.height=h;}
ctx.clearRect(0,0,w,h);
ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
const origin=toScreen(0,0),ox=origin[0],oy=origin[1],a0=sectorIndex*2*Math.PI/d,a1=a0+2*Math.PI/d;
const reach=6*Math.max(w,h)+Math.hypot(ox,oy);
ctx.globalCompositeOperation='destination-out';
ctx.beginPath();ctx.moveTo(ox,oy);
const steps=Math.max(2,Math.min(64,Math.ceil(300/d)));
for(let i=0;i<=steps;i++){
const a=a0+(a1-a0)*i/steps,px=reach*Math.cos(a),py=reach*Math.sin(a),pt=toScreen(px,py);
ctx.lineTo(pt[0],pt[1]);
}
ctx.closePath();ctx.fill();
ctx.globalCompositeOperation='source-over';
}
requestAnimationFrame(draw);
})();
