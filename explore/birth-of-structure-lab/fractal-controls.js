'use strict';
function mountFractalControls(root,close){
 const next=clone(cfg),family=cfg.fractal,geo=isGeometry(family),busy=()=>!!(window.birthExpeditionActive?.()||window.birthRecordingActive?.());
 const title=document.createElement('b');title.textContent=eng.name;root.append(title);
 const note=document.createElement('p');note.className='note';note.textContent='Change the mathematical construction without moving the camera. Apply when ready.';root.append(note);
 const form=document.createElement('div');form.style.cssText='display:grid;gap:12px';root.append(form);
 const addRange=(label,key,min,max,step,value)=>{const row=document.createElement('label'),out=document.createElement('output'),input=document.createElement('input');row.style.cssText='display:grid;gap:5px;font-size:13px';out.style.float='right';input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.style.cssText='width:100%;accent-color:#a0c9bd';out.textContent=String(value);row.append(document.createTextNode(label),out,input);input.setAttribute('aria-label',label);input.oninput=()=>{next[key]=+input.value;out.textContent=input.value;};form.append(row);};
 const addSelect=(label,key,values,value)=>{const row=document.createElement('label'),input=document.createElement('select');row.style.cssText='display:grid;gap:5px;font-size:13px';input.style.cssText='width:100%;background:#18232d;color:#fff;padding:8px;border:1px solid #66738c;border-radius:8px';for(const [v,t] of values){const opt=document.createElement('option');opt.value=v;opt.textContent=t;input.append(opt);}input.value=String(value);input.setAttribute('aria-label',label);input.onchange=()=>next[key]=+input.value;row.append(label,input);form.append(row);};
 const addButton=(label,fn)=>{const b=document.createElement('button');b.className='opt';b.type='button';b.textContent=label;b.onclick=fn;root.append(b);return b;};
 let seedInput;
 if(geo){const g=GEOMETRIC[family];addRange('Construction depth','geometryDepth',1,g.max,1,geometryDepth(next));for(const d of GEOMETRY_CONTROLS[family])addRange(d.label,d.key,d.min,d.max,d.step,geometryParameters(next)[d.key]);}
 else {
  if(family==='julia'){addSelect('Exponent','juliaPower',[...new Set([...JULIA_EXPONENTS,next.juliaPower])].map(v=>[v,juliaPowerLabel(v)]),next.juliaPower);const row=document.createElement('label');row.style.cssText='display:grid;gap:5px;font-size:13px';seedInput=document.createElement('input');seedInput.type='text';seedInput.setAttribute('aria-label','Julia parameter c');seedInput.value=cText(next.seed.re,next.seed.im,15).replace(/−/g,'-');seedInput.style.cssText='width:100%;background:#18232d;color:#fff;padding:8px;border:1px solid #66738c;border-radius:8px';row.append('Julia parameter c',seedInput);form.append(row);}
  if(family==='multibrot')addSelect('Polynomial degree','power',[3,4,5,6,7,8].map(v=>[v,String(v)]),next.power);
  if(family==='mandelbrot')note.textContent='The quadratic Mandelbrot rule is fixed. These controls change the finite-orbit calculation, not the mathematical set.';
  const iterations=[0,100,250,500,1000,2000,4000,8000,16000,40000];if(!iterations.includes(next.iter))iterations.push(next.iter);iterations.sort((a,b)=>a-b);
  addSelect('Iteration limit','iter',iterations.map(v=>[v,v===0?'Auto':String(v)]),next.iter);
  const radii=[.5,1,2,4,8,16,32,256];if(!radii.includes(next.radius))radii.push(next.radius);radii.sort((a,b)=>a-b);
  addSelect('Stopping radius','radius',radii.map(v=>[v,String(v)]),next.radius);
 }
 const msg=document.createElement('p');msg.className='note';msg.setAttribute('role','status');root.append(msg);
 addButton('Apply changes',()=>{if(busy()){msg.textContent='Stop the active expedition or recording first.';return;}if(cfg.fractal!==family){msg.textContent='Fractal changed; reopen this panel.';return;}if(seedInput){const c=parseC(seedInput.value);if(!c){msg.textContent='Enter a valid complex parameter c.';return;}next.seed=c;}if(geo)Object.assign(next,geometryParameters(next));const keep={...view};window.FractalLab.apply(next,keep);window.birthClearInitialCheckpoint?.();close();});
 addButton('Reset fractal controls',()=>{if(busy()){msg.textContent='Stop the active expedition or recording first.';return;}if(cfg.fractal!==family){msg.textContent='Fractal changed; reopen this panel.';return;}const reset=clone(cfg);if(geo){reset.geometryDepth=0;for(const d of GEOMETRY_CONTROLS[family])reset[d.key]=d.value;}else{reset.iter=DEFAULTS.iter;reset.radius=DEFAULTS.radius;if(family==='julia'){reset.juliaPower=DEFAULTS.juliaPower;reset.seed={...DEFAULTS.seed};}if(family==='multibrot')reset.power=DEFAULTS.power;}window.FractalLab.apply(reset,{...view});window.birthClearInitialCheckpoint?.();close();});
 addButton('Choose another fractal',()=>{if(busy()){msg.textContent='Stop the active expedition or recording first.';return;}close();openCfg();});
}
