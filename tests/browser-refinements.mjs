/** Optional integration QA: Node 22+ and a running Chrome CDP endpoint, no npm deps.
 * Start Django on :8000 and Chrome with --remote-debugging-port=9222.
 * Run: node tests/browser-refinements.mjs
 * Outputs screenshots, downloaded PNGs and a report under ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('.qa', `refinements-${Date.now()}`);
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
  if (m.method === 'Page.javascriptDialogOpening' && m.params.type === 'beforeunload' && autoLeave) { call('Page.handleJavaScriptDialog',{accept:true}); return; }
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

let autoLeave=true,originalStorage,peer;
const key='paper-blooms.works.v1';
async function dialogAction(action,accept=true,promptText='验收作品'){
  const start=dialogs.length,promise=action();await until(()=>dialogs.length>start,'Expected dialog');
  await call('Page.handleJavaScriptDialog',{accept,promptText});await promise;return dialogs.at(-1);
}
async function save(name,copy=false){await dialogAction(()=>click(copy?'save-copy':'save'),true,name);return evaluate(`new URLSearchParams(location.search).get('work')`);}
async function shortcut(key,modifiers=2){await call('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,windowsVirtualKeyCode:key.length===1?key.toUpperCase().charCodeAt(0):27});await call('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers:0});await delay(30);}
async function createPeer(route){
 const target=(await call('Target.createTarget',{url:'http://127.0.0.1:8000'+route})).targetId;
 const targets=await(await fetch('http://127.0.0.1:9222/json')).json();
 const ws=new WebSocket(targets.find(t=>t.id===target).webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(m.error):p.resolve(m.result);}});
 return {async evaluate(expression){const result=await new Promise((resolve,reject)=>{const k=++id,timer=setTimeout(()=>reject(Error('Peer timeout')),10000);pending.set(k,{resolve,reject,timer});ws.send(JSON.stringify({id:k,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;},async close(){await call('Target.closeTarget',{targetId:target});ws.close();}};
}
try{
 await call('Page.enable');await call('Runtime.enable');await call('Log.clear');await call('Log.enable');await call('Log.clear');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 await call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:path.join(output,'downloads'),eventsEnabled:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
 await navigate('/workshop/trace/');originalStorage=await evaluate(`localStorage.getItem('${key}')`);await evaluate(`localStorage.removeItem('${key}')`);
 await check('guide visible and separate from paper',`(()=>{const c=document.querySelector('#trace-guide');return !!c&&getComputedStyle(c).pointerEvents==='none'&&c.getContext('2d').getImageData(0,0,1024,1024).data.some((v,i)=>i%4===3&&v>0)&&document.querySelector('#paper-canvas').getContext('2d').getImageData(512,512,1,1).data[3]===255})()`);
 await evaluate(`window.paperBefore=document.querySelector('#paper-canvas').toDataURL()`);
 await click('toggle-guide');await check('hiding guide preserves artwork',`document.querySelector('#trace-guide').getContext('2d').getImageData(0,0,1024,1024).data.every(v=>v===0)&&document.querySelector('#paper-canvas').toDataURL()===window.paperBefore`);await click('toggle-guide');
 await mouseStroke([[.15,.15],[.4,.15],[.4,.4],[.15,.4]]);
 await check('drawing sets dirty',`document.querySelector('.workspace').dataset.dirty==='true'`);
 await shortcut('z');await check('undo returns clean blank',`document.querySelector('#cut-count').textContent.includes('0 次')&&document.querySelector('.workspace').dataset.dirty==='false'`);
 await shortcut('z',10);await check('redo restores cut',`document.querySelector('#cut-count').textContent.includes('1 次')`);
 await dialogAction(()=>shortcut('s'),true,'虚线临摹');
 await check('save shortcut clears dirty',`document.querySelector('.workspace').dataset.dirty==='false'&&JSON.parse(localStorage.getItem('${key}')).works[0].document.paths.length===1`);
 await click('compare');await check('compare excludes guide',`(()=>{const c=document.querySelector('#compare-user'),p=c.getContext('2d');return p.getImageData(c.width*.25,c.height*.25,1,1).data[3]===0&&p.getImageData(c.width*.5,c.height*.5,1,1).data[3]===255})()`);await evaluate(`document.querySelector('#trace-compare').close()`);
 const png=await download('trace-guide-excluded');assert.equal(png.paper[3],255);assert.equal(png.hole[3],0);checks.push('PNG excludes reference and preserves user cut');
 await check('export pixels exactly match user document without guide',`(async()=>{const {renderDocument}=await import('/static/core/js/work-document.js');const d=JSON.parse(localStorage.getItem('${key}')).works[0].document,c=document.createElement('canvas');c.width=c.height=2048;renderDocument(c,d);return c.toDataURL()===window.downloaded.toDataURL()})()`);
 const originalId=await evaluate(`new URLSearchParams(location.search).get('work')`);
 await dialogAction(()=>shortcut('s',10),true,'临摹副本');
 await check('save copy preserves original and has new ID',`new URLSearchParams(location.search).get('work')!==${JSON.stringify(originalId)}&&JSON.parse(localStorage.getItem('${key}')).works.length===2`);
 await click('complete');await evaluate(`document.querySelector('#trace-compare').close()`);await dialogAction(()=>click('clear'));
 await check('clear completed trace restores editing',`document.querySelector('#trace-workspace').dataset.phase==='editing'&&getComputedStyle(document.querySelector('#drawing-canvas')).pointerEvents!=='none'`);
 await mouseStroke([[.6,.6],[.8,.6],[.7,.8]]);await check('draw after clear works',`document.querySelector('#cut-count').textContent.includes('1 次')`);
 const w=await evaluate(`document.querySelector('#drawing-canvas').getBoundingClientRect().width`);await click('focus');await delay(80);
 await check('focus enlarges canvas',`document.querySelector('#drawing-canvas').getBoundingClientRect().width>${w}`);
 await mouseStroke([[.2,.6],[.4,.6],[.3,.8]]);await check('focus preserves accurate coordinates',`document.querySelector('#paper-canvas').getContext('2d').getImageData(307,680,1,1).data[3]===0`);
 await shortcut('Escape',0);await check('Escape exits focus',`!document.querySelector('.workspace').classList.contains('is-focused')`);
 await dialogAction(()=>evaluate(`document.querySelector('.back-link').click()`),false);
 await check('cancel navigation preserves paths',`location.pathname==='/workshop/trace/'&&document.querySelector('#cut-count').textContent.includes('2 次')`);
 autoLeave=false;const dlg=await dialogAction(()=>call('Page.reload'),false);assert.equal(dlg.type,'beforeunload');autoLeave=true;checks.push('reload cancellation protects dirty work');
 const shared=await save('跨页作品');
 peer=await createPeer('/workshop/trace/?work='+shared);
 await until(()=>peer.evaluate(`!!document.querySelector('[data-action="save-copy"]')`),'Peer page loads');
 await call('Page.bringToFront');await mouseStroke([[.6,.2],[.8,.2],[.7,.4]]);await save('新版作品');
 await peer.evaluate(`window.prompt=()=> '旧页内容';document.querySelector('[data-color="#292923"]').click();document.querySelector('[data-action="save"]').click()`);
 assert.ok(await peer.evaluate(`document.querySelector('#workshop-status').textContent.includes('其他页面修改')`));checks.push('stale second tab save blocked');
 await check('newer saved cuts survive stale save',`JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id==='${shared}').document.paths.length===3`);
 await peer.evaluate(`document.querySelector('[data-action="save-copy"]').click()`);
 assert.ok(await peer.evaluate(`new URLSearchParams(location.search).get('work')!=='${shared}'`));checks.push('conflicted second tab saves editable copy');
 await peer.evaluate(`(async()=>{const {deleteWork}=await import('/static/core/js/work-store.js');deleteWork('${shared}')})()`);
 await peer.close();peer=null;
 await save('删除后尝试保存');await check('deleted original does not lose current edits',`document.querySelector('#workshop-status').textContent.includes('另存副本')&&document.querySelector('#cut-count').textContent.includes('3 次')`);
 const rescued=await save('救回副本',true);assert.notEqual(rescued,shared);checks.push('deleted record saved as new copy without reload');
 await navigate('/workshop/compose/');await evaluate(`document.querySelector('[data-category="几何"]').click();document.querySelector('[data-motif="circle"]').click();document.querySelector('[data-action="deselect"]').click()`);
 await mouseStroke([[.5,.5]]);await check('rectangle selection includes transparent ring centre',`document.querySelector('#selected-name').textContent==='圆环'`);
 await evaluate(`document.querySelector('[data-category="花卉"]').click();document.querySelector('[data-motif="flower"]').click()`);
 await check('flower does not paint former outside fragment',`(async()=>{const {renderComposition}=await import('/static/core/js/composition-model.js');const c=document.createElement('canvas');c.width=c.height=1024;renderComposition(c,[{motif:'flower',x:.5,y:.5,size:.8,rotation:0}],'#a63127');return c.getContext('2d').getImageData(512,307,1,1).data[3]===0})()`);
 await check('six-point motif outside region is transparent',`(async()=>{const {renderComposition}=await import('/static/core/js/composition-model.js');const c=document.createElement('canvas');c.width=c.height=1024;renderComposition(c,[{motif:'star',x:.5,y:.5,size:.8,rotation:0}],'#a63127');return c.getContext('2d').getImageData(512,299,1,1).data[3]===0})()`);
 await evaluate(`for(let i=0;i<12;i++)document.querySelector('[data-action="larger"]').click()`);await check('maximum scale button disabled',`document.querySelector('[data-action="larger"]').disabled`);
 await shortcut('z');await check('one undo changes scale at maximum',`!document.querySelector('[data-action="larger"]').disabled`);await download('composition-fixed');
 await evaluate(`const i=document.createElement('input');i.id='qa-input';document.body.append(i);i.focus();window.beforeKeyboard=document.querySelector('#paper-canvas').toDataURL()`);
 await shortcut('z');await check('shortcuts do not steal input typing',`document.querySelector('#paper-canvas').toDataURL()===window.beforeKeyboard`);await evaluate(`document.querySelector('#qa-input').remove()`);
 await navigate('/workshop/trace/?reference=leaves');
 await check('selected reference initializes guide and clean state',`document.querySelector('[data-reference="leaves"]').getAttribute('aria-pressed')==='true'&&document.querySelector('.workspace').dataset.dirty==='false'`);
 await call('Emulation.setDeviceMetricsOverride',{width:720,height:1080,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await click('focus');await delay(80);
 const tr=await rect();const tp=(x,y)=>({x:tr.x+x*tr.width,y:tr.y+y*tr.height,id:1,radiusX:2,radiusY:2,force:1});
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp(.6,.6)]});await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tp(.8,.6)]});await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tp(.7,.8)]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(60);
 await check('touch drawing with guide in enlarged canvas cuts accurately',`document.querySelector('#cut-count').textContent.includes('1 次')&&document.querySelector('#paper-canvas').getContext('2d').getImageData(716,680,1,1).data[3]===0`);
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 for(const mode of ['free','fold','trace','compose']){
  await navigate('/workshop/'+mode+'/');if(mode==='fold')await evaluate(`document.querySelector('[data-fold="quarter"]').click()`);
  for(const width of [1920,1440,720,390]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await click('focus');await delay(60);
   await check('focused responsive '+mode+' '+width,`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#drawing-canvas').getBoundingClientRect().width>0`);
   if(mode==='trace'&&(width===1440||width===390)){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(output,'guide-focus-'+width+'.png'),Buffer.from(shot.data,'base64'));}
   await click('focus');
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:checks.length,downloads:downloads.length,errors,output},null,2));
}finally{
 if(peer)await peer.close();
 if(originalStorage!==undefined)await evaluate(originalStorage===null?`localStorage.removeItem('${key}')`:`localStorage.setItem('${key}',${JSON.stringify(originalStorage)})`).catch(()=>{});
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,downloads,errors},null,2));socket.close();
}
