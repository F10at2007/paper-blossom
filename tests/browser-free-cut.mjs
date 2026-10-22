/** Optional integration QA: Node 22+ and a running Chrome CDP endpoint, no npm deps.
 * Start Django on :8000 and Chrome with --remote-debugging-port=9222.
 * Run: node tests/browser-free-cut.mjs
 * Outputs screenshots, downloaded PNGs and a report under ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('.qa', `phase-two-${Date.now()}`);
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
  await until(() => evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(route)}`), 'Page load');
  if (route === '/workshop/free/') await until(() => evaluate(`!!document.querySelector('#paper-canvas')?.getContext('2d').getImageData(900,900,1,1).data[3]`), 'Canvas initialization');
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
async function download(name) {
  const index = downloads.length;
  await click('download');
  await until(() => downloads.length > index, 'No browser download event');
  const item = downloads[index];
  await until(() => completedDownloads.has(item.guid), 'PNG download did not complete');
  assert.equal(item.suggestedFilename, '一纸生花_自由剪纸.png');
  const bytes = await fs.readFile(path.join(output, 'downloads', item.guid));
  assert.equal(bytes.subarray(1,4).toString(), 'PNG');
  await fs.writeFile(path.join(output, `${name}.png`), bytes);
  const base64 = bytes.toString('base64');
  return evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${base64}')).blob();const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);window.downloaded=c;bitmap.close();const p=(x,y)=>[...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data];return {width:c.width,height:c.height,hole:p(.25,.25),paper:p(.5,.5)}})()`);
}

let browser;
try {
  await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');
  await call('Network.enable'); await call('Network.setCacheDisabled', {cacheDisabled:true});
  browser = await call('Browser.getVersion');
  await call('Browser.setDownloadBehavior', { behavior:'allowAndName',downloadPath:path.join(output,'downloads'),eventsEnabled:true });
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await navigate('/workshop/free/');
  await evaluate(`window.pixel=(x,y,id='paper-canvas')=>{const c=document.getElementById(id);return [...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data]}`);
  await evaluate(`window.createdUrls=[];window.revokedUrls=[];window.originalCreateUrl=URL.createObjectURL;window.originalRevokeUrl=URL.revokeObjectURL;URL.createObjectURL=function(blob){const u=window.originalCreateUrl(blob);window.createdUrls.push(u);return u};URL.revokeObjectURL=function(u){window.revokedUrls.push(u);window.originalRevokeUrl(u)}`);
  await check('initial full paper and disabled undo/redo/clear', `pixel(.25,.25)[3]===255 && ['undo','redo','clear'].every(a=>document.querySelector('[data-action="'+a+'"]').disabled)`);
  const blank = await download('blank-paper');
  assert.deepEqual(blank.hole, [166,49,39,255]); assert.equal(blank.width,2048); assert.equal(blank.height,2048);
  checks.push('blank paper downloads as valid 2048 square PNG');
  const rectangle = [[.15,.15],[.4,.15],[.4,.4],[.15,.4]];
  await mouseStroke(rectangle, false);
  await check('live path visible without removing paper before release', `pixel(.25,.25)[3]===255 && pixel(.25,.25,'drawing-canvas')[3]>0`);
  const r = await rect();
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+.15*r.width,y:r.y+.4*r.height,button:'left',buttons:0,clickCount:1});
  await delay(40);
  await check('mouse release auto-closes path; holes genuinely transparent in paper and preview', `pixel(.25,.25)[3]===0 && pixel(.25,.25,'preview-canvas')[3]===0 && pixel(.8,.8)[3]===255 && document.querySelector('#cut-count').textContent.includes('1 次')`);
  await check('checkerboard belongs to CSS, not paper pixels', `getComputedStyle(document.querySelector('.cut-paper')).backgroundImage.includes('conic-gradient') && pixel(.25,.25)[3]===0`);
  const triangle = [[.6,.6],[.9,.6],[.9,.9]];
  await mouseStroke(triangle);
  await evaluate(`window.expectedPaper=document.querySelector('#paper-canvas').toDataURL()`);
  await check('multiple cuts preserve previous holes', `pixel(.25,.25)[3]===0 && pixel(.8,.7)[3]===0 && pixel(.7,.8)[3]===255`);
  await click('undo');
  await check('undo restores last region only', `pixel(.25,.25)[3]===0 && pixel(.8,.7)[3]===255`);
  await click('undo');
  await check('second undo restores full paper', `pixel(.25,.25)[3]===255 && document.querySelector('[data-action="undo"]').disabled`);
  await click('redo'); await click('redo');
  await check('redo round trip yields identical bitmap', `document.querySelector('#paper-canvas').toDataURL()===window.expectedPaper && document.querySelector('[data-action="redo"]').disabled`);
  await click('undo');
  await mouseStroke([[.6,.15],[.9,.15],[.9,.4],[.6,.4]]);
  await check('new cut discards redo branch', `document.querySelector('[data-action="redo"]').disabled && pixel(.8,.25)[3]===0 && pixel(.8,.7)[3]===255`);
  await check('rectangular cut geometry stays aligned as feedback text changes', `pixel(.85,.16)[3]===0 && pixel(.61,.16)[3]===0 && pixel(.85,.14)[3]===255`);
  for (const [color, rgba] of [['#c62828',[198,40,40,255]],['#f4e9d5',[244,233,213,255]],['#292923',[41,41,35,255]],['#a63127',[166,49,39,255]]]) {
    await evaluate(`document.querySelector('[data-color="${color}"]').click()`);
    assert.deepEqual(await evaluate(`pixel(.5,.5)`),rgba);
    await check(`color ${color} preserves transparency and selected state`, `pixel(.25,.25)[3]===0 && document.querySelector('[data-color="${color}"]').getAttribute('aria-pressed')==='true'`);
  }
  await evaluate(`window.expectedPaper=document.querySelector('#paper-canvas').toDataURL()`);
  await evaluate(`document.querySelector('[data-color="#a63127"]').click();document.querySelector('[data-color="#a63127"]').click()`);
  await check('rebuild from path history is pixel-idempotent', `document.querySelector('#paper-canvas').toDataURL()===window.expectedPaper`);
  await evaluate(`document.querySelector('[data-color="#f4e9d5"]').click()`);
  const exported = await download('cut-paper');
  assert.equal(exported.width,2048); assert.equal(exported.height,2048); assert.equal(exported.hole[3],0);
  assert.deepEqual(exported.paper,[244,233,213,255]);
  await check('decoded PNG matches normalized preview pixels; no UI or checkerboard exported', `(()=>{const d=window.downloaded.getContext('2d');let n=0;for(let y=.025;y<1;y+=.05)for(let x=.025;x<1;x+=.05){const a=pixel(x,y),b=[...d.getImageData(Math.floor(x*2048),Math.floor(y*2048),1,1).data];if(a.some((v,i)=>v!==b[i]))n++}return n===0})()`);
  const beforeFailure = downloads.length;
  await evaluate(`window.originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null)}`);
  await click('download');
  await check('null toBlob shows failure and enables retry', `document.querySelector('#workshop-status').textContent.includes('下载失败') && !document.querySelector('[data-action="download"]').disabled`);
  assert.equal(downloads.length,beforeFailure);
  await evaluate(`HTMLCanvasElement.prototype.toBlob=function(){throw new Error('test encode error')}`);
  await click('download');
  await check('thrown export error is handled', `document.querySelector('#workshop-status').textContent.includes('下载失败')`);
  await evaluate(`HTMLCanvasElement.prototype.toBlob=window.originalToBlob`);
  await click('preview');
  await check('large preview is real and transparent', `document.querySelector('#paper-preview-dialog').open && pixel(.25,.25,'large-preview-canvas')[3]===0`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await check('preview closes with Escape', `!document.querySelector('#paper-preview-dialog').open`);
  await confirmClear(false);
  await check('cancel clear preserves cuts', `pixel(.25,.25)[3]===0`);
  await confirmClear(true);
  await check('confirmed clear restores full paper and history states', `pixel(.25,.25)[3]===255 && ['undo','redo','clear'].every(a=>document.querySelector('[data-action="'+a+'"]').disabled)`);
  for (let n=0;n<10;n++) await mouseStroke([[.45,.45],[.55,.45],[.55,.55],[.45,.55]]);
  await evaluate(`window.quickResult=document.querySelector('#paper-canvas').toDataURL()`);
  for (let n=0;n<10;n++) await click('undo');
  for (let n=0;n<10;n++) await click('redo');
  await check('ten consecutive cuts and ten undo/redo retain identical bitmap', `document.querySelector('#cut-count').textContent.includes('10 次') && document.querySelector('#paper-canvas').toDataURL()===window.quickResult`);
  await confirmClear(true);
  await mouseStroke([[.2,.2]]);
  await check('single clicks do not create empty history steps', `document.querySelector('[data-action="undo"]').disabled`);
  await mouseStroke(rectangle,false);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await check('window blur cancels unfinished stroke without losing committed paper', `document.querySelector('[data-action="undo"]').disabled && !document.querySelector('[data-action="download"]').disabled && pixel(.25,.25)[3]===255`);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:1,y:1,button:'left',buttons:0});
  await mouseStroke(rectangle,false);
  await evaluate(`const c=document.querySelector('#drawing-canvas');c.releasePointerCapture(1)`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1,buttons:1});
  await delay(40);
  await check('lost pointer capture cancels unfinished path', `!document.querySelector('[data-action="download"]').disabled && pixel(.25,.25)[3]===255`);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:1,y:1,button:'left',buttons:0});
  await mouseStroke(rectangle,false);
  await call('Emulation.setDeviceMetricsOverride',{width:720,height:1080,deviceScaleFactor:1,mobile:false});
  await delay(70);
  await check('resize during drawing cancels temporary path safely', `!document.querySelector('[data-action="download"]').disabled && pixel(.25,.25)[3]===255`);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:1,y:1,button:'left',buttons:0});
  await mouseStroke(rectangle,false);
  await evaluate(`document.querySelector('#drawing-canvas').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}))`);
  await check('pointer cancellation resets gesture', `!document.querySelector('[data-action="download"]').disabled && pixel(.25,.25)[3]===255`);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:1,y:1,button:'left',buttons:0});
  await mouseStroke([[.7,.7],[.95,.7],[1.2,.95],[.7,1.2]]);
  await check('pointer capture finishes stroke outside canvas', `document.querySelector('#cut-count').textContent.includes('1 次') && !document.querySelector('[data-action="download"]').disabled`);
  await confirmClear(true);

  for (const width of [1920,1440,720]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});
    await delay(70);
    await mouseStroke(rectangle);
    await check(`accurate mouse coordinates and no overflow at ${width}`, `pixel(.25,.25)[3]===0 && pixel(.5,.5)[3]===255 && document.documentElement.scrollWidth<=innerWidth`);
    const image = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await fs.writeFile(path.join(output,`free-${width}.png`),Buffer.from(image.data,'base64'));
    await confirmClear(true);
  }
  await mouseStroke(rectangle);
  await evaluate(`window.expectedPaper=document.querySelector('#paper-canvas').toDataURL()`);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:2,mobile:false});
  await delay(70);
  await check('existing cuts survive resize and high-DPI unchanged', `document.querySelector('#paper-canvas').toDataURL()===window.expectedPaper`);
  await mouseStroke(triangle);
  await check('new coordinates remain correct after resize', `pixel(.25,.25)[3]===0 && pixel(.8,.7)[3]===0`);
  await confirmClear(true);
  await call('Emulation.setDeviceMetricsOverride',{width:720,height:1080,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await delay(70);
  const touchRect = await rect();
  const touchPoint = ([x,y]) => ({x:touchRect.x+x*touchRect.width,y:touchRect.y+y*touchRect.height,id:7,radiusX:2,radiusY:2,force:1});
  const scrollBefore = await evaluate('scrollY');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint(rectangle[0])]});
  for (const p of rectangle.slice(1)) await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoint(p)]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(50);
  await check('real emulated touch cuts without scrolling/default gestures', `pixel(.25,.25)[3]===0 && scrollY===${scrollBefore} && !document.querySelector('[data-action="download"]').disabled`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint([.6,.6])]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoint([.9,.6])]});
  await call('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await check('touch cancellation preserves prior cuts and ends gesture', `pixel(.25,.25)[3]===0 && pixel(.8,.7)[3]===255 && !document.querySelector('[data-action="download"]').disabled`);
  await until(()=>evaluate('window.createdUrls.every(u=>window.revokedUrls.includes(u))'),'Blob URL cleanup');
  await check('all successful download object URLs released', `window.createdUrls.length===2 && window.revokedUrls.length>=2`);
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  // Restore the coordinate helper after each navigation and verify all routes.
  for (const width of [1920,1440,720]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});
    for (const route of ['/','/modes/','/works/','/workshop/fold/','/workshop/free/','/workshop/trace/','/workshop/compose/']) {
      await navigate(route);
      await check(`navigation/assets/layout ${width} ${route}`, `(async()=>{if(document.documentElement.scrollWidth>innerWidth)return false;if([...document.images].some(i=>!i.complete||!i.naturalWidth))return false;for(const url of new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h.startsWith('/')))){if(!(await fetch(url)).ok)return false}return true})()`);
      if (['trace','compose'].some(mode=>route.includes('/'+mode+'/'))) await check(`other mode remains placeholder ${width} ${route}`, `!document.querySelector('#drawing-canvas') && !!document.querySelector('[data-placeholder="下载 PNG"]')`);
    }
  }
  assert.deepEqual(errors,[],'Browser console/runtime errors');
  console.log(JSON.stringify({browser:browser.product,checks:checks.length,downloads:downloads.length,errors,output},null,2));
} finally {
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({browser,checks,downloads,errors},null,2));
  socket.close();
}
