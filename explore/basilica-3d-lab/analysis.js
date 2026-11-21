'use strict';
/* Paired Julia-plane view and independently sampled radius convergence diagnostics. */
(()=>{
 const plane=document.getElementById('slice2d'),pc=plane.getContext('2d');
 const chart=document.getElementById('hist'),hc=chart.getContext('2d');
 const metrics=document.getElementById('metrics');
 let run=0;
 function inside(x,y,it,re,im){
   let a=x,b=y;
   for(let n=0;n<it;n++){
     const aa=a*a-b*b+re,bb=2*a*b+im;
     a=aa;b=bb;
     if(a*a+b*b>64)return false;
   }
   return true;
 }
 function drawPlane(it,re,im){
   const w=plane.width,h=plane.height,imdata=pc.createImageData(w,h),d=imdata.data;
   // Same horizontal range as the 3D reconstruction, vertically symmetric display.
   for(let y=0;y<h;y++){
     const yy=(.5-y/(h-1))*2.56;
     for(let x=0;x<w;x++){
       const xx=-1.62+x/(w-1)*2.82;
       const on=inside(xx,yy,it,re,im),k=4*(y*w+x);
       d[k]=on?176:9;d[k+1]=on?115:17;d[k+2]=on?231:35;d[k+3]=255;
     }
   }
   pc.putImageData(imdata,0,0);
   pc.strokeStyle='rgba(255,255,255,.25)';pc.lineWidth=1;
   const axisY=h/2,axisX=(1.62/2.82)*(w-1);
   pc.beginPath();pc.moveTo(0,axisY);pc.lineTo(w,axisY);pc.moveTo(axisX,0);pc.lineTo(axisX,h);pc.stroke();
 }
 function coarseProfile(m,it,re,im){
   const ny=Math.round(m*.85),arr=[];
   for(let i=0;i<=m;i++){
     const x=-1.62+i*2.82/m;
     let outer=0;
     for(let j=0;j<=ny;j++){
       const y=1.28*j/ny;
       if(inside(x,y,it,re,im))outer=y;
     }
     arr.push(outer);
   }
   return arr;
 }
 function cdfDiff(a,b){
   const sortedA=[...a].sort((x,y)=>x-y),sortedB=[...b].sort((x,y)=>x-y);
   let i=0,j=0,max=0;
   while(i<sortedA.length||j<sortedB.length){
     const v=Math.min(i<sortedA.length?sortedA[i]:Infinity,j<sortedB.length?sortedB[j]:Infinity);
     while(i<sortedA.length&&sortedA[i]<=v)i++;
     while(j<sortedB.length&&sortedB[j]<=v)j++;
     max=Math.max(max,Math.abs(i/sortedA.length-j/sortedB.length));
   }
   return max;
 }
 function drawHistogram(a,b){
   const w=chart.width,h=chart.height,pad=35,bins=24,limit=1.28;
   const hist=(arr)=>{const out=new Array(bins).fill(0);for(const v of arr)out[Math.min(bins-1,Math.floor(v/limit*bins))]++;return out.map(x=>x/arr.length)};
   const aa=hist(a),bb=hist(b),peak=Math.max(.01,...aa,...bb);
   hc.clearRect(0,0,w,h);hc.fillStyle='#080e1b';hc.fillRect(0,0,w,h);
   hc.strokeStyle='#52627c';hc.beginPath();hc.moveTo(pad,12);hc.lineTo(pad,h-pad);hc.lineTo(w-8,h-pad);hc.stroke();
   const bw=(w-pad-12)/bins;
   for(let k=0;k<bins;k++){
     const x=pad+k*bw,full=aa[k]/peak*(h-pad-24),coarse=bb[k]/peak*(h-pad-24);
     hc.fillStyle='rgba(125,174,250,.7)';hc.fillRect(x,h-pad-full,bw*.72,full);
     hc.fillStyle='rgba(245,159,193,.75)';hc.fillRect(x+bw*.52,h-pad-coarse,bw*.42,coarse);
   }
   hc.fillStyle='#c5d1e7';hc.font='12px system-ui';
   hc.fillText('0',pad-4,h-13);hc.fillText('Radius r',w-62,h-13);
   hc.fillStyle='#7daefa';hc.fillRect(pad+3,14,11,8);hc.fillStyle='#c5d1e7';hc.fillText('Current',pad+18,23);
   hc.fillStyle='#f59fc1';hc.fillRect(pad+102,14,11,8);hc.fillStyle='#c5d1e7';hc.fillText('Half resolution',pad+117,23);
 }
 window.updateJuliaAnalysis=()=>{
   const id=++run,it=Number(document.getElementById('iter').value),re=cParam,im=imParam;
   const fine=profile.slice(),m=nx;
   metrics.textContent='Computing 2D view and independent half-resolution profile…';
   setTimeout(()=>{
     if(id!==run)return;
     drawPlane(it,re,im);
     const coarse=coarseProfile(Math.max(8,Math.floor(m/2)),it,re,im);
     if(id!==run)return;
     drawHistogram(fine,coarse);
     const mean=fine.reduce((a,b)=>a+b,0)/fine.length;
     const variance=fine.reduce((a,b)=>a+(b-mean)**2,0)/fine.length;
     const variation=fine.slice(1).reduce((a,b,i)=>a+Math.abs(b-fine[i]),0);
     const D=cdfDiff(fine,coarse);
     const levels=new Set(fine.map(v=>v.toFixed(8))).size;
     metrics.textContent='Resolution: '+m+' vs '+Math.floor(m/2)+' · Iterations: '+it+
       ' | Mean radius: '+mean.toFixed(4)+' · SD: '+Math.sqrt(variance).toFixed(4)+
       ' | Distinct sampled levels: '+levels+' · Profile variation: '+variation.toFixed(3)+
       ' | CDF distance D: '+D.toFixed(4);
   },30);
 };
})();