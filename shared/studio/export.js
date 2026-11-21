/* Studio export: WAV, MP3 and MP4 from a StudioEngine. Global: StudioExport.
   MP4 is rendered frame by frame (not screen-recorded): frame i is drawn for song time i/fps, so picture and sound
   line up exactly. Needs WebCodecs (Chrome, Edge, Safari 17+, Android Chrome); otherwise use StudioExport.live(). */
(function(global){
'use strict';
const BASE=new URL('./',document.currentScript.src);
const loaded={};
// encoders load on demand from jsDelivr (pinned versions): lamejs 1.2.1 (LGPL), mp4-muxer 5.2.2 (MIT)
const CDN={'lame':'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js','mp4':'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js'};
function loadScript(rel){if(!loaded[rel])loaded[rel]=new Promise((ok,bad)=>{const s=document.createElement('script');s.src=CDN[rel]||new URL(rel,BASE).href;s.onload=ok;s.onerror=()=>bad(Error('Could not load '+rel));document.head.append(s);});return loaded[rel];}
const tick=()=>new Promise(r=>setTimeout(r,0));
const slug=s=>String(s||'music').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'music';

function download(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}

function wav(buf){
  const ch=buf.numberOfChannels,n=buf.length,sr=buf.sampleRate,ab=new ArrayBuffer(44+n*ch*2),v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,36+n*ch*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*ch*2,true);
  const data=[...Array(ch)].map((_,c)=>buf.getChannelData(c));let o=44;
  for(let i=0;i<n;i++)for(let c=0;c<ch;c++){v.setInt16(o,Math.max(-1,Math.min(1,data[c][i]))*32767,true);o+=2;}
  return new Blob([ab],{type:'audio/wav'});
}
function id3(tags){ // ID3v2.3 with title and artist
  const frames=[];const enc=new TextEncoder();
  for(const [id,val] of [['TIT2',tags.title],['TPE1',tags.artist]]){if(!val)continue;const body=new Uint8Array([3,...enc.encode(val)]);// 3 = UTF-8
    const f=new Uint8Array(10+body.length);f.set(enc.encode(id),0);const L=body.length;f[4]=L>>>24&255;f[5]=L>>>16&255;f[6]=L>>>8&255;f[7]=L&255;f.set(body,10);frames.push(f);}
  const size=frames.reduce((a,f)=>a+f.length,0),h=new Uint8Array(10+size);h.set([73,68,51,3,0,0,size>>>21&127,size>>>14&127,size>>>7&127,size&127]);let o=10;frames.forEach(f=>{h.set(f,o);o+=f.length;});return h;
}
async function mp3(buf,{kbps=192,title='',artist='Roman Kesler',onProgress}={}){
  await loadScript('lame');
  const ch=Math.min(2,buf.numberOfChannels),enc=new global.lamejs.Mp3Encoder(ch,buf.sampleRate,kbps),B=1152,out=[id3({title,artist})];
  const conv=x=>{const r=new Int16Array(x.length);for(let i=0;i<x.length;i++)r[i]=Math.max(-1,Math.min(1,x[i]))*32767;return r;};
  const L=conv(buf.getChannelData(0)),R=ch>1?conv(buf.getChannelData(1)):null;
  for(let i=0;i<L.length;i+=B){const a=L.subarray(i,i+B),b=R?R.subarray(i,i+B):null;const m=R?enc.encodeBuffer(a,b):enc.encodeBuffer(a);if(m.length)out.push(new Uint8Array(m));
    if(i%(B*400)===0){onProgress&&onProgress(i/L.length);await tick();}}
  const end=enc.flush();if(end.length)out.push(new Uint8Array(end));
  return new Blob(out,{type:'audio/mpeg'});
}
async function pickVideoCodec(w,h,fps,bitrate){
  if(!global.VideoEncoder)return null;
  for(const codec of ['avc1.640033','avc1.640028','avc1.4d0033','avc1.4d0028','avc1.42e033','avc1.42e028','avc1.42001f']){
    const cfg={codec,width:w,height:h,bitrate,framerate:fps,latencyMode:'quality',avc:{format:'avc'}};
    try{const r=await VideoEncoder.isConfigSupported(cfg);if(r.supported)return cfg;}catch(e){}}
  return null;
}
async function pickAudioCodec(sr){
  if(!global.AudioEncoder)return null;
  for(const [codec,mux] of [['mp4a.40.2','aac'],['opus','opus']]){const cfg={codec,sampleRate:sr,numberOfChannels:2,bitrate:192000};
    try{const r=await AudioEncoder.isConfigSupported(cfg);if(r.supported)return {cfg,mux};}catch(e){}}
  return null;
}
function canExactMp4(){return !!(global.VideoEncoder&&global.AudioEncoder&&global.VideoFrame);}

/* mp4({engine, canvas, renderFrame(t, dt, frameIndex), fps=30, tail=1.5, from=0, to, bitrate, onProgress, signal})
   renderFrame must draw the picture for song time t onto canvas, synchronously or by returning a promise. */
async function mp4(o){
  const {engine,canvas,renderFrame}=o,fps=o.fps||30;
  if(!canExactMp4())throw Error('This browser cannot encode video frames (WebCodecs). Use live recording instead.');
  await loadScript('mp4');
  const w=canvas.width&~1,h=canvas.height&~1;if(w!==canvas.width||h!==canvas.height)throw Error('Canvas size must be even ('+canvas.width+'×'+canvas.height+')');
  const say=(p,msg)=>o.onProgress&&o.onProgress(p,msg);
  say(0,'Rendering sound…');
  const sr=48000,buf=o.audio||await engine.render({sampleRate:sr,onProgress:p=>say(p*0.2,'Rendering sound…')});
  const from=o.from||0,to=Math.min(o.to??(engine.duration+(o.tail??1.5)),buf.length/sr-buf.offset);
  const vcfg=await pickVideoCodec(w,h,fps,o.bitrate||Math.round(Math.min(16e6,w*h*fps*0.14)));if(!vcfg)throw Error('No H.264 encoder for '+w+'×'+h);
  const acfg=await pickAudioCodec(sr);if(!acfg)throw Error('No AAC or Opus audio encoder in this browser');
  const M=global.Mp4Muxer,target=new M.ArrayBufferTarget();
  const muxer=new M.Muxer({target,video:{codec:'avc',width:w,height:h,frameRate:fps},audio:{codec:acfg.mux,numberOfChannels:2,sampleRate:sr},fastStart:'in-memory',firstTimestampBehavior:'offset'});
  let failure=null;
  const venc=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:e=>failure=e});venc.configure(vcfg);
  const aenc=new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:e=>failure=e});aenc.configure(acfg.cfg);
  // audio: skip the render's lead-in so sample 0 is song time `from`
  const L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,start=Math.round((buf.offset+from)*sr),end=Math.min(L.length,start+Math.round((to-from)*sr)),CH=sr/10;
  for(let i=start;i<end;i+=CH){const n=Math.min(CH,end-i),d=new Float32Array(n*2);d.set(L.subarray(i,i+n),0);d.set(R.subarray(i,i+n),n);
    const ad=new AudioData({format:'f32-planar',sampleRate:sr,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round((i-start)/sr*1e6),data:d});aenc.encode(ad);ad.close();}
  const frames=Math.ceil((to-from)*fps),dt=1/fps,t0=performance.now();
  for(let i=0;i<frames;i++){
    if(o.signal?.aborted)throw Error('Export cancelled');if(failure)throw failure;
    const t=from+i*dt;await renderFrame(t,dt,i);
    if(canvas.width!==w||canvas.height!==h)throw Error('The canvas changed size during export');
    const vf=new VideoFrame(canvas,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});venc.encode(vf,{keyFrame:i%(fps*2)===0});vf.close();
    while(venc.encodeQueueSize>6)await new Promise(r=>setTimeout(r,4));
    if(i%8===0){const el=(performance.now()-t0)/1000,eta=el/(i+1)*(frames-i-1);say(0.2+0.78*i/frames,'Frame '+i+' / '+frames+' · '+Math.ceil(eta)+' s left');await tick();}
  }
  say(0.99,'Finishing file…');await venc.flush();await aenc.flush();if(failure)throw failure;muxer.finalize();venc.close();aenc.close();
  say(1,'Done');
  return {blob:new Blob([target.buffer],{type:'video/mp4'}),video:vcfg.codec,audio:acfg.cfg.codec,width:w,height:h,frames,seconds:to-from};
}

/* live({engine, canvas, fps}) — real-time fallback: records the canvas and the engine's sound while it plays.
   Returns {stop(): Promise<{blob, ext}>}. */
async function live({engine,canvas,fps=30,bitrate=6e6}){
  if(!canvas.captureStream||!global.MediaRecorder)throw Error('Recording is not supported in this browser');
  await engine.ensureContext();const types=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=types.find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('No MP4 or WebM recorder');
  const stream=new MediaStream([...canvas.captureStream(fps).getVideoTracks(),...(engine.stream?engine.stream.getAudioTracks():[])]);
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:192000}),chunks=[];
  rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};rec.start(1000);
  return {mime,stop:()=>new Promise(ok=>{rec.onstop=()=>{stream.getVideoTracks().forEach(t=>t.stop());const type=rec.mimeType||mime;ok({blob:new Blob(chunks,{type}),ext:type.includes('mp4')?'mp4':'webm'});};rec.stop();})};
}
global.StudioExport={wav,mp3,mp4,live,download,canExactMp4,slug,loadScript};
})(window);
