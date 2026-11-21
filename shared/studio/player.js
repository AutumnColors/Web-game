/* <studio-player> — the shared media player. Works on its own page or embedded in any page.
   Include once:   <script src="../../shared/studio/player.js"></script>
   Use:            <studio-player song="ng:motherofall-1" compact></studio-player>
   Songs:          ng:<id> (NoteGrid songs in shared/studio/songs) · lib:<id> (shared music library) · ver:<id> (a saved Studio version)
   Attributes:     song, src (URL of a score .txt), compact, loop, tempo, transpose, sync (channel name: players with the same name
                   in other tabs follow song + settings), nostudio (hide the Studio link), noexport (hide MP3/WAV)
   From the page:  el.engine · el.play() · el.pause() · el.stop() · el.seek(s) · el.load(spec | {text,title}) · el.config = {tempo:1.2}
                   el.features(t) · el.time · el.duration · el.song (summary: tracks, marks, bpm…)
   Events on el:   studio:load studio:state studio:time studio:note studio:beat studio:bar studio:mark studio:change studio:end studio:song
                   (bubble; changes made in the player's own controls arrive as studio:change with detail.source === 'ui')
   window.StudioReady resolves when the element and its helpers (NoteGrid, StudioEngine, StudioExport, StudioChoreo) are ready. */
(function(global){
'use strict';
if(global.StudioReady)return;
const BASE=new URL('./',document.currentScript.src);
const MUSIC=new URL('../music/',BASE);
const STUDIO_PAGE=new URL('../../music/studio/',BASE);
const load=src=>new Promise((ok,bad)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>bad(Error('Could not load '+src));document.head.append(s);});
// songs are stored as base64 of zlib-compressed score text (.z64) to keep the repo small
async function unpack(b64){const bytes=Uint8Array.from(atob(b64.trim()),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).text();}
const once={};const need=(key,fn)=>once[key]||(once[key]=fn());

// ---------- song sources ----------
const Library={
  ours:()=>need('ours',async()=>{const r=await fetch(new URL('songs/index.json',BASE));if(!r.ok)throw Error('Song list HTTP '+r.status);return r.json();}),
  shared:()=>need('shared',async()=>{if(!global.SharedMusic){await load(new URL('extras.js',MUSIC).href);await load(new URL('library.js',MUSIC).href);}return global.SharedMusic.catalog();}),
  versions(){try{return JSON.parse(localStorage.getItem('studio.versions')||'[]');}catch(e){return [];}},
  saveVersion(v){const all=Library.versions().filter(x=>x.id!==v.id);all.unshift(v);localStorage.setItem('studio.versions',JSON.stringify(all.slice(0,200)));return v;},
  deleteVersion(id){localStorage.setItem('studio.versions',JSON.stringify(Library.versions().filter(x=>x.id!==id)));},
  // ensembles in the shared library: which parts belong together
  ENSEMBLES:{
    'into-the-mother-of-all-ensemble':[['Lead guitar',{g:'mother',id:'into-the-mother-of-all-v1'},'guitar'],['Rhythm guitar',{g:'motherTracks',track:'rhythm'},'cleanguitar'],['Bass',{g:'motherTracks',track:'bass'},'bass'],['Synth pad',{g:'motherTracks',track:'pad'},'pad'],['Tick',{g:'motherTracks',track:'tick'},'pluck']],
    'dragonforce-ensemble':[['Acoustic guitar',{g:'dragonforce',track:'guitar'},'pluck'],['Bass guitar',{g:'dragonforce',track:'bass'},'bass'],['8-bit triangle',{g:'dragonforce',track:'triangle'},'sine'],['8-bit sine',{g:'dragonforce',track:'sine'},'sine'],['8-bit sawtooth',{g:'dragonforce',track:'sawtooth'},'saw']],
    'pyramids-of-giza-ensemble':[['Bass',{ens:'giza',track:'pyramids-of-giza-bass'},'bass'],['Drums',{ens:'giza',track:'pyramids-of-giza-drums'},'tom'],['Piano',{ens:'giza',track:'pyramids-of-giza-piano'},'piano'],['Violin then flute',{ens:'giza',track:'pyramids-of-giza-4'},'violin'],['Gamelan then voice',{ens:'giza',track:'pyramids-of-giza-5'},'gamelan']]},
  async resolve(spec){
    if(spec&&typeof spec==='object')return {text:spec.text,title:spec.title||'',id:spec.id||'',spec:spec.id||''};
    spec=String(spec||'');const [kind,...rest]=spec.split(':'),id=rest.join(':');
    if(kind==='ng'){const list=await Library.ours(),e=list.find(x=>x.id===id);if(!e)throw Error('No NoteGrid song "'+id+'"');
      const r=await fetch(new URL('songs/'+e.file,BASE));if(!r.ok)throw Error('Song HTTP '+r.status);return {text:/\.z64$/.test(e.file)?await unpack(await r.text()):await r.text(),title:e.title,id:spec,spec,about:e.about};}
    if(kind==='ver'){const v=Library.versions().find(x=>x.id===id);if(!v)throw Error('Version not found on this device');return {text:v.text,title:v.title,id:spec,spec};}
    if(kind==='lib'){const cat=await Library.shared(),e=cat.find(x=>x.id===id);if(!e)throw Error('Library piece "'+id+'" not found');
      const title=(e.c?e.c+' — ':'')+e.t;let parts;
      if(Library.ENSEMBLES[e.id])parts=await Promise.all(Library.ENSEMBLES[e.id].map(async([name,ref,inst])=>({name,inst,notes:(await global.SharedMusic.load(Object.assign({id:e.id,bpm:e.bpm},ref))).notes})));
      else{const L=await global.SharedMusic.load(e);parts=[{name:e.t.split('—').pop().trim()||'melody',inst:NoteGrid.guessInstrument(e.t)==='piano'&&/guitar/i.test(e.cat||'')?'guitar':NoteGrid.guessInstrument(e.t),notes:L.notes}];}
      return {text:NoteGrid.fromParts(title,e.bpm||120,parts),title,id:spec,spec,about:e.cat||''};}
    if(kind==='url'){const r=await fetch(id);if(!r.ok)throw Error('Score HTTP '+r.status);return {text:await r.text(),title:'',id:spec,spec};}
    throw Error('Unknown song "'+spec+'"');
  }
};
const fmt=s=>{s=Math.max(0,s||0);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const CSS=`
:host{display:block;font:14px system-ui,-apple-system,sans-serif;color:#e8eefb;--bg:#0f1828;--line:#33445f;--acc:#8fcaff;--acc2:#d466c8}
*{box-sizing:border-box}
.box{background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:10px 12px}
.row{display:flex;align-items:center;gap:8px;min-width:0}
button{font:inherit;color:#fff;background:#22344f;border:1px solid #4a5d7c;border-radius:9px;padding:7px 11px;cursor:pointer}
button:hover{background:#2b4163}button.on{background:#3a5f8f;border-color:var(--acc)}
.play{width:42px;height:42px;border-radius:50%;padding:0;font-size:17px;background:linear-gradient(135deg,#3b82c4,#b2549f);border:none;flex:none}
.stop{width:34px;height:34px;padding:0;border-radius:50%;flex:none}
.title{flex:1;min-width:0;text-align:left;background:none;border:none;padding:2px 4px}
.title b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.title small{display:block;color:#93a4c0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.time{font-variant-numeric:tabular-nums;color:#aebbd2;font-size:12px;flex:none}
.gear{flex:none;padding:7px 9px}
input[type=range]{width:100%;accent-color:var(--acc)}
.seek{margin:8px 0 2px}
.panel{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}
.grid{display:grid;grid-template-columns:auto 1fr auto;gap:8px 10px;align-items:center}
.grid output{font-variant-numeric:tabular-nums;color:#c9d6ee;min-width:46px;text-align:right}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips button{padding:5px 9px;font-size:12px}.chips button.muted{opacity:.45;text-decoration:line-through}
.chips button.solo{border-color:var(--acc2);box-shadow:0 0 0 1px var(--acc2) inset}
.tabs{display:flex;gap:6px;margin-bottom:8px}.tabs button{padding:5px 10px;font-size:13px}
.list{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:4px}
.list button{text-align:left;background:#172338;border-color:#2c3c57;padding:7px 9px}.list button small{display:block;color:#8ea0bd;font-size:11px;margin-top:2px}
.list .grp{font-size:11px;color:#8ea0bd;text-transform:uppercase;letter-spacing:.06em;margin:6px 2px 2px}
.search{width:100%;background:#172338;color:#fff;border:1px solid #3b4d6a;border-radius:8px;padding:8px;margin-bottom:6px;font:inherit}
.status{font-size:12px;color:#9fb0cc;margin-top:6px;min-height:1em}
.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
a.studio{color:var(--acc);text-decoration:none;font-size:13px;padding:7px 4px}
:host([compact]) .box{padding:8px 10px}:host([compact]) .play{width:36px;height:36px;font-size:15px}
`;

class StudioPlayer extends HTMLElement{
  static get observedAttributes(){return ['song','src','loop','tempo','transpose','sync'];}
  constructor(){
    super();this.engine=new StudioEngine();this.spec='';this.about='';this._id=Math.random().toString(36).slice(2);
    const root=this.attachShadow({mode:'open'});
    root.innerHTML=`<style>${CSS}</style><div class="box">
      <div class="row"><button class="play" part="play" title="Play / pause">▶</button><button class="stop" title="Stop">■</button>
        <button class="title" title="Choose a song"><b>Loading…</b><small></small></button><span class="time">0:00 / 0:00</span><button class="gear" title="Settings">⚙</button></div>
      <input class="seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Position">
      <div class="panel pick" hidden><div class="tabs"><button data-t="ours" class="on">Our songs</button><button data-t="lib">Library</button><button data-t="ver">My versions</button></div>
        <input class="search" placeholder="Search composer or title…" hidden><div class="list"></div></div>
      <div class="panel set" hidden><div class="grid">
        <span>Tempo</span><input name="tempo" type="range" min="0.5" max="2" step="0.05" value="1"><output data-o="tempo">100%</output>
        <span>Transpose</span><input name="transpose" type="range" min="-12" max="12" step="1" value="0"><output data-o="transpose">0</output>
        <span>Volume</span><input name="volume" type="range" min="0" max="1.2" step="0.05" value="0.85"><output data-o="volume">85%</output>
        <span>Loop</span><span><input name="loop" type="checkbox"></span><span></span></div>
        <div style="margin:10px 0 4px;font-size:12px;color:#93a4c0">Tracks — tap to mute, long-press to solo</div><div class="chips"></div>
        <div class="actions"><button data-x="mp3">Save MP3</button><button data-x="wav">Save WAV</button><a class="studio" target="_blank" href="#">Open in Studio ↗</a></div></div>
      <div class="status"></div></div>`;
    const $=s=>root.querySelector(s);this.$=$;
    $('.play').onclick=()=>this.toggle();$('.stop').onclick=()=>this.stop();
    $('.title').onclick=()=>this._panel('pick');$('.gear').onclick=()=>this._panel('set');
    const seek=$('.seek');let seeking=false;
    seek.oninput=()=>{seeking=true;$('.time').textContent=fmt(seek.value/1000*this.duration)+' / '+fmt(this.duration);};
    seek.onchange=()=>{seeking=false;this.seek(seek.value/1000*this.duration);};
    root.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{root.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));this._list(b.dataset.t);});
    $('.search').oninput=()=>this._list('lib');
    for(const inp of root.querySelectorAll('.set input'))inp.addEventListener(inp.type==='checkbox'?'change':'input',()=>{
      const v=inp.type==='checkbox'?inp.checked:+inp.value;this.engine.setConfig({[inp.name]:v},'ui');});
    $('[data-x=mp3]').onclick=()=>this.exportAudio('mp3');$('[data-x=wav]').onclick=()=>this.exportAudio('wav');
    $('a.studio').onclick=e=>{e.preventDefault();this.openStudio();};
    // engine → element events (+ UI refresh)
    for(const type of ['load','state','time','note','beat','bar','mark','change','end','seek','loop'])
      this.engine.addEventListener(type,ev=>{this._onEngine(type,ev.detail,seeking);this.dispatchEvent(new CustomEvent('studio:'+type,{detail:ev.detail,bubbles:true,composed:true}));});
  }
  connectedCallback(){
    if(this._started)return;this._started=true;
    this.$('.studio').hidden=this.hasAttribute('nostudio');if(this.hasAttribute('noexport'))this.$('[data-x=mp3]').hidden=this.$('[data-x=wav]').hidden=true;
    const cfg={};if(this.hasAttribute('loop'))cfg.loop=true;if(this.getAttribute('tempo'))cfg.tempo=+this.getAttribute('tempo');if(this.getAttribute('transpose'))cfg.transpose=+this.getAttribute('transpose');
    this.engine.setConfig(cfg,'attribute');this._setupSync(this.getAttribute('sync'));
    const src=this.getAttribute('src'),song=this.getAttribute('song');
    this.load(src?'url:'+new URL(src,location.href).href:(song||'ng:motherofall-1')).catch(()=>{});
  }
  disconnectedCallback(){this.engine.pause();}
  attributeChangedCallback(name,old,val){
    if(!this._started||old===val)return;
    if(name==='song'&&val&&val!==this.spec)this.load(val);
    else if(name==='src'&&val)this.load('url:'+new URL(val,location.href).href);
    else if(name==='loop')this.engine.setConfig({loop:val!==null},'attribute');
    else if(name==='tempo'||name==='transpose')this.engine.setConfig({[name]:+val},'attribute');
    else if(name==='sync')this._setupSync(val);
  }
  // ---------- public API ----------
  get song(){return this.engine.summary();}
  get time(){return this.engine.time;}
  get duration(){return this.engine.duration;}
  get playing(){return this.engine.playing;}
  get config(){return JSON.parse(JSON.stringify(this.engine.config));}
  set config(patch){this.engine.setConfig(patch,'api');}
  get text(){return this.engine.text;}
  features(t){return this.engine.features(t==null?this.engine.time:t);}
  play(from){return this.engine.play(from).catch(e=>this._status(e.message));}
  pause(){this.engine.pause();}
  stop(){this.engine.stop();}
  toggle(){return this.engine.playing?this.pause():this.play();}
  seek(s){this.engine.seek(s);}
  async load(spec,{keepTime=false,quiet=false}={}){
    const t=keepTime?this.engine.time:0,was=this.engine.playing;
    this._status('Loading…');
    try{const r=await Library.resolve(spec);this.spec=r.spec||'';this.about=r.about||'';
      this.engine.loadText(r.text,{id:this.spec,title:r.title||undefined});
      if(keepTime&&t)this.engine.seek(Math.min(t,this.engine.duration));if(keepTime&&was)this.engine.play();
      this._status('');if(this.spec&&this.getAttribute('song')!==this.spec&&this.spec.indexOf('url:')!==0)this.setAttribute('song',this.spec);
      this.dispatchEvent(new CustomEvent('studio:song',{detail:{spec:this.spec,song:this.song},bubbles:true,composed:true}));
      if(!quiet)this._broadcast({type:'song',spec:this.spec});
      return this.song;
    }catch(e){this._status(e.message);this.$('.title b').textContent='Could not load';throw e;}
  }
  // Load edited score text (from the Studio grid or the page) without changing the spec.
  loadText(text,{title,keepTime=true}={}){const t=this.engine.time,was=this.engine.playing;this.engine.loadText(text,{id:this.spec,title:title||this.engine.meta.title});
    if(keepTime){this.engine.seek(Math.min(t,this.engine.duration));if(was)this.engine.play();}return this.song;}
  async exportAudio(kind='mp3'){
    const name=StudioExport.slug(this.engine.meta.title);
    try{this._status('Rendering '+kind.toUpperCase()+'…');const buf=await this.engine.render({onProgress:p=>this._status('Rendering sound… '+Math.round(p*100)+'%')});
      const blob=kind==='wav'?StudioExport.wav(buf):await StudioExport.mp3(buf,{title:this.engine.meta.title,onProgress:p=>this._status('Encoding MP3… '+Math.round(p*100)+'%')});
      StudioExport.download(blob,name+'.'+kind);this._status(kind.toUpperCase()+' saved · '+(blob.size/1048576).toFixed(1)+' MB');return blob;
    }catch(e){this._status('Export failed: '+e.message);throw e;}
  }
  openStudio(){
    let hash=this.spec&&this.spec.indexOf('url:')!==0?'song='+encodeURIComponent(this.spec):'';
    try{localStorage.setItem('studio.handoff',JSON.stringify({text:this.engine.text,title:this.engine.meta.title,spec:this.spec,config:this.engine.config,at:Date.now()}));hash='handoff';}catch(e){}
    global.open(STUDIO_PAGE.href+'#'+hash,'_blank');
  }
  // ---------- sync across tabs/frames ----------
  _setupSync(name){
    if(this._bc){this._bc.close();this._bc=null;}if(!name||!global.BroadcastChannel)return;
    this._bc=new BroadcastChannel('studio-player:'+name);
    this._bc.onmessage=e=>{const m=e.data;if(!m||m.from===this._id)return;
      if(m.type==='song'&&m.spec&&m.spec!==this.spec)this.load(m.spec,{quiet:true}).catch(()=>{});
      if(m.type==='config'){this._remote=true;this.engine.setConfig(m.config,'sync');this._remote=false;}
      if(m.type==='hello'&&this.spec)this._broadcast({type:'song',spec:this.spec}),this._broadcast({type:'config',config:this.engine.config});};
    this._broadcast({type:'hello'});
  }
  _broadcast(m){if(this._bc)this._bc.postMessage(Object.assign({from:this._id},m));}
  // ---------- UI ----------
  _status(s){this.$('.status').textContent=s||'';}
  _panel(which){const p=this.$('.pick'),s=this.$('.set');if(which==='pick'){p.hidden=!p.hidden;s.hidden=true;if(!p.hidden)this._list(this.shadowRoot.querySelector('.tabs .on').dataset.t);}else{s.hidden=!s.hidden;p.hidden=true;}}
  async _list(tab){
    const L=this.$('.list'),q=this.$('.search');q.hidden=tab!=='lib';L.innerHTML='<div class="grp">Loading…</div>';
    const item=(spec,title,sub)=>{const b=document.createElement('button');b.innerHTML=esc(title)+(sub?'<small>'+esc(sub)+'</small>':'');if(spec===this.spec)b.classList.add('on');
      b.onclick=()=>{this.load(spec).then(()=>this.$('.pick').hidden=true).catch(()=>{});};return b;};
    try{
      if(tab==='ours'){const list=await Library.ours();L.innerHTML='';const G={ours:'Our songs',classic:'Classics',lab:'Listening lab'};
        for(const g of Object.keys(G)){const xs=list.filter(e=>e.group===g);if(!xs.length)continue;const h=document.createElement('div');h.className='grp';h.textContent=G[g];L.append(h);xs.forEach(e=>L.append(item('ng:'+e.id,e.title)));}}
      else if(tab==='ver'){const vs=Library.versions();L.innerHTML=vs.length?'':'<div class="grp">No saved versions yet — make one in the Studio</div>';vs.forEach(v=>L.append(item('ver:'+v.id,v.title,new Date(v.savedAt).toLocaleString())));}
      else{const cat=await Library.shared(),words=q.value.toLowerCase().split(/\s+/).filter(Boolean);
        const hits=cat.filter(e=>{const k=((e.c||'')+' '+e.t+' '+(e.al||'')).toLowerCase();return words.every(w=>k.includes(w));});
        hits.sort((a,b)=>(b.group==='ours'||b.c==='Roman Kesler')-(a.group==='ours'||a.c==='Roman Kesler'));
        L.innerHTML='';const h=document.createElement('div');h.className='grp';h.textContent=hits.length+' pieces'+(hits.length>80?' — showing 80, type to narrow':'');L.append(h);
        hits.slice(0,80).forEach(e=>L.append(item('lib:'+e.id,(e.c?e.c+' — ':'')+e.t,e.cat||'')));}
    }catch(e){L.innerHTML='<div class="grp">'+esc(e.message)+'</div>';}
  }
  _chips(){const C=this.$('.chips'),s=this.song;C.innerHTML='';if(!s)return;
    for(const t of s.tracks){const b=document.createElement('button');b.textContent=t.name+' · '+t.inst;b.dataset.n=t.name;let timer=0,long=false;
      b.onpointerdown=()=>{long=false;timer=setTimeout(()=>{long=true;this.engine.setConfig({solo:this.engine.config.solo===t.name?'':t.name},'ui');},550);};
      b.onpointerup=b.onpointerleave=()=>clearTimeout(timer);
      b.onclick=()=>{if(long)return;this.engine.setConfig({mute:{[t.name]:!this.engine.config.mute[t.name]}},'ui');};C.append(b);}
    this._chipState();}
  _chipState(){const c=this.engine.config;this.shadowRoot.querySelectorAll('.chips button').forEach(b=>{b.classList.toggle('muted',!this.engine.audible(b.dataset.n));b.classList.toggle('solo',c.solo===b.dataset.n);});}
  _cfgUI(){const c=this.engine.config,R=this.shadowRoot;
    for(const k of ['tempo','transpose','volume'])R.querySelector('.set input[name='+k+']').value=c[k];R.querySelector('.set input[name=loop]').checked=c.loop;
    R.querySelector('[data-o=tempo]').textContent=Math.round(c.tempo*100)+'%';R.querySelector('[data-o=transpose]').textContent=(c.transpose>0?'+':'')+c.transpose;R.querySelector('[data-o=volume]').textContent=Math.round(c.volume*100)+'%';
    this._chipState();}
  _onEngine(type,d,seeking){
    const $=this.$;
    if(type==='load'){$('.title b').textContent=d.song.title;$('.title small').textContent=(d.song.tracks.length+' tracks · '+Math.round(d.song.bpm)+' bpm · '+fmt(d.song.duration))+(this.about?' · '+this.about:'');this._chips();this._cfgUI();$('.seek').value=0;$('.time').textContent=fmt(0)+' / '+fmt(d.song.duration);}
    if(type==='state')$('.play').textContent=d.playing?'❚❚':'▶';
    if(type==='time'&&!seeking){$('.seek').value=Math.round(d.progress*1000);$('.time').textContent=fmt(d.time)+' / '+fmt(d.duration);}
    if(type==='mark')$('.title small').textContent=d.text;
    if(type==='change'){this._cfgUI();if(d.source!=='sync'&&!this._remote)this._broadcast({type:'config',config:d.config});}
  }
}
StudioPlayer.Library=Library;
global.StudioReady=(async()=>{
  for(const f of ['notegrid.js','synth.js','engine.js','export.js','choreo.js'])await load(new URL(f,BASE).href);
  global.StudioPlayer=StudioPlayer;customElements.define('studio-player',StudioPlayer);return StudioPlayer;
})();
})(window);
