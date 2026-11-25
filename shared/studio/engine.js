/* Studio engine: one NoteGrid song, a transport, live events and a deterministic picture of the music at any time.
   Needs notegrid.js and synth.js. Global: StudioEngine.

   const e = new StudioEngine();
   e.loadText(scoreText, {id, title});      // or e.loadSong(parsedSong)
   await e.play(); e.pause(); e.stop(); e.seek(seconds);
   e.setConfig({tempo:1.2, transpose:-2, volume:.8, loop:true, mute:{bass:true}});
   e.features(t)  -> everything a visual needs at song time t (same answer live and during export)
   await e.render() -> AudioBuffer of the whole song (for MP3/WAV/MP4)
   Events (EventTarget): load, state, time, note, beat, bar, mark, change, end, error
*/
(function(global){
'use strict';
const NG=()=>global.NoteGrid;
const DEFAULTS={tempo:1,transpose:0,volume:0.85,loop:false,mute:{},solo:''};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

class StudioEngine extends EventTarget{
  constructor(){
    super();
    this.song=null;this.text='';this.meta={};this.config=JSON.parse(JSON.stringify(DEFAULTS));
    this.ctx=null;this.out=null;this.stream=null;this.analyser=null;
    this.session=null;this.pos=0;this.playing=false;this._raf=0;this._lastBeat=-1;this._lastBar=-1;this._markI=0;this._noteI=0;
  }
  // ---------- loading ----------
  loadText(text,meta={}){
    const {song,errors}=NG().parseScore(String(text||''));
    if(errors.length){const err=new Error(errors.slice(0,6).join('\n'));err.errors=errors;throw err;}
    this.text=String(text);return this.loadSong(song,meta);
  }
  loadSong(song,meta={}){
    const was=this.playing;this._stopSession();this.playing=false;
    this.song=song;this.meta=Object.assign({title:song.title},meta);
    this._index();this.pos=0;this._resetCursors(0);
    this._emit('load',{song:this.summary()});this._emit('state',{playing:false,time:0});
    if(was)this.play();
    return this.summary();
  }
  summary(){
    const s=this.song;if(!s)return null;
    return {id:this.meta.id||'',title:this.meta.title||s.title,duration:this.duration,bpm:s.tempos[0].bpm,steps:s.steps,beats:s.beats,
      bars:s.length/(s.steps*s.beats),marks:s.marks.map(m=>({text:m.text,time:this.timeOfStep(m.step)})),
      tracks:this.tracks.map(t=>({name:t.name,inst:t.inst,notes:t.count,low:t.low,high:t.high}))};
  }
  // seconds from an event's start to any step, at tempo factor k (for the sidechain pump)
  _rel(ev,k){const s=this.song,N=NG();ev.e.beatSteps=s.steps;return st=>(N.songTime(s,st)-ev.t0)/k;}
  // Precompute timing (at tempo 1) and per-track onset lists for features().
  _index(){
    const s=this.song,N=NG();
    this.baseDuration=N.songTime(s,s.length);
    this.events=s.events.map((e,i)=>({e,i,t0:N.songTime(s,e.step),t1:N.songTime(s,e.step+e.len)}));
    const byTrack=new Map();
    this.tracks=s.tracks.map(t=>{const o={name:t.name,inst:t.inst,track:t,on:[],off:[],vel:[],pitch:[],low:Infinity,high:-Infinity,count:0};byTrack.set(t,o);return o;});
    this.drumHits={};N.DRUMS.forEach(d=>this.drumHits[d]=[]);
    for(const ev of this.events){const o=byTrack.get(ev.e.track);o.on.push(ev.t0);o.off.push(ev.t1);o.vel.push(ev.e.vel*ev.e.track.vol);o.count++;
      if(ev.e.track.inst==='drums'){o.pitch.push(ev.e.drum);this.drumHits[N.DRUMS[ev.e.drum]].push([ev.t0,ev.e.vel*ev.e.track.vol]);}
      else{o.pitch.push(ev.e.midi);o.low=Math.min(o.low,ev.e.midi);o.high=Math.max(o.high,ev.e.midi);}}
    // pitched drums (tom instrument used as drums) also count as kick-like hits
    this.tracks.forEach(o=>{if(!isFinite(o.low)){o.low=0;o.high=1;}if(o.high-o.low<1)o.high=o.low+1;});
    // energy normaliser: 95th percentile of the raw activity sampled across the song
    this._norm=1;const raw=[];for(let t=0;t<this.baseDuration;t+=this.baseDuration/240)raw.push(this._rawEnergy(t));
    raw.sort((a,b)=>a-b);this._norm=Math.max(0.05,raw[Math.floor(raw.length*0.95)]||1);
  }
  get duration(){return this.song?this.baseDuration/this.config.tempo:0;}
  timeOfStep(step){return NG().songTime(this.song,step)/this.config.tempo;}
  // ---------- config ----------
  setConfig(patch,source='api'){
    if(!patch)return this.config;const c=this.config,old=JSON.stringify(c);
    if(patch.tempo!=null)c.tempo=clamp(+patch.tempo||1,0.25,4);
    if(patch.transpose!=null)c.transpose=clamp(Math.round(+patch.transpose||0),-36,36);
    if(patch.volume!=null)c.volume=clamp(+patch.volume,0,1.5);
    if(patch.loop!=null)c.loop=!!patch.loop;
    if(patch.mute)c.mute=Object.assign({},c.mute,patch.mute);
    if(patch.solo!=null)c.solo=String(patch.solo||'');
    if(JSON.stringify(c)===old)return c;
    if(this.out)this.out.gain.value=c.volume;
    this._applyMutes();
    // tempo changes move every scheduled note: restart the session at the same musical position
    if(patch.tempo!=null&&this.playing){const frac=this.time/(this.baseDuration/JSON.parse(old).tempo||1);this._stopSession();this.pos=frac*this.duration;this._startSession();}
    else if(patch.transpose!=null&&this.playing){const p=this.time;this._stopSession();this.pos=p;this._startSession();}
    this._emit('change',{config:JSON.parse(JSON.stringify(c)),patch,source});
    return c;
  }
  audible(name){const c=this.config;if(c.solo)return c.solo===name;return !c.mute[name];}
  _applyMutes(){if(!this.session)return;for(const [name,g] of this.session.gains)g.gain.value=this.audible(name)?1:0;}
  // ---------- transport ----------
  async ensureContext(){
    if(this.ctx)return this.ctx;
    const AC=global.AudioContext||global.webkitAudioContext;this.ctx=new AC({latencyHint:'interactive'});
    this.out=this.ctx.createGain();this.out.gain.value=this.config.volume;
    this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=1024;
    const dest=this.ctx.createMediaStreamDestination?this.ctx.createMediaStreamDestination():null;
    this.out.connect(this.analyser);this.analyser.connect(this.ctx.destination);if(dest){this.out.connect(dest);this.stream=dest.stream;}
    this.synth=global.NoteGridSynth(this.ctx);this.master=this.synth.chain(this.out);
    return this.ctx;
  }
  get time(){if(!this.playing||!this.session)return this.pos;return clamp(this.ctx.currentTime-this.session.t0,0,this.duration);}
  async play(from){
    if(!this.song)throw Error('No song loaded');
    await this.ensureContext();await this.ctx.resume();
    if(from!=null)this.pos=clamp(+from,0,this.duration);
    if(this.pos>=this.duration-0.01)this.pos=0;
    this._stopSession();this.playing=true;this._startSession();
    this._emit('state',{playing:true,time:this.pos});
  }
  pause(){if(!this.playing)return;this.pos=this.time;this._stopSession();this.playing=false;this._emit('state',{playing:false,time:this.pos});}
  stop(){const was=this.playing;this._stopSession();this.playing=false;this.pos=0;this._resetCursors(0);if(was||true)this._emit('state',{playing:false,time:0});this._emit('time',this._timeDetail(0));}
  toggle(){return this.playing?this.pause():this.play();}
  seek(sec){sec=clamp(+sec||0,0,this.duration);if(this.playing){this._stopSession();this.pos=sec;this._startSession();}else{this.pos=sec;this._resetCursors(sec);this._emit('time',this._timeDetail(sec));}this._emit('seek',{time:sec});}
  _startSession(){
    const ctx=this.ctx,k=this.config.tempo,bus=ctx.createGain();bus.connect(this.master);
    const gains=new Map();for(const t of this.song.tracks){const g=ctx.createGain();g.connect(bus);gains.set(t.name,g);}
    this.synth.reset();
    const t0=ctx.currentTime+0.06-this.pos;
    let cursor=this.events.findIndex(ev=>ev.t0/k>=this.pos-1e-6);if(cursor<0)cursor=this.events.length;
    // a held note that started before the seek point is restarted so long notes are not lost
    const s={bus,gains,t0,cursor,timer:0};this.session=s;this._applyMutes();this._resetCursors(this.pos);
    const tr=this.config.transpose;
    const pump=()=>{
      if(this.session!==s)return;const until=ctx.currentTime+0.35;
      while(s.cursor<this.events.length){const ev=this.events[s.cursor],at=t0+ev.t0/k;if(at>until)break;
        if(at>=ctx.currentTime-0.02){const e=ev.e,midi=e.track.inst==='drums'?0:e.midi+tr;try{this.synth.play(e,at,(ev.t1-ev.t0)/k,midi,gains.get(e.track.name),e.track.duck?this._rel(ev,k):null);}catch(err){}}
        s.cursor++;}
    };
    pump();s.timer=setInterval(pump,60);
    const frame=()=>{if(this.session!==s)return;this._tick();this._raf=requestAnimationFrame(frame);};
    this._raf=requestAnimationFrame(frame);
  }
  _stopSession(){
    const s=this.session;if(!s)return;this.session=null;clearInterval(s.timer);cancelAnimationFrame(this._raf);
    try{const g=s.bus.gain,now=this.ctx.currentTime;g.cancelScheduledValues(now);g.setValueAtTime(g.value,now);g.linearRampToValueAtTime(0,now+0.03);setTimeout(()=>{try{s.bus.disconnect();}catch(e){}},80);}catch(e){}
  }
  _resetCursors(t){const k=this.config.tempo;this._noteI=this.events?this.events.findIndex(ev=>ev.t0/k>=t-1e-6):0;if(this._noteI<0)this._noteI=this.events.length;
    this._lastBeat=-1;this._lastBar=-1;const ms=this.song?this.song.marks:[];this._markI=ms.findIndex(m=>this.timeOfStep(m.step)>t-1e-6);if(this._markI<0)this._markI=ms.length;}
  _timeDetail(t){const s=this.song,step=NG().stepAt(s,t*this.config.tempo),beat=step/s.steps;return {time:t,duration:this.duration,progress:this.duration?t/this.duration:0,step,beat,bar:beat/s.beats};}
  _tick(){
    const t=this.time,k=this.config.tempo,d=this._timeDetail(t);
    // notes become audible now: report them in order
    let n=0;while(this._noteI<this.events.length&&this.events[this._noteI].t0/k<=t){const ev=this.events[this._noteI++],e=ev.e;
      if(n++<64&&this.audible(e.track.name))this._emit('note',{time:ev.t0/k,duration:(ev.t1-ev.t0)/k,track:e.track.name,inst:e.track.inst,
        midi:e.track.inst==='drums'?null:e.midi+this.config.transpose,drum:e.track.inst==='drums'?NG().DRUMS[e.drum]:null,velocity:e.vel*e.track.vol,step:e.step});}
    const b=Math.floor(d.beat+1e-6),br=Math.floor(d.bar+1e-6);
    if(b!==this._lastBeat){if(this._lastBeat>=0||b===0)this._emit('beat',{beat:b,bar:br,beatInBar:b%this.song.beats,time:t});this._lastBeat=b;}
    if(br!==this._lastBar){if(this._lastBar>=0||br===0)this._emit('bar',{bar:br,time:t});this._lastBar=br;}
    const ms=this.song.marks;while(this._markI<ms.length&&this.timeOfStep(ms[this._markI].step)<=t){this._emit('mark',{text:ms[this._markI].text,index:this._markI,time:t});this._markI++;}
    this._emit('time',d);
    if(t>=this.duration-1e-3){
      if(this.config.loop){this._stopSession();this.pos=0;this._startSession();this._emit('loop',{});}
      else{const last=this.events.length?Math.max(...this.events.slice(-40).map(e=>e.t1))/k:0;
        if(this.ctx.currentTime-this.session.t0>=Math.max(this.duration,last)+0.4){this._stopSession();this.playing=false;this.pos=this.duration;this._emit('state',{playing:false,time:this.pos});this._emit('end',{});}}
    }
  }
  // ---------- the music, as numbers, at any time ----------
  _lastIdx(arr,t){let lo=0,hi=arr.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(arr[m]<=t){r=m;lo=m+1;}else hi=m-1;}return r;}
  _trackState(o,t){ // t in base (tempo 1) seconds
    const i=this._lastIdx(o.on,t);if(i<0)return {hit:0,level:0,pitch:0,active:false,since:Infinity};
    const since=t-o.on[i],v=o.vel[i];let active=false,vmax=0;
    for(let j=i;j>=0&&j>i-24;j--){if(o.off[j]>t){active=true;vmax=Math.max(vmax,o.vel[j]);}}
    const hit=v*Math.exp(-since/0.11);const level=Math.max(hit,active?0.55*vmax:0);
    const p=o.track.inst==='drums'?0:(o.pitch[i]-o.low)/(o.high-o.low);
    return {hit,level,pitch:p,active,since,velocity:v};
  }
  _rawEnergy(t){let e=0;for(const o of this.tracks){if(!this.audible(o.name))continue;e+=this._trackState(o,t).level;}return e;}
  features(t){
    if(!this.song)return null;const k=this.config.tempo,bt=clamp(t,0,this.duration)*k,s=this.song;
    const step=NG().stepAt(s,bt),beat=step/s.steps,bar=beat/s.beats;
    const tracks={};let energy=0;
    for(const o of this.tracks){const st=this._trackState(o,bt);if(!this.audible(o.name)){st.hit=st.level=0;}tracks[o.name]=st;energy+=st.level;}
    const drums={};for(const d in this.drumHits)drums[d]=0;
    // drum hits (fast path: binary search on the onset column)
    for(const d in this.drumHits){const a=this.drumHits[d];if(!a.length)continue;let lo=0,hi=a.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(a[m][0]<=bt){r=m;lo=m+1;}else hi=m-1;}
      if(r>=0)drums[d]=a[r][1]*Math.exp(-(bt-a[r][0])/(d==='kick'?0.16:d==='hat'?0.06:0.12));}
    let section=0,sectionName='';for(let i=0;i<s.marks.length;i++){if(s.marks[i].step<=step){section=i+1;sectionName=s.marks[i].text;}}
    const bp=beat-Math.floor(beat),barp=bar-Math.floor(bar);
    return {time:t,duration:this.duration,progress:this.duration?t/this.duration:0,step,beat,bar,beatPhase:bp,barPhase:barp,
      beatPulse:Math.exp(-bp*6),barPulse:Math.exp(-barp*4),energy:clamp(energy/this._norm,0,1.5),tracks,drums,section,sectionName};
  }
  // ---------- offline render ----------
  async render({sampleRate=48000,onProgress}={}){
    if(!this.song)throw Error('No song loaded');
    const k=this.config.tempo,tr=this.config.transpose,dur=this.duration+2.5;
    const off=new OfflineAudioContext(2,Math.ceil(dur*sampleRate),sampleRate);
    const synth=global.NoteGridSynth(off),out=off.createGain();out.gain.value=1;out.connect(off.destination);const master=synth.chain(out);
    const gains=new Map();for(const t of this.song.tracks){const g=off.createGain();g.gain.value=this.audible(t.name)?1:0;g.connect(master);gains.set(t.name,g);}
    const lead=0.02,W=1;let cur=0;const evs=this.events;
    const sched=until=>{while(cur<evs.length&&lead+evs[cur].t0/k<until){const ev=evs[cur++],e=ev.e;synth.play(e,lead+ev.t0/k,(ev.t1-ev.t0)/k,e.track.inst==='drums'?0:e.midi+tr,gains.get(e.track.name),e.track.duck?this._rel(ev,k):null);}};
    sched(W+0.5);
    for(let w=W;w<dur-0.5;w+=W){const at=w;off.suspend(at).then(()=>{sched(at+W+0.5);onProgress&&onProgress(at/dur);off.resume();});}
    const buf=await off.startRendering();
    let pk=0;for(let c=0;c<buf.numberOfChannels;c++){const x=buf.getChannelData(c);for(let i=0;i<x.length;i++){const a=Math.abs(x[i]);if(a>pk)pk=a;}}
    const g=pk>0?0.89/pk*Math.min(1,this.config.volume/0.85):1;for(let c=0;c<buf.numberOfChannels;c++){const x=buf.getChannelData(c);for(let i=0;i<x.length;i++)x[i]*=g;}
    buf.offset=lead;return buf;
  }
  level(){if(!this.analyser||!this.playing)return 0;const a=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(a);let s=0;for(const x of a)s+=x;return Math.min(1,s/a.length/90);}
  _emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
}
StudioEngine.DEFAULTS=DEFAULTS;
global.StudioEngine=StudioEngine;
})(window);
