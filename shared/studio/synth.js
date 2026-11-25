/* NoteGrid sound engine (from Roman's NoteGrid player): every instrument as Web Audio synthesis.
   NoteGridSynth(ctx) works with a live AudioContext or an OfflineAudioContext. Global: NoteGridSynth. */
(function(global){
'use strict';
function midiHz(m){return 440*Math.pow(2,(m-69)/12);}
const DRUMS=['kick','snare','hat','openhat','clap','tom','rim','riser','impact','zap'];
function NoteGridSynth(ac){
const noiseBuf=(()=>{const nb=ac.createBuffer(1,ac.sampleRate,ac.sampleRate),nd=nb.getChannelData(0);let s=12345;for(let i=0;i<nd.length;i++){s=(s*1103515245+12345)&0x7fffffff;nd[i]=s/0x3fffffff-1;}return nb;})();
let legatoMap=new Map();
// master gain -> (dry + reverb) -> compressor -> out
function chain(out){
  const m=ac.createGain();m.gain.value=0.55;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=3;
  const rv=ac.createConvolver(),wet=ac.createGain();wet.gain.value=0.22;
  const len=Math.floor(ac.sampleRate*2.2),ir=ac.createBuffer(2,len,ac.sampleRate);let s=777;
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++){s=(s*1103515245+12345)&0x7fffffff;d[i]=(s/0x3fffffff-1)*Math.pow(1-i/len,3);}}
  rv.buffer=ir;m.connect(comp);m.connect(rv);rv.connect(wet);wet.connect(comp);comp.connect(out);
  return m;
}
function env(g,t,dur,a,peak,sus,tau,rel){
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);
  g.gain.setTargetAtTime(peak*sus,t+a,tau);
  const end=t+Math.max(dur,a);g.gain.setTargetAtTime(0,end,rel/3);return end+rel*1.6;
}
const SUST={
 sine:[0.01,0.45,1,1,0.15], pad:[0.35,0.35,0.85,0.5,0.8], strings:[0.12,0.4,0.9,0.4,0.3], lead:[0.015,0.5,0.8,0.2,0.1],
 violin:[0.07,0.5,0.9,0.4,0.25], saw:[0.02,0.3,1,1,0.15], flute:[0.05,0.55,0.9,0.4,0.15], voice:[0.09,0.6,0.9,0.4,0.2], guitar:[0.003,0.3,0.75,0.9,0.08],
 supersaw:[0.012,0.42,0.85,0.6,0.22]};
function buildSust(inst,f,t,g){
  const tones=[],all=[];let nf=null;
  const O=(type,cents,gain,dest)=>{const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.detune.value=cents;const og=ac.createGain();og.gain.value=gain;o.connect(og);og.connect(dest);tones.push(o);all.push(o);return o;};
  const F=(type,fr,q,dest)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=fr;b.Q.value=q||0.7;b.connect(dest||g);return b;};
  const vib=(cents)=>{const l=ac.createOscillator();l.frequency.value=5.3;const lg=ac.createGain();lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(cents,t+0.4);l.connect(lg);tones.forEach(o=>lg.connect(o.detune));all.push(l);};
  switch(inst){
    case 'supersaw':{const l=F('lowpass',5200,0.9),hp=F('highpass',140,0.7,l);[-31,-19,-8,0,8,19,31].forEach((c,i)=>O('sawtooth',c,i===3?0.48:0.36,hp));O('sawtooth',-1200,0.24,hp);vib(5);break;}
    case 'sine':O('sine',0,1,g);break;
    case 'saw':{const l=F('lowpass',6000);O('sawtooth',0,0.5,l);break;}
    case 'pad':{const l=F('lowpass',1400);[-9,0,9].forEach(c=>O('sawtooth',c,0.17,l));break;}
    case 'strings':{const l=F('lowpass',2300);[-5,5].forEach(c=>O('sawtooth',c,0.24,l));vib(10);break;}
    case 'lead':{const l=F('lowpass',3000);O('square',0,0.22,l);vib(8);break;}
    case 'violin':{const l=F('lowpass',2400,0.6),hp=F('highpass',200,0.7,l);[-9,0,8].forEach(c=>O('sawtooth',c,0.15,hp));vib(16);break;}
    case 'flute':{const l=F('lowpass',7000);O('triangle',0,0.8,l);O('sine',1200,0.08,l);vib(7);
      const n=ac.createBufferSource();n.buffer=noiseBuf;n.loop=true;nf=F('bandpass',f*2,1.5,null);const ng=ac.createGain();ng.gain.value=0.09;n.connect(nf);nf.disconnect();nf.connect(ng);ng.connect(l);all.push(n);break;}
    case 'voice':{const mix=ac.createGain();[[800,6,1],[1150,8,0.5],[2900,10,0.22]].forEach(([fc,q,a])=>{const b=F('bandpass',fc,q,null);b.disconnect();const ga=ac.createGain();ga.gain.value=a*3;mix.connect(b);b.connect(ga);ga.connect(g);});
      [-9,9].forEach(c=>O('sawtooth',c,0.5,mix));vib(20);break;}
    case 'guitar':{
      const pre=ac.createGain();pre.gain.value=2.2;const sh=ac.createWaveShaper();sh.curve=DIST;sh.oversample='2x';
      const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=110;
      const mid=ac.createBiquadFilter();mid.type='peaking';mid.frequency.value=1600;mid.Q.value=0.9;mid.gain.value=5;
      const cab=F('lowpass',4200,0.8);pre.connect(sh);sh.connect(hp);hp.connect(mid);mid.connect(cab);
      [-6,6].forEach(c=>O('sawtooth',c,0.45,pre));break;}
  }
  return {tones,all,nf};
}
function legatoNote(tr,midi,t,dur,vel,out){
  const f=midiHz(midi),[a,pk,sus]=SUST[tr.inst],peak=pk*sus*vel;let s=legatoMap.get(tr);
  if(s&&t<=s.end+0.3){
    s.tones.forEach(o=>o.frequency.setTargetAtTime(f,t,0.04));if(s.nf)s.nf.frequency.setTargetAtTime(f*2,t,0.04);
    s.g.gain.cancelScheduledValues(t);s.g.gain.setTargetAtTime(peak,t,0.08);
  }else{
    const g=ac.createGain();g.connect(out);g.gain.setValueAtTime(0.0001,t);g.gain.setTargetAtTime(peak,t,a*1.5);
    s=Object.assign(buildSust(tr.inst,f,t,g),{g});s.all.forEach(o=>o.start(t));legatoMap.set(tr,s);
  }
  s.end=t+dur;s.g.gain.setTargetAtTime(0,s.end,0.12);s.all.forEach(o=>o.stop(s.end+1.5));
}
const DIST=(()=>{const n=4096,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(3*x)/Math.tanh(3);}return c;})();
function voice(inst,midi,t,dur,vel,out){
  const f=midiHz(midi),g=ac.createGain();g.connect(out);
  if(SUST[inst]&&inst!=='guitar'){const s=buildSust(inst,f,t,g),[a,pk,sus,tau,rel]=SUST[inst],stop=env(g,t,dur,a,pk*vel,sus,tau,rel);s.all.forEach(o=>{o.start(t);o.stop(stop+0.05);});return;}
  const oscs=[];
  const O=(type,freq,gain,dest)=>{const o=ac.createOscillator();o.type=type;o.frequency.value=freq;const og=ac.createGain();og.gain.value=gain;o.connect(og);og.connect(dest||g);oscs.push(o);return o;};
  const LP=(fr,q)=>{const l=ac.createBiquadFilter();l.type='lowpass';l.frequency.value=fr;l.Q.value=q||0.7;l.connect(g);return l;};
  let stop;
  switch(inst){
    case 'piano':O('triangle',f,0.7);O('sine',f*2,0.22);O('sine',f*3,0.07);stop=env(g,t,dur,0.004,0.6*vel,0.12,0.55,0.3);break;
    case 'guitar':{
      const pre=ac.createGain();pre.gain.value=2.2;const sh=ac.createWaveShaper();sh.curve=DIST;sh.oversample='2x';
      const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=110;
      const mid=ac.createBiquadFilter();mid.type='peaking';mid.frequency.value=1600;mid.Q.value=0.9;mid.gain.value=5;
      const cab=LP(4200,0.8);pre.connect(sh);sh.connect(hp);hp.connect(mid);mid.connect(cab);
      const a=O('sawtooth',f,0.45,pre),b=O('sawtooth',f,0.45,pre);a.detune.value=-6;b.detune.value=6;
      const l=ac.createOscillator();l.frequency.value=5.6;const lg=ac.createGain();lg.gain.setValueAtTime(0,t);lg.gain.setValueAtTime(0,t+0.18);lg.gain.linearRampToValueAtTime(18,t+0.5);
      l.connect(lg);lg.connect(a.detune);lg.connect(b.detune);oscs.push(l);
      stop=env(g,t,dur,0.003,0.3*vel,0.75,0.9,0.08);break;}
    case 'organ':[1,2,3,4].forEach((h,i)=>O('sine',f*h,[0.6,0.3,0.15,0.08][i]));stop=env(g,t,dur,0.02,0.4*vel,0.9,0.3,0.08);break;
    case 'bass':{const l=LP(2000,2);l.frequency.setValueAtTime(2200,t);l.frequency.setTargetAtTime(320,t,0.09);O('sawtooth',f,0.45,l);O('sine',f,0.6);stop=env(g,t,dur,0.005,0.75*vel,0.7,0.3,0.07);break;}
    case 'cleanguitar':{ // gentle rhythm guitar: two saws, light saturation, a pick brightness that settles, warm cabinet
      const pre=ac.createGain();pre.gain.value=0.55;const sh=ac.createWaveShaper();sh.curve=DIST;
      const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=90;
      const lp=LP(3400,0.9);lp.frequency.setValueAtTime(3400,t);lp.frequency.setTargetAtTime(1500,t,0.12);
      pre.connect(sh);sh.connect(hp);hp.connect(lp);
      const a=O('sawtooth',f,0.5,pre),b=O('sawtooth',f,0.5,pre);a.detune.value=-5;b.detune.value=5;O('triangle',f,0.25,pre);
      stop=env(g,t,dur,0.004,0.42*vel,0.35,0.6,0.12);break;}
    case 'pluck':{const l=LP(5000,1.5);l.frequency.setValueAtTime(5000,t);l.frequency.setTargetAtTime(400,t,0.1);O('sawtooth',f,0.4,l);stop=env(g,t,Math.max(dur,0.25),0.002,0.7*vel,0,0.28,0.12);break;}
    case 'bell':{const c=O('sine',f,1);const m=ac.createOscillator();m.frequency.value=f*3.5;const mg=ac.createGain();mg.gain.setValueAtTime(f*1.6,t);mg.gain.setTargetAtTime(0,t,0.35);m.connect(mg);mg.connect(c.frequency);oscs.push(m);stop=env(g,t,Math.max(dur,0.6),0.002,0.5*vel,0,0.9,0.4);break;}
    case 'gamelan':{
      [[1,1,1.8],[2.756,0.2,0.55],[5.404,0.06,0.2]].forEach(([ratio,amp,tau],pi)=>{const pg=ac.createGain();pg.connect(g);pg.gain.setValueAtTime(0,t);pg.gain.linearRampToValueAtTime(0.45*vel*amp,t+0.006);pg.gain.setTargetAtTime(0,t+0.006,tau);
        const o=ac.createOscillator();o.frequency.value=f*ratio;o.connect(pg);oscs.push(o);if(pi===0){const o2=ac.createOscillator();o2.frequency.value=f+4;o2.connect(pg);oscs.push(o2);}});
      g.gain.value=1;stop=t+6;break;}
    case 'acid':{ // 303-style: saw through a resonant lowpass whose cutoff snaps down after every note, a little drive
      const sh=ac.createWaveShaper();sh.curve=DIST;const pre=ac.createGain();pre.gain.value=1.6;const post=LP(6000,0.7);sh.connect(post);pre.connect(sh);
      const l=ac.createBiquadFilter();l.type='lowpass';l.Q.value=13;l.connect(pre);const top=Math.min(7000,f*(5+5*vel));
      l.frequency.setValueAtTime(top,t);l.frequency.setTargetAtTime(Math.max(120,f*1.2),t+0.01,0.07+0.05*vel);
      O('sawtooth',f,0.3,l);stop=env(g,t,dur,0.003,0.5*vel,0.6,0.18,0.05);break;}
    case 'synthbass':{ // reese-style: two detuned saws + a sine sub, darker filter that opens a little on the attack
      const l=LP(900,1.2);l.frequency.setValueAtTime(1800,t);l.frequency.setTargetAtTime(520,t,0.12);
      const a=O('sawtooth',f,0.32,l),b=O('sawtooth',f,0.32,l);a.detune.value=-14;b.detune.value=14;O('sine',f,0.75);
      stop=env(g,t,dur,0.004,0.7*vel,0.8,0.4,0.06);break;}
    case 'stab':{ // bright chord stab: four detuned saws, the filter falls fast so each hit is a short 'bap'
      const l=LP(7000,2);l.frequency.setValueAtTime(7500,t);l.frequency.setTargetAtTime(700,t,0.06);
      [-12,-4,4,12].forEach(c=>{const o=O('sawtooth',f,0.5,l);o.detune.value=c;});
      stop=env(g,t,Math.min(dur,0.35),0.002,0.6*vel,0.15,0.12,0.08);break;}
    case 'tom':{const o=O('sine',f*1.7,1);o.frequency.setValueAtTime(f*1.7,t);o.frequency.exponentialRampToValueAtTime(f,t+0.07);g.gain.setValueAtTime(vel*0.9,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.32);stop=t+0.34;break;}
  }
  oscs.forEach(o=>{o.start(t);o.stop(stop+0.05);});
}
function noise(t,d,dest){const s=ac.createBufferSource();s.buffer=noiseBuf;s.connect(dest);s.start(t,Math.random()*0.4);s.stop(t+d);}
function perc(g,t,peak,d){g.gain.setValueAtTime(peak,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);}
function drum(i,t,vel,out,kit,dur){
  const name=DRUMS[i],g=ac.createGain();g.connect(out);
  const F=(type,fr,q)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=fr;b.Q.value=q||0.7;b.connect(g);return b;};
  if(name==='riser'){const d=Math.max(0.3,dur||1),b=F('bandpass',300,2.5);b.frequency.setValueAtTime(300,t);b.frequency.exponentialRampToValueAtTime(9000,t+d);
    const s=ac.createBufferSource();s.buffer=noiseBuf;s.loop=true;s.connect(b);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vel*0.55,t+d);g.gain.setTargetAtTime(0,t+d,0.03);s.start(t);s.stop(t+d+0.2);
    const o=ac.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(880,t+d);const ol=ac.createBiquadFilter();ol.type='lowpass';ol.frequency.value=2500;const og=ac.createGain();og.gain.value=0.12;o.connect(ol);ol.connect(og);og.connect(g);o.start(t);o.stop(t+d+0.2);return;}
  if(name==='impact'){const o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(90,t);o.frequency.exponentialRampToValueAtTime(28,t+1.2);o.connect(g);perc(g,t,vel*1.2,1.8);o.start(t);o.stop(t+1.9);
    const g2=ac.createGain();g2.connect(out);const b=ac.createBiquadFilter();b.type='lowpass';b.frequency.value=2500;b.connect(g2);noise(t,1.2,b);perc(g2,t,vel*0.5,1.1);return;}
  if(name==='zap'){const o=ac.createOscillator();o.type='square';o.frequency.setValueAtTime(2400,t);o.frequency.exponentialRampToValueAtTime(90,t+0.16);const l=F('lowpass',3000);o.connect(l);perc(g,t,vel*0.35,0.18);o.start(t);o.stop(t+0.2);return;}
  if(kit==='e'){
    if(name==='kick'){const o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(190,t);o.frequency.exponentialRampToValueAtTime(48,t+0.07);
      const sh=ac.createWaveShaper();sh.curve=DIST;const pg=ac.createGain();pg.gain.value=1.4;o.connect(pg);pg.connect(sh);sh.connect(g);perc(g,t,vel*1.0,0.42);o.start(t);o.stop(t+0.48);
      const cg=ac.createGain();cg.connect(out);const hb=ac.createBiquadFilter();hb.type='highpass';hb.frequency.value=2500;hb.connect(cg);noise(t,0.012,hb);perc(cg,t,vel*0.5,0.012);return;}
    if(name==='hat'||name==='openhat'){const d=name==='hat'?0.045:0.32,b=F('bandpass',10000,0.9),h=ac.createBiquadFilter();h.type='highpass';h.frequency.value=7000;h.connect(b);
      [263,400,421,474,587,845].forEach(fr=>{const o=ac.createOscillator();o.type='square';o.frequency.value=fr*1.18;o.connect(h);o.start(t);o.stop(t+d+0.05);});perc(g,t,vel*0.22,d);return;}
    if(name==='snare'){noise(t,0.16,F('highpass',1400,0.7));perc(g,t,vel*0.75,0.14);const o=ac.createOscillator();o.type='triangle';o.frequency.setValueAtTime(260,t);o.frequency.exponentialRampToValueAtTime(170,t+0.05);const og=ac.createGain();o.connect(og);og.connect(out);perc(og,t,vel*0.55,0.08);o.start(t);o.stop(t+0.1);return;}
    if(name==='tom'){const o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(320,t);o.frequency.exponentialRampToValueAtTime(90,t+0.25);o.connect(g);perc(g,t,vel*0.9,0.3);o.start(t);o.stop(t+0.32);return;}
  }
  if(name==='kick'||name==='tom'){const o=ac.createOscillator();o.type='sine';const a=name==='kick'?[160,42,0.12,0.45]:[140,85,0.3,0.4];
    o.frequency.setValueAtTime(a[0],t);o.frequency.exponentialRampToValueAtTime(a[1],t+a[2]);o.connect(g);perc(g,t,vel*1.1,a[3]);o.start(t);o.stop(t+a[3]+0.05);}
  else if(name==='snare'){noise(t,0.2,F('bandpass',1800,0.7));perc(g,t,vel*0.7,0.18);const o=ac.createOscillator();o.type='triangle';o.frequency.value=190;const og=ac.createGain();o.connect(og);og.connect(out);perc(og,t,vel*0.5,0.1);o.start(t);o.stop(t+0.12);}
  else if(name==='hat'||name==='openhat'){const d=name==='hat'?0.05:0.35;noise(t,d+0.02,F('highpass',7000));perc(g,t,vel*0.32,d);}
  else if(name==='clap'){noise(t,0.25,F('bandpass',1100,1));g.gain.setValueAtTime(0.001,t);[0,0.012,0.024].forEach(o=>{g.gain.setValueAtTime(vel*0.7,t+o);g.gain.exponentialRampToValueAtTime(0.05,t+o+0.01);});g.gain.setValueAtTime(vel*0.6,t+0.034);g.gain.exponentialRampToValueAtTime(0.001,t+0.2);}
  else if(name==='rim'){noise(t,0.04,F('bandpass',2500,4));perc(g,t,vel*0.9,0.03);}
}

// sidechain pump (track option duck=0.6): a gain that drops to (1−duck) on every beat and swells back (τ 75 ms).
// rel(step) = seconds from this note's start to that step (the engine passes it; without it there is no pump).
function duckBus(e,t,dur,out,rel){const g=ac.createGain();g.connect(out);const D=e.track.duck,sp=e.track.beatSteps||e.beatSteps||0,tau=0.075;
  if(!sp)return out;let b=Math.floor(e.step/sp+1e-9)*sp;const end=t+dur+1.6;
  g.gain.setValueAtTime(1-D*Math.exp(-(-rel(b))/tau),t);g.gain.setTargetAtTime(1,t,tau);
  for(b+=sp;t+rel(b)<end;b+=sp){const tb=t+rel(b);g.gain.setValueAtTime(1-D,tb);g.gain.setTargetAtTime(1,tb+0.004,tau);}
  return g;}
function play(e,t,dur,midi,out,rel){
  const v=e.vel*e.track.vol;
  if(e.track.duck>0&&!e.track.legato&&rel)out=duckBus(e,t,dur,out,rel);
  if(e.track.inst==='drums'){drum(e.drum,t,v,out,e.track.kit,dur);return;}
  if(e.track.legato)legatoNote(e.track,midi,t,dur,v,out);
  else voice(e.track.inst,midi,t,dur,v,out);
}
return {ctx:ac,chain,play,reset(){legatoMap=new Map();}};
}
global.NoteGridSynth=NoteGridSynth;
})(window);
