'use strict';
/* Optional vector overlay. Never computes unless enabled. */
const vectorOverlay = {
 enabled:false, source:'potential', sign:-1, density:12,
 draw(){
  if(!this.enabled || cfg.clean || cfg.polar || cfg.bottcher || cmp())return;
  const L=base||home;if(!L || L.left>0)return;
  const W=L.W,H=L.H,cos=Math.cos(L.a),sin=Math.sin(L.a),step=L.sx;
  const value=i=>{
   if(i<0||i>=L.T.length||L.T[i]===NO)return NaN;
   if(this.source==='sens')return L.S?L.S[i]:NaN;
   if(this.source==='potential')return cfg.stopMode==='outward'&&L.pw>1?Math.log(Math.LN2)+(1-L.F[i]-L.T[i])*Math.log(L.pw):NaN;
   return L.T[i]+L.F[i];
  };
  const width=Wd/DPR,height=Hd/DPR,spacing=width/this.density;
  ctx.save();ctx.scale(DPR,DPR);ctx.strokeStyle='white';ctx.lineWidth=1.7;ctx.shadowColor='black';ctx.shadowBlur=3;
  for(let y=spacing/2;y<height;y+=spacing)for(let x=spacing/2;x<width;x+=spacing){
   const [wx,wy]=toWorld(x*DPR,y*DPR),dx=wx-L.cx,dy=wy-L.cy;
   const ix=Math.round((dx*cos+dy*sin)/step+W/2-.5),iy=Math.round((dx*sin-dy*cos)/step+H/2-.5);
   if(ix<1||iy<1||ix>=W-1||iy>=H-1)continue;
   const i=iy*W+ix, left=value(i-1),right=value(i+1),up=value(i-W),down=value(i+W);
   if(![left,right,up,down].every(Number.isFinite))continue;
   const a=(right-left)/2,b=(down-up)/2;
   const fx=this.sign*(a*cos+b*sin),fy=this.sign*(a*sin-b*cos),m=Math.hypot(fx,fy);
   if(m<1e-12)continue;
   // vx = rightward, vy = upward on screen (the canvas y axis points down, hence y − vy below)
   const c=Math.cos(view.a),s=Math.sin(view.a),vx=(fx*c+fy*s)/m,vy=(-fx*s+fy*c)/m;
   const len=Math.min(20,spacing*.45),ex=x+vx*len/2,ey=y-vy*len/2;
   ctx.beginPath();ctx.moveTo(x-vx*len/2,y+vy*len/2);ctx.lineTo(ex,ey);
   ctx.moveTo(ex-5*vx-3*vy,ey+5*vy-3*vx);ctx.lineTo(ex,ey);
   ctx.lineTo(ex-5*vx+3*vy,ey+5*vy+3*vx);ctx.stroke();
  }
  ctx.restore();
 }
};
