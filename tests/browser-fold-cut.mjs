/** Optional integration QA: Node 22+ and a running Chrome CDP endpoint, no npm deps.
 * Start Django on :8000 and Chrome with --remote-debugging-port=9222.
 * Run: node tests/browser-fold-cut.mjs
 * Outputs screenshots, downloaded PNGs and a report under ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('.qa', `phase-three-${Date.now()}`);
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
  await until(() => evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(route)}`), 'Page load');
  if (route==='/workshop/fold/') await until(()=>evaluate(`document.querySelector('#workshop-status')?.textContent.includes('先选择折法')`),'Fold initialization');
  if (route==='/workshop/free/') await until(()=>evaluate(`!!document.querySelector('#paper-canvas')?.getContext('2d').getImageData(900,900,1,1).data[3]`),'Free initialization');
}
async function click(action) { await evaluate(`document.querySelector('[data-action="${action}"]').click()`); if(action==='unfold') await delay(280); }
async function rect() {
  return evaluate(`(()=>{const c=document.querySelector('#drawing-canvas');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollX,scrollY,innerWidth,vw:visualViewport.width,offset:visualViewport.offsetLeft,scale:visualViewport.scale,body:document.body.getBoundingClientRect().width}})()`);
}
async function displayPoint(x,y) {
  const mode=await evaluate(`document.querySelector('[data-fold][aria-pressed="true"]')?.dataset.fold`);
  const editing=await evaluate(`document.querySelector('#fold-workspace').dataset.state==='editing'`);
  if(!editing)return [x,y];
  if(mode==='vertical')return [.31+.76*x,.12+.76*y];
  if(mode==='horizontal')return [.12+.76*x,.31+.76*y];
  return [.12+1.52*x,.12+1.52*y];
}
async function mouseStroke(points, release = true) {
  const r = await rect();
  const display = await Promise.all(points.map(([x,y])=>displayPoint(x,y)));
  const mapped = display.map(([x,y]) => ({x:r.x+x*r.width,y:r.y+y*r.height}));
  await call('Input.dispatchMouseEvent', { type:'mouseMoved', ...mapped[0] });
  await call('Input.dispatchMouseEvent', { type:'mousePressed', ...mapped[0], button:'left',buttons:1,clickCount:1 });
  const afterDown = await rect();
  assert.ok(Math.abs(afterDown.y-r.y)<.5 && Math.abs(afterDown.x-r.x)<.5,`Drawing status must not shift canvas position: ${JSON.stringify({r,afterDown})}`);
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
  assert.equal(item.suggestedFilename, '一纸生花_折纸成花.png');
  const bytes = await fs.readFile(path.join(output, 'downloads', item.guid));
  assert.equal(bytes.subarray(1,4).toString(), 'PNG');
  await fs.writeFile(path.join(output, `${name}.png`), bytes);
  const base64 = bytes.toString('base64');
  return evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${base64}')).blob();const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);window.downloaded=c;bitmap.close();const p=(x,y)=>[...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data];return {width:c.width,height:c.height,hole:p(.25,.25),paper:p(.5,.5)}})()`);
}

let browser;
async function select(mode, accept = true) {
  const previous=dialogs.length;
  let resolved=false;
  const selection=evaluate(`document.querySelector('[data-fold="${mode}"]').click()`).then(value=>{resolved=true;return value;});
  await until(()=>resolved||dialogs.length>previous,'Select fold');
  if(dialogs.length>previous) await call('Page.handleJavaScriptDialog',{accept});
  await selection;
}
async function symmetry(kind) {
  const result=await evaluate(`(()=>{const c=document.querySelector('#paper-canvas'),n=c.width,a=c.getContext('2d').getImageData(0,0,n,n).data;let bad=0,max=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=a[(y*n+x)*4+3];const targets=${kind==='vertical'?'[[n-1-x,y]]':kind==='horizontal'?'[[x,n-1-y]]':kind==='quarter'?'[[n-1-x,y],[x,n-1-y]]':'[[n-1-x,y],[x,n-1-y],[y,x]]'};for(const [u,w] of targets){const d=Math.abs(v-a[(w*n+u)*4+3]);max=Math.max(d,max);if((v===0||v===255)&&(a[(w*n+u)*4+3]===0||a[(w*n+u)*4+3]===255)&&d>0)bad++}}return {bad,max}})()`);
  assert.equal(result.bad,0,`pixel symmetry ${kind}: ${JSON.stringify(result)}`);
  checks.push(`pixel symmetry ${kind}, max alpha difference ${result.max}`);
}
try {
  await call('Page.enable');await call('Runtime.enable');await call('Log.clear');await call('Log.enable');
  await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
  browser=await call('Browser.getVersion');
  await call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:path.join(output,'downloads'),eventsEnabled:true});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await navigate('/workshop/fold/');
  await evaluate(`window.pixel=(x,y,id='paper-canvas')=>{const c=document.getElementById(id);if(id==='paper-canvas'&&document.querySelector('#fold-workspace').dataset.state==='editing'){const m=document.querySelector('[data-fold][aria-pressed="true"]').dataset.fold;if(m==='vertical'){x=.31+.76*x;y=.12+.76*y}else if(m==='horizontal'){x=.12+.76*x;y=.31+.76*y}else{x=.12+1.52*x;y=.12+1.52*y}}return [...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data]}`);
  await check('initial choose state blocks editing and export', `document.querySelector('#fold-workspace').dataset.state==='choose' && document.querySelector('[data-action="download"]').disabled && document.querySelector('[data-step="choose"]').hasAttribute('aria-current')`);
  await select('vertical');
  await check('vertical editing region and fold guides ready', `document.querySelector('#fold-workspace').dataset.state==='editing' && document.querySelector('#fold-hint').textContent.includes('纸片已居中')`);
  await mouseStroke([[.7,.2],[.9,.2],[.8,.4]]);
  await check('stroke wholly outside paper creates no cut', `document.querySelector('[data-action="undo"]').disabled`);
  await mouseStroke([[-.1,.55],[.2,.55],[.2,.8],[-.1,.8]]);
  await check('stroke may start outside paper and cut across its edge',`pixel(.1,.65)[3]===0 && pixel(.3,.65)[3]===255 && document.querySelector('#cut-count').textContent.includes('1 次')`);
  await click('unfold');
  await check('outside-start cut unfolds into mirrored edge notches',`pixel(.1,.65)[3]===0 && pixel(.9,.65)[3]===0 && pixel(.5,.65)[3]===255`);
  await confirmClear(true);
  const triangle=[[.12,.2],[.35,.25],[.2,.45]];
  await mouseStroke(triangle);
  await check('only centred paper visible; no realtime preview exists', `pixel(.21,.29)[3]===0 && pixel(.79,.29)[3]===0 && !document.querySelector('#preview-canvas') && !document.querySelector('[data-action="preview"]')`);
  const foldedScreenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await fs.writeFile(path.join(output,'fold-vertical-edit.png'),Buffer.from(foldedScreenshot.data,'base64'));
  await check('download is disabled until unfolding', `document.querySelector('[data-action="download"]').disabled`);
  await click('unfold');
  await download('vertical-after-unfold');
  await check('download after unfolding exports full-paper mirror regions', `(()=>{const c=window.downloaded,a=c.getContext('2d');return [[.21,.29],[.79,.29]].every(([x,y])=>a.getImageData(x*2048,y*2048,1,1).data[3]===0) && a.getImageData(1024,1024,1,1).data[3]===255})()`);
  await check('unfold state shows actual mirror and hides guides', `document.querySelector('#fold-workspace').dataset.state==='unfolded' && pixel(.79,.29)[3]===0 && getComputedStyle(document.querySelector('#fold-guides')).display==='none'`);
  await symmetry('vertical');
  await mouseStroke([[.1,.6],[.3,.6],[.2,.8]]);
  await check('unfolded view does not accept drawing', `document.querySelector('#cut-count').textContent.includes('1 次')`);
  await evaluate(`window.triangleResult=document.querySelector('#paper-canvas').toDataURL()`);
  await click('unfold');
  await check('return editing retains base path and fold mode', `pixel(.21,.29)[3]===0 && pixel(.79,.29)[3]===0 && document.querySelector('[data-fold="vertical"]').getAttribute('aria-pressed')==='true'`);
  const curve=Array.from({length:40},(_,i)=>{const t=i*2*Math.PI/40,r=1+.18*Math.sin(3*t);return [.23+.13*r*Math.cos(t),.7+.1*r*Math.sin(t)];});
  await mouseStroke(curve);await click('unfold');await symmetry('vertical');
  await click('undo');
  await check('undo changes base only, preserving original expanded triangle bitmap', `document.querySelector('#paper-canvas').toDataURL()===window.triangleResult`);
  await click('redo');await symmetry('vertical');
  await click('undo');await click('unfold');
  await mouseStroke([[.1,.7],[.3,.7],[.3,.85]]);
  await check('new base cut clears redo branch', `document.querySelector('[data-action="redo"]').disabled`);
  await select('horizontal',false);
  await check('cancel switching preserves old fold and paths', `document.querySelector('[data-fold="vertical"]').getAttribute('aria-pressed')==='true' && document.querySelector('#cut-count').textContent.includes('2 次')`);
  await select('horizontal',true);
  await check('confirmed switch clears both history stacks', `document.querySelector('[data-action="undo"]').disabled && document.querySelector('[data-action="redo"]').disabled`);
  await mouseStroke([[.2,.1],[.45,.15],[.3,.35]]);await click('unfold');
  await check('horizontal triangle maps across horizontal axis', `pixel(.3,.2)[3]===0 && pixel(.3,.8)[3]===0 && pixel(.7,.2)[3]===255`);
  await symmetry('horizontal');
  await download('horizontal');
  await check('horizontal PNG preserves top/bottom transparency', `(()=>{const a=window.downloaded.getContext('2d');return [[.3,.2],[.3,.8]].every(([x,y])=>a.getImageData(x*2048,y*2048,1,1).data[3]===0)})()`);
  await select('quarter');
  await mouseStroke([[.12,.12],[.3,.13],[.22,.35]]);await click('unfold');
  await check('quarter yields four matching transparent regions', `[[.21,.2],[.79,.2],[.21,.8],[.79,.8]].every(([x,y])=>pixel(x,y)[3]===0) && pixel(.5,.5)[3]===255`);
  await symmetry('quarter');
  const quarter=await download('quarter');assert.equal(quarter.width,2048);assert.equal(quarter.height,2048);
  await select('eighth');
  await mouseStroke([[.3,.08],[.45,.12],[.4,.27]]);await click('unfold');
  await check('eightfold actual user triangle maps to all eight sectors', `[[.38,.16],[.62,.16],[.38,.84],[.62,.84],[.16,.38],[.84,.38],[.16,.62],[.84,.62]].every(([x,y])=>pixel(x,y)[3]===0) && pixel(.5,.5)[3]===255`);
  await symmetry('eighth');
  await click('unfold');
  const wedgeScreenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await fs.writeFile(path.join(output,'fold-eighth-edit.png'),Buffer.from(wedgeScreenshot.data,'base64'));
  await delay(150); // Chrome restores its viewport after a full-page screenshot.
  await mouseStroke([[.32,.1],[.46,.15],[.42,.29]]);await click('unfold');
  await check('overlapping base cuts form a union rather than restoring holes',`pixel(.38,.16)[3]===0 && document.querySelector('#cut-count').textContent.includes('2 次')`);
  await click('undo');
  await check('undo overlapping operation retains original eight holes',`pixel(.38,.16)[3]===0 && document.querySelector('#cut-count').textContent.includes('1 次')`);
  await evaluate(`document.querySelector('[data-color="#f4e9d5"]').click()`);
  await check('fold color change preserves transparent holes', `pixel(.38,.16)[3]===0 && pixel(.5,.5)[0]===244 && pixel(.5,.5)[3]===255`);
  await download('eighth');
  await check('download matches expanded canvas at normalized sample points', `(()=>{let bad=0;const c=window.downloaded;for(let y=.025;y<1;y+=.05)for(let x=.025;x<1;x+=.05){const a=pixel(x,y),b=[...c.getContext('2d').getImageData(Math.floor(x*2048),Math.floor(y*2048),1,1).data];if(a.some((v,i)=>v!==b[i]))bad++}return bad===0})()`);
  await confirmClear(true);
  await mouseStroke([[.4,.1],[1,0],[0,0],[0,1],[1,1],[1,0]]);await click('unfold');
  await check('eightfold boundary cuts join without diagonal or centre seams', `(()=>{const a=document.querySelector('#paper-canvas').getContext('2d').getImageData(0,0,1024,1024).data;return a.every((v,i)=>i%4!==3||v===0)})()`);
  await download('eighth-seam-boundary');
  await check('PNG preserves seam-free transparency even at centre and diagonal boundaries', `(()=>{const a=window.downloaded.getContext('2d').getImageData(0,0,2048,2048).data;return a.every((v,i)=>i%4!==3||v===0)})()`);
  await confirmClear(true);
  await check('restart keeps selected fold and restores editable full paper', `document.querySelector('#fold-workspace').dataset.state==='editing' && document.querySelector('[data-action="undo"]').disabled && pixel(.4,.2)[3]===255`);
  await mouseStroke([[.4,.3],[.9,.3],[.9,.7],[.4,.7]]);await click('unfold');
  await symmetry('eighth');
  await check('crossing wedge is clipped without cutting unrelated regions', `pixel(.45,.4)[3]===0 && pixel(.55,.4)[3]===0 && pixel(.5,.1)[3]===255`);
  for(const width of [1920,1440,720]) {
    await confirmClear(true);await select('quarter');
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await delay(80);
    await mouseStroke([[.12,.12],[.3,.13],[.22,.35]]);await click('unfold');
    await check(`fold layout and coordinates ${width}`,`document.documentElement.scrollWidth<=innerWidth && pixel(.21,.2)[3]===0 && pixel(.79,.8)[3]===0`);
    const image=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await fs.writeFile(path.join(output,`fold-${width}.png`),Buffer.from(image.data,'base64'));
  }
  await evaluate(`window.beforeResize=document.querySelector('#paper-canvas').toDataURL()`);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:2,mobile:false});await delay(80);
  await check('fold paths and expanded output survive resize/DPR',`document.querySelector('#paper-canvas').toDataURL()===window.beforeResize`);
  await confirmClear(true);await select('eighth');
  await call('Emulation.setDeviceMetricsOverride',{width:720,height:1080,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await delay(80);
  const r=await rect(), beforeScroll=await evaluate('scrollY');
  const touch=([x,y])=>({x:r.x+(.12+1.52*x)*r.width,y:r.y+(.12+1.52*y)*r.height,id:9,radiusX:2,radiusY:2,force:1});
  const pts=[[.3,.08],[.45,.12],[.4,.27]];
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(pts[0])]});
  for(const p of pts.slice(1))await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(p)]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(40);await click('unfold');
  await check('fold touch produces eight cuts without scrolling',`pixel(.38,.16)[3]===0 && pixel(.84,.62)[3]===0 && scrollY===${beforeScroll}`);
  await symmetry('eighth');
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await check('no PNG guides or CSS background are present in paper pixels', `pixel(.38,.16)[3]===0 && pixel(.5,.5)[3]===255`);
  assert.deepEqual(errors,[],'Console/runtime errors');
  console.log(JSON.stringify({browser:browser.product,checks:checks.length,downloads:downloads.length,errors,output},null,2));
} finally {
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({browser,checks,downloads,errors},null,2));socket.close();
}
