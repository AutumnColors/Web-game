/* Choreography: map parts of the music to movements of a figure. Global: StudioChoreo.
   const ch = new StudioChoreo({player, container, storageKey:'julia3d', targets:[
     {id:'spin', label:'Spin speed', default:{source:'energy', amount:1, smooth:.4}}, ...]});
   each frame: const v = ch.values(player.features(t), dt);  // v.spin, v.pulse … (0 … ~2)
   ch.reset() before an export so smoothing starts the same way every time. */
(function(global){
'use strict';
const GENERIC=[
 ['none','— nothing —'],['energy','Whole song · loudness'],['accent','Drums · any hit'],['kick','Drums · kick'],['snare','Drums · snare'],['hat','Drums · hi-hat'],
 ['beat','Beat pulse'],['bar','Bar pulse'],['melody','Melody · pitch'],['melodyhit','Melody · notes'],['low','Lowest part · notes'],['progress','Song progress 0→1'],['section','Section changes']];
class StudioChoreo extends EventTarget{
  constructor({player,container,targets,storageKey}){
    super();this.player=player;this.targets=targets;this.key=storageKey?'studio.choreo.'+storageKey:null;this.state={};this.last={};this.tracks=[];
    let saved={};try{saved=JSON.parse(localStorage.getItem(this.key)||'{}');}catch(e){}
    this.map={};for(const t of targets)this.map[t.id]=Object.assign({source:'none',amount:1,smooth:0.3},t.default||{},saved[t.id]||{});
    this.container=container;if(container)this._build();
    const eng=player&&(player.engine||player);
    if(eng&&eng.addEventListener){eng.addEventListener('load',()=>this._songChanged());if(eng.song)this._songChanged();}
  }
  get engine(){return this.player&&(this.player.engine||this.player);}
  _songChanged(){const s=this.engine.summary();this.tracks=s?s.tracks:[];
    const pitched=this.tracks.filter(t=>t.inst!=='drums'&&t.inst!=='tom');
    this.melody=(pitched.slice().sort((a,b)=>(b.notes*(b.high+b.low))-(a.notes*(a.high+a.low)))[0]||{}).name;
    this.low=(pitched.slice().sort((a,b)=>(a.low+a.high)-(b.low+b.high))[0]||{}).name;
    this.drumTracks=this.tracks.filter(t=>t.inst==='drums'||t.inst==='tom').map(t=>t.name);
    if(this.container)this._fillSources();this.reset();}
  sources(){const s=GENERIC.slice();for(const t of this.tracks){s.push(['hit:'+t.name,t.name+' · notes']);s.push(['level:'+t.name,t.name+' · held level']);if(t.inst!=='drums')s.push(['pitch:'+t.name,t.name+' · pitch']);}return s;}
  raw(src,f){
    if(!f||!src||src==='none')return 0;const T=f.tracks;
    switch(src){
      case 'energy':return f.energy;case 'beat':return f.beatPulse;case 'bar':return f.barPulse;case 'progress':return f.progress;
      case 'kick':case 'snare':case 'hat':return f.drums[src]||0;
      case 'accent':{let a=Math.max(f.drums.kick||0,f.drums.snare||0,f.drums.tom||0,f.drums.clap||0);for(const n of this.drumTracks||[])if(T[n])a=Math.max(a,T[n].hit);return this.drumTracks&&this.drumTracks.length?a:f.beatPulse*Math.min(1,f.energy);}
      case 'melody':return this.melody&&T[this.melody]?T[this.melody].pitch:0;
      case 'melodyhit':return this.melody&&T[this.melody]?T[this.melody].hit:0;
      case 'low':return this.low&&T[this.low]?T[this.low].hit:0;
      case 'section':return f.section%2;
    }
    const [kind,name]=[src.slice(0,src.indexOf(':')),src.slice(src.indexOf(':')+1)],st=T[name];if(!st)return 0;
    return kind==='hit'?st.hit:kind==='level'?st.level:kind==='pitch'?st.pitch:0;
  }
  values(f,dt=1/60){
    const out={};for(const t of this.targets){const m=this.map[t.id],x=this.raw(m.source,f)*m.amount;
      const tau=m.smooth*0.6,prev=this.state[t.id];const v=prev==null||tau<=0?x:prev+(x-prev)*(1-Math.exp(-dt/tau));this.state[t.id]=v;out[t.id]=v;}
    this.last=out;return out;
  }
  reset(){this.state={};}
  set(id,patch){Object.assign(this.map[id],patch);this._save();if(this.container)this._sync();this.dispatchEvent(new CustomEvent('change',{detail:{id,mapping:this.map[id]}}));}
  _save(){if(!this.key)return;try{localStorage.setItem(this.key,JSON.stringify(this.map));}catch(e){}}
  _build(){
    const c=this.container;c.classList.add('studio-choreo');
    if(!document.getElementById('studio-choreo-css')){const st=document.createElement('style');st.id='studio-choreo-css';st.textContent=`
.studio-choreo{display:grid;grid-template-columns:minmax(90px,1fr) minmax(130px,1.6fr) 1fr 1fr 54px;gap:6px 10px;align-items:center;font:13px system-ui;color:#dfe8f7}
.studio-choreo .h{font-size:11px;color:#8ea0bd;text-transform:uppercase;letter-spacing:.05em}
.studio-choreo select{width:100%;background:#1b2a42;color:#fff;border:1px solid #42536f;border-radius:7px;padding:6px}
.studio-choreo input[type=range]{width:100%;accent-color:#9fd0ff}
.studio-choreo .meter{height:8px;border-radius:4px;background:#1b2a42;overflow:hidden}.studio-choreo .meter i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3d8fd6,#d05cc4)}
@media(max-width:560px){.studio-choreo{grid-template-columns:1fr 1.5fr 1fr 44px}.studio-choreo .smooth{display:none}}`;document.head.append(st);}
    c.innerHTML='<div class="h">Movement</div><div class="h">Driven by</div><div class="h">Amount</div><div class="h smooth">Smoothing</div><div class="h">Now</div>';
    this.rows={};
    for(const t of this.targets){const r={};
      const lab=document.createElement('div');lab.textContent=t.label;if(t.hint)lab.title=t.hint;
      r.sel=document.createElement('select');r.sel.onchange=()=>this.set(t.id,{source:r.sel.value});
      r.amt=Object.assign(document.createElement('input'),{type:'range',min:0,max:2,step:0.05});r.amt.oninput=()=>this.set(t.id,{amount:+r.amt.value});
      r.sm=Object.assign(document.createElement('input'),{type:'range',min:0,max:1,step:0.05});r.sm.oninput=()=>this.set(t.id,{smooth:+r.sm.value});
      const smw=document.createElement('div');smw.className='smooth';smw.append(r.sm);
      r.meter=document.createElement('div');r.meter.className='meter';r.meter.append(r.bar=document.createElement('i'));
      c.append(lab,r.sel,r.amt,smw,r.meter);this.rows[t.id]=r;}
    this._fillSources();
    const loop=()=>{for(const t of this.targets){const v=this.last[t.id]||0;this.rows[t.id].bar.style.width=Math.min(100,v*60)+'%';}requestAnimationFrame(loop);};requestAnimationFrame(loop);
  }
  _fillSources(){const list=this.sources();for(const t of this.targets){const r=this.rows[t.id],m=this.map[t.id];r.sel.innerHTML='';
      for(const [v,l] of list)r.sel.append(new Option(l,v));
      if(!list.some(x=>x[0]===m.source)){r.sel.append(new Option(m.source.split(':')[1]+' (not in this song)',m.source));}
    }this._sync();}
  _sync(){for(const t of this.targets){const r=this.rows[t.id],m=this.map[t.id];r.sel.value=m.source;r.amt.value=m.amount;r.sm.value=m.smooth;}}
}
global.StudioChoreo=StudioChoreo;
})(window);
