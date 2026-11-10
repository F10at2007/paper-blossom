/** Isolated Chrome 129 acceptance for backup atomicity and responsive home assets.
 * Requires Django at BASE_URL and Chrome for Testing on CDP :9222. Output stays in ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_KEY } from '../core/static/core/js/work-store.js';

const base=process.env.BASE_URL||'http://127.0.0.1:8000';
const out=path.resolve('.qa',`import-home-${Date.now()}`);
await fs.mkdir(out,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:9222/json')).json();
const target=targets.find(t=>t.type==='page');assert.ok(target,'Chrome CDP page not found');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let seq=0;const pending=new Map(),events=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else events.push(m);});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+10000;while(Date.now()<end){if(await fn())return;await delay(50);}throw Error(`Timed out: ${label}`);}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function navigate(url){await call('Page.navigate',{url});await until(()=>evaluate(`document.readyState==='complete'`),`page load ${url}`);await delay(120);}
await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('DOM.enable');
await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
const version=await evaluate('navigator.userAgent');assert.match(version,/Chrome\/129\./);
const sizes={};
async function coldHome(width){
  await navigate('about:blank');events.length=0;await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Network.clearBrowserCache');await navigate(`${base}/?intro=0`);
  await evaluate(`document.querySelector('.mobile-modes').scrollIntoView({block:'center'})`);await delay(500);
  await evaluate('scrollTo(0,0)');await delay(120);
  const info=await evaluate(`(async()=>({stage:getComputedStyle(document.querySelector('.stage')).display,cards:[...document.querySelectorAll('.mm-card')].map(a=>({href:a.href,display:getComputedStyle(a).display,image:a.querySelector('img').complete})),entranceStatuses:await Promise.all([...document.querySelectorAll('.mm-card')].map(async a=>(await fetch(a.href,{method:'HEAD'})).status)),preloads:[...document.querySelectorAll('link[rel=preload][as=image]')].map(x=>({media:x.media,matched:matchMedia(x.media).matches,url:new URL(x.href).pathname}))}))()`);
  await delay(300);
  const byUrl=new Map();
  for(const e of events)if(e.method==='Network.requestWillBeSent'&&/\.(webp|png|jpe?g)(\?|$)/i.test(e.params.request.url))byUrl.set(e.params.requestId,{url:new URL(e.params.request.url).pathname,bytes:null});
  for(const e of events)if(e.method==='Network.loadingFinished'&&byUrl.has(e.params.requestId))byUrl.get(e.params.requestId).bytes=e.params.encodedDataLength;
  const resources=[...byUrl.values()].filter(x=>x.url.includes('bg-stage')||x.url.includes('-pop.webp')||x.url.includes('card-')||x.url.includes('title-brush'));
  sizes[width]={resources,info};return sizes[width];
}
const widths={};for(const w of [720,900,901,1440,1920])widths[w]=await coldHome(w);
assert.equal(widths[720].info.stage,'none');
assert.equal(widths[720].resources.some(r=>/bg-stage-(720|1080|1440|1920)\.webp$/.test(r.url)||/-pop\.webp$/.test(r.url)),false,'mobile layout requested desktop stage assets');
assert.equal(widths[720].info.cards.length,4);assert.ok(widths[720].info.cards.every(c=>c.display!=='none'&&c.image&&new URL(c.href).pathname.startsWith('/workshop/')));assert.ok(widths[720].info.entranceStatuses.every(s=>s===200));
assert.equal(widths[900].info.stage,'none');assert.ok(widths[901].info.stage!=='none');

// Verify a live narrow-to-wide transition loads each pop once, and resizing back does not refetch.
events.length=0;await call('Emulation.setDeviceMetricsOverride',{width:720,height:1000,deviceScaleFactor:1,mobile:false});await navigate(`${base}/?intro=0`);await delay(300);
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await until(()=>evaluate(`[...document.querySelectorAll('.stage img.pop')].every(i=>i.complete&&i.naturalWidth>0)`),'desktop hover cutouts load');await delay(300);
await call('Emulation.setDeviceMetricsOverride',{width:720,height:1000,deviceScaleFactor:1,mobile:false});await delay(120);
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await delay(300);
const popCounts={};for(const e of events)if(e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('-pop.webp')){const name=path.basename(new URL(e.params.request.url).pathname);popCounts[name]=(popCounts[name]||0)+1;}
assert.equal(Object.keys(popCounts).length,4);assert.ok(Object.values(popCounts).every(n=>n===1));
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await evaluate(`document.querySelector('.hotspot').focus()`);
await delay(450);
const focus=await evaluate(`({opacity:getComputedStyle(document.querySelector('.hotspot:focus-visible .pop')).opacity,outline:getComputedStyle(document.querySelector('.hotspot:focus-visible')).outlineStyle})`);
const hoverRect=await evaluate(`(()=>{const r=document.querySelector('.hotspot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
await call('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverRect});
await delay(450);
const hover=await evaluate(`getComputedStyle(document.querySelector('.hotspot:hover .pop')).opacity`);
assert.ok(Number(focus.opacity)>0&&focus.outline!=='none');assert.ok(Number(hover)>0);

// Seed, then corrupt import through the actual file input in this throwaway Chrome profile.
const thumb='data:image/png;base64,iVBORw0KGgo=';
const document={mode:'free',color:'#a63127',paths:[]};
const original={version:1,works:[{id:'protected-work',name:'隔离原作',document,thumbnail:thumb,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}]};
const before=JSON.stringify(original),invalid={version:1,works:[{...original.works[0],document:{...document,mode:['free']}}]};
const badFile=path.join(out,'invalid-import.json');await fs.writeFile(badFile,JSON.stringify(invalid));
await navigate(`${base}/works/`);await evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)},${JSON.stringify(before)})`);await navigate(`${base}/works/`);
const root=await call('DOM.getDocument');const input=await call('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#works-import'});assert.ok(input.nodeId);
await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[badFile]});
await until(()=>evaluate(`document.querySelector('#works-status').textContent.includes('mode字段')`),'invalid import error');
const invalidResult=await evaluate(`({message:document.querySelector('#works-status').textContent,raw:localStorage.getItem(${JSON.stringify(STORAGE_KEY)})})`);
assert.equal(invalidResult.raw,before);assert.match(invalidResult.message,/第 1 幅作品.*mode字段/);
const opened=events.filter(e=>e.method==='Page.javascriptDialogOpening');assert.equal(opened.length,0,'invalid file showed a confirm dialog');

// Valid four-mode backup is imported through the same file input; then each work is opened,
// edited, saved, and restored from localStorage again.
const pointPath=[[{x:.1,y:.1},{x:.3,y:.1},{x:.2,y:.3}]];
const docs=[
 {mode:'free',color:'#a63127',paths:pointPath},
 {mode:'fold',color:'#a63127',paths:[],foldMode:'eighth',foldState:'editing'},
 {mode:'trace',color:'#a63127',paths:pointPath,referenceId:'leaves',completed:false},
 {mode:'compose',color:'#a63127',objects:[{id:'one',motif:'flower',x:.5,y:.5,size:.34,rotation:15}]},
];
const backup={version:1,works:docs.map((d,i)=>({id:`roundtrip-${i}`,name:`往返${i}`,document:d,thumbnail:thumb,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}))};
const goodFile=path.join(out,'valid-four-modes.json');await fs.writeFile(goodFile,JSON.stringify(backup));
await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[goodFile]});
await until(()=>events.some(e=>e.method==='Page.javascriptDialogOpening'),'valid import confirm');
await call('Page.handleJavaScriptDialog',{accept:false});
assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`),before,'cancelled import changed existing records');
await evaluate(`(()=>{window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===${JSON.stringify(STORAGE_KEY)})throw new DOMException('quota','QuotaExceededError');return window.__originalSetItem.call(this,key,value)}})()`);
await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[goodFile]});
await until(()=>events.filter(e=>e.method==='Page.javascriptDialogOpening').length>=2,'confirm before simulated write failure');
await call('Page.handleJavaScriptDialog',{accept:true});
await until(()=>evaluate(`document.querySelector('#works-status').textContent.includes('导入失败')`),'simulated storage failure');
assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`),before,'failed write changed existing records');
await evaluate(`Storage.prototype.setItem=window.__originalSetItem`);
await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[goodFile]});
await until(()=>events.filter(e=>e.method==='Page.javascriptDialogOpening').length>=3,'valid import confirm after failed write');
await call('Page.handleJavaScriptDialog',{accept:true});
await until(()=>evaluate(`document.querySelector('#works-status').textContent.includes('备份已恢复')`),'valid import completion');
const restored=[];
for(let i=0;i<docs.length;i++){
 await navigate(`${base}/workshop/${docs[i].mode}/?work=roundtrip-${i}`);
 await until(()=>evaluate(`document.querySelector('#workshop-status').textContent.includes('已恢复')`),`${docs[i].mode} restore`);
 await evaluate(`document.querySelector('[data-color="#292923"]').click()`);
 await evaluate(`setTimeout(()=>document.querySelector('[data-action="save"]').click(),0)`);
 await until(()=>events.some(e=>e.method==='Page.javascriptDialogOpening'),'save name prompt');
 await call('Page.handleJavaScriptDialog',{accept:true,promptText:`往返保存${i}`});
 await until(()=>evaluate(`document.querySelector('#workshop-status').textContent.includes('已保存到当前浏览器')`),`${docs[i].mode} save`);
 const check=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).works.find(w=>w.id==='roundtrip-${i}').document`);
 assert.equal(check.color,'#292923');restored.push(docs[i].mode);
}
const previousMobileBytes=80704+118892+109872+112596+106556;
const report={browser:version,viewports:widths,dynamicPopRequestCounts:popCounts,keyboardFocus:focus,mouseHoverOpacity:hover,mobileBytesSavedAgainstAuditedBaseline:previousMobileBytes,invalidImport:{message:invalidResult.message,rawUnchanged:invalidResult.raw===before,confirmDialogs:opened.length},cancelledImportPreserved:true,writeFailurePreserved:true,fourModeRoundTrip:restored};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:path.join(out,'report.json'),browser:version,viewports:Object.fromEntries(Object.entries(widths).map(([w,v])=>[w,v.resources])),dynamicPopRequestCounts:popCounts,invalidImport:report.invalidImport,fourModeRoundTrip:restored},null,2));
ws.close();
