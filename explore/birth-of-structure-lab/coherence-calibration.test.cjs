const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'engine.js'),'utf8');
const worker=source.split('const WORKER_SRC=`')[1].split('`;')[0];
const context=vm.createContext({postMessage(){}});
vm.runInContext(worker,context);
const C=context.monomialCoherence;
function reference(theta,d,N,sigma){
 let a=0,b=0;
 for(let n=0;n<N;n++){const k=(d-1)*d**n,w=Math.exp(-.5*(k*sigma)**2);a+=w*Math.cos(k*theta);b+=w*Math.sin(k*theta);}
 return Math.hypot(a,b)/N;
}
test('monomial pointwise limit agrees with direct angular sum, independently of radius',()=>{
 for(const d of [2,3,7,17])for(const r of [.01,.3,.95])for(const theta of [0,.127,.75,1.4]){
  const N=5,actual=C(r*Math.cos(theta),r*Math.sin(theta),d,N,4,'fixed',0);
  assert.ok(Math.abs(actual-reference(theta,d,N,0))<1e-10);
 }
});
test('Gaussian aperture matches the direct spectral average',()=>{
 for(const d of [2,3,7,17])for(const sigma of [.0001,.01,.1])for(const theta of [0,.127,.75]){
  const actual=C(.5*Math.cos(theta),.5*Math.sin(theta),d,12,4,'outward',sigma);
  assert.ok(Math.abs(actual-reference(theta,d,12,sigma))<1e-10);
 }
});
test('zero, stop modes and vanishing high frequencies',()=>{
 assert.ok(Number.isNaN(C(0,0,3,400,4,'outward',.01)));
 assert.ok(Number.isNaN(C(1.9,0,3,400,4,'outward',.01)));
 assert.ok(Number.isNaN(C(.5,0,3,400,4,'inward',.01)));
 assert.ok(Math.abs(C(2.1,0,3,5,4,'fixed',0)-1)<1e-12);
 assert.ok(C(.5,0,17,400,4,'outward',.01)<.02);
});
test('actual worker preserves phase through numerical underflow',()=>{
 let result;context.postMessage=m=>{result=m;};
 const theta=.37,r=.01,step=1e-6,N=400,d=17;
 context.onmessage({data:{W:1,y0row:0,rows:1,or:r*Math.cos(theta),oi:r*Math.sin(theta),exr:step,exi:0,eyr:0,eyi:step,maxIt:N,kind:1,pw:d,kr:0,ki:0,R2:4,stopMode:'outward',needD:true,coherence:true}});
 assert.equal(result.T[0],65535);
 assert.ok(Math.abs(result.C[0]-reference(theta,d,12,step/(Math.sqrt(12)*r))*12/N)<1e-8);
});
