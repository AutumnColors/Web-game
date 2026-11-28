const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('./renormalization-error.js');
const cfg=(d,re,im=0)=>({juliaPower:d,seed:{re,im}});
test('quadratic accumulation and nearby fixed parameter differ',()=>{
 const a=cfg(2,-1.4011551890920506),b=cfg(2,-1.39);
 const x=[1,2,4,8].map(n=>R.frame(a,n)),y=[1,2,4,8].map(n=>R.frame(b,n));
 assert.ok(x.every(q=>q.status==='finite'&&q.coverage===1));
 assert.ok(x.at(-1).rms<x[0].rms/50);
 assert.ok(y.some((q,i)=>i&&q.rms>y[i-1].rms));
 assert.ok(x[0].scale[0]<0&&x[1].scale[0]>0);
});
test('zero return and unresolvable return are not zero error',()=>{
 for(const [c,n] of [[cfg(2,-1),2],[cfg(2,0),1],[cfg(2,-1+1e-15),2]]){
  const q=R.frame(c,n);
  assert.match(q.status,/zero-scale|unresolved-scale/);
  assert.equal(q.rms,null);assert.equal(q.coverage,0);
  assert.notDeepEqual(R.color(q.errorValues[0],q.flags[0]),[0,0,0]);
 }
});
test('complex, odd and higher even powers use measured scales',()=>{
 for(const c of [cfg(3,-.5),cfg(4,-1.1),cfg(6,-1.03),cfg(3,.12,.17)]){
  const q=R.frame(c,1);
  assert.equal(q.status,'finite');assert.ok(Number.isFinite(q.rms));assert.deepEqual(q.scale,[c.seed.re,c.seed.im]);
  const z=R.compare(c,1,R.scale(c,1),R.scale(c,2),[0,0]);assert.equal(z.value,0);
 }
 assert.ok(R.frame(cfg(3,-.5),1).ratio>1);
});
test('fixed transfer function and explicit invalid states',()=>{
 assert.deepEqual(R.color(0,0),[0,0,0]);
 assert.ok(R.color(.1,0)[0]<R.color(1,0)[0]);
 for(let i=1;i<=3;i++)assert.notDeepEqual(R.color(NaN,i),[0,0,0]);
 assert.equal(R.frame(cfg(2,-1),65536).status,'return-time-limit');
 const a=R.frame(cfg(2,-1.39),1,1),b=R.frame(cfg(2,-1.39),1,1.618);
 assert.equal(a.rms,b.rms);assert.equal(a.coverage,b.coverage);
});
