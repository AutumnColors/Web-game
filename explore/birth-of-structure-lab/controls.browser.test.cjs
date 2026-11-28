const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
require('./scalar-fields.test.cjs');
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
 assert.equal(await page.locator('[data-expedition]').count(),5);
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

test('shared scalar layers render geometry and orbit fields',async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:320,height:500},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/explore/birth-of-structure-lab/',{waitUntil:'load'});await page.evaluate(()=>{document.querySelector('#cfg').classList.remove('on');const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'carpet',geometryDepth:4,mode:'scalar'},{cx:0,cy:0,w:1.5,a:0});});await page.waitForFunction(()=>window.FractalLab.settled()&&base?.S,{},{timeout:60000});assert.ok(await page.evaluate(()=>base.S.some(v=>v>0)&&base.S.some(v=>v===0)));for(const label of ['Scalar gradient','Scalar Laplacian','Scalar curl (control)','Scalar Hessian']){await page.getByRole('button',{name:'Layers',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();assert.ok(await page.evaluate(()=>base.imgs[0]));}await page.evaluate(()=>{const F=window.FractalLab;F.apply({...F.clone(F.cfg),fractal:'julia',juliaPower:2,seed:{re:0,im:0},iter:100,mode:'scalar'},{cx:0,cy:0,w:2,a:0});});await page.waitForFunction(()=>window.FractalLab.settled()&&base?.S,{},{timeout:60000});assert.equal(await page.evaluate(()=>scalarField(base).source),'orbit-sensitivity');assert.deepEqual(errors,[]);}finally{await browser.close();}});