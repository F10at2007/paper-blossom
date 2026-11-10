/** Optional integration QA: Node 22+ and a running Chrome CDP endpoint, no npm deps.
 * Start Django on :8000 and Chrome with --remote-debugging-port=9222.
 * Run: node tests/browser-fold-cut.mjs
 * Outputs screenshots, downloaded PNGs and a report under ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('.qa', `radial-${Date.now()}`);
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
  await call('Page.navigate', { url: `${process.env.BASE_URL || "http://127.0.0.1:8000"}${route}` });
  await until(() => evaluate(`document.readyState === 'complete' && location.pathname+location.search === ${JSON.stringify(route)}`), 'Page load');
  if (route==='/workshop/fold/') await until(()=>evaluate(`document.querySelector('#workshop-status')?.textContent.includes('先选择折法')`),'Fold initialization');
  if (route==='/workshop/free/') await until(()=>evaluate(`!!document.querySelector('#paper-canvas')?.getContext('2d').getImageData(900,900,1,1).data[3]`),'Free initialization');
}
async function click(action) { await evaluate(`document.querySelector('[data-action="${action}"]').click()`); if(action==='unfold') await delay(280); }
async function rect() {
  return evaluate(`(()=>{const c=document.querySelector('#drawing-canvas');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollX,scrollY,innerWidth,vw:visualViewport.width,offset:visualViewport.offsetLeft,scale:visualViewport.scale,body:document.body.getBoundingClientRect().width}})()`);
}
async function displayPoint(x,y) {
  return evaluate(`(async()=>{const {toFoldView}=await import('/static/core/js/fold-paper.js');const mode=document.querySelector('[data-fold][aria-pressed="true"]').dataset.fold;const p=toFoldView({x:${x},y:${y}},mode);return [p.x,p.y]})()`);
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
  assert.equal(item.suggestedFilename, '一纸生花_对称之美.png');
  const bytes = await fs.readFile(path.join(output, 'downloads', item.guid));
  assert.equal(bytes.subarray(1,4).toString(), 'PNG');
  await fs.writeFile(path.join(output, `${name}.png`), bytes);
  const base64 = bytes.toString('base64');
  return evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${base64}')).blob();const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);window.downloaded=c;bitmap.close();const p=(x,y)=>[...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data];return {width:c.width,height:c.height,hole:p(.25,.25),paper:p(.5,.5)}})()`);
}


const modes=process.argv.slice(2).length?process.argv.slice(2):['radial3','radial6'];
const polar=(r,d)=>[.5+r*Math.cos(d*Math.PI/180),.5+r*Math.sin(d*Math.PI/180)];
try {
  await call('Page.enable');await call('Runtime.enable');await call('Log.enable');
  await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
  const browser=await call('Browser.getVersion');
  await call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:path.join(output,'downloads'),eventsEnabled:true});
  for(const mode of modes) {
    const n=Number(mode.at(-1)),angle=180/n;
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
    await navigate('/workshop/fold/');
    await evaluate(`document.querySelector('[data-fold="${mode}"]').click()`);
    await check(`${mode}: no final preview before unfold`, `document.querySelector('[data-action="download"]').disabled && !document.querySelector('#preview-canvas')`);
    await check(`${mode}: concave, self-crossing and centre cuts match independent Canvas clipping`, `(async()=>{
      const {clipFold,FOLDS}=await import('/static/core/js/fold-paper.js');
      const {traceCut}=await import('/static/core/js/free-paper.js');
      const paths=[
        [{x:.4,y:.4},{x:.9,y:.4},{x:.9,y:.9},{x:.8,y:.9},{x:.8,y:.45},{x:.6,y:.45},{x:.6,y:.9},{x:.4,y:.9}],
        [{x:.4,y:.4},{x:.95,y:.9},{x:.4,y:.9},{x:.95,y:.4}],
        [{x:.4,y:.4},{x:.6,y:.4},{x:.6,y:.6},{x:.4,y:.6}]
      ];
      for(const p of paths){
        const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=a.height=b.width=b.height=1024;
        const ac=a.getContext('2d'),bc=b.getContext('2d');
        traceCut(ac,FOLDS['${mode}'].region,1024,1024);ac.clip();traceCut(ac,p,1024,1024);ac.fill('evenodd');
        traceCut(bc,clipFold(p,'${mode}'),1024,1024);bc.fill('evenodd');
        const ad=ac.getImageData(0,0,1024,1024).data,bd=bc.getImageData(0,0,1024,1024).data;
        for(let i=3;i<ad.length;i+=4)if((ad[i]===0&&bd[i]===255)||(ad[i]===255&&bd[i]===0))return false;
      }
      return true;
    })()`);

    await evaluate(`window.alpha=(x,y,id='paper-canvas')=>{const c=id==='downloaded'?window.downloaded:document.getElementById(id);return c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data[3]}`);
    // Small triangle is deliberately asymmetric within the fundamental sector.
    await mouseStroke([polar(.19,angle*.2),polar(.32,angle*.4),polar(.22,angle*.7)]);
    await check(`${mode}: triangle committed`, `document.querySelector('#cut-count').textContent.includes('1 次')`);
    await click('unfold');
    const probe=polar(.24,angle*.42);
    const expected=[];
    for(let k=0;k<n;k++)for(const sign of [1,-1])expected.push(polar(.24,k*360/n+sign*angle*.42));
    await check(`${mode}: independently computed mirrored triangle holes`, `${JSON.stringify(expected)}.every(([x,y])=>alpha(x,y)===0)&&alpha(.5,.5)===255&&alpha(.02,.02)===0`);
    await download(mode);
    await check(`${mode}: decoded PNG has all transparent holes, circular boundary and paper`, `${JSON.stringify(expected)}.every(([x,y])=>alpha(x,y,'downloaded')===0)&&alpha(.5,.5,'downloaded')===255&&alpha(.02,.02,'downloaded')===0`);
    // Compare independently rasterized workspace and PNG away from edge antialiasing.
    await check(`${mode}: PNG agrees with preview`, `(()=>{let bad=0;for(let y=.013;y<1;y+=.021)for(let x=.017;x<1;x+=.023){const a=alpha(x,y),b=alpha(x,y,'downloaded');if((a===0||a===255)&&(b===0||b===255)&&a!==b)bad++}return bad===0})()`);
    await click('unfold');await click('undo');
    await check(`${mode}: undo`, `document.querySelector('#cut-count').textContent.includes('0 次')`);
    await click('redo');
    await check(`${mode}: redo`, `document.querySelector('#cut-count').textContent.includes('1 次')`);
    await click('undo');
    const curve=Array.from({length:40},(_,i)=>{const t=i*2*Math.PI/40;return polar(.28+.045*Math.cos(t)+.01*Math.cos(3*t),angle*(.5+.16*Math.sin(t)))});
    await mouseStroke(curve);
    await check(`${mode}: irregular cut discards redo`, `document.querySelector('[data-action="redo"]').disabled`);
    await click('unfold');
    const curveProbes=[];for(let k=0;k<n;k++)for(const sign of [1,-1])curveProbes.push(polar(.28,k*360/n+sign*angle*.5));
    await check(`${mode}: irregular curve mirrors`, `${JSON.stringify(curveProbes)}.every(([x,y])=>alpha(x,y)===0)`);
    await confirmClear(true);
    // Start beyond the radial edge, within the canvas, then cross into paper.
    await mouseStroke([polar(.24,-angle*.12),polar(.34,-angle*.12),polar(.34,angle*.18),polar(.24,angle*.18)]);
    await check(`${mode}: outside-paper start clipped`, `document.querySelector('#cut-count').textContent.includes('1 次')`);
    await click('unfold');
    await check(`${mode}: seam cut has no solid centre-line`, `alpha(.29+.5,.5)===0`);
    await click('unfold');
    // Native CDP touch input, not synthetic DOM pointer events.
    const r=await rect();const pts=await Promise.all([polar(.15,angle*.3),polar(.22,angle*.4),polar(.18,angle*.65)].map(p=>displayPoint(...p)));
    const touch=p=>({x:r.x+p[0]*r.width,y:r.y+p[1]*r.height,id:1,radiusX:2,radiusY:2,force:1});
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(pts[0])]});
    for(const p of pts.slice(1))await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(p)]});
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await check(`${mode}: touch commits`, `document.querySelector('#cut-count').textContent.includes('2 次')`);
    for(const width of [1920,1440,720]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await delay(100);
      await check(`${mode}: layout ${width}`, `document.documentElement.scrollWidth<=innerWidth && (()=>{const r=document.querySelector('#drawing-canvas').getBoundingClientRect();return Math.abs(r.width-r.height)<1})()`);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(output,`${mode}-${width}.png`),Buffer.from(shot.data,'base64'));
    }
    await mouseStroke([polar(.38,angle*.3),polar(.44,angle*.4),polar(.4,angle*.6)]);
    await check(`${mode}: drawing after resize`, `document.querySelector('#cut-count').textContent.includes('3 次')`);
    await evaluate(`document.querySelector('[data-color="#f4e9d5"]').click()`);
    await click('unfold');
    await check(`${mode}: changing colour preserves holes`, `alpha(.79,.5)===0 && (()=>{const c=document.querySelector('#paper-canvas');return c.getContext('2d').getImageData(512,512,1,1).data[0]===244})()`);
    await download(mode+'-final');
    await check(`${mode}: coloured PNG`, `downloaded.getContext('2d').getImageData(1024,1024,1,1).data[0]===244 && alpha(.79,.5,'downloaded')===0`);
    const bitmap=await evaluate(`document.querySelector('#paper-canvas').toDataURL()`);
    const prompts=dialogs.length, saving=click('save');
    await until(()=>dialogs.length>prompts,'save prompt');await call('Page.handleJavaScriptDialog',{accept:true,promptText:mode+' browser test'});await saving;
    const workId=await evaluate(`new URLSearchParams(location.search).get('work')`);assert.ok(workId);
    await navigate('/workshop/fold/?work='+workId);
    await until(()=>evaluate(`document.querySelector('#workshop-status').textContent.includes('已恢复')`),'restore initialization');
    await check(`${mode}: saved full image restored exactly`, `document.querySelector('#paper-canvas').toDataURL()===${JSON.stringify(bitmap)} && document.querySelector('[data-fold="${mode}"]').getAttribute('aria-pressed')==='true'`);
    await click('unfold');
    await check(`${mode}: restored document returns to editing`, `document.querySelector('#cut-count').textContent.includes('3 次') && document.querySelector('[data-action="download"]').disabled`);
    for(const accept of [false,true]) {
      const count=dialogs.length, switching=evaluate(`document.querySelector('[data-fold="vertical"]').click()`);
      await until(()=>dialogs.length>count,'switch confirmation');await call('Page.handleJavaScriptDialog',{accept});await switching;
      await check(`${mode}: switch ${accept?'resets':'cancel preserves'} history`, `document.querySelector('#cut-count').textContent.includes('${accept?0:3} 次')`);
    }

  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({browser,checks,errors},null,2));
  console.log(JSON.stringify({output,browser:browser.product,passed:checks.length}));
} finally {socket.close();}
