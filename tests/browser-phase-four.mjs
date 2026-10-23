/** Optional integration QA: Node 22+ and a running Chrome CDP endpoint, no npm deps.
 * Start Django on :8000 and Chrome with --remote-debugging-port=9222.
 * Run: node tests/browser-phase-four.mjs (BASE_URL can override :8000)
 * Controlled composition rendering + separate default-context integration pass.
 * Outputs screenshots, downloaded PNGs and a report under ignored .qa/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.BASE_URL || 'http://127.0.0.1:8000';
const layers={};
let renderingOverride;
let outcome='failed',failure=null;
const output = path.resolve('.qa', `phase-four-${Date.now()}`);
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
  await call('Page.navigate', { url: `${baseURL}${route}` });
  await until(() => evaluate(`document.readyState === 'complete' && (location.pathname+location.search === ${JSON.stringify(route)} || (${JSON.stringify(route)}.includes('work=missing-work') && location.pathname==='/workshop/free/' && document.querySelector('#workshop-status')?.textContent.includes('未找到')))`), 'Page load');
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
  return evaluate(`(async()=>{const blob=await(await fetch('data:image/png;base64,${base64}')).blob();const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);window.downloaded=c;window.downloadedPNG='data:image/png;base64,${base64}';bitmap.close();const p=(x,y)=>[...c.getContext('2d').getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data];return {width:c.width,height:c.height,hole:p(.25,.25),paper:p(.5,.5)}})()`);
}

// Compare decoded RGBA, not PNG encoding bytes. Zero tolerance on every channel.
async function exactPixels(name,before,after) {
  await check(name,`(async()=>{
    const decode=async url=>{const image=await createImageBitmap(await(await fetch(url)).blob());const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();return {width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data}};
    const a=await decode(${JSON.stringify(before)}),b=await decode(${JSON.stringify(after)});
    return a.width===b.width&&a.height===b.height&&a.data.every((v,i)=>v===b.data[i]);
  })()`);
}
async function savedDocument(id) {
  return evaluate(`JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id===${JSON.stringify(id)}).document`);
}
async function assertSavedRoundTrip(id,expected,name) {
  // Save the live restored model again: reading the unchanged stored record alone
  // would not prove that restore actually populated the editable model correctly.
  const savedId=await saveNamed(name);
  assert.equal(savedId,id);assert.deepEqual(await savedDocument(id),expected);
  checks.push('data: restored live model saves identical IDs, order, geometry and colour: '+name);
}
async function checkCompositionExport() {
  // Read a detached decoded snapshot, never thousands of pixels from the live
  // interactive canvas. Both image buffers are read once, then sampled in memory.
  await check('composition PNG contains arranged pixels without selection border',`(async()=>{
    const p=document.querySelector('#paper-canvas');const bitmap=await createImageBitmap(await(await fetch(p.toDataURL())).blob());
    const copy=document.createElement('canvas');copy.width=p.width;copy.height=p.height;const a=copy.getContext('2d',{willReadFrequently:true});a.drawImage(bitmap,0,0);bitmap.close();
    const ad=a.getImageData(0,0,1024,1024).data,bd=window.downloaded.getContext('2d').getImageData(0,0,2048,2048).data;
    let opaque=0,clear=0;
    for(let y=.0125;y<1;y+=.025)for(let x=.0125;x<1;x+=.025){
      const ai=(Math.floor(y*1024)*1024+Math.floor(x*1024))*4,bi=(Math.floor(y*2048)*2048+Math.floor(x*2048))*4;
      const u=ad.subarray(ai,ai+4),v=bd.subarray(bi,bi+4);
      if(u[3]===255&&v[3]===255){opaque++;if(u[0]!==v[0]||u[1]!==v[1]||u[2]!==v[2])return false;}
      if(u[3]===0&&v[3]===0)clear++;
      if([0,255].includes(u[3])&&[0,255].includes(v[3])&&u[3]!==v[3])return false;
    }
    return opaque>10&&clear>100;
  })()`);
}

let browser,originalStorage;
const key='paper-blooms.works.v1';
const ids={};
async function saveNamed(name){
  const count=dialogs.length,action=click('save');
  await until(()=>dialogs.length>count,'Save name prompt');
  await call('Page.handleJavaScriptDialog',{accept:true,promptText:name});await action;
  await check('manual save '+name,`document.querySelector('#workshop-status').textContent.includes('已保存到当前浏览器')`);
  return evaluate(`new URLSearchParams(location.search).get('work')`);
}

try {
  await call('Page.enable');await call('Runtime.enable');await call('Log.clear');await call('Log.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
  // Test-only deterministic rendering, installed before the first getContext.
  // Only the composition paper is affected; production files are unchanged.
  renderingOverride=await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,options){
      return original.call(this,kind,kind==='2d'&&this.id==='paper-canvas'&&location.pathname==='/workshop/compose/'?{...options,willReadFrequently:true}:options);
    };
  })()`});
  browser=await call('Browser.getVersion');
  await call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:path.join(output,'downloads'),eventsEnabled:true});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await navigate('/workshop/trace/');
  originalStorage=await evaluate(`localStorage.getItem('${key}')`);
  await evaluate(`localStorage.removeItem('${key}')`);
  await check('three original references and independent canvas',`document.querySelectorAll('[data-reference]').length===3 && !!document.querySelector('#reference-canvas')`);
  await evaluate(`window.referenceBefore=document.querySelector('#reference-canvas').toDataURL()`);
  await mouseStroke([[.15,.15],[.4,.15],[.4,.4],[.15,.4]]);
  await check('trace reuses real cutting without changing reference',`document.querySelector('#paper-canvas').getContext('2d').getImageData(256,256,1,1).data[3]===0 && document.querySelector('#reference-canvas').toDataURL()===window.referenceBefore`);
  await click('toggle-reference');await check('reference can be hidden',`document.querySelector('#reference-panel').hidden`);
  await click('toggle-reference');await click('compare');
  await check('comparison has two independent images',`document.querySelector('#trace-compare').open && document.querySelector('#compare-reference').toDataURL()!==document.querySelector('#compare-user').toDataURL()`);
  await evaluate(`document.querySelector('#trace-compare').close()`);
  await click('complete');await check('trace completion and continue state',`document.querySelector('#trace-workspace').dataset.phase==='completed' && document.querySelector('#trace-compare').open`);
  await evaluate(`document.querySelector('#trace-compare').close()`);
  const png=await download('trace-user');assert.equal(png.width,2048);assert.equal(png.hole[3],0);assert.equal(png.paper[3],255);
  checks.push('trace PNG contains user cuts and excludes reference centre hole');
  await click('complete');await check('continue tracing re-enables editing',`document.querySelector('#trace-workspace').dataset.phase==='editing'`);
  await click('complete');
  await evaluate(`document.querySelector('[data-action="resume-tracing"]').click()`);
  await check('comparison continue button resumes real drawing',`!document.querySelector('#trace-compare').open && document.querySelector('#trace-workspace').dataset.phase==='editing'`);
  for(const reference of ['leaves','lattice']){
    await navigate('/workshop/trace/?reference='+reference);
    await check('reference selection '+reference,`document.querySelector('[data-reference="${reference}"]').getAttribute('aria-pressed')==='true'`);
  }
  await mouseStroke([[.15,.15],[.4,.15],[.4,.4],[.15,.4]]);
  await evaluate(`document.querySelector('[data-color="#f4e9d5"]').click()`);
  ids.trace=await saveNamed('临摹 <b>练习</b>');
  await navigate('/workshop/compose/');
  await check('composition starts transparent',`document.querySelector('#paper-canvas').getContext('2d').getImageData(512,512,1,1).data[3]===0`);
  let motifs=0;
  for(const category of ['花卉','动物','几何','边框']){
    await evaluate(`document.querySelector('[data-category="${category}"]').click()`);
    motifs+=await evaluate(`document.querySelectorAll('[data-motif]').length`);
  }
  assert.equal(motifs,12);checks.push('12 original motifs in four categories');
  await evaluate(`document.querySelector('[data-category="花卉"]').click();document.querySelector('[data-motif="flower"]').click()`);
  await check('click adds an independently selected object',`document.querySelector('#object-count').textContent.includes('1 /') && document.querySelector('#selected-name').textContent==='团花'`);
  await mouseStroke([[.6,.5],[.75,.35]]);
  await click('larger');await click('rotate-right');
  await check('composition moves, scales, rotates',`document.querySelector('#object-settings').textContent.includes('15°') && document.querySelector('#object-settings').textContent.includes('39%')`);
  await click('preview');await check('preview is selection-free',`document.querySelector('#compose-preview').open`);await evaluate(`document.querySelector('#compose-preview').close()`);
  await evaluate(`document.querySelector('[data-color="#292923"]').click()`);
  const composed=await download('composition');assert.equal(composed.width,2048);assert.equal(composed.paper[3],0);checks.push('composition PNG transparent background');
  await checkCompositionExport();
  await click('delete');await check('delete affects selected object',`document.querySelector('#object-count').textContent.includes('0 /')`);
  await click('undo');await check('composition undo restores deleted object',`document.querySelector('#object-count').textContent.includes('1 /')`);
  await evaluate(`window.beforeSecondPiece=document.querySelector('#paper-canvas').toDataURL();document.querySelector('[data-motif="leaf"]').click()`);
  await click('delete');
  await check('deleting a second element preserves the first exactly',`document.querySelector('#object-count').textContent.includes('1 /')&&document.querySelector('#paper-canvas').toDataURL()===window.beforeSecondPiece`);
  await mouseStroke([[.1,.1]]);
  await check('blank click deselects without deleting any element',`document.querySelector('[data-action="delete"]').disabled&&document.querySelector('#object-count').textContent.includes('1 /')`);
  await confirmClear(false);await check('cancel composition clear protects objects',`document.querySelector('#object-count').textContent.includes('1 /')`);
  await confirmClear(true);await check('confirmed clear removes composition',`document.querySelector('#object-count').textContent.includes('0 /')`);
  await click('undo');await check('clear can be undone',`document.querySelector('#paper-canvas').toDataURL()===window.beforeSecondPiece`);
  await evaluate(`window.realToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=cb=>cb(null)`);
  await click('download');await check('composition export failure is reported and retry enabled',`document.querySelector('#workshop-status').textContent.includes('下载失败')&&!document.querySelector('[data-action="download"]').disabled`);
  await evaluate(`HTMLCanvasElement.prototype.toBlob=window.realToBlob`);
  ids.compose=await saveNamed('拼接练习');
  const compositionDocument=await savedDocument(ids.compose);
  await check('strict rendering: readback context selected before drawing',`String(document.querySelector('#paper-canvas').getContext('2d').getContextAttributes().willReadFrequently)==='true'`);
  const compositionBitmap=await evaluate(`document.querySelector('#paper-canvas').toDataURL()`);
  await navigate('/workshop/free/?work=missing-work');
  await check('missing work gives a recoverable message and fresh canvas',`document.querySelector('#workshop-status').textContent.includes('未找到')&&!new URLSearchParams(location.search).has('work')`);
  await mouseStroke([[.15,.15],[.4,.15],[.4,.4],[.15,.4]]);ids.free=await saveNamed('自由练习');
  const first=await evaluate(`JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id==='${ids.free}')`);
  await navigate('/workshop/free/?work='+ids.free);
  await check('free reload restores editable cuts',`document.querySelector('#paper-canvas').getContext('2d').getImageData(256,256,1,1).data[3]===0 && !document.querySelector('[data-action="undo"]').disabled`);
  await mouseStroke([[.6,.6],[.9,.6],[.9,.9]]);await saveNamed('自由练习更新');
  await check('saved edit updates same ID without duplicating record',`(()=>{const a=JSON.parse(localStorage.getItem('${key}')).works.filter(w=>w.id==='${ids.free}');return a.length===1&&a[0].document.paths.length===2&&a[0].createdAt===${JSON.stringify(first.createdAt)}&&a[0].updatedAt>=${JSON.stringify(first.updatedAt)}})()`);
  await navigate('/workshop/fold/');
  await until(()=>evaluate(`document.querySelector('#workshop-status').textContent.includes('先选择折法')`),'Fold mount');
  await evaluate(`document.querySelector('[data-fold="quarter"]').click()`);
  await mouseStroke([[.3024,.3024],[.576,.3176],[.4544,.652]]);await click('unfold');
  ids.fold=await saveNamed('折纸练习');
  await navigate('/workshop/fold/?work='+ids.fold);
  await check('fold reload restores type, base cuts and unfolded state',`document.querySelector('#fold-workspace').dataset.state==='unfolded' && document.querySelector('[data-fold="quarter"]').getAttribute('aria-pressed')==='true' && document.querySelector('#cut-count').textContent.includes('1 次')`);
  await click('unfold');await check('restored fold returns to centred editing without realtime preview',`!document.querySelector('#preview-canvas')&&document.querySelector('#fold-workspace').dataset.state==='editing'`);
  await navigate('/workshop/trace/?work='+ids.trace);
  await check('trace reload restores reference and user paths',`document.querySelector('[data-reference="lattice"]').getAttribute('aria-pressed')==='true'&&document.querySelector('#cut-count').textContent.includes('1 次')&&document.querySelector('[data-color="#f4e9d5"]').getAttribute('aria-pressed')==='true'`);
  await navigate('/workshop/compose/?work='+ids.compose);
  await assertSavedRoundTrip(ids.compose,compositionDocument,'拼接练习');
  await exactPixels('strict rendering: restored composition RGBA is exactly identical',compositionBitmap,await evaluate(`document.querySelector('#paper-canvas').toDataURL()`));
  await check('stored composition retains positions, sizes and angle',`(()=>{const d=JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id==='${ids.compose}').document;return d.objects.length===1&&d.objects[0].rotation===15&&Math.abs(d.objects[0].size-.391)<.001&&d.objects[0].x>.6})()`);
  await call('Emulation.setDeviceMetricsOverride',{width:720,height:1080,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await delay(70);
  const touchRect=await rect(),scrollBefore=await evaluate('scrollY');
  const tp=(x,y)=>({x:touchRect.x+x*touchRect.width,y:touchRect.y+y*touchRect.height,id:8,radiusX:2,radiusY:2,force:1});
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp(.75,.35)]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tp(.85,.45)]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(50);
  await saveNamed('拼接练习');
  await check('composition touch drag updates coordinates without page scroll',`(()=>{const o=JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id==='${ids.compose}').document.objects[0];return o.x>.7&&o.y>.4&&scrollY===${scrollBefore}})()`);
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});
  await navigate('/works/');await until(()=>evaluate(`document.querySelectorAll('[data-work-id]').length===4`),'Saved works rendering');
  await check('real saved cards show four modes, titles and metadata safely',`document.querySelector('#works-count').textContent==='4'&&!document.querySelector('.saved-info b')&&document.querySelector('#works-list').textContent.includes('<b>练习</b>')`);
  await download('library-composition',()=>evaluate(`document.querySelector('[data-work-id="${ids.compose}"] [data-work-action="download"]').click()`));
  await check('library download renders saved composition, not UI',`window.downloaded.width===2048&&window.downloaded.getContext('2d').getImageData(0,0,1,1).data[3]===0`);
  await evaluate(`document.querySelector('#works-filter').value='fold';document.querySelector('#works-filter').dispatchEvent(new Event('change'))`);
  await check('works mode filter',`document.querySelectorAll('[data-work-id]').length===1`);
  await evaluate(`document.querySelector('#works-filter').value='';document.querySelector('#works-filter').dispatchEvent(new Event('change'))`);
  for(const width of [1920,1440,720]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await delay(60);
    await check('works responsive '+width,`document.documentElement.scrollWidth<=innerWidth`);
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(output,'works-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  for(const accept of [false,true]){
    const before=dialogs.length,action=evaluate(`document.querySelector('[data-work-id="${ids.trace}"] [data-work-action="delete"]').click()`);
    await until(()=>dialogs.length>before,'Delete prompt');await call('Page.handleJavaScriptDialog',{accept});await action;
    await check('delete confirmation '+accept,`document.querySelectorAll('[data-work-id]').length===${accept?3:4}`);
  }
  const renameCount=dialogs.length,renameAction=evaluate(`document.querySelector('[data-work-id="${ids.free}"] [data-work-action="rename"]').click()`);
  await until(()=>dialogs.length>renameCount,'Rename prompt');await call('Page.handleJavaScriptDialog',{accept:true,promptText:'自由新名称'});await renameAction;
  await check('works rename updates existing record safely',`JSON.parse(localStorage.getItem('${key}')).works.find(w=>w.id==='${ids.free}').name==='自由新名称'`);
  const backupIndex=downloads.length;await click('backup');await until(()=>downloads.length>backupIndex,'Backup download');
  const backup=downloads[backupIndex];await until(()=>completedDownloads.has(backup.guid),'Backup completion');
  const backupFile=path.join(output,'downloads',backup.guid),backupData=JSON.parse(await fs.readFile(backupFile,'utf8'));
  assert.equal(backupData.version,1);assert.equal(backupData.works.length,3);checks.push('local record backup downloads structured editable JSON');
  await evaluate(`localStorage.setItem('${key}',JSON.stringify({version:1,works:[]}));window.dispatchEvent(new StorageEvent('storage',{key:'${key}'}))`);
  await check('empty state is real and cards disappear',`!document.querySelector('#works-empty').hidden && !document.querySelector('[data-work-id]')`);
  const dom=await call('DOM.getDocument'),node=await call('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#works-import'});
  const importDialogs=dialogs.length;await call('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[backupFile]});
  await until(()=>dialogs.length>importDialogs,'Import confirmation');await call('Page.handleJavaScriptDialog',{accept:true});
  await until(()=>evaluate(`document.querySelectorAll('[data-work-id]').length===3`),'Imported cards');checks.push('confirmed backup import restores three editable records');
  await evaluate(`window.realGet=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw new Error('blocked')};window.dispatchEvent(new StorageEvent('storage',{key:'${key}'}))`);
  await check('blocked storage reports error without breaking page',`document.querySelector('#works-status').textContent.includes('阻止')&&!!document.querySelector('a[href="/modes/"]')`);
  await evaluate(`Storage.prototype.getItem=window.realGet`);
  const validRaw=await evaluate(`localStorage.getItem('${key}')`);
  await evaluate(`localStorage.setItem('${key}','{broken')`);await navigate('/works/');
  await check('corrupt storage reports error, keeps raw record and navigation',`document.querySelector('#works-status').textContent.includes('损坏')&&localStorage.getItem('${key}')==='{broken'&&!!document.querySelector('a[href="/modes/"]')`);
  await evaluate(`localStorage.setItem('${key}',${JSON.stringify(validRaw)})`);await navigate('/workshop/free/?work='+ids.free);
  await evaluate(`window.realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}`);
  const promptCount=dialogs.length,failedSave=click('save');await until(()=>dialogs.length>promptCount,'Quota save prompt');
  await call('Page.handleJavaScriptDialog',{accept:true,promptText:'不能覆盖旧记录'});await failedSave;
  await check('quota failure keeps previous document and informs user',`document.querySelector('#workshop-status').textContent.includes('保存失败')&&localStorage.getItem('${key}')===${JSON.stringify(validRaw)}`);
  await evaluate(`Storage.prototype.setItem=window.realSet`);
  for(const width of [1920,1440,720]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});
    for(const mode of ['trace','compose']){
      await navigate('/workshop/'+mode+'/');
      await check('new mode responsive '+mode+' '+width,`document.documentElement.scrollWidth<=innerWidth`);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(output,mode+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
    }
  }
  layers.controlledFourModes=checks.length;
  // Separate default-rendering integration pass: no context override, real UI,
  // editable restore and actual downloads. Do not compare CPU/GPU live snapshots.
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:renderingOverride.identifier});renderingOverride=null;
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await navigate('/workshop/compose/');
  await check('default rendering: normal context attributes',`String(document.querySelector('#paper-canvas').getContext('2d').getContextAttributes().willReadFrequently)===String(document.createElement('canvas').getContext('2d').getContextAttributes().willReadFrequently)`);
  await evaluate(`document.querySelector('[data-motif="flower"]').click()`);
  await mouseStroke([[.6,.5],[.75,.35]]);await click('larger');await click('rotate-right');
  await evaluate(`document.querySelector('[data-motif="leaf"]').click();document.querySelector('[data-color="#292923"]').click()`);
  const defaultId=await saveNamed('默认渲染恢复验证'),defaultDocument=await savedDocument(defaultId);
  assert.equal(defaultDocument.objects.length,2);assert.equal(defaultDocument.objects[0].rotation,15);
  assert.equal(defaultDocument.objects[0].size,.391);assert.ok(defaultDocument.objects[0].x>.6);
  checks.push('default rendering: real move, scale, rotation and two-element order');
  await download('composition-default-before');await checkCompositionExport();
  const defaultPNG=await evaluate('window.downloadedPNG');
  await navigate('/workshop/compose/?work='+defaultId);
  await assertSavedRoundTrip(defaultId,defaultDocument,'默认渲染恢复验证');
  await download('composition-default-after');await checkCompositionExport();
  await exactPixels('default rendering: before/after downloaded PNG RGBA exactly identical',defaultPNG,await evaluate('window.downloadedPNG'));
  await mouseStroke([[.5,.5],[.55,.6]]);await saveNamed('默认渲染恢复验证');
  const edited=await savedDocument(defaultId);
  assert.deepEqual(edited.objects[0],defaultDocument.objects[0]);
  assert.equal(edited.objects[1].id,defaultDocument.objects[1].id);
  assert.ok(edited.objects[1].x>defaultDocument.objects[1].x&&edited.objects[1].y>defaultDocument.objects[1].y);
  checks.push('default rendering: restored element remains editable without changing its peer');
  layers.defaultComposition=checks.length-layers.controlledFourModes;
  assert.deepEqual(errors,[]);
  outcome='passed';
  console.log(JSON.stringify({browser:browser.product,checks:checks.length,layers,downloads:downloads.length,errors,output},null,2));
} catch(error) {failure={message:error.message,stack:error.stack};throw error;
} finally {if(renderingOverride)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:renderingOverride.identifier});if(originalStorage!==undefined)await evaluate(originalStorage===null?`localStorage.removeItem('${key}')`:`localStorage.setItem('${key}',${JSON.stringify(originalStorage)})`).catch(()=>{});await fs.writeFile(path.join(output,'report.json'),JSON.stringify({outcome,failure,browser,layers,checks,downloads,errors},null,2));socket.close();}
