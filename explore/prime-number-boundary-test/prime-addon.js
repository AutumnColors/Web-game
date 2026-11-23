'use strict';
/* Prime experiment adapter for the isolated Universal Lab copy. */
(()=>{
const el=id=>document.getElementById(id),status=t=>el('primeStatus').textContent=t;
const cv=el('primeOverlay'),cx=cv.getContext('2d');
let selected=null,attempt=0,solving=false;
el('primeToggle').onclick=()=>{el('primePanel').hidden=!el('primePanel').hidden;};
function mul(a,b){return [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];}
function pow(z,n){let a=[1,0],b=z;while(n>0){if(n%2)a=mul(a,b);n=Math.floor(n/2);if(n)b=mul(b,b);}return a;}
function orbit(c,d,n){let z=[0,0],v=[0,0],points=[[0,0]];for(let i=0;i<n;i++){let q=pow(z,d-1),v2=mul([d*q[0],d*q[1]],v),zz=mul(q,z);v=[v2[0]+1,v2[1]];z=[zz[0]+c[0],zz[1]+c[1]];points.push(z);if(!Number.isFinite(z[0])||Math.hypot(...z)>1e4)return null;}return {z,v,points};}
function div(a,b){let q=b[0]*b[0]+b[1]*b[1];return [(a[0]*b[0]+a[1]*b[1])/q,(a[1]*b[0]-a[0]*b[1])/q];}
function newton(d,start){let c=start.slice();for(let i=0;i<70;i++){let o=orbit(c,d,d);if(!o||Math.hypot(...o.v)<1e-13)return null;let err=Math.hypot(...o.z);if(err<1e-9){if(Math.hypot(...c)<.08)return null;for(let k=1;k<d;k++){let t=orbit(c,d,k);if(t&&Math.hypot(...t.z)<1e-6)return null;}return {c,points:o.points};}let delta=div(o.z,o.v),scale=1,ok=false;while(scale>1/4096){let next=[c[0]-scale*delta[0],c[1]-scale*delta[1]],t=orbit(next,d,d);if(t&&Math.hypot(...t.z)<err){c=next;ok=true;break;}scale/=2;}if(!ok)return null;}return null;}
function setJulia(d,c,points){selected={d,c,points};let next=clone(cfg);next.fractal='julia';next.juliaPower=d;next.seed={re:c[0],im:c[1]};next.polar=false;next.bottcher=false;applyConfig(next);el('cfg').classList.remove('on');status('Degree '+d+' · '+(points.length===d+1?'verified exact period '+d:'reference construction')+' · c = '+c[0].toPrecision(9)+(c[1]<0?' − ':' + ')+Math.abs(c[1]).toPrecision(9)+'i');}
function generate(){if(solving)return;let d=+el('primeDegree').value,k=Math.max(0,Math.floor(+el('primeIndex').value||0)),type=el('primeFamily').value;selected=null;if(type!=='period'){let angle=type==='unity'?2*Math.PI*(k%d)/d:(2*(k%(d-1))+1)*Math.PI/(d-1),c=[Math.cos(angle),Math.sin(angle)],o=orbit(c,d,type==='unity'?d:2);setJulia(d,c,o?o.points:[]);return;}
solving=true;el('primeGenerate').disabled=true;status('Searching for a verified exact period-'+d+' parameter…');let j=0,found=null;const seedOffset=k*0.071234;
function batch(){for(let t=0;t<25&&j<2000&&!found;t++,j++){let a=2*Math.PI*((j*.618033988749895+seedOffset)%1),r=.70+.42*((j*.414213562373095)%1);found=newton(d,[r*Math.cos(a),r*Math.sin(a)]);}if(found){solving=false;el('primeGenerate').disabled=false;setJulia(d,found.c,found.points);}else if(j<2000){status('Searching… '+j+' candidate parameters checked');setTimeout(batch,0);}else{solving=false;el('primeGenerate').disabled=false;status('No verified period-'+d+' parameter found in 2,000 Newton starts. Try another solution index. No unverified Julia set was substituted.');}}setTimeout(batch,0);}
el('primeGenerate').onclick=generate;
el('primeNext').onclick=()=>{el('primeIndex').value=(+el('primeIndex').value||0)+1;generate();};
function draw(){let w=innerWidth,h=innerHeight,ratio=Math.min(devicePixelRatio||1,2);if(cv.width!==Math.round(w*ratio)||cv.height!==Math.round(h*ratio)){cv.width=Math.round(w*ratio);cv.height=Math.round(h*ratio);cv.style.width=w+'px';cv.style.height=h+'px';}cx.clearRect(0,0,cv.width,cv.height);if(!selected||cfg.fractal!=='julia'||cfg.juliaPower!==selected.d||cfg.seed.re!==selected.c[0]||cfg.seed.im!==selected.c[1])return;
cx.save();cx.scale(ratio,ratio);
function dot(z,color,size){let pt=toScreen(z[0],z[1]);if(!Number.isFinite(pt[0])||!Number.isFinite(pt[1]))return;cx.beginPath();cx.arc(pt[0],pt[1],size,0,Math.PI*2);cx.fillStyle=color;cx.fill();}
if(el('primeRoots').checked)for(let j=0;j<selected.d;j++){let a=2*Math.PI*j/selected.d;dot([Math.cos(a),Math.sin(a)],'#61dfeb',2.5);}
if(el('primeOrbit').checked&&selected.points.length){cx.strokeStyle='#ffd278';cx.lineWidth=1.5;cx.beginPath();selected.points.forEach((p,i)=>{let [x,y]=toScreen(...p);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();selected.points.slice(0,-1).forEach((p,i)=>dot(p,i===0?'#fff':'#ffbd5c',i===0?4:2.5));}
cx.restore();}
setInterval(draw,130);
})();
