/** Optional integration QA: Node 22+ and a running Chrome CDP endpoint, no npm deps.
 * Start Django on :8000 and Chrome with --remote-debugging-port=9222.
 * Run: node tests/browser-composition-box.mjs
 * Outputs screenshots, downloaded PNGs and a report under ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('.qa', `bounding-box-${Date.now()}`);
await fs.mkdir(path.join(output, 'downloads'), { recursive: true });
const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
const downloads = [];
const completedDownloads = new Set();
const dialogs = [];
const checks = [];
socket.addEventListener('message', event => {
  const m = JSON.parse(event.data);
  if (m.id) {
    const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
    if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry);
  if (m.method === 'Browser.downloadWillBegin') downloads.push(m.params);
  if (m.method === 'Browser.downloadProgress' && m.params.state === 'completed') completedDownloads.add(m.params.guid);
  if (m.method === 'Page.javascriptDialogOpening' && m.params.type === 'beforeunload') { call('Page.handleJavaScriptDialog',{accept:true}); return; }
  if (m.method === 'Page.javascriptDialogOpening') dialogs.push(m.params);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(50); }
  throw new Error(message);
}
async function check(name, expression) {
  assert.ok(await evaluate(expression), name);
  checks.push(name);
}
async function navigate(route) {
  await call('Page.navigate', { url: `http://127.0.0.1:8000${route}` });
  await until(() => evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(route.split('?')[0])}`), 'Page load');
  if (route.startsWith('/workshop/')&&!route.includes('/compose/')&&!route.includes('/fold/')) await until(() => evaluate(`!!document.querySelector('#paper-canvas')?.getContext('2d').getImageData(900,900,1,1).data[3]`), 'Canvas initialization');
}
async function click(action) { await evaluate(`document.querySelector('[data-action="${action}"]').click()`); }
async function rect() {
  return evaluate(`(()=>{const c=document.querySelector('#drawing-canvas');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
}
async function mouseStroke(points, release = true) {
  const r = await rect();
  const mapped = points.map(([x,y]) => ({x:r.x+x*r.width,y:r.y+y*r.height}));
  await call('Input.dispatchMouseEvent', { type:'mouseMoved', ...mapped[0] });
  await call('Input.dispatchMouseEvent', { type:'mousePressed', ...mapped[0], button:'left',buttons:1,clickCount:1 });
  const afterDown = await rect();
  assert.ok(Math.abs(afterDown.y-r.y)<.5 && Math.abs(afterDown.x-r.x)<.5,'Drawing status must not shift canvas position');
  for (const point of mapped.slice(1)) await call('Input.dispatchMouseEvent', {type:'mouseMoved', ...point,button:'left',buttons:1});
  if (release) await call('Input.dispatchMouseEvent', {type:'mouseReleased',...mapped.at(-1),button:'left',buttons:0,clickCount:1});
  await delay(35);
  return mapped;
}
async function confirmClear(accept) {
  const count = dialogs.length;
  const action = click('clear');
  await until(() => dialogs.length > count, 'Clear confirmation not shown');
  await call('Page.handleJavaScriptDialog', { accept });
  await action;
}
async function download(name, trigger=()=>click('download')) {
  const index = downloads.length;
  await trigger();
  await until(() => downloads.length > index, 'No browser download event');
  const item = downloads[index];
  await until(() => completedDownloads.has(item.guid), 'PNG download did not complete');
  assert.ok(item.suggestedFilename.endsWith('.png'));
  const bytes = await fs.readFile(path.join(output, 'downloads', item.guid));
  assert.equal(bytes.subarray(1,4).toString(), 'PNG');
  await fs.writeFile(path.join(output, `${name}.png`), bytes);
  const base64 = bytes.toString('base64');
  return evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${base64}')).blob();const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);window.downloaded=c;bitmap.close();const p=(x,y)=>[...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data];return {width:c.width,height:c.height,hole:p(.25,.25),paper:p(.5,.5)}})()`);
}

let originalStorage;
const key='paper-blooms.works.v1';
async function snapshot(){return evaluate(`(()=>{window.prompt=()=> '选框验收';document.querySelector('[data-action="save"]').click();return JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id===new URLSearchParams(location.search).get('work')).document})()`);}
async function corners(o){return evaluate(`(async()=>{const {objectBox}=await import('/static/core/js/composition-box.js');return objectBox(${JSON.stringify(o)}).corners})()`);}
try{
 await call('Page.enable');await call('Runtime.enable');await call('Log.clear');await call('Log.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 await call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:path.join(output,'downloads'),eventsEnabled:true});
 await navigate('/workshop/compose/');originalStorage=await evaluate(`localStorage.getItem('${key}')`);await evaluate(`localStorage.removeItem('${key}');document.querySelector('[data-category="几何"]').click();document.querySelector('[data-motif="circle"]').click()`);
 await check('single selection draws independent helper frame',`document.querySelector('#selected-name').textContent==='圆环'&&document.querySelector('#drawing-canvas').getContext('2d').getImageData(0,0,1024,1024).data.some(v=>v>0)`);
 await mouseStroke([[.5,.5],[.6,.6]]);let o=(await snapshot()).objects[0];assert.ok(Math.abs(o.x-.6)<.002&&Math.abs(o.y-.6)<.002);checks.push('transparent rectangle interior moves element');
 for(let corner=0;corner<4;corner++){
  const before={...o},c=(await corners(o))[corner],target={x:o.x+(c.x-o.x)*1.15,y:o.y+(c.y-o.y)*1.15};
  await mouseStroke([[c.x,c.y],[target.x,target.y]]);o=(await snapshot()).objects[0];
  assert.ok(Math.abs(o.size-before.size*1.15)<.002);assert.equal(o.x,before.x);assert.equal(o.y,before.y);assert.equal(o.rotation,before.rotation);checks.push('corner '+corner+' uniformly scales without moving centre');
  await click('undo');const undone=(await snapshot()).objects[0];assert.ok(Math.abs(undone.size-before.size)<1e-9);await click('redo');o=(await snapshot()).objects[0];assert.ok(Math.abs(o.size-before.size*1.15)<.002);checks.push('corner '+corner+' commits one reversible history operation');
 }
 await click('rotate-right');await click('rotate-right');o=(await snapshot()).objects[0];assert.equal(o.rotation,30);
 const c=(await corners(o))[1],before={...o};await mouseStroke([[c.x,c.y],[o.x+(c.x-o.x)*.85,o.y+(c.y-o.y)*.85]]);o=(await snapshot()).objects[0];assert.ok(Math.abs(o.size-before.size*.85)<.002);assert.equal(o.rotation,30);checks.push('rotated corner preserves angle and aspect ratio');
 await evaluate(`document.querySelector('[data-category="花卉"]').click();document.querySelector('[data-motif="leaf"]').click()`);
 await mouseStroke([[.5,.5]]);await check('overlap selects top rectangle',`document.querySelector('#selected-name').textContent==='叶片'`);
 await mouseStroke([[.1,.1]]);await check('blank clears handles and disables deletion',`document.querySelector('[data-action="delete"]').disabled&&document.querySelector('#drawing-canvas').getContext('2d').getImageData(0,0,1024,1024).data.every(v=>v===0)`);
 await mouseStroke([[.7,.65]]);await check('click another rectangle switches selection',`document.querySelector('#selected-name').textContent==='圆环'`);
 await click('delete');let data=await snapshot();assert.equal(data.objects.length,1);assert.equal(data.objects[0].motif,'leaf');checks.push('delete only removes selected and clears state');
 await mouseStroke([[.5,.5]]);o=(await snapshot()).objects[0];
 const sc=(await corners(o))[2];await mouseStroke([[sc.x,sc.y],[.5,.5]]);o=(await snapshot()).objects[0];assert.equal(o.size,.08);checks.push('crossing corner clamps to finite minimum size');
 await click('undo');o=(await snapshot()).objects[0];
 const cancelBefore=JSON.stringify(o),cc=(await corners(o))[0];await mouseStroke([[cc.x,cc.y],[cc.x-.05,cc.y-.05]],false);await evaluate(`window.dispatchEvent(new Event('blur'))`);await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:0,y:0,button:'left',buttons:0});assert.equal(JSON.stringify((await snapshot()).objects[0]),cancelBefore);checks.push('blur cancels incomplete scaling without history change');
 await call('Emulation.setDeviceMetricsOverride',{width:720,height:1080,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await delay(80);
 o=(await snapshot()).objects[0];const tc=(await corners(o))[2],r=await rect(),tp=(x,y)=>({x:r.x+x*r.width,y:r.y+y*r.height,id:3,radiusX:2,radiusY:2,force:1});
 const scroll=await evaluate('scrollY');await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp(tc.x,tc.y)]});await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tp(o.x+(tc.x-o.x)*1.2,o.y+(tc.y-o.y)*1.2)]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(50);const touched=(await snapshot()).objects[0];assert.ok(Math.abs(touched.size-o.size*1.2)<.003);assert.equal(await evaluate('scrollY'),scroll);checks.push('touch corner scales without scrolling');
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await click('preview');await check('preview has no helper pixels',`(()=>{const a=document.querySelector('#compose-preview-canvas'),b=document.querySelector('#paper-canvas');return a.toDataURL()===b.toDataURL()})()`);await evaluate(`document.querySelector('#compose-preview').close()`);
 await download('box-export');await check('download matches document exactly without frame and handles',`(async()=>{const {renderDocument}=await import('/static/core/js/work-document.js'),d=JSON.parse(localStorage.getItem('${key}')).works[0].document,c=document.createElement('canvas');c.width=c.height=2048;renderDocument(c,d);return c.toDataURL()===window.downloaded.toDataURL()})()`);
 for(const width of [1920,1440,720,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await delay(50);await check('responsive '+width,`document.documentElement.scrollWidth<=innerWidth`);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(output,'box-'+width+'.png'),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:checks.length,downloads:downloads.length,errors,output},null,2));
}finally{
 if(originalStorage!==undefined)await evaluate(originalStorage===null?`localStorage.removeItem('${key}')`:`localStorage.setItem('${key}',${JSON.stringify(originalStorage)})`).catch(()=>{});
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,downloads,errors},null,2));socket.close();
}
