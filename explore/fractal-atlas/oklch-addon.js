'use strict';
/* Perceptual OKLCH palette extension for the pinned Universal Lab.
   Pure display transformation: does not modify iteration or measurement data. */
(()=>{
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 // Oceanic: restrained OKLCH lightness/chroma, with a seamless cyclic ramp.
 // The fractal engine and numerical measurements remain untouched.
 const stops=[
   [0.00,0.44,0.055,252], // deep ocean blue
   [0.17,0.57,0.065,228], // slate blue
   [0.36,0.70,0.075,195], // muted teal
   [0.52,0.81,0.055,175], // soft seafoam
   [0.69,0.85,0.040,92],  // pale sand
   [0.84,0.69,0.052,218], // cool return
   [1.00,0.44,0.055,252]
 ];
 const cv=document.createElement('canvas');cv.width=1024;cv.height=1;
 const cx=cv.getContext('2d',{willReadFrequently:true});
 function sample(t){
   t=((t%1)+1)%1;
   let k=0;while(k<stops.length-2&&t>stops[k+1][0])k++;
   const a=stops[k],b=stops[k+1];
   let f=(t-a[0])/(b[0]-a[0]);f=f*f*(3-2*f);
   const L=a[1]+(b[1]-a[1])*f;
   const C=a[2]+(b[2]-a[2])*f;
   const h=a[3]+(b[3]-a[3])*f;
   return 'oklch('+(L*100).toFixed(3)+'% '+C.toFixed(4)+' '+h.toFixed(2)+')';
 }
 function makeLut(cyclic){
   for(let i=0;i<1024;i++){
     const t=i/(cyclic?1024:1023);
     cx.fillStyle=sample(t);
     cx.fillRect(i,0,1,1);
   }
   const rgba=cx.getImageData(0,0,1024,1).data;
   const out=new Uint32Array(1024);
   for(let i=0;i<1024;i++){const k=i*4;out[i]=(0xff000000|(rgba[k+2]<<16)|(rgba[k+1]<<8)|rgba[k])>>>0;}
   return out;
 }
 function rebuild(){
   PALETTES.oklch={t:'OKLCH · Oceanic',cyc:makeLut(true),seq:makeLut(false)};
   if(cfg.palette==='oklch')repaint();
 }
 rebuild();

 // The main configuration and quick palette chooser share the same option.
 // Both groups were initialized before this addon loaded.
 function addOption(id,get,set){
   const el=document.getElementById(id);
   if(!el || [...el.children].some(b=>b._v==='oklch'))return;
   const b=document.createElement('button');
   b.type='button';b.className='opt';b._v='oklch';
   const title=document.createElement('b');title.textContent='OKLCH · Oceanic';b.append(title);
   b.onclick=()=>set('oklch');
   el.append(b);
 }
 addOption('qPal',()=>cfg.palette,setPalette);
 addOption('gPal',()=>draft.palette,v=>{draft.palette=v;syncCfg();thumbs();});
 // Refresh selected state when this palette is active.
 if(cfg.palette==='oklch')syncQuick();
})();
