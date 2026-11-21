/* NoteGrid core: score parser (from Roman's NoteGrid player, v0.4), score writer, and converters.
   Pure functions, no audio, no DOM. Global: NoteGrid.  Score grammar: see music/studio/ (Score tab). */
(function(global){
'use strict';
const INSTRUMENTS=['piano','guitar','cleanguitar','bass','pad','lead','strings','violin','flute','voice','bell','gamelan','pluck','organ','sine','saw','tom','drums'];
const LEGATO_OK=['sine','saw','pad','lead','strings','violin','flute','voice','guitar'];
const DRUMS=['kick','snare','hat','openhat','clap','tom','rim'];
const NOTE_IDX={c:0,d:2,e:4,f:5,g:7,a:9,b:11};
const NAMES=['C','C#','D','E♭','E','F','F#','G','G#','A','B♭','B'];
function noteToMidi(s){const m=String(s).trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);if(!m)return null;return NOTE_IDX[m[1].toLowerCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12*(parseInt(m[3],10)+1);}
function midiName(m){const n=Math.round(m),d=Math.round((m-n)*100);return NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1)+(d?(d>0?' +':' −')+Math.abs(d)+'¢':'');}
function parsePitch(t){if(/^[+-]?\d+(\.\d+)?$/.test(t))return parseFloat(t);const m=t.match(/^([+-]?\d+)\/(\d+)$/);if(m&&+m[2]>0)return parseInt(m[1],10)/parseInt(m[2],10);return null;}
function midiHz(m){return 440*Math.pow(2,(m-69)/12);}
function drumIndex(t){t=String(t).toLowerCase();if(/^\d+$/.test(t)){const i=parseInt(t,10);return i<DRUMS.length?i:null;}const i=DRUMS.indexOf(t);return i<0?null:i;}
function parseScore(text){
  const song={title:'Untitled',bpm:100,steps:4,beats:4,root:60,loop:true,length:0,tracks:[],events:[],marks:[],tempos:[]};
  const errors=[],pats=[];let cur=null,explicitLen=null;
  const barSteps=()=>song.steps*song.beats;
  function parseStep(t){const m=String(t).match(/^(\d+):(\d+(?:\.\d+)?)$/);if(m)return parseInt(m[1],10)*barSteps()+parseFloat(m[2]);if(/^\d+(\.\d+)?$/.test(t))return parseFloat(t);return null;}
  text.split(/\r?\n/).forEach((raw,i)=>{
    const ln=i+1,line=raw.replace(/\/\/.*$/,'').trim();if(!line)return;
    let m=line.match(/^tempo\s+(\S+)\s+(\d+(?:\.\d+)?)$/i);
    if(m){const s=parseStep(m[1]),b=parseFloat(m[2]);if(s==null||!(b>0))errors.push(`line ${ln}: tempo lines are "tempo WHERE BPM", like "tempo 4:0 90"`);else song.tempos.push({step:s,bpm:b});return;}
    m=line.match(/^mark\s+(\S+)\s+(.+)$/i);
    if(m){const s=parseStep(m[1]);if(s==null)errors.push(`line ${ln}: mark needs a position, like "mark 4:0 Chorus"`);else song.marks.push({step:s,text:m[2]});return;}
    m=line.match(/^track:?\s+(\S+)\s+(\S+)\s*(.*)$/i);
    if(m){
      const inst=m[2].toLowerCase();
      if(!INSTRUMENTS.includes(inst))errors.push(`line ${ln}: unknown instrument "${m[2]}" (use: ${INSTRUMENTS.join(', ')})`);
      cur={name:m[1],inst:INSTRUMENTS.includes(inst)?inst:'sine',vol:0.8,oct:0,legato:false,pedal:0,notes:[],idx:song.tracks.length,muted:false};
      (m[3]||'').split(/\s+/).filter(Boolean).forEach(kv=>{const [k,v]=kv.split('=');
        if(k==='vol'&&!isNaN(parseFloat(v)))cur.vol=parseFloat(v);
        else if(k==='oct'&&/^[+-]?\d+$/.test(v))cur.oct=parseInt(v,10);
        else if(k==='pedal'&&parseFloat(v)>0)cur.pedal=parseFloat(v);
        else if(k==='legato'&&v===undefined){if(LEGATO_OK.includes(cur.inst))cur.legato=true;else errors.push(`line ${ln}: legato works with ${LEGATO_OK.join(', ')}`);}
        else errors.push(`line ${ln}: unknown track option "${kv}" (use vol=0.8, oct=-1, pedal=12 or legato)`);});
      song.tracks.push(cur);return;
    }
    if(!cur){
      m=line.match(/^(\w+)\s*:\s*(.+)$/);
      if(!m){errors.push(`line ${ln}: before the first track, lines look like "bpm: 100"`);return;}
      const k=m[1].toLowerCase(),v=m[2].trim();
      if(k==='title')song.title=v;
      else if(k==='bpm'){const b=parseFloat(v);if(b>0)song.bpm=b;else errors.push(`line ${ln}: bpm must be > 0`);}
      else if(k==='steps'){const s=parseInt(v,10);if(s>0)song.steps=s;else errors.push(`line ${ln}: steps must be ≥ 1`);}
      else if(k==='beats'){const s=parseInt(v,10);if(s>0)song.beats=s;else errors.push(`line ${ln}: beats must be ≥ 1`);}
      else if(k==='root'){const r=/^-?\d+$/.test(v)?parseInt(v,10):noteToMidi(v);if(r==null)errors.push(`line ${ln}: root must be like C4, F#3 or a MIDI number`);else song.root=r;}
      else if(k==='loop')song.loop=/^(yes|true|on|1)$/i.test(v);
      else if(k==='length'){const b=v.match(/^(\d+)\s*bars?$/i);if(b)explicitLen=-parseInt(b[1],10);else{const s=parseStep(v);if(s==null)errors.push(`line ${ln}: length like "8 bars" or "128"`);else explicitLen=s;}}
      else errors.push(`line ${ln}: unknown setting "${k}"`);
      return;
    }
    m=line.match(/^(\S+)\s*\|(.*)$/);
    if(m){
      const body=m[2].replace(/[|\s]/g,'');
      if(!/^[xX.\-]+$/.test(body)){errors.push(`line ${ln}: pattern may only use x X . -`);return;}
      const p=cur.inst==='drums'?drumIndex(m[1]):parsePitch(m[1]);
      if(p==null){errors.push(`line ${ln}: "${m[1]}" is not a ${cur.inst==='drums'?'drum ('+DRUMS.join(', ')+')':'pitch number'}`);return;}
      pats.push({track:cur,p,body});return;
    }
    const pp=t=>{if(cur.inst==='drums')return drumIndex(t);
      let q=t.match(/^(\d+(?:\.\d+)?)hz$/i);if(q&&+q[1]>0)return 12*Math.log2(+q[1]/midiHz(song.root));
      q=t.match(/^r(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/i);if(q){const r=+q[1]/(q[2]?+q[2]:1);if(r>0)return 12*Math.log2(r);}
      return parsePitch(t);};
    m=line.match(/^copy\s+(\S+)\s+(\S+)\s+at\s+(\S+)\s*(.*)$/i);
    if(m){const a=parseStep(m[1]),b=parseStep(m[2]),d=parseStep(m[3]);let reps=1,tr=0,bad=false;
      if(a==null||b==null||d==null||b<=a){errors.push(`line ${ln}: copy FROM TO at WHERE [x2] [+5]`);return;}
      m[4].split(/\s+/).filter(Boolean).forEach(t=>{if(/^x\d+$/.test(t))reps=parseInt(t.slice(1),10);else if(/^[+-]\d+(\.\d+)?$/.test(t)&&cur.inst!=='drums')tr=parseFloat(t);else bad=true;});
      if(bad){errors.push(`line ${ln}: after "at WHERE" only x2 (repeat) and +5 / -12 (transpose)`);return;}
      const src=cur.notes.filter(n=>n.step>=a&&n.step<b);
      for(let r=0;r<reps;r++)src.forEach(n=>cur.notes.push({...n,step:n.step-a+d+r*(b-a),p:n.p+tr,line:ln}));
      return;}
    m=line.match(/^(\S+)\s+seq\s+(\S+)\s+(.+)$/i);
    if(m){const s0=parseStep(m[1]),len=parseFloat(m[2]);
      if(s0==null||!(len>0)){errors.push(`line ${ln}: seq lines are "WHERE seq LENGTH p1 p2 - _ ..."`);return;}
      let last=[];
      for(const [j,t] of m[3].split(/\s+/).entries()){const s=s0+j*len;
        if(t==='-'){last.forEach(n=>n.len+=len);continue;}
        if(t==='_'){last=[];continue;}
        const ps=t.split(',').map(pp);if(ps.some(p=>p==null)){errors.push(`line ${ln}: bad note "${t}" in seq (use numbers, a,b,c chords, - hold, _ rest)`);return;}
        last=ps.map(p=>({step:s,len,p,vel:0.8,line:ln}));last.forEach(n=>cur.notes.push(n));}
      return;}
    const tk=line.split(/\s+/);
    const step=parseStep(tk[0]);
    if(step==null||tk.length<2){errors.push(`line ${ln}: note lines are "step pitch(es) [length] [velocity]"`);return;}
    const ps=tk[1].split(',').map(pp);
    if(ps.some(p=>p==null)){errors.push(`line ${ln}: bad pitch list "${tk[1]}"`);return;}
    const len=tk[2]!=null?parseFloat(tk[2]):1,vel=tk[3]!=null?parseFloat(tk[3]):0.8;
    if(!(len>0)){errors.push(`line ${ln}: length must be > 0`);return;}
    ps.forEach(p=>cur.notes.push({step,len,p,vel:isNaN(vel)?0.8:vel,line:ln}));
  });
  let end=0;
  song.tracks.forEach(t=>t.notes.forEach(n=>end=Math.max(end,n.step+n.len)));
  pats.forEach(p=>end=Math.max(end,p.body.length));
  let L;
  if(explicitLen!=null)L=explicitLen<0?-explicitLen*barSteps():explicitLen;
  else L=Math.max(barSteps(),Math.ceil(end/barSteps())*barSteps());
  pats.forEach(({track,p,body})=>{let last=null;
    for(let s=0;s<L;s++){const ch=body[s%body.length];
      if(ch==='x'||ch==='X'){last={step:s,len:1,p,vel:ch==='X'?1:0.72,line:0};track.notes.push(last);}
      else if(ch==='-'){if(last&&last.step+last.len===s)last.len++;}
      else last=null;}});
  song.length=L;
  song.tracks.forEach(t=>{if(t.pedal)t.notes.forEach(n=>{const b=Math.ceil((n.step+1e-9)/t.pedal)*t.pedal;if(b>n.step+n.len)n.len=b-n.step;});});
  song.marks.sort((a,b)=>a.step-b.step);
  song.tempos=song.tempos.filter(t=>t.step>0).sort((a,b)=>a.step-b.step);song.tempos.unshift({step:0,bpm:song.bpm});
  song.tracks.forEach(t=>t.notes.forEach(n=>{
    const ev={step:n.step,len:n.len,vel:n.vel,track:t,line:n.line};
    if(t.inst==='drums'){ev.drum=n.p;}else{ev.rel=n.p+12*t.oct;ev.midi=song.root+ev.rel;}
    if(ev.step<L)song.events.push(ev);}));
  song.events.sort((a,b)=>a.step-b.step);
  return {song,errors};
}
// time (seconds) at a grid position, and the inverse — they follow the tempo changes
function songTime(s,st){let t=0;const T=s.tempos;for(let i=0;i<T.length;i++){const a=T[i].step,b=i+1<T.length?T[i+1].step:Infinity;if(st<=a)break;t+=(Math.min(st,b)-a)*60/T[i].bpm/s.steps;}return t;}
// Inverse of songTime: the step reached after t seconds.
function stepAt(s,t){let acc=0;const T=s.tempos;for(let i=0;i<T.length;i++){const a=T[i].step,b=i+1<T.length?T[i+1].step:Infinity,sec=(b-a)*60/T[i].bpm/s.steps;if(t<=acc+sec||b===Infinity)return a+(t-acc)*T[i].bpm*s.steps/60;acc+=sec;}return 0;}

const num=x=>{const r=Math.round(x*1000)/1000;return String(Object.is(r,-0)?0:r)};
const rootName=r=>{const n=Math.round(r);if(n!==r)return String(r);const L=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return L[((n%12)+12)%12]+(Math.floor(n/12)-1)};
// Write a parsed song back as a flat NoteGrid score (one line per note). Comments and seq/copy shorthand are not kept.
function serialize(song,note){
  const L=[];if(note)String(note).split('\n').forEach(x=>L.push('// '+x));
  L.push('title: '+song.title,'bpm: '+num(song.tempos[0]?.bpm??song.bpm),'steps: '+song.steps,'beats: '+song.beats,'root: '+rootName(song.root),'loop: '+(song.loop?'yes':'no'),'length: '+num(song.length),'');
  song.tempos.slice(1).forEach(t=>L.push('tempo '+num(t.step)+' '+num(t.bpm)));
  song.marks.forEach(m=>L.push('mark '+num(m.step)+' '+m.text));
  song.tracks.forEach(t=>{
    const opts=['vol='+num(t.vol)];if(t.oct)opts.push('oct='+t.oct);if(t.legato)opts.push('legato');
    L.push('','track '+t.name+' '+t.inst+' '+opts.join(' '));
    [...t.notes].sort((a,b)=>a.step-b.step||a.p-b.p).forEach(n=>L.push(num(n.step)+' '+(t.inst==='drums'?DRUMS[n.p]:num(n.p))+' '+num(n.len)+' '+num(n.vel)));
  });
  return L.join('\n')+'\n';
}
// Guess a NoteGrid instrument from a track or piece name.
function guessInstrument(name){const n=String(name||'').toLowerCase();
  const R=[['drum','tom'],['bass','bass'],['rhythm','cleanguitar'],['guitar','guitar'],['violin','violin'],['string','strings'],['pad','pad'],['choir','voice'],['voice','voice'],['flute','flute'],['gamelan','gamelan'],['organ','organ'],['bell','bell'],['tick','pluck'],['triangle','sine'],['sine','sine'],['saw','saw'],['8-bit','saw']];
  for(const [k,v] of R)if(n.includes(k))return v;return 'piano';}
// Build a NoteGrid score from shared-library note lists: parts = [{name, inst?, notes:[{on (beats), p (MIDI), d (beats)}]}].
function fromParts(title,bpm,parts,opts={}){
  const steps=opts.steps||4,root=60,L=['// Converted from the shared music library: '+title,'title: '+title,'bpm: '+num(bpm||120),'steps: '+steps,'beats: 4','root: C4','loop: no',''];
  let start=Infinity;parts.forEach(p=>p.notes.forEach(n=>start=Math.min(start,n.on)));if(!isFinite(start))start=0;
  parts.forEach((p,i)=>{const inst=p.inst||guessInstrument(p.name);const nm=String(p.name||('part'+(i+1))).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||('part'+(i+1));
    L.push('track '+nm+' '+inst+' vol='+num(p.vol??(inst==='tom'?0.7:0.8)));
    p.notes.forEach(n=>L.push(num((n.on-start)*steps)+' '+num(n.p-root)+' '+num(Math.max(0.25,Math.min((n.d||0.5)*steps,steps*8)))+' 0.8'));L.push('');});
  return L.join('\n');
}
global.NoteGrid={INSTRUMENTS,LEGATO_OK,DRUMS,parseScore,songTime,stepAt,serialize,fromParts,guessInstrument,midiName,midiHz,noteToMidi};
})(typeof window!=='undefined'?window:globalThis);
