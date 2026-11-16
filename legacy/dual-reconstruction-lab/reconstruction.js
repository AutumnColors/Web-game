
'use strict';
(()=>{
const style=document.createElement('style');
style.textContent='#dualPanel{position:fixed;inset:0;background:#0b1423;color:white;z-index:200;overflow:auto;padding:18px;font:14px system-ui;display:none}#dualPanel.open{display:block}#dualPanel button,#dualPanel select{padding:9px;background:#203047;color:white;border:1px solid #678;border-radius:8px}#dualPanel canvas{width:100%;aspect-ratio:1;background:#060c15}#dualPanel .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}#dualPanel article{padding:10px;border:1px solid #456;border-radius:12px}#dualOpen{position:fixed;right:12px;bottom:75px;z-index:80;background:#12344c;color:white;border:1px solid cyan;border-radius:22px;padding:12px}';
document.head.append(style);
const button=document.createElement('button');button.id='dualOpen';button.textContent='∥ Dual Reconstruction';document.body.append(button);
const root=document.createElement('div');root.id='dualPanel';root.innerHTML='<h2>Fractal Universe Lab ∥ Dual Reconstruction</h2><p>Independent Cartesian reconstructions from f(z)=z²+c. No Böttcher coordinates or shared boundary masks.</p><p><button id="dualClose">Back to lab</button> <select id="dualC"><option value="0">Circle c=0</option><option value="-1">Basilica c=−1</option></select> <select id="dualN"><option>256</option><option selected>512</option></select> <select id="dualIter"><option>32</option><option selected>64</option><option>128</option></select> <button id="dualRun">Run</button> <button id="dualExport" disabled>Export data and images</button></p><p id="dualStatus">Ready</p><div class="grid"><article><h3>A · Green potential</h3><canvas id="dualA"></canvas></article><article><h3>B · Spherical derivative</h3><canvas id="dualB"></canvas></article><article><h3>Comparison · Cyan / Violet</h3><canvas id="dualCompare"></canvas></article></div><pre id="dualMetrics"></pre><p>Derivative reconstruction is a finite-iteration ridge heuristic, not a proven boundary detector. Both algorithms use the same initial points but different observables.</p>';
document.body.append(root);
const $d=id=>document.getElementById(id);button.onclick=()=>root.classList.add('open');$d('dualClose').onclick=()=>root.classList.remove('open');
let data=null;
function calculate(){
 const N=+$d('dualN').value,K=+$d('dualIter').value,c=+$d('dualC').value,width=c===0?3.2:4.2;
 const G=new Float32Array(N*N),Q=new Float32Array(N*N),A=new Uint8Array(N*N),B=new Uint8Array(N*N);
 const depths=[8,16,32,64,128].filter(n=>n<=K),step=width/N;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const i=y*N+x,x0=(x+.5-N/2)*step,y0=(N/2-y-.5)*step;
  let zr=x0,zi=y0,dr=1,di=0,g=0,q=-1000,escaped=false;
  for(let n=1;n<=K;n++){
   const ndR=2*(zr*dr-zi*di),ndI=2*(zr*di+zi*dr),nzR=zr*zr-zi*zi+c,nzI=2*zr*zi;
   zr=nzR;zi=nzI;dr=ndR;di=ndI;
   const zz=zr*zr+zi*zi,dd=dr*dr+di*di;
   if(depths.includes(n)&&Number.isFinite(zz)&&Number.isFinite(dd))q=Math.max(q,.5*Math.log(Math.max(dd,1e-300))+Math.log1p(x0*x0+y0*y0)-Math.log1p(zz));
   if(!escaped&&zz>256){g=Math.pow(2,-n)*Math.log(Math.sqrt(zz));escaped=true;}
   if(!Number.isFinite(zz)||!Number.isFinite(dd))break;
  }
  G[i]=g;Q[i]=q;
 }
 const threshold=Math.max(1e-9,step*.2);
 for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){
  const i=y*N+x,inside=G[i]<=threshold;
  A[i]=[i-1,i+1,i-N,i+N].some(j=>(G[j]<=threshold)!==inside)?1:0;
  if(Q[i]<Math.log(8))continue;
  let greater=false,strict=false;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;
   const v=Q[i+dy*N+x+dx];if(v>Q[i]+.03)greater=true;if(Q[i]>v+.03)strict=true;
  }
  B[i]=!greater&&strict?1:0;
 }
 return {N,K,c,width,G,Q,A,B,threshold};
}
function paint(id,mode,r){
 const cv=$d(id);cv.width=cv.height=r.N;const ctx=cv.getContext('2d'),img=ctx.createImageData(r.N,r.N),a=img.data;
 for(let i=0;i<r.N*r.N;i++){
  let red=5,green=12,blue=23;
  if(mode==='A'){const v=Math.min(1,Math.log1p(r.G[i]*400)/6);red=10+v*30;green=20+v*130;blue=35+v*180;if(r.A[i]){red=40;green=235;blue=250;}}
  if(mode==='B'){const v=Math.max(0,Math.min(1,(r.Q[i]+2)/14));red=20+v*160;green=10+v*70;blue=30+v*190;if(r.B[i]){red=220;green=150;blue=255;}}
  if(mode==='C'){if(r.A[i]){red=20;green=235;blue=250;}if(r.B[i]){red=195;green=90;blue=240;}if(r.A[i]&&r.B[i]){red=255;green=255;blue=255;}}
  a[4*i]=red;a[4*i+1]=green;a[4*i+2]=blue;a[4*i+3]=255;
 }
 ctx.putImageData(img,0,0);
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$d('dualRun').onclick=()=>{
 $d('dualStatus').textContent='Calculating…';$d('dualRun').disabled=true;
 setTimeout(()=>{
  try{
   data=calculate();paint('dualA','A',data);paint('dualB','B',data);paint('dualCompare','C',data);
   const count=a=>a.reduce((s,v)=>s+v,0);
   $d('dualMetrics').textContent='Green boundary pixels: '+count(data.A)+' | Derivative ridge pixels: '+count(data.B)+'\nGrid: '+data.N+' × '+data.N+' | iterations: '+data.K+' | width: '+data.width+'\nGreen threshold: '+data.threshold.toPrecision(4)+' | derivative ridge: Q ≥ ln(8)';
   $d('dualStatus').textContent='Completed';$d('dualExport').disabled=false;
  }catch(e){$d('dualStatus').textContent='Error: '+e.message;}
  $d('dualRun').disabled=false;
 },40);
};
$d('dualExport').onclick=()=>{
 if(!data)return;const r=data,tag='dual-reconstruction-'+Date.now();
 const meta={experiment:'dual-reconstruction-v1',parameter:{re:r.c,im:0,p:2},grid:{size:r.N,width:r.width,center:[0,0]},iterations:r.K,green:{escapeRadius:16,threshold:r.threshold},derivative:{depths:[8,16,32,64,128].filter(n=>n<=r.K),ridgeThreshold:'ln(8)',localTolerance:0.03},warning:'Derivative ridge is a heuristic estimator, not a proven reconstruction'};
 download(new Blob([JSON.stringify(meta,null,2)],{type:'application/json'}),tag+'.json');
 const rows=['x,y,G,max_log_spherical_derivative,green_boundary,derivative_ridge'];
 for(let y=0;y<r.N;y++)for(let x=0;x<r.N;x++){const i=y*r.N+x;rows.push([(x+.5-r.N/2)*r.width/r.N,(r.N/2-y-.5)*r.width/r.N,r.G[i],r.Q[i],r.A[i],r.B[i]].join(','));}
 download(new Blob([rows.join('\n')],{type:'text/csv'}),tag+'.csv');
 for(const id of ['dualA','dualB','dualCompare'])$d(id).toBlob(b=>{if(b)download(b,tag+'-'+id+'.png');});
};
})();
