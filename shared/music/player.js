/* Shared Web Audio synthesizer, with audio capture and live amplitude for visualizations. */
(function(global){
'use strict';
class MusicPlayer{
 constructor(){this.ctx=null;this.master=null;this.dest=null;this.analyser=null;this.voices=[];this.timer=null;this.notes=[];this.started=0;this.bpm=120;this.cursor=0;this.playing=false;this.level=0;this.onstop=null}
 async init(){if(this.ctx)return;this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.16;this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=256;this.dest=this.ctx.createMediaStreamDestination();this.master.connect(this.analyser);this.analyser.connect(this.ctx.destination);this.master.connect(this.dest)}
 async play(entry){this.stop();await this.init();await this.ctx.resume();const loaded=await global.SharedMusic.load(entry);this.notes=loaded.notes;this.bpm=entry.bpm||120;this.cursor=0;this.started=this.ctx.currentTime+.08;this.playing=true;const seconds=60/this.bpm;const start=this.notes[0]?.on||0;const schedule=()=>{if(!this.playing)return;const until=this.ctx.currentTime+.35;while(this.cursor<this.notes.length){const n=this.notes[this.cursor];const t=this.started+(n.on-start)*seconds;if(t>until)break;this.note(n,t,Math.max(.05,Math.min(.8,(n.d||.5)*seconds)));this.cursor++}if(this.cursor>=this.notes.length&&this.ctx.currentTime>this.started+(this.notes[this.notes.length-1].on-start)*seconds+1)this.stop()};schedule();this.timer=setInterval(schedule,70)}
 note(n,t,len){const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type='triangle';osc.frequency.value=440*Math.pow(2,(n.p-69)/12);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.45,t+.012);gain.gain.exponentialRampToValueAtTime(.001,t+len+.04);osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+len+.05);this.voices.push(osc);if(this.voices.length>500)this.voices.splice(0,300)}
 amplitude(){if(!this.playing||!this.analyser)return 0;const a=new Uint8Array(this.analyser.frequencyBinCount);this.analyser.getByteFrequencyData(a);let sum=0;for(const x of a)sum+=x;return Math.min(1,sum/a.length/110)}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const o of this.voices){try{o.stop()}catch(e){}}this.voices=[];const was=this.playing;this.playing=false;if(was)this.onstop?.()}
 get stream(){return this.dest?.stream||null}
}
global.SharedMusicPlayer=MusicPlayer;
})(window);