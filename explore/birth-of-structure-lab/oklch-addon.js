'use strict';
/* Perceptual OKLCH palette extension for the pinned Universal Lab.
   Pure display transformation: does not modify iteration or measurement data. */
(()=>{
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const stops=[[0,.44,.055,252],[.17,.57,.065,228],[.36,.70,.075,195],[.52,.81,.055,175],[.69,.85,.040,92],[.84,.69,.052,218],[1,.44,.055,252]];
 const cv=document.createElement('canvas');cv.width=1024;cv.height=1;
 const cx=cv.getContext('2d',{willReadFrequently:true});
 function sample(t){
   t=((t%1)+1)%1;
   let k=0;while(k<stops.length-2&&t>stops[k+1][0])k++;
   const a=stops[k],b=stops[k+1];let f=(t-a[0])/(b[0]-a[0]);f=f*f*(3-2*f);
   return 'oklch('+((a[1]+(b[1]-a[1])*f)*100).toFixed(3)+'% '+(a[2]+(b[2]-a[2])*f).toFixed(4)+' '+(a[3]+(b[3]-a[3])*f).toFixed(2)+')';
 }
 function makeLut(cyclic){
   for(let i=0;i<1024;i++){cx.fillStyle=sample(i/(cyclic?1024:1023));cx.fillRect(i,0,1,1);}
   const rgba=cx.getImageData(0,0,1024,1).data,out=new Uint32Array(1024);
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

/* Layer-local palette controls. Palette changes only repaint cached fields. */
(()=>{
 const defaults={sens:'gray',sgrad:'gray',waves:'gray',phase:'hue',stablephase:'hue',normphase:'hue',coherence:'gray'};
 const settings=new Map();
 const hueValues=new Map();
 const key=c=>c.mode;
 const choice=c=>settings.get(key(c))||defaults[key(c)]||'classic';
 const hue=c=>hueValues.get(key(c))??145;
 function build(h){
   const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   for(let i=0;i<1024;i++){const t=i/1023;ctx.fillStyle='oklch('+t+' '+(.13*Math.sin(Math.PI*t))+' '+h+')';ctx.fillRect(i,0,1,1);}
   const seq=new Uint32Array(ctx.getImageData(0,0,1024,1).data.buffer);
   return {t:'Hue Scale',seq,cyc:seq};
 }
 const cache=new Map();
 function palette(h){if(!cache.has(h)){if(cache.size>=24)cache.clear();cache.set(h,build(h));}return cache.get(h);}
 PALETTES.huescale=palette(145);
 const oldPaint=paint;
 paint=function(L,m){
   const previous=cfg.palette, previousHue=PALETTES.huescale;
   const selected=settings.get(m)||defaults[m]||'classic';
   cfg.palette=selected;
   if(selected==='huescale')PALETTES.huescale=palette(hueValues.get(m)??145);
   try{return oldPaint(L,m);}finally{cfg.palette=previous;PALETTES.huescale=previousHue;}
 };
 function mount(id,getConfig){
   const groupEl=$(id);if(!groupEl)return;
   const wrap=document.createElement('div');wrap.style.cssText='margin:8px 0;display:grid;gap:6px';
   const label=document.createElement('label'), slider=document.createElement('input'), preview=document.createElement('canvas');
   slider.type='range';slider.min=0;slider.max=359;slider.step=1;slider.style.width='100%';preview.width=256;preview.height=16;preview.style.width='100%';
   label.append(slider);wrap.append(label,preview);groupEl.after(wrap);
   const title=document.createElement('div');groupEl.before(title);
   function refresh(){
     const c=getConfig(), p=choice(c), h=hue(c);title.textContent='Palette · '+modeOf(c.mode).t;
     wrap.hidden=p!=='huescale';wrap.style.display=wrap.hidden?'none':'grid';
     if(document.activeElement!==slider)slider.value=h;
     slider.setAttribute('aria-label','Hue for '+modeOf(c.mode).t);
     const lut=palette(h).seq,ctx=preview.getContext('2d'),img=ctx.createImageData(256,16),out=new Uint32Array(img.data.buffer);
     for(let i=0;i<out.length;i++)out[i]=lut[(i%256)*4];ctx.putImageData(img,0,0);
     syncGroups(groupEl.parentElement);
   }
   group(groupEl,Object.keys(PALETTES).map(v=>({v,t:PALETTES[v].t})),()=>choice(getConfig()),v=>{settings.set(key(getConfig()),v);repaint();refresh();});
   slider.oninput=()=>{hueValues.set(key(getConfig()),+slider.value);repaint();refresh();};
   let last='';function tick(){const c=getConfig(),s=c.mode+':'+choice(c)+':'+hue(c);if(s!==last){last=s;refresh();}requestAnimationFrame(tick);}tick();
 }
 mount('qPal',()=>cfg);mount('gPal',()=>draft);
 repaint();
})();
