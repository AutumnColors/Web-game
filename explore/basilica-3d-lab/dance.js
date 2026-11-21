'use strict';
/* Music → dance for the 3D Julia figure: the shared <studio-player>, a choreography grid, and MP4 export.
   Uses globals from index.html: cv, draw, setSpinning, danceStep, spinning, spinPhase, renderSize, exporting, angle, tilt, zoom, cParam, imParam. */
StudioReady.then(()=>{
 const player=document.getElementById('player'),$=id=>document.getElementById(id),say=s=>$('vstatus').textContent=s;
 window.player=player;
 window.choreo=new StudioChoreo({player,container:$('choreo'),storageKey:'julia-3d-lab',targets:[
  {id:'spin',label:'Band spin speed',hint:'How fast the blue and purple bands turn',default:{source:'energy',amount:1,smooth:0.35}},
  {id:'pulse',label:'Breathing (radius)',hint:'The surface swells outward',default:{source:'accent',amount:0.8,smooth:0.1}},
  {id:'flash',label:'Band brightness',hint:'How strongly the bands light up',default:{source:'melodyhit',amount:0.8,smooth:0.15}},
  {id:'sway',label:'Sway (turn left / right)',hint:'Camera turns with the value; pitch works well',default:{source:'melody',amount:1,smooth:0.6}},
  {id:'zoom',label:'Push in (zoom)',default:{source:'bar',amount:0.25,smooth:0.3}},
  {id:'tilt',label:'Nod (tilt)',default:{source:'none',amount:1,smooth:0.4}}]});
 // the figure starts dancing when the music starts
 player.addEventListener('studio:state',e=>{if(e.detail.playing&&!spinning)setSpinning(true);});
 const size=()=>{const v=$('vsize').value;if(v==='screen'){const d=Math.min(devicePixelRatio||1,2);return [Math.round(cv.clientWidth*d)&~1,Math.round(cv.clientHeight*d)&~1];}return v.split('x').map(Number);};
 const name=ext=>'julia-dance-c'+cParam.toFixed(3)+(imParam?'_'+imParam.toFixed(3)+'i':'')+'-'+StudioExport.slug(player.song?.title||'music')+'.'+ext;
 let busy=false,ctrl=null;
 $('mp4').onclick=async()=>{
  if(busy){ctrl&&ctrl.abort();return;}
  if(!StudioExport.canExactMp4()){say('This browser cannot render video frame by frame — use Record live.');return;}
  busy=true;ctrl=new AbortController();$('mp4').textContent='Cancel export';player.pause();
  const was=spinning,keep={phase:spinPhase};setSpinning(false);spinning=true;exporting=true;
  const [w,h]=size();renderSize={w,h};choreo.reset();spinPhase=0;danceStep(player.features(0),0);draw();
  try{
   const r=await StudioExport.mp4({engine:player.engine,canvas:cv,fps:+$('vfps').value,signal:ctrl.signal,
     renderFrame:(t,dt)=>{danceStep(player.features(t),dt);draw();},onProgress:(p,m)=>say(Math.round(p*100)+'% · '+m)});
   StudioExport.download(r.blob,name('mp4'));
   say('Saved MP4 · '+r.width+'×'+r.height+' · '+r.seconds.toFixed(1)+' s · '+(r.blob.size/1048576).toFixed(1)+' MB · '+r.video+' + '+r.audio+(r.audio==='opus'?' (this browser has no AAC encoder; Safari or Chrome on Mac/iPhone/Android give AAC)':''));
  }catch(e){say('Export stopped: '+e.message);}
  finally{renderSize=null;exporting=false;spinning=false;spinPhase=keep.phase;setSpinning(was);draw();busy=false;$('mp4').textContent='Export MP4 (exact sync)';}
 };
 let rec=null;
 $('live').onclick=async()=>{
  if(rec){const r=await rec.stop();rec=null;player.pause();StudioExport.download(r.blob,name(r.ext));say('Saved live recording ('+r.ext.toUpperCase()+')');$('live').textContent='Record live';return;}
  try{rec=await StudioExport.live({engine:player.engine,canvas:cv});choreo.reset();if(!spinning)setSpinning(true);await player.play(0);$('live').textContent='Stop recording';say('Recording while the song plays…');
   player.addEventListener('studio:end',()=>{if(rec)$('live').click();},{once:true});}
  catch(e){rec=null;say('Recording unavailable: '+e.message);}
 };
});
