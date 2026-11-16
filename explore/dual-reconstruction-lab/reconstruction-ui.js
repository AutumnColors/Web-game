 'use strict';
(()=>{
 const style=document.createElement('style');style.textContent='#dualOpenV2{position:fixed;right:12px;bottom:76px;z-index:80;background:#16344b;color:white;border:1px solid #67e8f9;border-radius:22px;padding:12px}#dualV2{position:fixed;inset:0;z-index:250;overflow:auto;background:#080f1d;color:#e5edf9;padding:16px;font:14px system-ui;display:none}#dualV2.open{display:block}#dualV2 button,#dualV2 select{padding:8px;background:#1b3046;color:white;border:1px solid #62758c;border-radius:8px}#dualV2 .controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}#dualV2 .panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:12px}#dualV2 article{border:1px solid #34465f;border-radius:12px;padding:10px;background:#101d30}#dualV2 canvas{width:100%;aspect-ratio:1;image-rendering:pixelated;background:#050b13}#dualV2 small{color:#afc0d2}#dualV2 pre{white-space:pre-wrap;line-height:1.7}';document.head.append(style);
 const open=document.createElement('button');open.id='dualOpenV2';open.textContent='∥ Reconstruction';document.body.append(open);
 const root=document.createElement('section');root.id='dualV2';root.innerHTML='<div class="controls"><h2>∥ Dual Reconstruction · Convergence v2</h2><button id="dvClose">Back to lab</button></div><small>Independent Julia estimators. Derivative response uses no Green field or escape count. All depth layers are computed once in a worker.</small><div class="controls"><label>Julia <select id="dvC"><option value="0">Circle c=0</option><option value="-1" selected>Basilica c=−1</option></select></label><label>Resolution <select id="dvSize"><option>256</option><option selected>512</option><option>1024</option></select></label><label>Max depth <select id="dvMax"><option>32</option><option>64</option><option selected>128</option></select></label><button id="dvRun">Run all depths</button><button id="dvCancel" disabled>Cancel</button><button id="dvExport" disabled>Export results</button><button id="dvCopy" disabled>Copy current result</button><button id="dvCopyAll">Copy all experiments</button></div><div class="controls"><label>Depth <select id="dvDepth"></select></label><label>Response <select id="dvMode"><option value="M">Cumulative maximum</option><option value="Q">Instantaneous Q</option></select></label><label>Neighborhood <select id="dvRadius"><option value="2">2 px</option><option value="4" selected>4 px</option><option value="8">8 px</option></select></label><label>Threshold <select id="dvThreshold"><option value="1">Q ≥ 1</option><option value="2" selected>Q ≥ 2</option><option value="3">Q ≥ 3</option><option value="4">Q ≥ 4</option></select></label></div><p id="dvStatus">Ready</p><div class="panels"><article><b style="color:#67e8f9">A · Green boundary</b><canvas id="dvGreen"></canvas></article><article><b style="color:#d8b4fe">B · Derivative neighborhood response</b><canvas id="dvDerivative"></canvas></article><article><b>Comparison · Cyan / Purple</b><canvas id="dvOverlay"></canvas></article></div><article style="margin-top:12px"><b>Convergence metrics</b><pre id="dvStats">Run to calculate.</pre></article><small>Important: candidate response is not a proven Julia boundary criterion. Neighborhood radius is in pixels; refinement requires separate spatial-resolution runs. No thickness is artificially reduced with depth.</small>';document.body.append(root);
 const $=id=>document.getElementById(id);open.onclick=()=>root.classList.add('open');$('dvClose').onclick=()=>root.classList.remove('open');
 let worker=null,data=null,analyses=null,batchRunning=false;
 const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
 function neighborhood(field,N,r){const out=new Float32Array(field.length);
 // Separable sliding maximum; O(N²*r), fixed small radii.
 const temp=new Float32Array(field.length);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let m=-Infinity;for(let dx=-r;dx<=r;dx++){const xx=x+dx;if(xx>=0&&xx<N)m=Math.max(m,field[y*N+xx]);}temp[y*N+x]=m;}
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){let m=-Infinity;for(let dy=-r;dy<=r;dy++){const yy=y+dy;if(yy>=0&&yy<N)m=Math.max(m,temp[yy*N+x]);}out[y*N+x]=m;}
 return out;
 }
 function build(){
  const d=data,N=d.N,r=+$('dvRadius').value,threshold=+$('dvThreshold').value,mode=$('dvMode').value;
  const green=new Uint8Array(N*N),gth=Math.max(1e-9,d.width/N*.2);
  for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=y*N+x,inside=d.G[i]<=gth;green[i]=[i-1,i+1,i-N,i+N].some(j=>(d.G[j]<=gth)!==inside)?1:0;}
  const layers=d.depths.map((depth,k)=>{
   const raw=mode==='M'?d.M[k]:d.Q[k],response=neighborhood(raw,N,r),mask=new Uint8Array(N*N);
   for(let i=0;i<N*N;i++)if(response[i]>=threshold)mask[i]=1;
   return {depth,raw,response,mask};
  });
  return {green,layers,gth,r,threshold,mode};
 }
 function counts(mask){let n=0;for(const v of mask)n+=v;return n;}

 function dilate3(mask,N){
  const stride=N+1,prefix=new Uint32Array(stride*stride),out=new Uint8Array(N*N);
  for(let y=0;y<N;y++){let row=0;for(let x=0;x<N;x++){row+=mask[y*N+x];prefix[(y+1)*stride+x+1]=prefix[y*stride+x+1]+row;}}
  for(let y=0;y<N;y++){const top=Math.max(0,y-3),bottom=Math.min(N,y+4);for(let x=0;x<N;x++){const left=Math.max(0,x-3),right=Math.min(N,x+4);out[y*N+x]=+(prefix[bottom*stride+right]-prefix[top*stride+right]-prefix[bottom*stride+left]+prefix[top*stride+left]>0);}}
  return out;
 }
 function evaluate(mask,green,d){
  const N=d.N,step=d.width/N,nearGreen=dilate3(green,N),nearMask=dilate3(mask,N);
  let hit=0,candidates=0,reference=0,cover=0,radialSum=0;
  const errors=[];
  for(let i=0;i<N*N;i++){
   if(green[i]){reference++;if(nearMask[i])cover++;}
   if(!mask[i])continue;
   candidates++;if(nearGreen[i])hit++;
   if(d.c===0){const x=i%N,y=Math.floor(i/N),xx=(x+.5-N/2)*step,yy=(N/2-y-.5)*step,err=Math.abs(Math.hypot(xx,yy)-1);errors.push(err);radialSum+=err;}
  }
  errors.sort((a,b)=>a-b);
  return {candidates,reference,coverage:cover/Math.max(1,reference),precision:hit/Math.max(1,candidates),falsePositive:(candidates-hit)/Math.max(1,candidates),meanCircleError:d.c===0?radialSum/Math.max(1,candidates):null,p95CircleError:d.c===0&&errors.length?errors[Math.floor(.95*(errors.length-1))]:null};
 }
 function paint(id,kind,d,a,layer){
  const N=d.N,cv=$(id);cv.width=cv.height=N;const ctx=cv.getContext('2d'),img=ctx.createImageData(N,N),v=img.data;
  for(let i=0;i<N*N;i++){
   let R=5,G=11,B=21;
   if(kind==='green'){const t=Math.min(1,Math.log1p(d.G[i]*500)/7);R=10+30*t;G=22+130*t;B=35+180*t;if(a.green[i]){R=30;G=230;B=245;}}
   if(kind==='derivative'){const q=layer.response[i],t=Number.isFinite(q)?Math.max(0,Math.min(1,(q+2)/12)):0;R=20+150*t;G=9+50*t;B=40+185*t;if(layer.mask[i]){R=204;G=130;B=250;}}
   if(kind==='overlay'){if(a.green[i]){R=20;G=225;B=245;}if(layer.mask[i]){R=160;G=90;B=235;}if(a.green[i]&&layer.mask[i]){R=255;G=255;B=255;}}
   v[i*4]=R;v[i*4+1]=G;v[i*4+2]=B;v[i*4+3]=255;
  }ctx.putImageData(img,0,0);
 }
 function refresh(){
  if(!data)return;analyses=build();const k=Math.max(0,data.depths.indexOf(+$('dvDepth').value)),layer=analyses.layers[k];
  paint('dvGreen','green',data,analyses,layer);paint('dvDerivative','derivative',data,analyses,layer);paint('dvOverlay','overlay',data,analyses,layer);
  const metrics=analyses.layers.map(l=>({depth:l.depth,...evaluate(l.mask,analyses.green,data)}));
  const selected=metrics[k],lines=metrics.map(m=>'N='+m.depth+' candidates='+m.candidates+' coverage='+ (m.coverage*100).toFixed(1)+'% near-boundary precision='+(m.precision*100).toFixed(1)+'%'+(m.meanCircleError===null?'':' circle error='+m.meanCircleError.toFixed(4)));
  $('dvStats').textContent='Current N='+selected.depth+'; green boundary pixels='+counts(analyses.green)+'\n'+lines.join('\n')+'\nDistances use 3-pixel tolerance; circle errors are in complex-plane units.\nA high coverage with low precision means thick or excessive candidate regions.';
 }
 $('dvRun').onclick=()=>{
  if(worker)worker.terminate();data=null;analyses=null;
  const N=+$('dvSize').value,K=+$('dvMax').value,c=+$('dvC').value,depths=[8,16,32,64,128].filter(n=>n<=K),width=c===0?3.2:4.2;
  $('dvRun').disabled=true;$('dvCancel').disabled=false;$('dvExport').disabled=true;$('dvCopy').disabled=true;$('dvStatus').textContent='Worker computing…';
  worker=new Worker('reconstruction-worker.js');
  worker.onmessage=e=>{
   if(!e.data.done){$('dvStatus').textContent='Worker '+Math.round(e.data.progress*100)+'%';return;}
   data=e.data;worker.terminate();worker=null;$('dvRun').disabled=false;$('dvCancel').disabled=true;$('dvExport').disabled=false;$('dvCopy').disabled=false;
   $('dvDepth').innerHTML=data.depths.map(n=>'<option value="'+n+'">'+n+'</option>').join('');$('dvDepth').value=String(data.depths[data.depths.length-1]);
   $('dvStatus').textContent='Completed '+N+'×'+N+' at depths '+depths.join(', ');refresh();
  };
  worker.onerror=e=>{$('dvStatus').textContent='Worker error: '+e.message;$('dvRun').disabled=false;$('dvCancel').disabled=true;};
  worker.postMessage({size:N,maxIter:K,c,width,depths});
 };
 $('dvCancel').onclick=()=>{if(worker){worker.terminate();worker=null;}$('dvRun').disabled=false;$('dvCancel').disabled=true;$('dvStatus').textContent='Cancelled';};
 for(const id of ['dvDepth','dvMode','dvRadius','dvThreshold'])$(id).onchange=refresh;

 function snapshot(){
  if(!data||!analyses)return null;
  const k=Math.max(0,data.depths.indexOf(+$('dvDepth').value));
  const selected=analyses.layers[k],m=evaluate(selected.mask,analyses.green,data);
  return {format:'dual-reconstruction-copy-v1',parameter:{c:data.c,p:2},grid:{resolution:data.N,width:data.width,center:[0,0]},iterations:selected.depth,maximumIterations:data.K,detector:{response:analyses.mode,neighborhoodRadiusPixels:analyses.r,threshold:analyses.threshold},greenBoundaryPixels:counts(analyses.green),measurements:m,interpretation:'Finite spherical-derivative neighborhood candidate; not a certified Julia boundary'};
 }
 async function copyReport(report){
  const value=JSON.stringify(report,null,2);
  try{await navigator.clipboard.writeText(value);$('dvStatus').textContent='Copied '+value.length.toLocaleString()+' characters. Paste into ChatGPT.';}
  catch(err){
   // Mobile browser fallback: allow manual selection/copy.
   let box=$('dvCopyFallback');
   if(!box){box=document.createElement('textarea');box.id='dvCopyFallback';box.style.cssText='display:block;width:100%;height:180px;background:#12243a;color:white';root.append(box);}
   box.value=value;box.focus();box.select();$('dvStatus').textContent='Clipboard access blocked. The report is selected below; use Copy.';
  }
 }
 $('dvCopy').onclick=()=>{const report=snapshot();if(report)copyReport(report);};
 function runBatchWorker(c,N,K){
  return new Promise((resolve,reject)=>{
   const depths=[8,16,32,64,128].filter(n=>n<=K),width=c===0?3.2:4.2;
   const w=new Worker('reconstruction-worker.js');worker=w;
   w.onmessage=e=>{
    if(!e.data.done){$('dvStatus').textContent='Batch '+(c===0?'circle':'Basilica')+' '+Math.round(e.data.progress*100)+'%';return;}
    w.terminate();if(worker===w)worker=null;resolve(e.data);
   };
   w.onerror=e=>{w.terminate();if(worker===w)worker=null;reject(new Error(e.message));};
   w.postMessage({size:N,maxIter:K,c,width,depths});
  });
 }
 $('dvCopyAll').onclick=async()=>{
  if(batchRunning)return;
  if(worker){$('dvStatus').textContent='Finish or cancel the current run first.';return;}
  batchRunning=true;$('dvCopyAll').disabled=true;$('dvRun').disabled=true;
  const N=+$('dvSize').value,K=+$('dvMax').value;
  const report={format:'dual-reconstruction-batch-v1',createdAt:new Date().toISOString(),source:'AutumnColors/Web-game/explore/dual-reconstruction-lab',configuration:{resolution:N,maxIterations:K,parameters:[0,-1],responses:['M','Q'],radiiPixels:[2,4,8],thresholds:[1,2,3,4],boundaryTolerancePixels:3},description:'Full grid of finite spherical-derivative candidate comparisons. All parameter combinations evaluated without tuning to the Green result.',runs:[]};
  try{
   for(const c of [0,-1]){
    const d=await runBatchWorker(c,N,K);
    const green=new Uint8Array(d.N*d.N),gth=Math.max(1e-9,d.width/d.N*.2);
    for(let y=1;y<d.N-1;y++)for(let x=1;x<d.N-1;x++){
     const i=y*d.N+x,inside=d.G[i]<=gth;
     green[i]=[i-1,i+1,i-d.N,i+d.N].some(j=>(d.G[j]<=gth)!==inside)?1:0;
    }
    const run={c,grid:{size:d.N,width:d.width},greenBoundaryPixels:counts(green),results:[]};
    for(const mode of ['M','Q']){
     for(const radius of [2,4,8]){
      for(let k=0;k<d.depths.length;k++){
       const response=neighborhood(mode==='M'?d.M[k]:d.Q[k],d.N,radius);
       for(const threshold of [1,2,3,4]){
        const mask=new Uint8Array(d.N*d.N);
        for(let i=0;i<mask.length;i++)if(response[i]>=threshold)mask[i]=1;
        run.results.push({depth:d.depths[k],response:mode,radiusPixels:radius,threshold,...evaluate(mask,green,d)});
       }
      }
     }
    }
    report.runs.push(run);
   }
   report.summary={cases:report.runs.reduce((sum,r)=>sum+r.results.length,0),note:'Compare coverage AND near-boundary precision; no inference of convergence from a single depth.'};
   await copyReport(report);
  }catch(err){$('dvStatus').textContent='Batch failed: '+err.message;}
  finally{batchRunning=false;$('dvCopyAll').disabled=false;$('dvRun').disabled=false;}
 };

 $('dvExport').onclick=()=>{
  if(!data)return;const d=data,a=analyses,tag='dual-convergence-'+Date.now(),manifest={experiment:'dual-reconstruction-convergence-v2',parameter:{c:d.c,p:2},grid:{N:d.N,width:d.width,center:[0,0]},depths:d.depths,green:{escapeRadius:256,threshold:a.gth},derivative:{response:a.mode,neighborhoodRadiusPixels:a.r,threshold:a.threshold},note:'Finite-iteration derivative candidates are heuristic, not certified Julia boundaries.',metrics:a.layers.map(l=>({depth:l.depth,...evaluate(l.mask,a.green,d)}))};
  download(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),tag+'-manifest.json');
  const rows=['x,y,G,green_boundary,depth,Q,M,response,candidate'];
  for(let y=0;y<d.N;y++)for(let x=0;x<d.N;x++){const i=y*d.N+x,xx=(x+.5-d.N/2)*d.width/d.N,yy=(d.N/2-y-.5)*d.width/d.N;for(let k=0;k<d.depths.length;k++)rows.push([xx,yy,d.G[i],a.green[i],d.depths[k],d.Q[k][i],d.M[k][i],a.layers[k].response[i],a.layers[k].mask[i]].join(','));}
  download(new Blob([rows.join('\n')],{type:'text/csv'}),tag+'-fields.csv');
  for(const id of ['dvGreen','dvDerivative','dvOverlay'])$(id).toBlob(b=>{if(b)download(b,tag+'-'+id+'.png');});
 };
})();