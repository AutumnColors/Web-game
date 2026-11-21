'use strict';
(()=>{
 const pick=document.getElementById('musicPick'),mode=document.getElementById('musicMode'),play=document.getElementById('musicPlay'),record=document.getElementById('record'),status=document.getElementById('musicStatus');
 const player=new SharedMusicPlayer();
 let catalog=[],recorder=null,capture=null,chunks=[],lastUrl=null;
 const say=s=>status.textContent=s;
 window.musicMotionLevel=()=>mode.value==='reactive'?player.amplitude():0;
 player.onstop=()=>{play.textContent='Play music';if(recorder?.state==='recording')recorder.stop()};
 SharedMusic.catalog().then(list=>{
   catalog=list;pick.innerHTML='';
   const ordered=list.filter(x=>x.g==='ours'||x.c==='Roman Kesler').concat(list.filter(x=>x.g!=='ours'&&x.c!=='Roman Kesler').slice(0,400));
   for(const e of ordered){const opt=document.createElement('option');opt.value=e.id;opt.textContent=(e.c||'')+' — '+e.t;pick.append(opt)}
   say(ordered.length+' shared-library pieces available');
 }).catch(e=>say('Could not load music catalog: '+e.message));
 function chosen(){return catalog.find(x=>x.id===pick.value)}
 async function startMusic(){
   const entry=chosen();if(!entry)throw Error('Select a piece');
   await player.play(entry);play.textContent='Stop music';
   if(mode.value==='reactive'&&!spinning)setSpinning(true);
   say('Playing '+entry.t+(mode.value==='reactive'?' · music-reactive':' · independent'));
 }
 play.onclick=async()=>{try{if(player.playing){player.stop();return}await startMusic()}catch(e){say('Playback failed: '+e.message)}};
 pick.onchange=()=>{if(player.playing)player.stop()};
 function supportedMime(){if(!window.MediaRecorder)return null;return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||null}
 record.onclick=async()=>{
   if(recorder?.state==='recording'){recorder.stop();return}
   try{
     if(!cv.captureStream)throw Error('Canvas recording is not supported here');
     const mime=supportedMime();if(!mime)throw Error('No supported MP4 or WebM recorder');
     if(!player.playing)await startMusic();
     draw();
     const video=cv.captureStream(30);
     const tracks=[...video.getVideoTracks(),...(player.stream?.getAudioTracks()||[])];
     if(!tracks.some(t=>t.kind==='audio'))throw Error('Audio capture is unavailable');
     capture=new MediaStream(tracks);chunks=[];
     recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:3500000,audioBitsPerSecond:128000});
     recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
     recorder.onerror=e=>say('Recording error: '+(e.error?.message||'unknown'));
     recorder.onstop=()=>{
       const type=recorder.mimeType||mime,ext=type.includes('mp4')?'mp4':'webm';
       const blob=new Blob(chunks,{type});if(lastUrl)URL.revokeObjectURL(lastUrl);
       lastUrl=URL.createObjectURL(blob);
       const a=document.createElement('a');a.href=lastUrl;a.download='julia-music-c-'+cParam.toFixed(3)+'-'+imParam.toFixed(3)+'i.'+ext;document.body.append(a);a.click();a.remove();
       capture?.getVideoTracks().forEach(t=>t.stop());capture=null;record.textContent='Start recording';
       say('Recording saved as '+ext.toUpperCase()+' · '+(blob.size/1048576).toFixed(1)+' MB');
     };
     recorder.start(1000);record.textContent='Stop recording';say('Recording video + synthesized music ('+(mime.includes('mp4')?'MP4':'WebM')+')');
   }catch(e){say('Recording unavailable: '+e.message);record.textContent='Start recording'}
 };
})();