const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
test('mobile toolbar shell and panel lifecycle',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});
 await page.waitForSelector('#tools.unified-tools',{state:'attached'});
 const buttons=page.locator('#tools.unified-tools > button');
 assert.equal(await buttons.count(),7);
 assert.equal(await page.evaluate(()=>window.birthCameraOrientation()),'portrait');
 assert.deepEqual(await buttons.evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label'))),['Picture','Expedition','Layers','Fractal controls','Current layer','Navigation','Tools']);
 assert.equal(await page.locator('[data-expedition]').count(),6);
 await page.locator('[data-expedition=birth]').click();
 assert.equal(await page.getByRole('button',{name:'Choose / generate starting cycle'}).isVisible(),false);
 await page.locator('[data-expedition=complete]').click();
 assert.equal(await page.getByRole('button',{name:'Choose / generate starting cycle'}).isVisible(),true);
 await page.evaluate(()=>{document.querySelector('#cfg')?.classList.remove('on');document.body.classList.remove('clean');});
 await buttons.nth(2).click();
 assert.equal(await page.locator('#unified-panel').isVisible(),true);
 await buttons.nth(6).click();
 assert.equal(await page.locator('#unified-panel').isVisible(),true);
 assert.equal(await page.locator('#unified-panel strong').textContent(),'Tools');
 await buttons.nth(6).click();
 assert.equal(await page.locator('#unified-panel').isVisible(),false);
 const bounds=await buttons.evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};}));
 for(const b of bounds)assert.ok(b.top>=0&&b.bottom<=844&&b.left>=0&&b.right<=390);
 for(let i=1;i<bounds.length;i++)assert.ok(bounds[i].top>=bounds[i-1].bottom);
 await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:-1.4011551890920506,im:0}},{...F.view});window.birthSelectExpedition('accumulation');if(!window.birthSaveInitialCheckpoint({zoom:6.264548,interval:12}))throw Error('checkpoint save failed');});
 const cp=await page.evaluate(()=>window.birthGetInitialCheckpoint());
 await page.evaluate(()=>{const F=window.FractalLab;F.apply(F.clone(F.cfg),{...F.view,w:F.view.w*.7});});
 assert.deepEqual(await page.evaluate(()=>window.birthGetInitialCheckpoint()),cp);
 await buttons.nth(1).click();
 await page.getByRole('button',{name:'Preview expedition',exact:true}).click();
 await page.waitForFunction(()=>{const s=window.birthExpeditionStatus?.();return s?.stage==='running'&&s.step>2;},{},{timeout:60000});
 const current=()=>page.evaluate(()=>({seed:window.FractalLab.cfg.seed,w:window.FractalLab.view.w}));
 let v=await current();assert.deepEqual(v.seed,cp.mathematics.c);assert.ok(v.w<cp.viewer.camera.w);
 const pause=async()=>{await page.evaluate(()=>{const c=window.FractalLab.canvas;for(let i=0;i<2;i++)c.dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,bubbles:true,cancelable:true}));});await page.getByRole('button',{name:'Continue',exact:true}).waitFor({state:'visible'});};
 await pause();let step=await page.evaluate(()=>window.birthExpeditionStatus().step);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.birthExpeditionStatus().step),step);
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.waitForFunction(n=>window.birthExpeditionStatus().step>n,step);
 await pause();await page.getByRole('button',{name:'Restart expedition',exact:true}).click();
 await page.waitForFunction(()=>window.birthExpeditionStatus().stage==='running');
 assert.deepEqual((await current()).seed,cp.mathematics.c);
 assert.deepEqual(await page.evaluate(()=>window.birthGetInitialCheckpoint()),cp);
 await pause();await page.getByRole('button',{name:'Stop expedition',exact:true}).click();
 await page.waitForFunction(()=>window.birthExpeditionStatus().stage==='idle');
 assert.deepEqual(await page.evaluate(()=>window.birthGetInitialCheckpoint()),cp);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('desktop camera orientation, live layer, capture and return',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});
 await page.waitForSelector('#tools.unified-tools',{state:'attached'});
 assert.equal(await page.evaluate(()=>window.birthCameraOrientation()),'landscape');
 await page.locator('[data-expedition=birth]').click();
 await page.locator('#useCfg').click();
 await page.waitForFunction(()=>!document.querySelector('#cfg').classList.contains('on'));
 await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:-1.4011551890920506,im:0},mode:'escape'},{cx:0,cy:0,w:3.6,a:0});window.birthSelectExpedition('accumulation');if(!window.birthSaveInitialCheckpoint({zoom:6.264548,interval:12}))throw Error('checkpoint save failed');});
 await page.getByRole('button',{name:'Layers',exact:true}).click();
 await page.getByRole('button',{name:'Orbit sensitivity',exact:true}).click();
 await page.getByRole('button',{name:'Expedition',exact:true}).click();
 await page.getByRole('button',{name:'Preview expedition',exact:true}).click();
 try { await page.waitForFunction(()=>{const s=window.birthExpeditionStatus();return s.stage==='running'&&s.step>2;},{},{timeout:60000}); } catch (error) { console.error('Expedition timeout diagnostics:', JSON.stringify(await page.evaluate(()=>({status:window.birthExpeditionStatus(),settled:window.FractalLab.settled(),config:window.FractalLab.cfg,camera:window.FractalLab.view,preview:window.birthPreviewQuality,checkpoint:window.birthGetInitialCheckpoint()}))), 'page errors:', errors); throw error; }
 assert.equal(await page.evaluate(()=>window.FractalLab.cfg.mode),'sens');
 const bounds=await page.locator('#c').boundingBox();
 assert.ok(bounds.width>bounds.height&&Math.abs(bounds.width/bounds.height-(1+Math.sqrt(5))/2)<.03);
 assert.ok(bounds.y>=0&&bounds.x>=0&&bounds.x+bounds.width<=1281&&bounds.y+bounds.height<=801);
 const controls=page.locator('#desktop-expedition-actions');
 await controls.getByRole('button',{name:'Pause',exact:true}).click();
 await page.waitForFunction(()=>window.birthExpeditionStatus().stage==='paused');
 const picture=page.getByRole('button',{name:'Picture',exact:true});
 await picture.click();
 await page.waitForFunction(()=>document.querySelector('#cap').classList.contains('on')&&document.querySelector('#capImg').naturalWidth>0,{},{timeout:20000});
 assert.ok(await page.locator('#capImg').isVisible());
 assert.equal(await page.locator('#cap').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
 const png=page.waitForEvent('download');await page.locator('#capSave').click();assert.match((await png).suggestedFilename(),/\.png$/);if(await page.locator('#cap').isVisible())await page.locator('#capClose').click();
 await controls.getByRole('button',{name:'Continue',exact:true}).click();
 await page.waitForFunction(()=>window.birthExpeditionStatus().stage==='running');
 await page.getByRole('button',{name:'Back to expedition menu'}).click({trial:true});
 page.once('dialog',d=>d.dismiss());
 await page.getByRole('button',{name:'Back to expedition menu'}).click();
 assert.equal(await page.evaluate(()=>window.birthExpeditionStatus().stage),'running');
 page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Back to expedition menu'}).click();
 await page.waitForFunction(()=>document.querySelector('#cfg').classList.contains('on'));
 assert.equal(await page.evaluate(()=>window.birthHasInitialCheckpoint()),false);
 assert.equal(await page.evaluate(()=>window.birthExpeditionStatus().stage),'idle');
 await page.locator('[data-expedition=birth]').click();
 await page.locator('#useCfg').click();
 await page.waitForFunction(()=>!document.querySelector('#cfg').classList.contains('on'));
 await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:-1.4011551890920506,im:0},mode:'escape',iter:128},{cx:0,cy:0,w:3.6,a:0});window.birthSelectExpedition('accumulation');if(!window.birthSaveInitialCheckpoint({zoom:6.264548,interval:12}))throw Error('checkpoint save failed');});
 await page.getByRole('button',{name:'Expedition',exact:true}).click();
 await page.getByRole('button',{name:'Record expedition',exact:true}).click();
 await page.waitForFunction(()=>window.birthRecordingActive()&&/Recording · [1-9]/.test(document.querySelector('#birth-record-dock').textContent),{},{timeout:60000});
 await controls.getByRole('button',{name:'Stop',exact:true}).click();
 await page.waitForFunction(()=>!window.birthRecordingActive()&&window.birthExpeditionStatus().stage==='idle');
 const json=page.waitForEvent('download');await page.getByRole('link',{name:'Download JSON',exact:true}).click();
 const downloaded=await json;const record=JSON.parse(require('node:fs').readFileSync(await downloaded.path(),'utf8'));
 assert.ok(record.samples.length>0);
 const dimensions=await page.evaluate(async src=>{const im=new Image();im.src=src;await im.decode();return [im.naturalWidth,im.naturalHeight];},record.samples[0].image);
 assert.ok(dimensions[0]>dimensions[1]);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('coherence zoom settles and stays deterministic without escape events',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});
 await page.evaluate(()=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:17,seed:{re:0,im:0},mode:'coherence',iter:0,stopMode:'outward'},{cx:0,cy:0,w:.6,a:0});});
 await page.waitForFunction(()=>window.FractalLab.settled(),{},{timeout:60000});
 await page.evaluate(()=>{const F=window.FractalLab;F.apply(F.clone(F.cfg),{...F.view,w:F.view.w*.9});});
 await page.waitForFunction(()=>window.FractalLab.settled(),{},{timeout:60000});
 const snapshot=()=>page.evaluate(()=>({job:cur.id,iterations:cur.maxIt,budget:itFor(view.w),boost,dirty,queued:queue.filter(q=>q.tag==='main').length,complete:cur.passes.every(p=>p.left<=0),pixels:base.imgs[0].toDataURL()}));
 const first=await snapshot();assert.equal(first.iterations,first.budget);assert.ok(first.iterations<1000);assert.equal(first.dirty,false);assert.equal(first.queued,0);assert.equal(first.complete,true);assert.ok(first.pixels.length>1000);
 await page.waitForTimeout(2500);assert.deepEqual(await snapshot(),first);
 await page.evaluate(()=>{const F=window.FractalLab;F.apply(F.clone(F.cfg),{...F.view});});
 await page.waitForFunction(()=>window.FractalLab.settled(),{},{timeout:60000});
 const second=await snapshot();assert.equal(second.iterations,first.iterations);assert.equal(second.pixels,first.pixels);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('fractal controls change geometry and preserve the camera across reload',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});
 const open=()=>page.getByRole('button',{name:'Fractal controls',exact:true}).click();
 await page.evaluate(()=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'tree',mode:'construction',geometryDepth:5},{cx:0,cy:0,w:2.1,a:.1});});
 const camera=()=>page.evaluate(()=>({...window.FractalLab.view}));
 const before=await camera();
 await open();
 await page.getByRole('slider',{name:'Branch angle (°)',exact:true}).evaluate(el=>{el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.getByRole('button',{name:'Apply changes',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.FractalLab.cfg.treeAngle),50);
 assert.deepEqual(await camera(),before);
 await page.waitForFunction(()=>location.hash.includes('treeAngle=50'));
 await page.reload({waitUntil:'load'});
 assert.equal(await page.evaluate(()=>window.FractalLab.cfg.treeAngle),50);
 await open();
 await page.getByRole('button',{name:'Reset fractal controls',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.FractalLab.cfg.treeAngle),32);
 for(const [family,label] of [['koch','Bump height'],['carpet','Subdivision grid (n × n)'],['gasket','Triangle scale'],['dust','Corner scale']]){
  await page.evaluate(family=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:family,geometryDepth:3,mode:'construction'},{cx:0,cy:0,w:1.4,a:0});},family);
  await open();assert.ok(await page.getByRole('slider',{name:label,exact:true}).isVisible());
  await page.getByRole('button',{name:'Close panel',exact:true}).click();
 }
 await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:17,seed:{re:0,im:0},mode:'escape',iter:100},{cx:0,cy:0,w:2,a:0});});
 await open();assert.equal(await page.getByRole('combobox',{name:'Exponent',exact:true}).inputValue(),'17');
 assert.ok(await page.getByRole('textbox',{name:'Julia parameter c',exact:true}).isVisible());
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('shared scalar fields on geometric and orbit families',async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});await page.evaluate(()=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'dust',geometryDepth:3,mode:'construction'},{cx:0,cy:0,w:1.5,a:0});});const open=()=>page.getByRole('button',{name:'Layers',exact:true}).click();await open();await page.getByRole('button',{name:'Distance to set',exact:true}).click();await page.waitForFunction(()=>window.FractalLab.settled(),{},{timeout:60000});assert.ok(await page.evaluate(()=>base.g['scalar:distance'].some(v=>v>0)&&base.g['scalar:distance'].some(v=>v===0)));await open();await page.getByRole('combobox',{name:'Scalar source'}).selectOption('construction');await page.getByRole('button',{name:'Scalar Laplacian',exact:true}).click();await page.waitForFunction(()=>window.FractalLab.settled(),{},{timeout:60000});assert.ok(await page.evaluate(()=>base.g['scalar:construction']?.length>0));await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:0,im:0},scalarSource:'auto',mode:'distance',iter:60},{cx:0,cy:0,w:3,a:0});});await page.waitForFunction(()=>window.FractalLab.settled(),{},{timeout:60000});assert.ok(await page.evaluate(()=>base.g['scalar:distance'].some(v=>v>0)&&base.g['scalar:distance'].some(v=>v===0)));assert.deepEqual(errors,[]);}finally{await browser.close();}});

test('automatic recursive detail and hard camera limits',async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});await page.evaluate(()=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'dust',geometryDepth:0,mode:'distance',scalarSource:'auto'},{cx:0,cy:0,w:1.3,a:0});});const depth=await page.evaluate(()=>itFor(view.w));await page.evaluate(()=>zoomAt(Wd/2,Hd/2,100));assert.ok(await page.evaluate(d=>itFor(view.w)>d,depth));await page.evaluate(()=>zoomAt(Wd/2,Hd/2,1e30));assert.ok(await page.locator('#zoomLimitMarker').isVisible());assert.match(await page.locator('#zoomLimitMarker').textContent(),/Construction limit/);const before=await page.evaluate(()=>({...view}));await page.evaluate(()=>zoomAt(Wd/2,Hd/2,10));assert.deepEqual(await page.evaluate(()=>({...view})),before);assert.equal(await page.evaluate(()=>back),null);await page.evaluate(()=>zoomAt(Wd/2,Hd/2,.5));assert.equal(await page.locator('#zoomLimitMarker').isVisible(),false);await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:0,im:0},mode:'escape',iter:32},{cx:.9,cy:0,w:1e-20,a:0});});assert.match(await page.locator('#zoomLimitMarker').textContent(),/Numerical precision/);assert.equal(await page.evaluate(()=>back),null);assert.deepEqual(errors,[]);}finally{await browser.close();}});

test('renormalization error mobile mini view, limits and recording',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});
  await page.locator('[data-expedition=renormalization-error]').click();
  assert.equal(await page.getByRole('button',{name:'Choose / generate starting cycle'}).isVisible(),false);
  assert.ok(await page.locator('#expReturn').isVisible());
  const prepare=async(c,n)=>page.evaluate(({c,n})=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:c,im:0},mode:'escape',iter:64,depth:0},{cx:0,cy:0,w:3.6,a:0});if(!window.birthSelectExpedition('renormalization-error')||!window.birthSaveInitialCheckpoint({baseReturn:n,interval:1}))throw Error('checkpoint save failed');},{c,n});
  const mini=page.locator('#birthPlayer.renormalization-mini'),canvas=mini.locator('canvas');
  await prepare(-1.4011551890920506,1);
  assert.ok(await page.evaluate(()=>window.birthLaunchCheckpoint(false)));
  await mini.waitFor({state:'visible'});
  await page.waitForFunction(()=>window.birthExpeditionStatus().step>=1,{},{timeout:60000});
  const box=await mini.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
  await mini.getByRole('button',{name:/collapse/}).click();assert.equal(await canvas.isVisible(),false);
  const before=await page.evaluate(()=>window.birthExpeditionStatus().step);
  await page.waitForFunction(n=>window.birthExpeditionStatus().step>n,before,{timeout:60000});
  await mini.getByRole('button',{name:/open/}).click();assert.ok(await canvas.isVisible());
  assert.deepEqual(await page.evaluate(()=>window.FractalLab.cfg.seed),{re:-1.4011551890920506,im:0});
  await page.evaluate(()=>window.birthStopExpedition());
  await page.waitForFunction(()=>window.birthExpeditionStatus().stage==='idle');
  assert.equal(await mini.count(),0);
  await prepare(-1,2);
  assert.ok(await page.evaluate(()=>window.birthLaunchCheckpoint(false)));
  await page.waitForFunction(()=>window.birthExpeditionStatus().limitReached&&window.birthExpeditionStatus().stage==='paused',{},{timeout:60000});
  assert.match(await mini.locator('output').first().textContent(),/zero-scale/);
  await page.evaluate(()=>window.birthStopExpedition());
  await prepare(-1.39,1);
  assert.ok(await page.evaluate(()=>window.birthLaunchCheckpoint(true)));
  await page.waitForFunction(()=>window.birthRecordingActive()&&/Recording · [1-9]/.test(document.querySelector('#birth-record-dock').textContent),{},{timeout:60000});
  await page.evaluate(()=>window.birthStopExpedition());
  await page.waitForFunction(()=>!window.birthRecordingActive()&&window.birthExpeditionStatus().stage==='idle');
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download JSON',exact:true}).click();
  const result=JSON.parse(require('node:fs').readFileSync(await (await download).path(),'utf8'));
  assert.ok(result.samples.length>0);assert.equal(result.evolution.mode,'renormalization-error');assert.equal(result.samples[0].evolution.returnTime,1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});


test('Böttcher selection and exterior rendering on mobile',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});
 await page.evaluate(()=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:6,seed:{re:-.3,im:.2},mode:'sgrad',iter:128,polar:false,logPolar:false,bottcher:false},{cx:0,cy:0,w:3,a:0});});
 await page.getByRole('button',{name:'Current layer',exact:true}).click();
 await page.locator('#coordPickerQuick').selectOption('bottcher');
 await page.waitForFunction(()=>window.FractalLab.settled()&&base?.bottcher,{},{timeout:60000});
 assert.equal(await page.evaluate(()=>window.FractalLab.cfg.mode),'sens');
 const initial=await page.evaluate(()=>({min:cfg.bottcherGMin,max:cfg.bottcherGMax,valid:Array.from(base.F).filter(Number.isFinite).length,total:base.F.length}));
 assert.ok(initial.valid>initial.total*.99);
 await page.evaluate(()=>{zoomAt(Wd/2,Hd/2,2);});
 await page.waitForFunction(()=>window.FractalLab.settled()&&base?.bottcher,{},{timeout:60000});
 const zoomed=await page.evaluate(()=>({min:cfg.bottcherGMin,max:cfg.bottcherGMax}));
 assert.ok(Math.log(zoomed.max/zoomed.min)<Math.log(initial.max/initial.min));
 await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),seed:{re:2,im:0}},{...F.view});shiftBottcher(-100);});
 await page.waitForFunction(()=>window.FractalLab.settled()&&base?.bottcher,{},{timeout:60000});
 assert.ok(await page.evaluate(()=>cfg.bottcherGMin>bottcherCriticalPotential()));
 assert.match(await page.locator('#zoomLimitMarker').textContent(),/Critical equipotential/);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
