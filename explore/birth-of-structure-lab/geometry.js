'use strict';
const GEOMETRIC={koch:{name:'Koch snowflake',rule:'Four segments at scale 1/3',depth:6,max:8,span:1.65},tree:{name:'Binary ghost tree',rule:'Two branches at ±32°, scale 0.65',depth:10,max:12,span:2.7},carpet:{name:'Sierpiński carpet',rule:'Remove the middle ninth',depth:7,max:20,span:1.3},gasket:{name:'Sierpiński triangle',rule:'Remove the central triangle',depth:8,max:24,span:1.3},dust:{name:'Cantor dust',rule:'Keep four corner thirds',depth:6,max:20,span:1.3}};
const isGeometry=f=>Object.hasOwn(GEOMETRIC,f);
const geometryDepth=c=>Math.max(1,Math.min(GEOMETRIC[c.fractal].max,Math.round(c.geometryDepth)||GEOMETRIC[c.fractal].depth));
const layerAllowed=(f,m)=>isGeometry(f)?['construction','binary'].includes(m):m!=='construction';
function geometrySample(kind,x,y,depth){
 const h=Math.sqrt(3)/2;
 if(kind==='carpet'||kind==='dust'){
  x+=.5;y+=.5;if(x<0||x>=1||y<0||y>=1)return [0,0];
  for(let j=1;j<=depth;j++){x*=3;y*=3;const a=Math.floor(x),b=Math.floor(y);if(kind==='carpet'?a===1&&b===1:a===1||b===1)return [0,j];x-=a;y-=b;}return [1,depth];
 }
 const tri=(ax,ay,bx,by,cx,cy)=>{
  const a=(bx-ax)*(y-ay)-(by-ay)*(x-ax),b=(cx-bx)*(y-by)-(cy-by)*(x-bx),c=(ax-cx)*(y-cy)-(ay-cy)*(x-cx);
  return (a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0);
 };
 if(kind==='gasket'){
  let u=x+.5-(y+h/3)/(2*h),v=(y+h/3)/h;if(u<0||v<0||u+v>1)return [0,0];
  for(let j=1;j<=depth;j++){if(u>=.5)u=2*u-1,v*=2;else if(v>=.5)v=2*v-1,u*=2;else if(u+v<=.5)u*=2,v*=2;else return [0,j];}return [1,depth];
 }
 if(kind==='koch'){
  const ay=-h/3,cy=2*h/3;if(tri(-.5,ay,.5,ay,0,cy))return [1,0];
  function bump(ax,ay,bx,by,j){
   if(j>depth)return -1;
   const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy,px=x-ax,py=y-ay,t=(px*dx+py*dy)/l2,s=(dx*py-dy*px)/l2;
   if(t<-.01||t>1.01||s>.01||s<-.5)return -1;
   const ux=ax+dx/3,uy=ay+dy/3,vx=ax+2*dx/3,vy=ay+2*dy/3,mx=(ax+bx)/2+dy*h/3,my=(ay+by)/2-dx*h/3;
   if(tri(ux,uy,mx,my,vx,vy))return j;
   if(j===depth)return -1;
   let k=bump(ax,ay,ux,uy,j+1);if(k>=0)return k;k=bump(ux,uy,mx,my,j+1);if(k>=0)return k;k=bump(mx,my,vx,vy,j+1);return k>=0?k:bump(vx,vy,bx,by,j+1);
  }
  let j=bump(-.5,ay,.5,ay,1);if(j<0)j=bump(.5,ay,0,cy,1);if(j<0)j=bump(0,cy,-.5,ay,1);return j>=0?[1,j]:[0,0];
 }
 if(kind==='tree'){
  const ratio=.65,angle=32*Math.PI/180;
  function branch(ax,ay,a,len,j){
   if(j>depth||Math.hypot(x-ax,y-ay)>len/(1-ratio)+len*.055)return -1;
   const dx=Math.cos(a)*len,dy=Math.sin(a)*len,px=x-ax,py=y-ay,t=Math.max(0,Math.min(1,(px*dx+py*dy)/(len*len)));
   if(Math.hypot(px-t*dx,py-t*dy)<=len*.045)return j;
   const k=branch(ax+dx,ay+dy,a-angle,len*ratio,j+1);return k>=0?k:branch(ax+dx,ay+dy,a+angle,len*ratio,j+1);
  }
  const j=branch(0,-.95,Math.PI/2,.76,1);return j>=0?[1,j]:[0,0];
 }return [0,0];
}
if(typeof module!=='undefined')module.exports={geometrySample,GEOMETRIC,geometryDepth,layerAllowed};
