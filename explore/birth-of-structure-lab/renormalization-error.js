'use strict';
/* Critical-return normalization for the same unicritical Julia map at every level.
   Float64 error estimates are conservative diagnostics, not interval proofs. */
const RenormalizationError=(()=>{
 const EPS=Number.EPSILON, MAX_WORK=2200000, MAX_RETURN=65536, DOMAIN=2;
 const mul=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
 const abs=a=>Math.hypot(...a);
 function power(a,d){
  if(d===2)return mul(a,a);
  if(Number.isSafeInteger(d)&&d>=2){let r=[1,0],b=a,n=d;while(n){if(n%2)r=mul(r,b);n=Math.floor(n/2);if(n)b=mul(b,b);}return r;}
  const m=abs(a)**d,t=d*Math.atan2(a[1],a[0]);return [m*Math.cos(t),m*Math.sin(t)];
 }
 function orbit(cfg,a,n,uncertainty=0){
  const d=cfg.juliaPower,c=[cfg.seed.re,cfg.seed.im];let bound=Math.max(2,abs(c)+1);while(Number.isFinite(bound)&&bound**d-bound<=abs(c))bound*=2;let z=a,e=uncertainty,escaped=false;
  for(let i=0;i<n;i++){
   const r=abs(z);
   if(!Number.isFinite(r)||!Number.isFinite(e))return {status:escaped?'escaped':'overflow'};
   if(r-e>bound)escaped=true;
   if(!Number.isInteger(d)&&z[0]<0&&Math.abs(z[1])<=e&&e>0)return {status:'unresolved'};
   const w=power(z,d);z=[w[0]+c[0],w[1]+c[1]];
   if(!z.every(Number.isFinite))return {status:escaped?'escaped':'overflow'};
   e=d*Math.pow(r+e,d-1)*e+16*EPS*Math.max(abs(w),abs(c),abs(z),Number.MIN_VALUE);
   if(!Number.isFinite(e))return {status:escaped?'escaped':'unresolved'};
  }
  return {status:'finite',z,e};
 }
 function scale(cfg,n){
  const q=orbit(cfg,[0,0],n);
  if(q.status!=='finite')return q;
  const m=abs(q.z);
  if(m===0)return {...q,status:'zero-scale'};
  if(m<=64*q.e||m<1e-14)return {...q,status:'unresolved-scale'};
  return q;
 }
 function normalized(cfg,z,n,s){
  const q=orbit(cfg,mul(s.z,z),n,abs(z)*s.e+8*EPS*abs(s.z)*abs(z));
  if(q.status!=='finite')return q;
  const m=abs(s.z),a=s.z[0]/m,b=s.z[1]/m,x=q.z[0]/m,y=q.z[1]/m;
  const v=[x*a+y*b,y*a-x*b],e=(q.e+abs(v)*s.e)/m+16*EPS*abs(v);
  if(!v.every(Number.isFinite))return {status:'overflow'};
  if(!Number.isFinite(e)||e>1e-5*Math.max(1,abs(v)))return {status:'unresolved'};
  return {status:'finite',v,e};
 }
 function compare(cfg,n,s,t,z){
  const a=normalized(cfg,z,n,s),b=normalized(cfg,z,n*2,t);
  if(a.status!=='finite'||b.status!=='finite')return {status:[a.status,b.status].includes('overflow')?'overflow':[a.status,b.status].includes('escaped')?'escaped':'unresolved'};
  const value=abs([a.v[0]-b.v[0],a.v[1]-b.v[1]]);
  if(!Number.isFinite(value))return {status:'overflow'};
  if(value<=a.e+b.e&&!(z[0]===0&&z[1]===0))return {status:'unresolved'};
  return {status:'finite',value:z[0]===0&&z[1]===0?0:value};
 }
 function frame(cfg,n,aspect=1){
  if(!Number.isSafeInteger(n)||n<1||2*n>MAX_RETURN||!Number.isFinite(aspect)||aspect<=0)return {n,scale:null,nextScale:null,ratio:NaN,rms:null,coverage:0,status:'return-time-limit',W:1,H:1,errorValues:new Float64Array([NaN]),flags:new Uint8Array([2])};
  const s=scale(cfg,n),t=scale(cfg,2*n),m=s.z?abs(s.z):NaN,ratio=t.z?abs(t.z)/m:NaN;
  const out={n,scale:s.z||null,nextScale:t.z||null,ratio,rms:null,coverage:0,status:'finite',W:1,H:1,errorValues:new Float64Array([NaN]),flags:new Uint8Array([2])};
  if(s.status!=='finite'||t.status!=='finite'){out.status=s.status!=='finite'?s.status:t.status;out.flags[0]=out.status==='escaped'?1:out.status==='overflow'?3:2;return out;}
  const rawSide=Math.min(129,Math.floor(Math.sqrt(MAX_WORK/(3*n*(Math.max(aspect,1/aspect)+1))))),side=rawSide%2?rawSide:rawSide-1;
  if(side<17){out.status='work-limit';return out;}
  // The fixed square RMS domain is independent of the screen aspect and sampling resolution.
  const W=side,H=Math.max(1,Math.round(side*aspect/2)*2+1),V=new Float64Array(W*H),flags=new Uint8Array(W*H);V.fill(NaN);
  const sample=(x,y)=>compare(cfg,n,s,t,[x,y]);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
   const q=sample(DOMAIN*(i+.5-W/2)/W,DOMAIN*(H/2-j-.5)/W),k=j*W+i;
   if(q.status==='finite')V[k]=q.value;else flags[k]=q.status==='escaped'?1:q.status==='overflow'?3:2;
  }
  let rms=0,valid=0;const size=17;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
   const q=sample(DOMAIN*(i+.5-size/2)/size,DOMAIN*(size/2-j-.5)/size);
   if(q.status==='finite'){valid++;rms=Math.hypot(rms,q.value);}
  }
  return {...out,W,H,errorValues:V,flags,rms:valid?rms/Math.sqrt(valid):null,coverage:valid/(size*size),status:valid?'finite':'unresolved-field'};
 }
 function shade(v){return Math.round(255*Math.max(0,Math.min(1,Math.log1p(v*100)/Math.log1p(100))));}
 function color(v,flag){if(flag===1)return [116,64,20];if(flag===3)return [181,35,79];if(flag||!Number.isFinite(v))return [55,73,112];const g=shade(v);return [g,g,g];}
 return {frame,scale,compare,color,DOMAIN,MAX_RETURN};
})();
if(typeof module!=='undefined')module.exports=RenormalizationError;
