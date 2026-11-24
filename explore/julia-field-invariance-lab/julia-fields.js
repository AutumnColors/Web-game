'use strict';
const juliaFields={
 // Critical-point field: E = conj((f^n)''/(f^n)') = grad log|(f^n)'|, charges at the critical points of f^n (total d^n - 1).
 field(x,y,a,b,n,p){let u=1,v=0,s=0,t=0;for(let k=0;k<n;k++){let r=Math.hypot(x,y);if(!r||!Number.isFinite(r))return null;let co=x/r,si=y/r,qr=(u*co+v*si)/r,qi=(v*co-u*si)/r;s+=(p-1)*qr;t+=(p-1)*qi;if(k===n-1)break;let angle=p*Math.atan2(y,x),rad=r**p;if(!Number.isFinite(rad)||rad>1e100){let rem=p**(n-k-1)-1;s+=rem*p*qr;t+=rem*p*qi;break;}let X=rad*Math.cos(angle),Y=rad*Math.sin(angle),U=p*(X*qr-Y*qi);v=p*(X*qi+Y*qr);u=U;x=X+a;y=Y+b;}return Number.isFinite(s)&&Number.isFinite(t)?[s,-t]:null},
 // Source-point field: E = conj((f^n)'/(f^n - s)) = grad log|f^n(z) - s|, one charge at each of the d^n solutions of f^n(zeta) = s.
 // Same Julia set for every s; different field for each finite n; the same limit grad G as n grows (Brolin).
 sourceField(x,y,a,b,n,p,sr,si){
  let u=1,v=0;
  for(let k=0;k<n;k++){
   const r=Math.hypot(x,y); if(!Number.isFinite(r)) return null;
   const rad=r**p;
   if(rad>1e100){ // f^(n-k)(z_k) = z_k^(d^(n-k)) (1 + tiny), so (f^n)'/(f^n - s) = d^(n-k) z_k'/z_k to relative 1e-100
    const m=p**(n-k), r2=r*r; return [m*(u*x+v*y)/r2, -m*(v*x-u*y)/r2];
   }
   const th=Math.atan2(y,x), rp1=r**(p-1), c1=rp1*Math.cos((p-1)*th), s1=rp1*Math.sin((p-1)*th); // z^(p-1)
   const U=p*(c1*u-s1*v); v=p*(c1*v+s1*u); u=U;                                                   // w <- p z^(p-1) w
   x=rad*Math.cos(p*th)+a; y=rad*Math.sin(p*th)+b;                                                // z <- z^p + c
  }
  const dx=x-sr, dy=y-si, d2=dx*dx+dy*dy; if(!d2||!Number.isFinite(d2)) return null;
  const qr=(u*dx+v*dy)/d2, qi=(v*dx-u*dy)/d2;                                                     // w / (z - s)
  return Number.isFinite(qr)&&Number.isFinite(qi)?[qr,-qi]:null;
 },
 a:[0,0], a2:[0.5,0.5], placing:0, qCache:null,
 // charges as points: [x, y, generation]
 charges(mode,c,p,n,s){
  const key=[mode,c[0],c[1],p,n,s[0],s[1]].join();
  if(this.qCache&&this.qCache.key===key) return this.qCache.list;
  const total=mode==='crit'?(p**n-1)/(p-1):p**n; let list=null;
  if(total<=6000){
   const pre=(z)=>{const wx=z[0]-c[0],wy=z[1]-c[1],R=Math.hypot(wx,wy)**(1/p),t0=Math.atan2(wy,wx),o=[];for(let j=0;j<p;j++){const t=(t0+2*Math.PI*j)/p;o.push([R*Math.cos(t),R*Math.sin(t)]);}return o;};
   if(mode==='crit'){ let gen=[[0,0]]; list=[[0,0,0]]; for(let k=1;k<n;k++){ gen=gen.flatMap(pre); for(const z of gen) list.push([z[0],z[1],k]); } }
   else { let gen=[s]; for(let k=0;k<n;k++) gen=gen.flatMap(pre); list=gen.map(z=>[z[0],z[1],n]); }
  }
  this.qCache={key,list}; return list;
 },
 src(){ return document.getElementById('jfSrc').value; },
 green(x,y,a,b,p,k,quality){
 let u=1,v=0; const limit=quality*24, R=Math.max(64,Math.hypot(a,b)+2);
 for(let i=0;i<=limit;i++){
  const r=Math.hypot(x,y);
  if(r>R){const co=x/r,si=y/r,m=p**k-1;return [m*(u*co+v*si)/r,m*(u*si-v*co)/r];}
  if(i===limit)return null;
  const th=Math.atan2(y,x),rad=r**p,amp=r**(p-1),co=Math.cos((p-1)*th),si=Math.sin((p-1)*th);
  const U=amp*(co*u-si*v);v=amp*(si*u+co*v);u=U;
  x=rad*Math.cos(p*th)+a;y=rad*Math.sin(p*th)+b;
  if(![x,y,u,v].every(Number.isFinite))return null;
 }return null;
 },
 F(mode,s,wx,wy,a,c,n,p){ if(mode==='green')return this.green(wx,wy,a,c,p,+document.getElementById('jfCompose').value,+document.getElementById('jfN').value); return mode==='crit'?this.field(wx,wy,a,c,n,p):this.sourceField(wx,wy,a,c,n,p,s[0],s[1]); },
 draw(){const panel=document.getElementById('juliaFieldControls');const active=cfg.fractal==='julia';panel.hidden=!active;if(!active||cfg.polar||cfg.bottcher||cmp()||cfg.clean||!Number.isInteger(cfg.juliaPower)||cfg.juliaPower<2)return;
 const $j=id=>document.getElementById(id);
 const sk=[cfg.juliaPower,$j('jfN').value,$j('jfCompose').value,this.src()].join(); if(this.syncKey!==sk){ this.syncKey=sk; this.sync(); }
 const e=$j('jfE').checked,b=$j('jfB').checked,j=$j('jfJ').checked,showQ=$j('jfQ').checked&&this.src()!=='green',diff=$j('jfDiff').checked&&this.src()!=='green',n=+$j('jfN').value * +$j('jfCompose').value,mode=this.src();
 const w=Wd/DPR,h=Hd/DPR,spacing=w/(+$j("jfDensity").value),arrowScale=+$j("jfSize").value,p=cfg.juliaPower,a=cfg.seed.re,c=cfg.seed.im,co=Math.cos(view.a),si=Math.sin(view.a);
 const showA=mode==='a', showA2=diff;
 if(!e&&!b&&!j&&!showQ&&!showA&&!showA2)return;
 ctx.save();ctx.scale(DPR,DPR);
 if(j){const step=2,cols=Math.ceil(w/step),rows=Math.ceil(h/step),mask=new Uint8Array(cols*rows);for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){let [x,y]=toWorld(ix*step*DPR,iy*step*DPR),k=0;for(;k<100;k++){if(Math.hypot(x,y)>Math.max(2,Math.hypot(a,c)+1))break;let r=Math.hypot(x,y)**p,ang=p*Math.atan2(y,x);x=r*Math.cos(ang)+a;y=r*Math.sin(ang)+c;}mask[iy*cols+ix]=k===100?1:0;}ctx.fillStyle='#f0f0f0';for(let iy=1;iy<rows-1;iy++)for(let ix=1;ix<cols-1;ix++){let i=iy*cols+ix;if(mask[i]&&(!mask[i-1]||!mask[i+1]||!mask[i-cols]||!mask[i+cols]))ctx.fillRect(ix*step,iy*step,step,step);}}
 const N1=mode==='green'?1:mode==='crit'?p**n-1:p**n;
 function arrow(x,y,u,v,col,len){let mag=Math.hypot(u,v);if(!mag||!Number.isFinite(mag)||len<0.6)return;let dx=(u*co+v*si)/mag*len,dy=-(-u*si+v*co)/mag*len;ctx.strokeStyle=col;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x-dx/2,y-dy/2);ctx.lineTo(x+dx/2,y+dy/2);ctx.lineTo(x+dx*.18-dy*.2,y+dy*.18+dx*.2);ctx.moveTo(x+dx/2,y+dy/2);ctx.lineTo(x+dx*.18+dy*.2,y+dy*.18-dx*.2);ctx.stroke();}
 const k0=Math.min(spacing/21,1.6)*arrowScale;
 if(e||b) for(let y=spacing*13/21;y<h;y+=spacing)for(let x=spacing*13/21;x<w;x+=spacing){
  let [wx,wy]=toWorld(x*DPR,y*DPR),f=this.F(mode,this.a,wx,wy,a,c,n,p);if(!f)continue;
  if(diff){ // difference of two sources: same Julia set, so whatever is left is how the two fields disagree
   const g=this.sourceField(wx,wy,a,c,n,p,this.a2[0],this.a2[1]); if(!g) continue;
   const u=f[0]/N1-g[0]/p**n, v=f[1]/N1-g[1]/p**n, len=18*Math.tanh(4*Math.hypot(u,v))*k0;
   if(e)arrow(x,y,u,v,'#ff7fb6',len * (mode==='green'?1:+$j('jfElectric').value)); if(b)arrow(x,y,-v,u,'#7ff0c4',len * (mode==='green'?1:+$j('jfMagnetic').value));
  } else {
   let [u,v]=f,len=(mode==='green'?22*Math.tanh(Math.hypot(u,v)):5+13*Math.tanh(Math.hypot(u,v)/N1))*k0;
   if(e)arrow(x,y,u,v,'#eac16c',len * (mode==='green'?1:+$j('jfElectric').value)); if(b)arrow(x,y,-v,u,'#63c9ee',len * (mode==='green'?1:+$j('jfMagnetic').value));
  }
 }
 const dot=(wx,wy,r,col)=>{const [sx,sy]=toScreen(wx,wy);ctx.beginPath();ctx.arc(sx/DPR,sy/DPR,r,0,TAU);ctx.fillStyle=col;ctx.fill();};
 if(showQ){ const Q=this.charges(mode,[a,c],p,n,this.a); if(Q){ const r=Math.max(1.5,4-0.3*n); ctx.lineWidth=1; for(const q of Q) dot(q[0],q[1],r,q[2]===(mode==='crit'?n-1:n)?'#ffffff':'rgba(255,255,255,.55)'); } }
 const mark=(s,label,col)=>{const [sx,sy]=toScreen(s[0],s[1]),x=sx/DPR,y=sy/DPR;ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.6)';ctx.beginPath();ctx.arc(x,y,8,0,TAU);ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle=col;ctx.beginPath();ctx.arc(x,y,8,0,TAU);ctx.stroke();textShadow(label,x+11,y-9,'700 13px system-ui,sans-serif','left',col);};
 if(showA) mark(this.a,'a','#eac16c');
 if(showA2) mark(this.a2,'a₂','#ff7fb6');
 ctx.restore();
 },
 fmt(s){ const r=x=>String(+x.toFixed(6)); return r(s[0])+(s[1]<0?' − ':' + ')+r(Math.abs(s[1]))+'i'; },
 sync(){ const $j=id=>document.getElementById(id), mode=this.src(), n=+$j('jfN').value * +$j('jfCompose').value, p=typeof cfg!=='undefined'?cfg.juliaPower:2;
  $j('jfSourceSliders').hidden=mode!=='a'; $j('jfLegacyStrength').hidden=mode==='green'; $j('jfQ').disabled=mode==='green'; $j('jfDiff').disabled=mode==='green'; $j('jfARow').hidden=mode!=='a'; $j('jfA2Row').hidden=!$j('jfDiff').checked;
  $j('jfOut').textContent=$j('jfN').value; for(const id of ['jfCompose','jfElectric','jfMagnetic']) $j(id+'Out').textContent=$j(id).value; $j('jfDensityOut').textContent=$j('jfDensity').value; $j('jfSizeOut').textContent=$j('jfSize').value+'×';
  const total=Number.isInteger(p)&&p>=2?(mode==='crit'?p**n-1:p**n):NaN;
  $j('jfCount').textContent=mode==='green'?'Intrinsic magnitude factor: '+(p**(+$j('jfCompose').value)-1):Number.isFinite(total)?total.toLocaleString('en-US')+(mode==='crit'?' charges at the critical points of fⁿ':' charges at the points with fⁿ(z) = a'):'';
 }
};
// Tapping the map while "Tap map" is armed places a or a2 instead of a pin. placePin is the lab's tap handler (overlays.js).
{ const pinTap=placePin;
  placePin=function(px,py){
   const k=juliaFields.placing; if(!k) return pinTap(px,py);
   const [re,im]=toWorld(px,py), s=[re,im]; juliaFields.placing=0;
   if(k===1){ juliaFields.a=s; document.getElementById('jfA').value=juliaFields.fmt(s); }
   else { juliaFields.a2=s; document.getElementById('jfA2').value=juliaFields.fmt(s); }
   for(const id of ['jfPickA','jfPickA2']) document.getElementById(id).classList.remove('on');
   toast((k===1?'a':'a₂')+' = '+juliaFields.fmt(s)); needDraw=true;
  };
}
for(const id of ['jfE','jfB','jfJ','jfQ','jfDiff','jfN','jfDensity','jfSize','jfSrc','jfCompose','jfElectric','jfMagnetic'])document.getElementById(id).addEventListener('input',()=>{juliaFields.sync();needDraw=true;});
for(const [id,key] of [['jfA','a'],['jfA2','a2']]) document.getElementById(id).addEventListener('input',e=>{const v=parseC(e.target.value);e.target.classList.toggle('bad',!v);if(v){juliaFields[key]=[v.re,v.im];needDraw=true;}});
for(const [id,k] of [['jfPickA',1],['jfPickA2',2]]) document.getElementById(id).addEventListener('click',()=>{
 const on=juliaFields.placing!==k; juliaFields.placing=on?k:0;
 document.getElementById('jfPickA').classList.toggle('on',on&&k===1); document.getElementById('jfPickA2').classList.toggle('on',on&&k===2);
 if(on){ closePop(); toast('Tap the map to place '+(k===1?'a':'a₂'),2600); }
});
juliaFields.sync();
