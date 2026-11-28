'use strict';
// The native scalar field is sampled in world coordinates and stored in L.S.
// Geometries supply unsigned Euclidean distance to their finite construction;
// polynomial dynamics retain the existing log-compressed orbit derivative.
function scalarField(L){return {values:L.S,source:L.geometry?'distance':'orbit-sensitivity',label:L.geometry?'Distance to set':'Orbit sensitivity (unmasked)',spacing:L.sx,cartesian:!L.ring};}
function geometryDistance(kind,x,y,depth,p={}){
 const h=Math.sqrt(3)/2;
 const seg=(ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,q=dx*dx+dy*dy,t=q?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/q)):0;return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
 const tri=(ax,ay,bx,by,cx,cy)=>{const a=(bx-ax)*(y-ay)-(by-ay)*(x-ax),b=(cx-bx)*(y-by)-(cy-by)*(x-bx),c=(ax-cx)*(y-cy)-(ay-cy)*(x-cx);return (a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0)?0:Math.min(seg(ax,ay,bx,by),seg(bx,by,cx,cy),seg(cx,cy,ax,ay));};
 if(kind==='carpet'){
  let u=x+.5,v=y+.5;if(u<0||u>1||v<0||v>1)return Math.hypot(Math.max(0,-u,u-1),Math.max(0,-v,v-1));
  const n=p.carpetGrid??3,k=(n-1)/2;let size=1;
  for(let i=0;i<depth;i++){u*=n;v*=n;size/=n;if(u>k&&u<k+1&&v>k&&v<k+1)return size*Math.min(u-k,k+1-u,v-k,k+1-v);u-=Math.min(n-1,Math.floor(u));v-=Math.min(n-1,Math.floor(v));}return 0;
 }
 if(kind==='dust'){
  const r=p.dustRatio??1/3;
  function axis(u){if(u<=0)return -u;if(u>=1)return u-1;let size=1;for(let j=0;j<depth;j++){if(u>r&&u<1-r)return size*Math.min(u-r,1-r-u);u=(u>=1-r?u-(1-r):u)/r;size*=r;}return 0;}
  return Math.hypot(axis(x+.5),axis(y+.5));
 }
 if(kind==='gasket'){
  const r=p.gasketRatio??.5;let best=Infinity;
  function walk(ax,ay,len,j){
   const bx=ax+len,cy=ay+h*len,cx=ax+len/2,d=tri(ax,ay,bx,ay,cx,cy);
   if(d>=best)return;if(j===depth){best=d;return;}
   const len2=len*r,shift=len-len2;
   const children=[[ax,ay],[ax+shift,ay],[ax+shift/2,ay+h*shift]];
   children.sort((a,b)=>tri(a[0],a[1],a[0]+len2,a[1],a[0]+len2/2,a[1]+h*len2)-tri(b[0],b[1],b[0]+len2,b[1],b[0]+len2/2,b[1]+h*len2));
   for(const [a,b] of children){walk(a,b,len2,j+1);if(best===0)return;}
  }walk(-.5,-h/3,1,0);return best;
 }
 if(kind==='koch'){
  const height=p.kochHeight??1,ay=-h/3,cy=2*h/3;let best=tri(-.5,ay,.5,ay,0,cy);
  function walk(ax,ay,bx,by,j){
   if(best===0||j>depth)return;const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
   // Every descendant is within sum of the shrinking bump heights of this edge.
   if(seg(ax,ay,bx,by)-len*h*height/2>=best)return;
   const ux=ax+dx/3,uy=ay+dy/3,vx=ax+2*dx/3,vy=ay+2*dy/3,mx=(ax+bx)/2+dy*h*height/3,my=(ay+by)/2-dx*h*height/3;
   best=Math.min(best,tri(ux,uy,mx,my,vx,vy));
   if(best===0||j===depth)return;
   const children=[[ax,ay,ux,uy],[ux,uy,mx,my],[mx,my,vx,vy],[vx,vy,bx,by]];
   children.sort((a,b)=>seg(...a)-seg(...b));for(const c of children)walk(...c,j+1);
  }walk(-.5,ay,.5,ay,1);walk(.5,ay,0,cy,1);walk(0,cy,-.5,ay,1);return best;
 }
 if(kind==='tree'){
  const r=p.treeRatio??.65,a=(p.treeAngle??32)*Math.PI/180,t=p.treeThickness??.045;let best=Infinity;
  function walk(ax,ay,ang,len,j){
   if(j>depth||best===0||Math.hypot(x-ax,y-ay)-len/(1-r)-len*t>=best)return;
   const bx=ax+Math.cos(ang)*len,by=ay+Math.sin(ang)*len;
   best=Math.min(best,Math.max(0,seg(ax,ay,bx,by)-len*t));if(best===0||j===depth)return;
   const left=ang-a,right=ang+a,n=len*r;
   const dl=seg(bx,by,bx+Math.cos(left)*n,by+Math.sin(left)*n),dr=seg(bx,by,bx+Math.cos(right)*n,by+Math.sin(right)*n);
   if(dl<=dr){walk(bx,by,left,n,j+1);walk(bx,by,right,n,j+1);}else{walk(bx,by,right,n,j+1);walk(bx,by,left,n,j+1);}
  }walk(0,-.95,Math.PI/2,.76,1);return best;
 }
 return NaN;
}
if(typeof module!=='undefined')module.exports={scalarField,geometryDistance};
