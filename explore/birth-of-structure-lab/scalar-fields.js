'use strict';
// A source returns one scalar per grid point, in world coordinates where applicable.
// A distance is to the nearest sampled member of the finite set, not to an analytic limit.
const SCALAR_SOURCES={auto:'Default for fractal',distance:'Distance to sampled set',sensitivity:'Orbit sensitivity',escape:'Smooth escape time',construction:'Construction generation'};
const scalarSourceFor=(f,source)=>source==='auto'||!Object.hasOwn(SCALAR_SOURCES,source)?(isGeometry(f)?'distance':'sensitivity'):isGeometry(f)?(['distance','construction'].includes(source)?source:'distance'):(source==='construction'?'sensitivity':source);
const scalarSourcesFor=f=>Object.keys(SCALAR_SOURCES).filter(s=>s==='auto'||scalarSourceFor(f,s)===s);
const scalarModes=['scalar','distance','sgrad','sdiv','scurl','shess'];
const scalarMode=m=>scalarModes.includes(m);
function distanceTransform(T,W,H,sx,geometry){
 // Exact squared Euclidean distance transform on the sampled rectangular grid, O(W H).
 const N=W*H,a=new Float64Array(N),out=new Float64Array(N),n=Math.max(W,H),v=new Int32Array(n),z=new Float64Array(n+1),line=new Float64Array(n),d=new Float64Array(n);
 function edt(len){
  let k=-1;
  for(let q=0;q<len;q++){if(!Number.isFinite(line[q]))continue;let s=-Infinity;while(k>=0){const p=v[k];s=((line[q]+q*q)-(line[p]+p*p))/(2*(q-p));if(s>z[k])break;k--;}k++;v[k]=q;z[k]=k===0?-Infinity:s;z[k+1]=Infinity;}
  if(k<0){d.fill(Infinity,0,len);return;}let j=0;for(let q=0;q<len;q++){while(j<k&&z[j+1]<q)j++;d[q]=(q-v[j])**2+line[v[j]];}
 }
 for(let y=0;y<H;y++){for(let x=0;x<W;x++){const member=geometry?T[y*W+x]!==65535:T[y*W+x]===65535;line[x]=member?0:Infinity;}edt(W);for(let x=0;x<W;x++)a[y*W+x]=d[x];}
 for(let x=0;x<W;x++){for(let y=0;y<H;y++)line[y]=a[y*W+x];edt(H);for(let y=0;y<H;y++)out[y*W+x]=Number.isFinite(d[y])?Math.sqrt(d[y])*sx:NaN;}
 return out;
}
const SCALAR_PROVIDERS={
 distance:L=>L.ring?null:distanceTransform(L.T,L.W,L.H,L.sx,!!L.geometry),
 sensitivity:L=>L.S||null,
 escape:L=>Float64Array.from(L.T,(t,i)=>t===65535?NaN:t+L.F[i]),
 construction:L=>L.geometry?Float64Array.from(L.F):null,
 'renormalization-error':L=>L.errorValues||null
};
function scalarField(L,source){
 if(!L.g)L.g={};const key='scalar:'+source;
 if(Object.hasOwn(L.g,key))return L.g[key];
 return L.g[key]=SCALAR_PROVIDERS[source]?.(L)||null;
}
// Render a scalar source with an explicit, frame-independent color policy.
function paintScalarGrid(ctx,L,source,color){
 const V=scalarField(L,source),img=ctx.createImageData(L.W,L.H);
 for(let i=0;i<L.W*L.H;i++){const rgb=color(V?.[i]??NaN,L.flags?.[i]||0);img.data.set(rgb,i*4);img.data[i*4+3]=255;}
 ctx.putImageData(img,0,0);
}
function scalarDifferential(L,mode,S){
 const {W,H,sx}=L,out=new Float64Array(W*H);out.fill(NaN);
 if(!S||L.ring||!(sx>0))return out;
 const d=sx,d2=d*d;
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
  const i=y*W+x,c=S[i],a=S[i-1],b=S[i+1],u=S[i-W],v=S[i+W],ul=S[i-W-1],ur=S[i-W+1],dl=S[i+W-1],dr=S[i+W+1];
  if(![c,a,b,u,v,ul,ur,dl,dr].every(Number.isFinite))continue;
  const gx=(b-a)/(2*d),gy=(u-v)/(2*d),xx=(a+b-2*c)/d2,yy=(u+v-2*c)/d2,xy=((ur-ul)-(dr-dl))/(4*d2),yx=((ur-dr)-(ul-dl))/(4*d2);
  out[i]=mode==='sgrad'?Math.hypot(gx,gy):mode==='sdiv'?xx+yy:mode==='scurl'?yx-xy:Math.hypot(xx,yy,Math.SQRT2*xy);
 }
 return out;
}
if(typeof module!=='undefined')module.exports={distanceTransform,scalarField,scalarDifferential,paintScalarGrid};
