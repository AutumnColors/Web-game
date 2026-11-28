const assert=require('node:assert/strict');
const {distanceTransform,scalarField,scalarDifferential}=require('./scalar-fields.js');
for(const geometry of [false,true])for(const [W,H] of [[1,1],[7,9],[16,13]]){
 const T=Uint16Array.from({length:W*H},(_,i)=>((i*17+3)%11<2)===geometry?1:65535),d=distanceTransform(T,W,H,.2,geometry),sites=[];
 for(let i=0;i<T.length;i++)if(geometry?T[i]!==65535:T[i]===65535)sites.push(i);
 for(let i=0;i<T.length;i++){const expected=Math.min(...sites.map(j=>Math.hypot(i%W-j%W,Math.floor(i/W)-Math.floor(j/W))))*.2;assert.ok(sites.length?Math.abs(d[i]-expected)<1e-12:Number.isNaN(d[i]));}
}
const W=11,H=11,sx=.25,L={W,H,sx,g:{},S:Float64Array.from({length:W*H},(_,i)=>((i%W-5)*sx)**2+((Math.floor(i/W)-5)*sx)**2)};
const S=scalarField(L,'sensitivity');assert.equal(S,L.S);
for(const [m,w] of [['sgrad',0],['sdiv',4],['scurl',0],['shess',Math.sqrt(8)]])assert.ok(Math.abs(scalarDifferential(L,m,S)[60]-w)<1e-12,m);
console.log('Distance transform and shared scalar derivatives passed');
