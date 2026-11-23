'use strict';
/* Julie Cycle Lab: independent polynomial degree and exact critical period. */
(()=>{
const el=id=>document.getElementById(id),status=t=>el('primeStatus').textContent=t;
let busy=false,nonce=0,current=null;
el('primeToggle').onclick=()=>{el('primePanel').hidden=!el('primePanel').hidden;};
function mul(a,b){return [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];}
function pow(z,n){let a=[1,0],b=z;while(n>0){if(n%2)a=mul(a,b);n=Math.floor(n/2);if(n)b=mul(b,b);}return a;}
function orbit(c,d,p){let z=[0,0],v=[0,0],pts=[[0,0]],early=false;for(let i=1;i<=p;i++){let q=pow(z,d-1),dv=mul([d*q[0],d*q[1]],v),zz=mul(q,z);v=[dv[0]+1,dv[1]];z=[zz[0]+c[0],zz[1]+c[1]];if(!Number.isFinite(z[0])||!Number.isFinite(z[1])||Math.hypot(...z)>1e5)return null;pts.push(z);if(i<p&&Math.hypot(...z)<1e-6)early=true;}return {z,v,pts,early};}
function div(a,b){const den=b[0]*b[0]+b[1]*b[1];return [(a[0]*b[0]+a[1]*b[1])/den,(a[1]*b[0]-a[0]*b[1])/den];}
function newton(d,p,start){let c=start.slice();for(let i=0;i<65;i++){let o=orbit(c,d,p);if(!o)return null;const err=Math.hypot(...o.z);if(err<1e-10){if(o.early)return null;const check=orbit(c,d,p);if(!check||Math.hypot(...check.z)>1e-9)return null;return {c,pts:check.pts};}if(Math.hypot(...o.v)<1e-13)return null;const delta=div(o.z,o.v);let scale=1,ok=false;while(scale>=1/8192){const next=[c[0]-scale*delta[0],c[1]-scale*delta[1]],test=orbit(next,d,p);if(test&&Math.hypot(...test.z)<err){c=next;ok=true;break;}scale/=2;}if(!ok)return null;}return null;}
function show(d,p,result){current={d,p,c:result.c};let next=clone(cfg);next.fractal='julia';next.juliaPower=d;next.seed={re:result.c[0],im:result.c[1]};next.polar=false;next.bottcher=false;applyConfig(next);el('cfg').classList.remove('on');const c=result.c;status('Degree '+d+' · verified superattracting period '+p+' · c = '+c[0].toPrecision(11)+(c[1]<0?' − ':' + ')+Math.abs(c[1]).toPrecision(11)+'i');}
function generate(regenerate){if(busy)return;const d=Number(el('cycleDegree').value),p=Number(el('cyclePeriod').value);if(!Number.isInteger(d)||d<2||d>47||!Number.isInteger(p)||p<1||p>47){status('Choose whole numbers: degree 2–47 and period 1–47.');return;}if(!regenerate)current=null;
if(p===1){const result={c:[0,0],pts:[[0,0],[0,0]]};if(regenerate&&current&&current.d===d&&current.p===1){status('Period 1 has only c = 0 in this family; there is no different solution.');return;}show(d,p,result);return;}
busy=true;el('cycleGenerate').disabled=true;el('cycleRegenerate').disabled=true;const ticket=++nonce;let j=0,found=null;
status('Searching for an exact period-'+p+' critical cycle (degree '+d+')…');
const offset=Math.random(),shift=Math.random(),maxAttempts=2400;
function batch(){if(ticket!==nonce)return;for(let t=0;t<12&&j<maxAttempts&&!found;t++,j++){const angle=2*Math.PI*((j*.618033988749895+offset)%1);const radius=.64+.42*((j*.414213562373095+shift)%1);const candidate=newton(d,p,[radius*Math.cos(angle),radius*Math.sin(angle)]);if(candidate&&(!regenerate||!current||current.d!==d||current.p!==p||Math.hypot(candidate.c[0]-current.c[0],candidate.c[1]-current.c[1])>1e-5))found=candidate;}
if(found){busy=false;el('cycleGenerate').disabled=false;el('cycleRegenerate').disabled=false;show(d,p,found);}
else if(j<maxAttempts){if(j%120===0)status('Searching for exact period '+p+'… '+j+' initial guesses tested');setTimeout(batch,0);}
else{busy=false;el('cycleGenerate').disabled=false;el('cycleRegenerate').disabled=false;status('No '+(regenerate?'different ':'')+'verified solution found in '+maxAttempts+' attempts. Try Regenerate again; the current Julia set is unchanged.');}}
setTimeout(batch,0);}
el('cycleGenerate').onclick=()=>generate(false);el('cycleRegenerate').onclick=()=>generate(true);
})();
