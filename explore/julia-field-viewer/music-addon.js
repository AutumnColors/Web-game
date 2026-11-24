'use strict';
/* Music for the Universal Lab — an add-on, loaded only when ♫ is pressed (or a link carries mu=…).
   It uses only window.FractalLab (the lab's knobs, from lab-addons.js) and the shared <studio-player>. If anything here fails,
   the lab keeps working: the hooks are removed and the original colours come back.

   How the colours dance without recomputing the fractal:
   each finished layer is painted once more with an "index palette" (every colour encodes its own palette position),
   so the add-on knows where every pixel sits in the palette. Each frame it builds a new 1024-entry palette from the
   music (shift, density, brightness) and looks every pixel up again. Zoom pulse and sway only move the finished image. */
(()=>{
const FL=window.FractalLab;
const STUDIO=new URL('../../shared/studio/player.js',document.currentScript.src).href;
const $=id=>document.getElementById(id);
const BLACK=0xFF000000, WHITE=0xFFFFFFFF, LEVELS=12;
const ID={cyc:new Uint32Array(1024),seq:new Uint32Array(1024)};
for(let i=0;i<1024;i++){ ID.cyc[i]=(BLACK|(0x80<<16)|((i>>8)<<8)|(i&255))>>>0; ID.seq[i]=(BLACK|(0x40<<16)|((i>>8)<<8)|(i&255))>>>0; }

let player=null, choreo=null, panel=null, enabled=true, exporting=false, recording=false, active=false;
const st={phase:0,pos:0,k:1,bright:1,lines:0,zoom:1,turn:0};

function load(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(Error('Could not load '+src)); document.head.append(s); }); }

/* ---------- index capture: where every pixel sits in the palette ---------- */
function capture(L){
  const cfg=FL.cfg, P=FL.palettes, key=cfg.palette, keep=P[key], keepC=cfg.contours;
  const orig=L.imgs.slice(), mu=[];
  P[key]=ID; cfg.contours=false;
  try{
    FL.shown().forEach((m,k)=>{
      const c=FL.paint(L,m); if(!c){ mu[k]=null; return; }
      const W=c.width, H=c.height, n=W*H, d=c.getContext('2d').getImageData(0,0,W,H).data, code=new Uint16Array(n);
      for(let i=0,j=0;i<n;i++,j+=4){ const r=d[j],g=d[j+1],b=d[j+2];
        code[i]= b===0x80&&g<4 ? (g<<8|r) : b===0x40&&g<4 ? 1024+(g<<8|r) : (r===255&&g===255&&b===255) ? 2049 : 2048; }
      // contour mask: edges between palette bands (iso-lines of the measurement)
      const edge=new Uint8Array(n), band=x=>x<1024?((x*LEVELS)>>10):x<2048?100+(((x-1024)*LEVELS)>>10):-1;
      for(let y=0;y<H-1;y++) for(let x=0;x<W-1;x++){ const i=y*W+x, a=band(code[i]); if(a<0) continue;
        const r=band(code[i+1]), b=band(code[i+W]); if((r>=0&&r!==a)||(b>=0&&b!==a)) edge[i]=1; }
      let over=null;
      if(m==='potential'&&keepC){ cfg.contours=true; over=document.createElement('canvas'); over.width=W; over.height=H; FL.contours(over,L); cfg.contours=false; }
      const out=document.createElement('canvas'); out.width=W; out.height=H;
      mu[k]={W,H,code,edge,over,out,g:out.getContext('2d'),img:new ImageData(W,H)};
    });
  } finally { P[key]=keep; cfg.contours=keepC; }
  L.mu=mu; L.muOrig=orig;
}
function release(L){ if(L.muOrig) L.imgs=L.muOrig; delete L.mu; delete L.muOrig; }

/* ---------- recolour from the music state ---------- */
function luts(){
  const P=FL.palettes[FL.cfg.palette]||FL.palettes.classic, C=new Uint32Array(1024), S=new Uint32Array(1024), b=st.bright;
  const shade=c=>{ if(b===1) return c; const r=Math.min(255,(c&255)*b), g=Math.min(255,((c>>8)&255)*b), bl=Math.min(255,((c>>16)&255)*b); return (BLACK|(bl<<16)|(g<<8)|r)>>>0; };
  for(let i=0;i<1024;i++){
    let x=i/1024*st.k+st.pos; x-=Math.floor(x); C[i]=shade(P.cyc[(x*1024)|0]);
    let y=(i/1023*st.k+st.pos)%2; if(y<0) y+=2; if(y>1) y=2-y; S[i]=shade(P.seq[Math.min(1023,(y*1023)|0)]);
  }
  return [C,S];
}
function recolour(){
  const [C,S]=luts(), la=Math.min(1,st.lines*0.8);
  for(const L of FL.layers()){
    if(!L.mu) capture(L);
    L.mu.forEach((m,k)=>{ if(!m) return;
      const o=new Uint32Array(m.img.data.buffer), {code,edge}=m, n=code.length;
      for(let i=0;i<n;i++){ const c=code[i]; o[i]= c<1024?C[c] : c<2048?S[c-1024] : c===2048?BLACK : WHITE; }
      if(la>0.02) for(let i=0;i<n;i++) if(edge[i]){ const c=o[i], r=c&255, g=(c>>8)&255, b=(c>>16)&255;
        o[i]=(BLACK|((b+(255-b)*la)<<16)|((g+(255-g)*la)<<8)|(r+(255-r)*la))>>>0; }
      m.g.putImageData(m.img,0,0); if(m.over) m.g.drawImage(m.over,0,0);
      L.imgs[k]=m.out;
    });
  }
  FL.redraw();
}

/* ---------- the music state for one frame ---------- */
function step(f,dt){
  const v=choreo.values(f,dt), on=id=>choreo.map[id].source!=='none';
  st.phase+=dt*(0.03+0.4*(v.flow||0));
  st.pos=st.phase+(on('shift')?0.5*(v.shift||0):0);
  st.k=1+1.5*(v.bands||0);
  st.bright=1+0.8*(v.flash||0);
  st.lines=v.lines||0;
  const cfg=FL.cfg, flat=!cfg.polar&&!cfg.bottcher;
  st.turn=flat&&on('sway')?0.07*((v.sway??0.5)-0.5)*2:0;
  const [W,H]=FL.size(), a=Math.abs(st.turn), cover=a?Math.cos(a)+Math.sin(a)*Math.max(W/H,H/W):1;
  st.zoom=flat?(1+0.12*(v.breathe||0))*cover:1;
}
function setActive(on){
  if(on===active) return; active=on;
  if(!on){ for(const L of FL.layers()) release(L); st.zoom=1; st.turn=0; FL.redraw(); }
}
FL.hooks.paint=L=>{ if(!active){ delete L.mu; delete L.muOrig; return; } capture(L); recolour(); };
FL.hooks.view=()=>active?{zoom:st.zoom,turn:st.turn,overlays:(exporting||recording)?false:undefined}:null;
function unhook(){ setActive(false); delete FL.hooks.paint; delete FL.hooks.view; }

let last=0;
function loop(now){
  try{
    const run=enabled&&!exporting&&player&&player.playing;
    if(run){ const dt=last?Math.min(0.1,(now-last)/1000):0; setActive(true); step(player.features(),dt); recolour(); }
    else if(!exporting) setActive(false);
    last=run?now:0;
  }catch(e){ console.warn('Music add-on stopped:',e); unhook(); FL.toast('Music effects stopped after an error. The lab is unchanged.',3000); return; }
  requestAnimationFrame(loop);
}

/* ---------- link: song + mapping travel with the lab's own link ---------- */
// mu=<song>;<target>,<source>,<amount>,<smooth>;…  (every field URI-encoded, so track names may hold any character)
const E=encodeURIComponent, D=x=>{ try{ return decodeURIComponent(x); }catch(e){ return ''; } };
function encode(){ return 'mu='+[E(player.spec||''),...Object.entries(choreo.map).map(([id,x])=>[E(id),E(x.source),+(+x.amount).toFixed(2),+(+x.smooth).toFixed(2)].join(','))].join(';'); }
function readLink(){
  const h=(FL.initialMu||'').match(/^mu=(.*)$/); if(!h) return null;
  const [spec,...parts]=h[1].split(';'), map={};
  for(const p of parts){ const [id,source,amount,smooth]=p.split(',').map(D); if(id&&source) map[id]={source,amount:Number.isFinite(+amount)?+amount:1,smooth:Number.isFinite(+smooth)?+smooth:0.3}; }
  return {spec:D(spec),map};
}
function syncLink(){ FL.hashExtra=encode(); FL.writeHash(); }

/* ---------- panel ---------- */
const CSS=`
#fmusic{position:fixed;right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));z-index:3;width:min(460px,calc(100vw - 84px));max-height:min(78vh,760px);overflow:auto;
 background:rgba(8,10,16,.86);border:1.5px solid rgba(255,255,255,.35);border-radius:16px;padding:10px 12px;color:#fff;font:13px system-ui;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none}
#fmusic.on{display:block}body.clean #fmusic{display:none}
#fmusic .mtop{display:flex;align-items:center;gap:8px;margin-bottom:8px}#fmusic .mtop b{flex:1;font-size:14px}
#fmusic button,#fmusic select{background:#1d2a40;color:#fff;border:1px solid #4a5a76;border-radius:9px;padding:7px 10px;font:13px system-ui;cursor:pointer}
#fmusic button.on{background:#fff;color:#000}#fmusic .x{width:30px;height:30px;padding:0;border-radius:50%}
#fmusic details{margin:8px 0}#fmusic summary{cursor:pointer;color:#cdd8ea;padding:6px 0}
#fmusic .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
#fmusic .note{color:#aab6cc;font-size:12px;margin-top:6px;line-height:1.4}
#fmusicBlock{position:fixed;inset:0;z-index:2;display:none;cursor:wait}#fmusicBlock.on{display:block}
@media (max-width:560px){#fmusic{width:calc(100vw - 80px);padding:8px}}`;
const TARGETS=[
 {id:'flow',label:'Colour flow (speed)',hint:'How fast the colours travel through the bands',default:{source:'energy',amount:1,smooth:0.35}},
 {id:'shift',label:'Colour position',hint:'The palette sits where the value is; melody pitch works well',default:{source:'melody',amount:0.6,smooth:0.5}},
 {id:'bands',label:'Band density',hint:'More, thinner colour bands',default:{source:'none',amount:1,smooth:0.4}},
 {id:'flash',label:'Brightness flash',default:{source:'accent',amount:0.8,smooth:0.12}},
 {id:'lines',label:'Contour lines glow',hint:'Lines along the level sets light up',default:{source:'kick',amount:1,smooth:0.15}},
 {id:'breathe',label:'Breathing (zoom pulse)',hint:'Moves the finished picture only — no recompute',default:{source:'beat',amount:0.5,smooth:0.12}},
 {id:'sway',label:'Sway (turn)',hint:'Small turn left / right with the value',default:{source:'none',amount:1,smooth:0.6}}];

function build(){
  const st0=document.createElement('style'); st0.textContent=CSS; document.head.append(st0);
  const link=readLink();
  panel=document.createElement('div'); panel.id='fmusic';
  panel.innerHTML=`<div class="mtop"><b>♫ Music</b><button id="fmOn" class="on" type="button" title="Let the colours follow the music">Dance: on</button><button class="x" id="fmX" type="button" aria-label="Hide">×</button></div>
<studio-player id="fmPlayer" compact sync="fractal-lab"></studio-player>
<details id="fmMap"><summary>What the music moves</summary><div id="fmChoreo"></div>
<div class="note">Colours, lines and the zoom pulse change instantly at any depth: the fractal itself is not recomputed. In polar and Böttcher views only the colours move.</div></details>
<div class="row"><select id="fmSize" aria-label="Video size"><option value="screen">Screen size</option><option value="1080x1920">1080 × 1920 (vertical)</option><option value="1920x1080">1920 × 1080</option><option value="1080x1080">1080 × 1080</option></select>
<select id="fmFps" aria-label="Frames per second"><option>30</option><option>60</option><option>24</option></select>
<button id="fmMp4" type="button">Export MP4</button><button id="fmLive" type="button">Record live</button></div>
<div class="note" id="fmStatus">The video uses the picture on screen; zoom where you want it before exporting.</div>`;
  document.body.append(panel);
  const block=document.createElement('div'); block.id='fmusicBlock'; document.body.append(block);
  player=$('fmPlayer'); player.setAttribute('song',(link&&/^(ng|lib|ver|url):/.test(link.spec)&&link.spec)||'ng:motherofall-1');
  choreo=new StudioChoreo({player,container:$('fmChoreo'),storageKey:'fractal-lab',targets:TARGETS});
  if(link) for(const [id,m] of Object.entries(link.map)) if(choreo.map[id]) choreo.set(id,m);
  choreo.addEventListener('change',syncLink);
  player.addEventListener('studio:song',syncLink);
  $('fmX').onclick=()=>hide();
  $('fmOn').onclick=()=>{ enabled=!enabled; $('fmOn').classList.toggle('on',enabled); $('fmOn').textContent='Dance: '+(enabled?'on':'off'); };
  wireExport(block);
  requestAnimationFrame(loop);
}

/* ---------- export ---------- */
function wireExport(block){
  const say=t=>$('fmStatus').textContent=t;
  const size=()=>{ const v=$('fmSize').value, [W,H]=FL.size(); return v==='screen'?[W&~1,H&~1]:v.split('x').map(Number); };
  const name=ext=>'fractal-'+StudioExport.slug(FL.name())+'-'+StudioExport.slug(player.song?.title||'music')+'.'+ext;
  let ctrl=null;
  $('fmMp4').onclick=async()=>{
    if(exporting){ ctrl&&ctrl.abort(); return; }
    if(!StudioExport.canExactMp4()){ say('This browser cannot render video frame by frame — use Record live.'); return; }
    exporting=true; ctrl=new AbortController(); $('fmMp4').textContent='Cancel export'; block.classList.add('on'); player.pause();
    try{
      for(let t0=performance.now();!FL.settled();){ if(performance.now()-t0>30000) break; if(ctrl.signal.aborted) throw Error('Export cancelled'); say('Waiting for the picture to finish…'); await new Promise(r=>setTimeout(r,200)); }
      const [w,h]=size(), ex=document.createElement('canvas'); ex.width=w; ex.height=h; const g=ex.getContext('2d');
      const cv=FL.canvas, copy=()=>{ const s=Math.max(w/cv.width,h/cv.height), dw=cv.width*s, dh=cv.height*s; g.fillStyle='#000'; g.fillRect(0,0,w,h); g.imageSmoothingQuality='high'; g.drawImage(cv,(w-dw)/2,(h-dh)/2,dw,dh); };
      choreo.reset(); st.phase=0; setActive(true);
      const r=await StudioExport.mp4({engine:player.engine,canvas:ex,fps:+$('fmFps').value,signal:ctrl.signal,
        renderFrame:(t,dt)=>{ step(player.features(t),dt); recolour(); FL.draw(false); copy(); },
        onProgress:(p,m)=>say(Math.round(p*100)+'% · '+m)});
      StudioExport.download(r.blob,name('mp4'));
      say('Saved MP4 · '+r.width+'×'+r.height+' · '+r.seconds.toFixed(1)+' s · '+(r.blob.size/1048576).toFixed(1)+' MB · '+r.video+' + '+r.audio);
    }catch(e){ say('Export stopped: '+e.message); }
    finally{ exporting=false; block.classList.remove('on'); $('fmMp4').textContent='Export MP4'; setActive(false); FL.draw(); }
  };
  let rec=null;
  $('fmLive').onclick=async()=>{
    if(rec){ const r=await rec.stop(); rec=null; recording=false; player.pause(); StudioExport.download(r.blob,name(r.ext)); say('Saved live recording ('+r.ext.toUpperCase()+')'); $('fmLive').textContent='Record live'; return; }
    try{ rec=await StudioExport.live({engine:player.engine,canvas:FL.canvas}); recording=true; choreo.reset(); await player.play(0); $('fmLive').textContent='Stop recording'; say('Recording while the song plays…');
      player.addEventListener('studio:end',()=>{ if(rec) $('fmLive').click(); },{once:true}); }
    catch(e){ rec=null; recording=false; say('Recording unavailable: '+e.message); }
  };
}

function show(){ panel.classList.add('on'); $('bMusic').classList.add('on'); }
function hide(){ panel.classList.remove('on'); $('bMusic').classList.remove('on'); }
function toggle(){ panel.classList.contains('on')?hide():show(); }
const api={show,hide,toggle,get player(){return player;},get choreo(){return choreo;},state:st};

window.FractalMusic={ready:(async()=>{
  try{ if(!window.StudioReady) await load(STUDIO); await StudioReady; build(); return api; }
  catch(e){ unhook(); throw e; }
})()};
})();
