 'use strict';
self.onmessage=function(e){
 const p=e.data,N=p.size,K=p.maxIter,width=p.width,c=p.c,depths=p.depths;
 const total=N*N,step=width/N, G=new Float32Array(total), Q=depths.map(()=>new Float32Array(total)), M=depths.map(()=>new Float32Array(total)),invalid=new Uint8Array(total);
 const depthIndex=new Map(depths.map((n,i)=>[n,i]));
 for(let y=0;y<N;y++){
  for(let x=0;x<N;x++){
   const i=y*N+x,z0r=(x+.5-N/2)*step,z0i=(N/2-y-.5)*step;
   let zr=z0r,zi=z0i,logD=0,escaped=false,maxQ=-Infinity,dead=false;
   for(let n=1;n<=K;n++){
    const r=Math.hypot(zr,zi);
    if(r===0){logD=-Infinity;}else if(logD!==-Infinity){logD+=Math.log(2)+Math.log(r);}
    const nr=zr*zr-zi*zi+c,ni=2*zr*zi;
    zr=nr;zi=ni;
    const r2=Math.hypot(zr,zi);
    if(!escaped&&r2>256&&Number.isFinite(r2)){G[i]=Math.pow(2,-n)*Math.log(r2);escaped=true;}
    if(!Number.isFinite(r2)){
     dead=true; // Subsequent spherical derivatives tend to zero for escaping polynomial orbits.
     for(let k=0;k<depths.length;k++)if(depths[k]>=n){Q[k][i]=-Infinity;M[k][i]=maxQ;}
     break;
    }
    const q=logD+Math.log1p(z0r*z0r+z0i*z0i)-Math.log1p(r2*r2);
    if(Number.isFinite(q))maxQ=Math.max(maxQ,q);
    const k=depthIndex.get(n);if(k!==undefined){Q[k][i]=q;M[k][i]=maxQ;}
   }
   if(!dead&&!escaped)G[i]=0;
   if(dead&& !escaped)invalid[i]=1;
  }
  if(y%16===0)self.postMessage({progress:y/N});
 }
 const payload={done:true,N,K,width,c,depths,G,Q,M,invalid};
 self.postMessage(payload,[G.buffer,invalid.buffer,...Q.map(a=>a.buffer),...M.map(a=>a.buffer)]);
};