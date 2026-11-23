'use strict';
/* Sector filter: a fixed world-space wedge, no secondary fractal renderer. */
(()=>{
const mask=document.getElementById('sectorMask'),button=document.getElementById('sectorOpen'),ctx=mask.getContext('2d');
let enabled=false,sectorIndex=0,lockedDegree=0,lastKey='';
const tau=Math.PI*2;
function valid(){return cfg.fractal==='julia'&&Number.isInteger(cfg.juliaPower)&&cfg.juliaPower>=2&&!cfg.polar&&!cfg.bottcher;}
function hide(){enabled=false;mask.style.display='none';button.textContent='Show one sector';lastKey='';}
function choose(){const d=cfg.juliaPower,angle=((Math.atan2(view.cy,view.cx)%tau)+tau)%tau;return Math.floor(angle/(tau/d))%d;}
button.onclick=()=>{
if(enabled){hide();return;}
if(!valid()){document.getElementById('primeStatus').textContent='Generate a polynomial Julia set in Cartesian view first.';return;}
sectorIndex=choose();lockedDegree=cfg.juliaPower;enabled=true;mask.style.display='block';button.textContent='Show full set';lastKey='';
};
function clip(poly,nx,ny){
const out=[],eps=1e-12;
for(let i=0;i<poly.length;i++){
const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*ny,db=b[0]*nx+b[1]*ny;
if(da>=-eps)out.push(a);
if((da>=-eps)!==(db>=-eps)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
}
return out;
}
function draw(){
requestAnimationFrame(draw);
if(!enabled)return;
if(!valid()||cfg.juliaPower!==lockedDegree){hide();return;}
const w=Wd,h=Hd,key=[w,h,sectorIndex,lockedDegree,view.cx,view.cy,view.w,view.a].join('|');
if(key===lastKey)return;lastKey=key;
if(mask.width!==w||mask.height!==h){mask.width=w;mask.height=h;}
const a=sectorIndex*tau/lockedDegree,b=(sectorIndex+1)*tau/lockedDegree;
let poly=[toWorld(0,0),toWorld(w,0),toWorld(w,h),toWorld(0,h)];
// A narrow wedge is the intersection of two half-planes through the origin.
poly=clip(poly,-Math.sin(a),Math.cos(a));
poly=clip(poly,Math.sin(b),-Math.cos(b));
ctx.globalCompositeOperation='source-over';ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
if(poly.length>=3){
ctx.globalCompositeOperation='destination-out';ctx.beginPath();
poly.forEach((p,i)=>{const q=toScreen(p[0],p[1]);if(i===0)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);});
ctx.closePath();ctx.fill();ctx.globalCompositeOperation='source-over';
}
}
requestAnimationFrame(draw);
})();
