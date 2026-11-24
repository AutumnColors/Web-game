'use strict';
/* Feigenbaum Constant Lab: superstable period-doubling cascades of z² + c, with certified continuation.
   In the Universal Lab it opens from the "Feigenbaum cascade" button of the experiment panel; on its own page it opens at once. */
// ===FG-CORE-BEGIN===
/* Feigenbaum cascade mathematics for f_c(z) = z² + c (complex c).
   Everything here is plain arithmetic on [re, im] pairs, so it can be tested outside the page. */
const FG=(()=>{
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]], sub=(a,b)=>[a[0]-b[0],a[1]-b[1]], sc=(a,k)=>[a[0]*k,a[1]*k];
const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]], abs=a=>Math.hypot(a[0],a[1]);
const div=(a,b)=>{const d=b[0]*b[0]+b[1]*b[1];return [(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
const ok=a=>Number.isFinite(a[0])&&Number.isFinite(a[1]);
const MAXP=2048;

// Critical orbit z_k = f^k(0) with v = ∂z/∂c and h = (f^p)''(0). half = f^(p/2)(0), the cycle point closest to 0 one level up.
function jet(c,p){
  let z=[0,0],v=[0,0],h=[0,0],d=[1,0],half=[0,0];
  for(let j=0;j<p;j++){
    v=add(sc(mul(z,v),2),[1,0]); h=sc(add(mul(d,d),mul(z,h)),2); d=sc(mul(z,d),2); z=add(mul(z,z),c);
    if(j+1===p/2) half=z;
    if(!ok(z)||abs(z)>1e6) return null;
  }
  return {z,v,h,half};
}
// Smallest k < p with f^k(0) = 0, i.e. the orbit closes early and the true period is smaller than p.
function earlyClose(c,p){ let z=[0,0]; for(let k=1;k<p;k++){ z=add(mul(z,z),c); if(abs(z)<1e-9) return k; } return 0; }

// Damped Newton for a centre of exact period p: f^p_c(0) = 0 and no earlier return to 0.
function centre(p,start){
  let c=start.slice();
  for(let i=0;i<80;i++){
    const o=jet(c,p); if(!o) return null;
    const err=abs(o.z); if(err===0) break;
    if(abs(o.v)<1e-300) return null;
    const step=div(o.z,o.v); let s=1, moved=false;
    while(s>=1/8192){ const next=sub(c,sc(step,s)), t=jet(next,p); if(t&&abs(t.z)<=err){ c=next; moved=true; break; } s/=2; }
    if(!moved||abs(step)*s<4e-16*Math.max(1,abs(c))) break;
  }
  const o=jet(c,p); if(!o||abs(o.z)>1e-6||earlyClose(c,p)) return null;
  return c;
}

// A cycle of period p with prescribed multiplier lam: f^p(w) = w and (f^p)'(w) = lam, solved for (w, c) by 2-D complex Newton.
function cycleJet(w,c,p){
  let z=w,D=[1,0],V=[0,0],H=[0,0],M=[0,0];
  for(let i=0;i<p;i++){
    const z2=sc(z,2);
    H=add(sc(mul(D,D),2),mul(z2,H)); M=add(sc(mul(V,D),2),mul(z2,M));     // ∂²/∂w², ∂²/∂w∂c
    D=mul(z2,D); V=add(mul(z2,V),[1,0]); z=add(mul(z,z),c);               // ∂/∂w, ∂/∂c
    if(!ok(z)||abs(z)>1e6) return null;
  }
  return {z,D,V,H,M};
}
function solveCycle(w,c,p,lam){
  for(let i=0;i<40;i++){
    const o=cycleJet(w,c,p); if(!o) return null;
    const A=sub(o.z,w), B=sub(o.D,lam), a=sub(o.D,[1,0]), det=sub(mul(a,o.M),mul(o.V,o.H));
    if(abs(det)<1e-300) return null;
    const dw=div(sub(mul(o.V,B),mul(o.M,A)),det), dc=div(sub(mul(o.H,A),mul(a,B)),det);
    w=add(w,dw); c=add(c,dc); if(!ok(w)||!ok(c)) return null;
    if(abs(dc)<1e-15*Math.max(1,abs(c))&&abs(dw)<1e-13) return {w,c};
  }
  const o=cycleJet(w,c,p); return o&&abs(sub(o.z,w))<1e-9&&abs(sub(o.D,lam))<1e-7?{w,c}:null;
}
// Walk an internal ray from a centre (multiplier 0, cycle through 0) to multiplier lamEnd.
function ray(c0,p,lamEnd,steps){
  let w=[0,0],c=c0;
  for(let s=1;s<=steps;s++){ const r=solveCycle(w,c,p,sc(lamEnd,s/steps)); if(!r) return null; w=r.w; c=r.c; }
  return c;
}
// Certificate that c1 (period 2p) is the period-doubling child of c0 (period p): the parent's internal ray reaches
// multiplier −1 at a root, and the child's internal ray reaches multiplier → +1 at the same root.
function certify(c0,c1,p){
  const root=ray(c0,p,[-1,0],32); if(!root) return {ok:false,why:'parent cycle could not be followed to multiplier −1'};
  const end=ray(c1,2*p,[0.98,0],32); if(!end) return {ok:false,why:'child cycle could not be followed to multiplier +1'};
  const gap=abs(sub(end,root))/abs(sub(c1,root));
  return {ok:gap<0.1,root,gap,why:gap<0.1?'':'child component does not meet the parent at its multiplier −1 root'};
}

// The period-doubling child: quadratic estimate c − 2/(h·v), refined by Newton; accepted only with a certificate.
function child(c,p){
  const j=jet(c,p); if(!j) return null;
  const step=div([-2,0],mul(j.h,j.v)); if(!ok(step)) return null;
  const seen=[];
  for(const f of [1,.7,1.3,.5,1.6,2]) for(const an of [0,.25,-.25,.6,-.6]){
    const r=centre(2*p,add(c,mul(sc(step,f),[Math.cos(an),Math.sin(an)])));
    if(!r||abs(sub(r,c))>4*abs(step)||seen.some(s=>abs(sub(s,r))<1e-12*Math.max(1,abs(r)))) continue;
    seen.push(r);
    const cert=certify(c,r,p); if(cert.ok) return {c:r,cert,predicted:add(c,step)};
  }
  return null;
}
// The parent of a centre of even period P, found by Newton on period P/2 from the child and certified.
function parent(c,P){
  if(P%2) return null;
  const r=centre(P/2,c); if(!r) return null;
  const cert=certify(r,c,P/2); return cert.ok?{c:r,cert}:null;
}
// Which centre is c? Candidates are the record-close returns |f^k(0)| < 0.01 (each closer than every earlier one);
// each is refined by Newton on its period, and the exact centre nearest to c wins.
function identify(c){
  let z=[0,0],low=Infinity; const cand=[];
  for(let k=1;k<=MAXP;k++){ z=add(mul(z,z),c); const r=abs(z); if(r>4) break; if(r<low){ low=r; if(r<1e-2) cand.push(k); } }
  let best=null;
  for(const k of cand.slice(-24)){ const r=centre(k,c); if(r){ const d=abs(sub(r,c)); if(!best||d<best.d) best={p:k,c:r,d}; } }
  return best;
}
// Deterministic search for a centre of period p anywhere in |c| ≤ 2 (golden-angle spiral of starting points).
function findCentre(p,avoid,from=0,count=2400){
  for(let j=from;j<from+count;j++){
    const r=2*Math.sqrt((j+.5)/count), t=j*2.399963229728653, c=centre(p,[r*Math.cos(t),r*Math.sin(t)]);
    if(c&&!avoid.some(a=>abs(sub(a,c))<1e-9)) return {c,next:j+1};
  }
  return {c:null,next:from+count};
}
// One level of the table: everything the panel shows about a centre.
function level(c,p,cert){
  const o=jet(c,p); if(!o) return null;
  const eps=Math.max(abs(o.z)/Math.max(abs(o.v),1e-300),64*2.2e-16*Math.max(1,abs(c)));   // uncertainty of c
  return {c,p,halfC:o.half,half:abs(o.half),I:2*abs(o.h),residual:abs(o.z),eps,cert:cert||null};
}
// δ, |α| and the (fᵖ)″ ratio at level n (needs n ≥ 2), with an error bar on δ from the uncertainty of the three centres.
function ratios(rows,n){
  const r=rows[n],s=rows[n-1],t=rows[n-2]; if(!r||!s||!t) return null;
  const d1=abs(sub(s.c,t.c)), d2=abs(sub(r.c,s.c)), q=div(sub(s.c,t.c),sub(r.c,s.c));
  const delta=d1/d2, du=delta*((t.eps+s.eps)/d1+(s.eps+r.eps)/d2);
  const aC=div(s.halfC,r.halfC);
  return {delta,deltaErr:du,deltaComplex:q,alpha:s.half/r.half,alphaAngle:Math.atan2(aC[1],aC[0]),field:r.I/s.I};
}
return {MAXP,jet,centre,certify,child,parent,identify,findCentre,level,ratios,abs,sub};
})();
// ===FG-CORE-END===

/* ---------- the panel ---------- */
(()=>{
const host=document.getElementById('experimentButtons');           // present in the Universal Lab: open from a button there
const FL=()=>window.FractalLab||null;
const panel=document.createElement('div'); panel.id='fgPanel'; panel.hidden=!!host;
panel.innerHTML=`
<div class="fgHead"><b>Feigenbaum cascade</b><span><button type="button" id="fgFold" aria-label="Fold">▾</button>${host?'<button type="button" id="fgClose" aria-label="Close">✕</button>':''}</span></div>
<div id="fgBody">
<p class="fgSub">Superstable period-doubling cascade of z² + c. Every step is certified: the parent's cycle reaches multiplier −1 exactly where the child's cycle reaches +1.</p>
<div class="fgRow"><label>Start period <input id="fgBase" type="number" min="1" max="64" value="1"></label><button type="button" id="fgFind">Find cascade</button><button type="button" id="fgUse">Use viewer c</button></div>
<p id="fgStatus"></p>
<div class="fgScroll"><table id="fgTable"><thead><tr><th>Period</th><th>δ</th><th>|α|</th><th>(fᵖ)″ ratio</th><th>Check</th></tr></thead><tbody></tbody></table></div>
<div id="fgDetail"></div>
<div class="fgRow"><input id="fgC" type="text" readonly aria-label="Complex parameter c"><button type="button" id="fgShow">Show in viewer</button><button type="button" id="fgCopy">Copy c</button></div>
<div class="fgRow"><label><input type="checkbox" id="fgNorm" checked> Normalize by |α|</label><select id="fgMode" aria-label="Picture">
<option value="julia">Julia set</option><option value="sens">Sensitivity |(fᵖ)′|</option><option value="div">Re 2(fᵖ)″ · divergence of (fᵖ)′</option><option value="curl">Im 2(fᵖ)″ · curl of (fᵖ)′</option><option value="mag">|2(fᵖ)″|</option><option value="phase">arg (fᵖ)″</option></select></div>
<div class="fgPics"><figure><canvas id="fgA"></canvas><figcaption id="fgCapA"></figcaption></figure><figure><canvas id="fgB"></canvas><figcaption id="fgCapB"></figcaption></figure></div>
<small id="fgNote">Pictures use exactly p steps (escaped pixels black), so the derivative fields are exact. Divergence and curl of the vector field (fᵖ)′ are the real and imaginary parts of the single holomorphic function 2(fᵖ)″, so they are not independent. They are not the lab's log-compressed "Complex field" views. Normalizing zooms each picture by its own |α|ⁿ scale; the 180° turn of the real scaling does not show, because quadratic Julia sets are symmetric under z → −z.</small>
</div>`;
const style=document.createElement('style');
style.textContent=`#fgPanel{position:fixed;top:calc(12px + env(safe-area-inset-top));left:calc(12px + env(safe-area-inset-left));z-index:8;background:#101722f5;color:#eee;padding:10px 12px;border-radius:12px;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;font:13px system-ui,sans-serif;box-sizing:border-box;border:1px solid #3a4a60}
#fgPanel[hidden]{display:none}#fgPanel .fgHead{display:flex;justify-content:space-between;align-items:center;font-size:14px}
#fgPanel .fgSub{color:#aab4c3;margin:6px 0;line-height:1.35}#fgPanel .fgRow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
#fgPanel button,#fgPanel select,#fgPanel input[type=number]{background:#26364b;color:#f5f7fa;border:1px solid #61748d;border-radius:7px;padding:7px 9px;font:inherit;min-height:34px;cursor:pointer}
#fgPanel button:disabled{opacity:.5}#fgPanel input[type=number]{width:62px}#fgPanel input[type=text]{flex:1 1 180px;min-width:0;background:#182334;color:#fff;border:1px solid #61748d;border-radius:7px;padding:7px;font:12px ui-monospace,Menlo,monospace}
#fgPanel select{max-width:100%}#fgPanel .fgScroll{overflow-x:auto;max-height:210px;overflow-y:auto}
#fgPanel table{border-collapse:collapse;width:100%;font-size:12px}#fgPanel th,#fgPanel td{padding:4px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid #26364b}
#fgPanel th{position:sticky;top:0;background:#101722;color:#aab4c3;font-weight:600}#fgPanel tbody tr{cursor:pointer}#fgPanel tbody tr.on{background:#2c4466}
#fgPanel #fgDetail{background:#182334;border-radius:8px;padding:6px 8px;margin-top:6px;line-height:1.45;font-size:12px}
#fgPanel .fgPics{display:grid;grid-template-columns:1fr 1fr;gap:6px}#fgPanel figure{margin:0}#fgPanel canvas{width:100%;aspect-ratio:1;display:block;background:#000;border-radius:6px;image-rendering:pixelated}
#fgPanel figcaption{font-size:11px;color:#aab4c3;text-align:center}#fgPanel small{color:#9aa6b8;line-height:1.35;display:block;margin-top:4px}
#fgPanel #fgFold,#fgPanel #fgClose{min-height:30px;padding:3px 9px;margin-left:4px}`;
document.head.append(style); document.body.append(panel);
const q=id=>panel.querySelector('#fg'+id), tick=()=>new Promise(r=>setTimeout(r,0));
let rows=[], sel=0, busy=false, search={p:0,from:0,avoid:[]};

const fmtC=c=>c[0].toPrecision(15)+(c[1]<0?' − ':' + ')+Math.abs(c[1]).toPrecision(15)+'i';
const digits=e=>Math.max(2,Math.min(10,Math.floor(-Math.log10(Math.max(e,1e-12)))));
function setBusy(b){ busy=b; for(const id of ['Find','Use']) q(id).disabled=b; }
async function grow(list,status){       // add certified children until the period limit or until no certified child exists
  for(;;){ const last=list[list.length-1]; if(last.p*2>FG.MAXP) return 'reached the period limit '+FG.MAXP;
    status('Continuing to period '+last.p*2+'…'); await tick();
    const ch=FG.child(last.c,last.p); if(!ch) return 'no certified period-doubling child of period '+last.p*2+' was found';
    list.push(FG.level(ch.c,last.p*2,ch.cert)); }
}
function table(){
  q('Table').querySelector('tbody').innerHTML=rows.map((r,n)=>{ const x=n>=2?FG.ratios(rows,n):null;
    return `<tr data-n="${n}" class="${n===sel?'on':''}"><td>${r.p}</td><td>${x?x.delta.toFixed(digits(x.deltaErr)):'—'}</td><td>${x?x.alpha.toFixed(6):'—'}</td><td>${x?x.field.toFixed(6):'—'}</td><td>${n===0?'start':r.cert&&r.cert.ok?'✓':'?'}</td></tr>`; }).join('');
}
function detail(){
  const r=rows[sel]; if(!r){ q('Detail').textContent=''; return; }
  const x=sel>=2?FG.ratios(rows,sel):null, root=r.cert&&r.cert.root;
  q('C').value=r.c[0]+(r.c[1]<0?'':'+')+r.c[1]+'i';
  q('Detail').innerHTML=`<b>Period ${r.p}</b> · c = ${fmtC(r.c)}<br>orbit residual |fᵖ(0)| = ${r.residual.toExponential(2)} · uncertainty of c ≈ ${r.eps.toExponential(1)}`+
   (x?`<br>δ = ${x.delta.toFixed(digits(x.deltaErr))} ± ${x.deltaErr.toExponential(1)} <span style="color:#9aa6b8">(complex ratio ${x.deltaComplex[0].toFixed(6)} ${x.deltaComplex[1]<0?'−':'+'} ${Math.abs(x.deltaComplex[1]).toFixed(6)}i)</span>`+
      `<br>|α| = ${x.alpha.toFixed(8)} · scaling turns by ${(x.alphaAngle*180/Math.PI).toFixed(3)}° · (fᵖ)″ ratio = ${x.field.toFixed(8)} (tends to |α| too: (fᵖ)″(0) grows by −α per doubling)`:'<br>δ and |α| need three levels: choose period ≥ the third row.')+
   (sel===0?'':`<br>Certificate: ${r.cert&&r.cert.ok?'✓ period-doubling child':'not certified'} · parent multiplier −1 at c = ${root?fmtC(root):'—'} · child-ray mismatch ${r.cert?(r.cert.gap*100).toFixed(1)+'%':'—'}`);
}
function draw(canvas,r,scale,mode){
  const w=r.p<=256?180:r.p<=1024?120:90; canvas.width=canvas.height=w;
  const ctx=canvas.getContext('2d'), img=ctx.createImageData(w,w), cr=r.c[0], ci=r.c[1], n=mode==='julia'?Math.max(300,2*r.p):r.p;
  for(let y=0;y<w;y++) for(let x=0;x<w;x++){
    let a=(x+.5-w/2)*scale/w, b=(w/2-y-.5)*scale/w, u=1,v=0,h=0,k=0,esc=false;
    for(let j=0;j<n;j++){ const H=2*(u*u-v*v+a*h-b*k), K=2*(2*u*v+a*k+b*h), U=2*(a*u-b*v), V=2*(a*v+b*u), A=a*a-b*b+cr, B=2*a*b+ci;
      a=A;b=B;u=U;v=V;h=H;k=K; if(a*a+b*b>16){ esc=true; break; } }
    let rgb=[0,0,0];
    if(mode==='julia') rgb=esc?[45,105,150]:[230,235,240];
    else if(!esc){ const D=2*h,C=2*k;
      if(mode==='phase'){ const t=Math.atan2(k,h); rgb=[0,2,4].map(s=>128+127*Math.cos(t+s)); }
      else { const val=mode==='div'?D:mode==='curl'?C:mode==='sens'?Math.hypot(u,v):Math.hypot(D,C), g=Math.min(255,45*Math.log1p(Math.abs(val))); rgb=val<0?[g*.2,g*.6,g]:[g,g*.65,g*.25]; } }
    img.data.set([rgb[0],rgb[1],rgb[2],255],4*(y*w+x));
  }
  ctx.putImageData(img,0,0);
}
let picT=0;
function pictures(){
  clearTimeout(picT); const r=rows[sel], s=rows[sel-1];
  if(!r||!s||!(s.half>0)){ for(const id of ['A','B']){ const cv=q(id); cv.getContext('2d').clearRect(0,0,cv.width,cv.height); } q('CapA').textContent=q('CapB').textContent=''; return; }
  q('CapA').textContent='Drawing…'; q('CapB').textContent='';
  picT=setTimeout(()=>{ const mode=q('Mode').value, norm=q('Norm').checked;
    draw(q('A'),s,4*s.half,mode); draw(q('B'),r,4*(norm?r.half:s.half),mode);
    q('CapA').textContent='period '+s.p+' · width '+(4*s.half).toExponential(2); q('CapB').textContent='period '+r.p+' · width '+(4*(norm?r.half:s.half)).toExponential(2); },30);
}
function select(n){ sel=Math.max(0,Math.min(rows.length-1,n)); table(); detail(); pictures();
  const tr=q('Table').querySelector('tr.on'); if(tr) tr.scrollIntoView({block:'nearest'}); }
async function run(job){ if(busy) return; setBusy(true); try{ await job(); }catch(e){ q('Status').textContent='Stopped: '+e.message; } finally{ setBusy(false); } }
function show(list,focus,msg){ rows=list; select(focus); q('Status').textContent=msg; }

// the real cascade from c = 0
const realCascade=()=>run(async()=>{ const list=[FG.level([0,0],1)]; const end=await grow(list,t=>q('Status').textContent=t);
  show(list,list.length-1,'Real cascade 1 → '+list[list.length-1].p+' · '+end+'.'); });
// a new starting cycle of the chosen period (deterministic order: press again for the next one)
q('Find').onclick=()=>run(async()=>{
  const p=Math.round(+q('Base').value); if(!(p>=1&&p<=64)){ q('Status').textContent='Start period must be 1–64.'; return; }
  if(search.p!==p) search={p,from:0,avoid:[],count:0};
  q('Status').textContent='Searching for a centre of period '+p+'…'; await tick();
  const f=FG.findCentre(p,search.avoid,search.from); search.from=f.next;
  if(!f.c){ q('Status').textContent='No further centre of period '+p+' found.'; return; }
  search.avoid.push(f.c); search.count++;
  const list=[FG.level(f.c,p)], end=await grow(list,t=>q('Status').textContent=t);
  show(list,list.length-1,'Centre #'+search.count+' of period '+p+' · cascade '+p+' → '+list[list.length-1].p+' · '+end+'. Press again for the next centre.');
});
// the c of the Julia set open in the viewer: identify its period, rebuild its ancestors, continue below it
q('Use').onclick=()=>run(async()=>{
  const k=FL()&&FL().cfg; if(!k){ q('Status').textContent='Viewer configuration unavailable.'; return; }
  if(k.fractal!=='julia'||k.juliaPower!==2){ q('Status').textContent='Open a quadratic Julia set in the viewer first: its c is what this uses.'; return; }
  q('Status').textContent='Identifying the viewer c…'; await tick();
  const id=FG.identify([k.seed.re,k.seed.im]);
  if(!id){ q('Status').textContent='The viewer c is not close to the centre of any cycle up to period '+FG.MAXP+'.'; return; }
  const list=[FG.level(id.c,id.p)]; let P=id.p;
  while(P%2===0){ q('Status').textContent='Finding the parent of period '+P+'…'; await tick(); const pr=FG.parent(list[0].c,P); if(!pr) break;
    list[0].cert=pr.cert; list.unshift(FG.level(pr.c,P/2)); P/=2; }
  const at=list.length-1, end=await grow(list,t=>q('Status').textContent=t);
  show(list,Math.max(at,Math.min(2,list.length-1)),'Viewer c is the period-'+id.p+' centre'+(id.d>1e-10?' nearest to it (moved by '+id.d.toExponential(1)+')':'')+
    ' · cascade '+list[0].p+' → '+list[list.length-1].p+' · '+end+'.');
});
q('Table').addEventListener('click',e=>{ const tr=e.target.closest('tr[data-n]'); if(tr) select(+tr.dataset.n); });
for(const id of ['Norm','Mode']) q(id).addEventListener('change',pictures);
q('Show').onclick=()=>{ const r=rows[sel], f=FL(); if(!r||!f) return;
  const k=f.clone(f.cfg); k.fractal='julia'; k.juliaPower=2; k.seed={re:r.c[0],im:r.c[1]}; k.bottcher=false; k.polar=false; k.logPolar=false;
  f.apply(k); f.toast&&f.toast('Julia set of the period-'+r.p+' centre'); };
q('Copy').onclick=async()=>{ const input=q('C');
  try{ await navigator.clipboard.writeText(input.value); }catch(e){ input.focus(); input.select(); if(!document.execCommand('copy')){ q('Copy').textContent='Select c'; return; } }
  q('Copy').textContent='Copied'; setTimeout(()=>q('Copy').textContent='Copy c',1200); };
q('Fold').onclick=()=>{ const b=q('Body'); b.hidden=!b.hidden; q('Fold').textContent=b.hidden?'▸':'▾'; };
let started=false; const open=()=>{ panel.hidden=false; if(!started){ started=true; realCascade(); } };
if(host){
  q('Close').onclick=()=>{ panel.hidden=true; };
  const b=document.createElement('button'); b.type='button'; b.className='opt'; b.textContent='Feigenbaum cascade';
  b.style.cssText='width:100%;min-width:0;min-height:34px;padding:6px 2px;font-size:12px;text-align:center;color:white;background:#263044;border-radius:7px';
  b.onclick=()=>{ if(panel.hidden) open(); else panel.hidden=true; }; host.append(b);
} else open();
})();
