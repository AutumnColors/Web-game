'use strict';
/* Julia cycle tools for the Fractal Universe Lab (formerly the separate Julie Cycle Lab).
   Loaded on demand by lab-addons.js. It talks to the lab only through window.FractalLab.
   Starting point: the Cycle tab on the setup sheet finds c for a chosen degree d and cycle length p.
   Viewer: the cycle button (shown only with a Julia set) opens a panel with the equation, Regenerate,
   earlier results, and a one-sector view of the d-fold symmetry. */
(()=>{
const FL=window.FractalLab, tau=Math.PI*2;
const cfg=()=>FL.cfg;

/* ---------- the search: c with 0 → c → … → 0 in exactly p steps under z ↦ z^d + c ---------- */
function mul(a,b){return [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];}
function pow(z,n){let a=[1,0],b=z;while(n>0){if(n%2)a=mul(a,b);n=Math.floor(n/2);if(n)b=mul(b,b);}return a;}
function div(a,b){const den=b[0]*b[0]+b[1]*b[1];return [(a[0]*b[0]+a[1]*b[1])/den,(a[1]*b[0]-a[0]*b[1])/den];}
function orbit(c,d,p){let z=[0,0],v=[0,0],early=false;for(let i=1;i<=p;i++){const q=pow(z,d-1),dv=mul([d*q[0],d*q[1]],v),zz=mul(q,z);v=[dv[0]+1,dv[1]];z=[zz[0]+c[0],zz[1]+c[1]];if(!Number.isFinite(z[0])||!Number.isFinite(z[1])||Math.hypot(...z)>1e5)return null;if(i<p&&Math.hypot(...z)<1e-6)early=true;}return {z,v,early};}
function newton(d,p,start){let c=start.slice();for(let i=0;i<65;i++){const o=orbit(c,d,p);if(!o)return null;const err=Math.hypot(...o.z);if(err<1e-10){if(o.early)return null;return c;}if(Math.hypot(...o.v)<1e-13)return null;const delta=div(o.z,o.v);let scale=1,ok=false;while(scale>=1/8192){const next=[c[0]-scale*delta[0],c[1]-scale*delta[1]],test=orbit(next,d,p);if(test&&Math.hypot(...test.z)<err){c=next;ok=true;break;}scale/=2;}if(!ok)return null;}return null;}
function verified(c,d,p){const o=orbit(c,d,p);return !!o&&!o.early&&Math.hypot(...o.z)<1e-6;}
function checkInput(d,p){
  if(!Number.isSafeInteger(d)||d<2||!Number.isSafeInteger(p)||p<1) return 'Choose whole numbers: degree at least 2 and cycle length at least 1.';
  if(d>1000) return 'Degree above 1,000 is outside what the viewer can draw.';
  if(d*p>12000) return 'Degree × cycle length is too large for the browser search. Reduce one of them.';
  return '';
}
/* In degree d, c and ω·c with ω^(d−1) = 1 draw the same set rotated, and c̄ draws its mirror image.
   Regenerate skips those, so every result is a new shape. */
function sameShape(a,b,d){
  const n=d-1;
  for(let k=0;k<n;k++){ const t=tau*k/n, r=[a[0]*Math.cos(t)-a[1]*Math.sin(t),a[0]*Math.sin(t)+a[1]*Math.cos(t)];
    if(Math.hypot(r[0]-b[0],r[1]-b[1])<1e-5||Math.hypot(r[0]-b[0],r[1]+b[1])<1e-5) return true; }
  return false;
}
/* Runs in small batches so the page stays responsive. avoid: c values whose shape to skip (for Regenerate). */
let ticket=0;
function search(d,p,avoid,onStatus){
  const my=++ticket;
  return new Promise(done=>{
    if(p===1){ const same=avoid.some(a=>Math.hypot(a[0],a[1])<1e-9); done(same?{none:'Cycle length 1 has only c = 0 in this family.'}:{c:[0,0]}); return; }
    const offset=Math.random(),shift=Math.random(),max=Math.max(80,Math.min(2400,Math.floor(180000/(d*p)))),per=Math.max(1,Math.min(12,Math.floor(500/(d*p))));
    let j=0;
    if(d*p>1500) onStatus('Large degree × cycle length: the search may be slow or find nothing.');
    (function batch(){
      if(my!==ticket) return done(null);
      for(let t=0;t<per&&j<max;t++,j++){
        const a=tau*((j*.618033988749895+offset)%1),r=.64+.42*((j*.414213562373095+shift)%1),c=newton(d,p,[r*Math.cos(a),r*Math.sin(a)]);
        if(c&&!avoid.some(x=>sameShape(x,c,d))) return done({c});
      }
      if(j>=max) return done({none:avoid.length?'No new shape found in '+max+' tries. There may be no more for this d and p, or try again.':'No verified c found in '+max+' tries. Try again.'});
      if(j%120===0) onStatus('Searching… '+j+' starting guesses tried');
      setTimeout(batch,0);
    })();
  });
}

/* ---------- results: every c found in this visit, newest last ---------- */
const found=[]; let at=-1;
function remember(d,p,c){
  let i=found.findIndex(f=>f.d===d&&f.p===p&&Math.hypot(f.c[0]-c[0],f.c[1]-c[1])<1e-12);
  if(i<0){ found.push({d,p,c}); i=found.length-1; }
  at=i; return found[i];
}
function current(){   // the result shown now, if the viewer's Julia set came from the search
  const k=cfg(); if(k.fractal!=='julia') return null;
  return found.find(f=>f.d===k.juliaPower&&Math.abs(f.c[0]-k.seed.re)<1e-12&&Math.abs(f.c[1]-k.seed.im)<1e-12)||null;
}
const cStr=c=>FL.cText(c[0],c[1],11);
const sup=n=>String(n).replace(/./g,ch=>'⁰¹²³⁴⁵⁶⁷⁸⁹⁻'['0123456789-'.indexOf(ch)]||ch);
function syncLink(){ const f=current(); FL.hashParts.cy=f?f.d+','+f.p:''; FL.writeHash(); }

/* ---------- styles (shared by the tab and the panel) ---------- */
const st=document.createElement('style');
st.textContent=`
#cyclePanel{position:fixed;left:calc(64px + env(safe-area-inset-left));bottom:calc(12px + env(safe-area-inset-bottom));width:min(300px,calc(100vw - 80px));max-height:calc(100dvh - 40px);overflow:auto;z-index:3;padding:12px;border-radius:16px;display:none}
#cyclePanel.on{display:block}
body.clean #cyclePanel,body.cmp #cyclePanel{display:none}
.cyRow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
.cyRow label{font-size:11px;color:#9a9aa2}
.cyRow input{display:block;width:100%;box-sizing:border-box;margin-top:3px;font:15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:8px 10px;border-radius:10px;border:1.5px solid rgba(255,255,255,.3);background:#111;color:#fff;outline:none}
.cyBtns{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 2px}
.cyBtns button{flex:1;min-width:0;font-size:13px;padding:8px 10px;border-radius:18px;border:1.5px solid rgba(255,255,255,.4);background:#151515;color:#fff;cursor:pointer}
.cyBtns button.main{background:#fff;color:#000;border-color:#fff;font-weight:650}
.cyBtns button:disabled{opacity:.45;cursor:default}
.cyBtns button.on{background:#fff;color:#000}
.cyEq{font:14px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:4px 2px 2px}
.cyC{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd3da;margin:4px 2px;word-break:break-all}
.cyStatus{font-size:12px;color:#8d8d95;line-height:1.4;margin:6px 2px 0;min-height:1.4em}
#cycleSector{position:fixed;inset:0;width:100vw;height:100dvh;pointer-events:none;z-index:1;display:none}`;
document.head.append(st);
const $=id=>document.getElementById(id);
const num=id=>Number($(id).value);

/* ---------- 1 · starting point: the Cycle tab on the setup sheet ---------- */
let setupBusy=false;
function mountSetup(){
  const host=$('seedCyclePanel'); if(host.dataset.ready) return; host.dataset.ready='1';
  const d0=Number.isInteger(FL.draft.juliaPower)&&FL.draft.juliaPower>=2?FL.draft.juliaPower:2;
  host.innerHTML=`<div class="note">Find c so that the critical point returns to itself: 0 → c → … → 0 in exactly p steps of z ↦ z<sup>d</sup> + c (a superattracting cycle). The result fills “Selected c” below.</div>
  <div class="cyRow"><label>Degree d<input id="cyD" type="number" min="2" step="1" value="${d0}" inputmode="numeric"></label><label>Cycle length p<input id="cyP" type="number" min="1" step="1" value="3" inputmode="numeric"></label></div>
  <div class="cyBtns"><button id="cyFind" class="main" type="button">Find c</button><button id="cyAgain" type="button">Another c</button></div>
  <div class="cyStatus" id="cyS">Choose d and p, then Find c.</div>`;
  const say=t=>$('cyS').textContent=t;
  async function run(again){
    if(setupBusy) return; const d=num('cyD'),p=num('cyP'),bad=checkInput(d,p); if(bad){say(bad);return;}
    setupBusy=true; $('cyFind').disabled=$('cyAgain').disabled=true; say('Searching for a cycle of length '+p+' (degree '+d+')…');
    const avoid=again?found.filter(f=>f.d===d&&f.p===p).map(f=>f.c):[];
    const r=await search(d,p,avoid,say);
    setupBusy=false; $('cyFind').disabled=$('cyAgain').disabled=false;
    if(!r) return; if(r.none){ say(r.none); return; }
    remember(d,p,r.c);
    FL.draft.juliaPower=d; FL.chooseSeed(r.c[0],r.c[1]); FL.syncCfg();
    say('Verified: degree '+d+', cycle length '+p+'. c = '+cStr(r.c)+'. Press “Use this configuration”.');
  }
  $('cyFind').onclick=()=>run(false); $('cyAgain').onclick=()=>run(true);
}

/* ---------- 2 · viewer: the panel next to the cycle button ---------- */
const panel=document.createElement('div'); panel.id='cyclePanel'; panel.className='glass';
panel.innerHTML=`<div class="lbl">Julia · cycle</div>
<div class="cyEq" id="cvEq"></div><div class="cyC" id="cvC"></div>
<div class="cyRow"><label>Degree d<input id="cvD" type="number" min="2" step="1" inputmode="numeric"></label><label>Cycle length p<input id="cvP" type="number" min="1" step="1" inputmode="numeric"></label></div>
<div class="cyBtns"><button id="cvGen" class="main" type="button">Regenerate</button></div>
<div class="cyBtns"><button id="cvPrev" type="button" aria-label="Earlier result">‹</button><button id="cvPos" type="button" disabled>–</button><button id="cvNext" type="button" aria-label="Later result">›</button></div>
<div class="lbl" style="margin-top:12px">Symmetry</div>
<div class="cyBtns"><button id="cvSector" type="button">One sector</button></div>
<div class="cyStatus" id="cvS"></div>`;
document.body.append(panel);
const btn=$('bCycle'), say=t=>$('cvS').textContent=t;
let open=false, busy=false;
function setOpen(v){ open=v; panel.classList.toggle('on',v); if(btn) btn.classList.toggle('on',v); if(v){ FL.closePop(); refresh(); } }
// Any other toolbar button closes the panel, so two panels never overlap.
const tools=$('tools'); if(tools) tools.addEventListener('click',e=>{ if(open&&!e.target.closest('#bCycle')) setOpen(false); },true);

function refresh(){
  const k=cfg(), f=current(), d=k.juliaPower;
  $('cvEq').innerHTML='z ↦ z'+sup(Number(d.toPrecision(6)))+' + c';
  $('cvC').textContent='c = '+FL.cText(k.seed.re,k.seed.im,11);
  if(document.activeElement!==$('cvD')) $('cvD').value=Number.isInteger(d)&&d>=2?d:2;
  if(f&&document.activeElement!==$('cvP')) $('cvP').value=f.p;
  if(!$('cvP').value) $('cvP').value=3;
  $('cvPos').textContent=found.length?((f?found.indexOf(f)+1:'–')+' / '+found.length):'–';
  $('cvPrev').disabled=!found.length||(f&&found.indexOf(f)===0); $('cvNext').disabled=!found.length||(f&&found.indexOf(f)===found.length-1);
  $('cvSector').classList.toggle('on',sector.on); $('cvSector').textContent=sector.on?'Full set':'One sector';
  if(!busy) say(f?'0 → c → … → 0 in exactly '+f.p+' steps · verified':'This c was not found by the cycle search. Regenerate finds one for d and p.');
}
function show(f){ const n=FL.clone(cfg()); n.fractal='julia'; n.juliaPower=f.d; n.seed={re:f.c[0],im:f.c[1]}; n.bottcher=false; FL.apply(n); }
$('cvGen').onclick=async()=>{
  if(busy) return; const d=num('cvD'),p=num('cvP'),bad=checkInput(d,p); if(bad){say(bad);return;}
  busy=true; $('cvGen').disabled=true; say('Searching for a cycle of length '+p+' (degree '+d+')…');
  const r=await search(d,p,found.filter(f=>f.d===d&&f.p===p).map(f=>f.c),say);
  busy=false; $('cvGen').disabled=false;
  if(!r) return; if(r.none){ say(r.none+' The current Julia set is unchanged.'); return; }
  show(remember(d,p,r.c));
};
function step(k){ if(!found.length) return; const f=current(); let i=f?found.indexOf(f)+k:(k>0?0:found.length-1); i=Math.max(0,Math.min(found.length-1,i)); at=i; show(found[i]); }
$('cvPrev').onclick=()=>step(-1); $('cvNext').onclick=()=>step(1);

/* ---------- one sector: black mask outside the wedge [k·2π/d, (k+1)·2π/d] around the origin ---------- */
const mask=document.createElement('canvas'); mask.id='cycleSector'; mask.setAttribute('aria-hidden','true');
const lab=FL.canvas; lab.parentNode.insertBefore(mask,lab.nextSibling);
const ctx=mask.getContext('2d'), sector={on:false,k:0,d:0,key:''};
function sectorValid(){ const k=cfg(); return k.fractal==='julia'&&Number.isInteger(k.juliaPower)&&k.juliaPower>=2&&!k.polar&&!k.bottcher; }
function sectorOff(){ sector.on=false; sector.key=''; mask.style.display='none'; }
$('cvSector').onclick=()=>{
  if(sector.on){ sectorOff(); refresh(); return; }
  if(!sectorValid()){ say('One sector needs a Julia set with a whole-number degree d ≥ 2 in Cartesian coordinates.'); return; }
  const d=cfg().juliaPower, v=FL.view, a=((Math.atan2(v.cy,v.cx)%tau)+tau)%tau;
  Object.assign(sector,{on:true,d,k:Math.floor(a/(tau/d))%d,key:''}); mask.style.display='block'; refresh();
};
function clip(poly,nx,ny){ const out=[],eps=1e-12; for(let i=0;i<poly.length;i++){ const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*ny,db=b[0]*nx+b[1]*ny; if(da>=-eps)out.push(a); if((da>=-eps)!==(db>=-eps)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);} } return out; }
(function draw(){
  requestAnimationFrame(draw);
  if(!sector.on) return;
  if(!sectorValid()||cfg().juliaPower!==sector.d){ sectorOff(); if(open) refresh(); return; }
  const [w,h]=FL.size(), v=FL.view, key=[w,h,sector.k,sector.d,v.cx,v.cy,v.w,v.a].join('|');
  if(key===sector.key) return; sector.key=key;
  if(mask.width!==w||mask.height!==h){ mask.width=w; mask.height=h; }
  const a=sector.k*tau/sector.d, b=(sector.k+1)*tau/sector.d;
  let poly=[FL.toWorld(0,0),FL.toWorld(w,0),FL.toWorld(w,h),FL.toWorld(0,h)];
  poly=clip(poly,-Math.sin(a),Math.cos(a)); poly=clip(poly,Math.sin(b),-Math.cos(b));   // a wedge is two half-planes through 0
  ctx.globalCompositeOperation='source-over'; ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
  if(poly.length>=3){ ctx.globalCompositeOperation='destination-out'; ctx.beginPath(); poly.forEach((p,i)=>{ const q=FL.toScreen(p[0],p[1]); if(i) ctx.lineTo(q[0],q[1]); else ctx.moveTo(q[0],q[1]); }); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation='source-over'; }
})();

/* ---------- keep everything in step with the lab ---------- */
FL.onConfig.push(()=>{ if(cfg().fractal!=='julia'){ setOpen(false); sectorOff(); } else if(open) refresh(); syncLink(); });

window.FractalCycle={
  search, newton, verified,
  mountSetup,
  toggle:()=>setOpen(!open),
  restore(text){   // from a link: cy=d,p — trust it only if the orbit really closes
    const [d,p]=String(text).split(',').map(Number), k=cfg(), c=[k.seed.re,k.seed.im];
    if(k.fractal==='julia'&&d===k.juliaPower&&!checkInput(d,p)&&verified(c,d,p)) remember(d,p,c);
    syncLink();
  }
};
})();
