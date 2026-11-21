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
 const host=document.createElement('div');
 host.id='oklch-controls';
 host.innerHTML='<div class="lbl">Perceptual colours · OKLCH</div><button type="button" class="opt" id="oklch-enable"><b>Use OKLCH palette</b><small>Colour the current fractal without recalculating it</small></button><div id="oklch-sliders" style="display:none;padding:8px 4px 12px"></div>';
 const pop=document.getElementById('pop');
 pop.appendChild(host);
 const sliders=host.querySelector('#oklch-sliders');
 const specs=[['hue','Hue rotation',0,360,1,'°'],['chroma','Chroma',0,.24,.005,''],['light','Lightness',25,90,1,'%'],['cycles','Hue cycles',1,12,1,'×']];
 for(const [key,title,min,max,step,unit] of specs){
   const label=document.createElement('label');label.style.cssText='display:block;margin:12px 0 3px;font-size:12px;color:#ddd';
   const val=document.createElement('span');val.style.float='right';val.textContent=state[key]+unit;
   label.append(title,val);
   const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=state[key];input.style.width='100%';
   input.addEventListener('input',()=>{state[key]=Number(input.value);val.textContent=state[key]+unit;rebuild();});
   sliders.append(label,input);
 }
 const button=host.querySelector('#oklch-enable');
 button.onclick=()=>{setPalette('oklch');sliders.style.display='block';button.querySelector('b').textContent='OKLCH active';};
 // Restore slider access when a previously saved OKLCH palette is loaded.
 if(cfg.palette==='oklch'){sliders.style.display='block';button.querySelector('b').textContent='OKLCH active';}
 const note=document.createElement('div');note.className='note';note.textContent='Hue is mapped from the selected measurement, not from the geometric direction of the fractal boundary. Values remain unchanged; only the palette changes.';
 sliders.appendChild(note);
})();