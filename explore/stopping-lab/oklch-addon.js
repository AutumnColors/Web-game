'use strict';
/* Perceptual OKLCH palette extension for the pinned Universal Lab.
   Pure display transformation: does not modify iteration or measurement data. */
(()=>{
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const state={hue:0,chroma:.14,light:70,cycles:1};
 const cv=document.createElement('canvas');cv.width=1024;cv.height=1;
 const cx=cv.getContext('2d',{willReadFrequently:true});
 function makeLut(cyclic){
   for(let i=0;i<1024;i++){
     const t=i/(cyclic?1024:1023);
     cx.fillStyle='oklch('+state.light+'% '+state.chroma+' '+((t*360*state.cycles+state.hue)%360)+'deg)';
     cx.fillRect(i,0,1,1);
   }
   const rgba=cx.getImageData(0,0,1024,1).data;
   const out=new Uint32Array(1024);
   for(let i=0;i<1024;i++){const k=i*4;out[i]=(0xff000000|(rgba[k+2]<<16)|(rgba[k+1]<<8)|rgba[k])>>>0;}
   return out;
 }
 function rebuild(){
   PALETTES.oklch={t:'OKLCH · perceptual',cyc:makeLut(true),seq:makeLut(false)};
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
   const title=document.createElement('b');title.textContent='OKLCH · perceptual';b.append(title);
   b.onclick=()=>set('oklch');
   el.append(b);
 }
 addOption('qPal',()=>cfg.palette,setPalette);
 addOption('gPal',()=>draft.palette,v=>{draft.palette=v;syncCfg();thumbs();});
 // Refresh selected state when this palette is active.
 if(cfg.palette==='oklch')syncQuick();
})();
