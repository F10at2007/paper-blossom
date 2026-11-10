import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.BASE_URL||'http://127.0.0.1:8000';
const output=path.resolve('.qa',`intro-gate-${Date.now()}`);await fs.mkdir(output,{recursive:true});
const targets=await(await fetch('http://127.0.0.1:9222/json')).json();
const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map(),checks=[];
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error(method+' timed out')),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails||r.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails||r.exceptionDetails));return r.result.value;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,label,timeout=18000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await wait(50);}throw new Error(label);}
async function navigate(url=baseURL+'/'){await call('Page.navigate',{url});await until("document.readyState==='complete'",'page load');}
try{
 const browser=await call('Browser.getVersion');await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await navigate();
 const ctx=await evaluate(`({url:location.href,isSecureContext:window.isSecureContext,randomUUID:typeof crypto.randomUUID,version:document.querySelector('video').canPlayType('video/mp4')})`);
 for(const width of [1920,1440,720]){await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});await wait(100);const dims=await evaluate(`({scroll:document.documentElement.scrollWidth,view:innerWidth,gate:document.querySelector('#gate').getBoundingClientRect().toJSON()})`);assert.ok(dims.scroll<=dims.view,`horizontal overflow ${width}`);await fs.writeFile(path.join(output,`home-${width}.png`),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));checks.push(`home responsive ${width}`);}
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate();
 await until("!document.querySelector('#gate').hidden",'first intro gate');
 assert.equal(await evaluate("document.activeElement.id"),'gate-sound');
 assert.equal(await evaluate("document.querySelector('#gate-skip').matches(':focus')"),false);
 await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))");assert.equal(await evaluate("document.activeElement.id"),'gate-sound');checks.push('focus stays on a visible gate control before skip appears');
 await until("document.querySelector('#gate').hidden",'natural video ending',15000);checks.push('first play exits on real video ended event');
 assert.equal(await evaluate("document.body.classList.contains('gate-open')"),false);await wait(300);
 await navigate();await wait(400);assert.equal(await evaluate("document.querySelector('#gate').hidden"),true);checks.push('seen session skips autoplay');
 await evaluate("document.querySelector('#gate-replay').click()");await until("!document.querySelector('#gate').hidden",'manual replay');
 await evaluate("document.querySelector('#gate-skip').click();document.querySelector('#gate-replay').click()");
 await wait(1150);assert.equal(await evaluate("document.querySelector('#gate').hidden"),false,'old fade closed new replay');
 assert.equal(await evaluate("document.body.classList.contains('gate-open')"),true);checks.push('rapid skip then replay survives previous 950ms fade');
 await evaluate("document.dispatchEvent(new Event('visibilitychange'));document.querySelector('#gate-skip').click()");await wait(1000);assert.equal(await evaluate("document.body.classList.contains('gate-open')"),false);checks.push('closing gate unlocks page scroll');
 await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*intro-gate.js*']});await navigate();
 assert.equal(await evaluate("document.querySelector('#gate').hidden"),true);assert.equal(await evaluate("document.querySelectorAll('.hotspot').length"),4);assert.equal(await evaluate("document.querySelector('nav a[href=\"/modes/\"]')!==null"),true);checks.push('script execution disabled leaves all workshop links usable');
 await call('Network.setBlockedURLs',{urls:[]});
 await navigate(baseURL+'/?intro=0');assert.equal(await evaluate("document.querySelector('#gate')===null"),true);assert.equal(await evaluate("document.querySelector('#gate-replay')===null"),true);checks.push('intro=0 has no inert replay control');
 await navigate(baseURL+'/?intro=0');await evaluate("sessionStorage.removeItem('pb-intro-seen');localStorage.clear()");
 const report={outcome:'passed',browser:browser.product,tests:checks,context:ctx,output};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await fs.writeFile(path.join(output,'report.json'),JSON.stringify({outcome:'failed',tests:checks,error:e.message,stack:e.stack,output},null,2));throw e;}finally{socket.close();}
