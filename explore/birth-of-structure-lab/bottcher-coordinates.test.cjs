'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'engine.js'),'utf8');
const worker=source.match(/const WORKER_SRC=`([\s\S]*?)`;/)[1];
const main=source.slice(source.lastIndexOf('function bottcherPotential'),source.lastIndexOf('const wrap='));
const load=s=>new Function(s+';return {bottcherInverse,bottcherPotential,parameterInverse};')();
const f=load(main),w=load(worker.replace('onmessage=e=>','let onmessage=e=>'));
const near=(a,b,tol)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<=tol,JSON.stringify({a,b,tol}));
test('exact monomial and Chebyshev references',()=>{
 for(const u of [.0001,.02,.6,2])for(let j=0;j<32;j++){const t=2*Math.PI*j/32;
 for(const d of [2,3,6,10])near(f.bottcherInverse(u,t,0,0,d),[Math.exp(u)*Math.cos(t),Math.exp(u)*Math.sin(t)],1e-12);
 near(f.bottcherInverse(u,t,-2,0),[(Math.exp(u)+Math.exp(-u))*Math.cos(t),(Math.exp(u)-Math.exp(-u))*Math.sin(t)],1e-8);}
});
test('integer Julia conjugacy, branch continuity and critical cutoff',()=>{
 for(const d of [2,3,4,6,10])for(const c of [[-1,0],[-.3,.2],[.4,.6],[2,0]]){
 const floor=f.bottcherPotential(0,0,...c,d);
 for(let j=0;j<24;j++){const t=2*Math.PI*(j+.37)/24,state={};for(const u of [3,1,.2,.02,.002,.0001]){
 if(u<=floor*1.01)continue;
 const z=f.bottcherInverse(u,t,...c,d,floor,state),q=f.bottcherInverse(d*u,d*t,...c,d,floor);
 const m=Math.pow(Math.hypot(...z),d),a=d*Math.atan2(z[1],z[0]);
 near([m*Math.cos(a)+c[0],m*Math.sin(a)+c[1]],q,1e-8*Math.max(1,Math.hypot(...q)));
 near(z,w.bottcherInverse(u,t,...c,d,floor),1e-8);
 }}
 if(floor>0)assert.ok(Number.isNaN(f.bottcherInverse(floor*.9,0,...c,d,floor)[0]));
 }
});
test('Mandelbrot parameter ray potential and reflection',()=>{
 for(let j=0;j<16;j++){const t=2*Math.PI*(j+.17)/16,state={};for(const u of [3,1,.6,.1,.02,.001,.0001]){
 const z=f.parameterInverse(u,t,state),q=f.parameterInverse(u,-t);
 assert.ok(Number.isFinite(z[0]),JSON.stringify({u,t,z}));
 assert.ok(Math.abs(f.bottcherPotential(...z,...z,2)-u)<Math.max(2e-7,u*2e-5));
 near(z,[q[0],-q[1]],2e-6);near(z,w.parameterInverse(u,t),2e-6);
 }}
});
test('actual worker exterior pixel sampling',()=>{
 let out;const run=new Function('postMessage','let onmessage;'+worker+';return onmessage')(m=>out=m);
 for(const [kind,pw,kr,ki] of [[1,2,-1,0],[1,6,-.3,.2],[0,2,0,0]]){
 const W=16,rows=12;run({data:{W,rows,y0row:0,or:0,oi:0,exr:0,exi:0,eyr:0,eyi:0,maxIt:1000,kind,pw,kr,ki,R2:4,stopMode:'outward',needD:true,needDLD:false,polar:true,polarH:rows,polarAngle:Math.PI,bottcher:true,bottcherGMin:.02,bottcherGMax:.6,bottcherCritical:kind===1?f.bottcherPotential(0,0,kr,ki,pw):0}});
 assert.equal(out.T.length,W*rows);assert.ok([...out.T].every(n=>n!==65535));assert.ok([...out.S].every(Number.isFinite));
 }
});


test('measured Green potential is horizontal and independent of orbit stopping',()=>{
 let out;const run=new Function('postMessage','let onmessage;'+worker+';return onmessage')(m=>out=m);
 for(const [kind,pw,kr,ki] of [[1,2,-1.401155189,0],[1,6,-.3,.2],[0,2,0,0]]){
 let previous;
 for(const [R2,stopMode] of [[4,'outward'],[256,'outward'],[4,'fixed']]){
 const W=64,rows=24;
 run({data:{W,rows,y0row:0,or:0,oi:0,exr:0,exi:0,eyr:0,eyi:0,maxIt:128,kind,pw,kr,ki,R2,stopMode,needD:true,needDLD:false,polar:true,polarH:rows,polarAngle:Math.PI,bottcher:true,bottcherGMin:.01,bottcherGMax:.3,bottcherCritical:0}});
 for(let y=0;y<rows;y++){
 const expected=Math.log(.3)*(1-(y+.5)/rows)+Math.log(.01)*(y+.5)/rows;
 const values=Array.from(out.G.slice(y*W,(y+1)*W));
 assert.ok(values.every(v=>Number.isFinite(v)&&Math.abs(v-expected)<3e-5));
 assert.ok(Math.max(...values)-Math.min(...values)<3e-5);
 }
 if(previous)assert.deepEqual(out.G,previous);
 previous=out.G;
 }
 }
});
