/* Shared note-data catalog for Web-game applications. No audio recordings are bundled. */
(function(global){
'use strict';
const ROOT=new URL('./data/',document.currentScript.src);
const GROUPS=new Set(['ours','keyboard','haydn','joplin','mozart','lieder']);
const cache=new Map();const extrasBUN={};const extras=global.SharedMusicExtras?.install(extrasBUN);const extraEntries=extras?[...extras.gizaEntries,...extras.dragonEntries,extras.motherEnsembleEntry,extras.motherEntry,...extras.motherTrackEntries]:[];
const group=e=>e.g||(e.c||'').toLowerCase();
async function json(name){const r=await fetch(new URL(name,ROOT));if(!r.ok)throw Error('Music library: '+name+' HTTP '+r.status);return r.json()}
async function catalog(){const [a,b]=await Promise.all([json('index.json'),json('index2.json')]);return a.concat(b).filter(e=>GROUPS.has(group(e))).concat(extraEntries).map(e=>({...e,group:group(e)}))}
async function bundle(groupName){if(!GROUPS.has(groupName))throw Error('Collection not installed: '+groupName);if(!cache.has(groupName))cache.set(groupName,json(groupName+'.json'));return cache.get(groupName)}
function decode(j){if(!j||!Array.isArray(j.don)||!Array.isArray(j.p)||!Array.isArray(j.d)||!j.U)throw Error('Invalid note bundle');let on=0;return j.don.map((delta,i)=>{on+=delta;return {on:on/j.U,p:j.p[i],d:j.d[i]/j.U}})}
async function load(entry){const g=group(entry);const data=(entry.ens==='giza'?await extrasBUN.giza:extrasBUN[g]?await extrasBUN[g]:await bundle(g));const j=data[entry.track||entry.id];if(!j)throw Error('Piece unavailable: '+entry.id);return {entry,notes:decode(j)}}
global.SharedMusic={catalog,bundle,load,decode,group,root:ROOT.href};
})(window);