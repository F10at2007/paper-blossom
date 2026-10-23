import { objectBox,inObjectBox,cornerAt,scaleFromCorner } from './composition-box.js';
import { MOTIFS } from './patterns.js';
import { PAPER_COLORS,traceCut } from './free-paper.js';
import { CompositionHistory,renderComposition } from './composition-model.js';
import { createPaperDownloader } from './paper-download.js';
import { attachPersistence } from './work-persistence.js';

const root=document.querySelector('#compose-workspace');
if(root){
  const model=new CompositionHistory(),paper=root.querySelector('#paper-canvas'),input=root.querySelector('#drawing-canvas'),ctx=input.getContext('2d'),downloader=createPaperDownloader(),listeners=new AbortController();
  const button=a=>root.querySelector(`[data-action="${a}"]`),notify=text=>root.querySelector('#workshop-status').textContent=text;
  let selected=null,color=PAPER_COLORS[0].value,drag=null,exporting=false;
  const current=()=>model.objects.find(o=>o.id===selected);
  const on=(target,event,handler,options={})=>target.addEventListener(event,handler,{...options,signal:listeners.signal});
  function redraw(){
    renderComposition(paper,model.objects,color);ctx.clearRect(0,0,1024,1024);
    const object=current();
    if(object){
      const {corners}=objectBox(object),pixel=1024/input.getBoundingClientRect().width;
      ctx.save();traceCut(ctx,corners,1024,1024);
      ctx.lineWidth=3*pixel;ctx.strokeStyle='#fff9e9';ctx.stroke();
      ctx.lineWidth=1.2*pixel;ctx.strokeStyle='#51463c';ctx.stroke();
      for(const p of corners){ctx.fillStyle='#fff9e9';ctx.strokeStyle='#a63127';ctx.lineWidth=1.3*pixel;ctx.beginPath();ctx.rect(p.x*1024-4*pixel,p.y*1024-4*pixel,8*pixel,8*pixel);ctx.fill();ctx.stroke();}
      ctx.restore();
      root.querySelector('#selected-name').textContent=MOTIFS.find(m=>m.id===object.motif).name;
      root.querySelector('#object-settings').textContent=`大小 ${Math.round(object.size*100)}% · 旋转 ${object.rotation}°`;
    }else{selected=null;root.querySelector('#selected-name').textContent='未选中';root.querySelector('#object-settings').textContent='框内拖动，四角等比缩放；点击空白取消选择。';}
    for(const action of ['smaller','larger','rotate-left','rotate-right','duplicate','delete','deselect'])button(action).disabled=!object||!!drag;
    button('smaller').disabled=!object||!!drag||object.size<=.08;
    button('larger').disabled=!object||!!drag||object.size>=.8;
    button('undo').disabled=!!drag||!model.past.length;button('redo').disabled=!!drag||!model.future.length;button('clear').disabled=!!drag||!model.objects.length;
    button('download').disabled=!!drag||exporting||!model.objects.length;button('save').disabled=!!drag;button('preview').disabled=!!drag||!model.objects.length;
    if(!drag)root.dispatchEvent(new Event('workchange'));
    root.querySelector('#object-count').textContent=`${model.objects.length} / 80 个元素`;
  }
  const point=e=>{const r=input.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
  function add(motif){
    if(drag)return;
    if(model.objects.length>=80){notify('每幅作品最多 80 个元素，请先删除部分纹样。');return;}
    const object={id:crypto.randomUUID(),motif,x:.5,y:.5,size:.34,rotation:0};selected=object.id;model.commit([...model.objects,object]);redraw();notify('已添加纹样。拖动矩形框内部移动，拖动四角等比缩放。');
  }
  function library(category){
    const container=root.querySelector('#motif-library');container.replaceChildren();
    for(const motif of MOTIFS.filter(m=>m.category===category)){
      const item=document.createElement('button');item.type='button';item.dataset.motif=motif.id;item.setAttribute('aria-label',`添加${motif.name}`);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=100;canvas.setAttribute('aria-hidden','true');
      renderComposition(canvas,[{motif:motif.id,x:.5,y:.5,size:1,rotation:0}],PAPER_COLORS[0].value);
      const name=document.createElement('span');name.textContent=motif.name;item.append(canvas,name);item.addEventListener('click',()=>add(motif.id));container.append(item);
    }
    for(const tab of root.querySelectorAll('[data-category]'))tab.setAttribute('aria-pressed',String(tab.dataset.category===category));
  }
  for(const tab of root.querySelectorAll('[data-category]'))on(tab,'click',()=>library(tab.dataset.category));
  function finish(commit){
    if(!drag)return;const ended=drag,after=structuredClone(model.objects);drag=null;
    if(input.hasPointerCapture(ended.pointer))input.releasePointerCapture(ended.pointer);
    model.objects=ended.original;
    if(commit&&JSON.stringify(after)!==JSON.stringify(ended.original))model.commit(after);
    redraw();
  }
  function movePointer(e){
    const p=point(e),object=current();
    if(drag.kind==='scale')object.size=scaleFromCorner(drag.object,drag.corner,drag.start,p);
    else {object.x=Math.max(0,Math.min(1,drag.object.x+p.x-drag.start.x));object.y=Math.max(0,Math.min(1,drag.object.y+p.y-drag.start.y));}
    redraw();
  }
  on(input,'pointerdown',e=>{
    if(drag||!e.isPrimary||e.button!==0)return;e.preventDefault();
    const p=point(e),tolerance=(e.pointerType==='touch'?18:11)/input.getBoundingClientRect().width;
    const corner=current()?cornerAt(p,current(),tolerance):-1;
    const object=corner>=0?current():[...model.objects].reverse().find(o=>inObjectBox(p,o));selected=object?.id||null;
    if(object){drag={pointer:e.pointerId,kind:corner>=0?'scale':'move',corner,start:p,original:structuredClone(model.objects),object:{...object}};input.setPointerCapture(e.pointerId);notify(corner>=0?'正在等比缩放；松手确定大小。':'正在移动；松手确定位置。');}
    redraw();
  },{passive:false});
  on(input,'pointermove',e=>{
    if(!drag){const p=point(e);input.style.cursor=current()&&cornerAt(p,current(),11/input.getBoundingClientRect().width)>=0?'nwse-resize':[...model.objects].reverse().some(o=>inObjectBox(p,o))?'grab':'default';return;}
    if(e.pointerId!==drag.pointer)return;e.preventDefault();
    if(e.pointerType==='mouse'&&!(e.buttons&1)){finish(false);return;}
    movePointer(e);
  },{passive:false});
  on(input,'pointerup',e=>{if(drag&&e.pointerId===drag.pointer){e.preventDefault();movePointer(e);finish(true);}},{passive:false});
  on(input,'pointercancel',()=>finish(false));on(input,'lostpointercapture',()=>finish(false));on(window,'blur',()=>finish(false));
  on(document,'visibilitychange',()=>{if(document.hidden)finish(false);});
  on(window,'keydown',e=>{if(e.key==='Escape'){finish(false);selected=null;redraw();}});
  function modify(change){const objects=structuredClone(model.objects),object=objects.find(o=>o.id===selected);if(!object)return;change(object);model.commit(objects);redraw();}
  on(button('smaller'),'click',()=>modify(o=>o.size=Math.max(.08,o.size/1.15)));
  on(button('larger'),'click',()=>modify(o=>o.size=Math.min(.8,o.size*1.15)));
  on(button('rotate-left'),'click',()=>modify(o=>o.rotation=(o.rotation+345)%360));
  on(button('rotate-right'),'click',()=>modify(o=>o.rotation=(o.rotation+15)%360));
  on(button('delete'),'click',()=>{model.commit(model.objects.filter(o=>o.id!==selected));selected=null;redraw();notify('已删除选中元素，可撤销恢复。');});
  on(button('deselect'),'click',()=>{selected=null;redraw();});
  on(button('duplicate'),'click',()=>{if(model.objects.length>=80){notify('每幅作品最多 80 个元素。');return;}const o={...current(),id:crypto.randomUUID(),x:Math.min(.95,current().x+.04),y:Math.min(.95,current().y+.04)};selected=o.id;model.commit([...model.objects,o]);redraw();});
  on(button('undo'),'click',()=>{model.undo();redraw();});on(button('redo'),'click',()=>{model.redo();redraw();});
  on(button('clear'),'click',()=>{if(window.confirm('清空全部拼接元素？可以撤销恢复。')){model.clear();selected=null;redraw();}});
  for(const swatch of root.querySelectorAll('[data-color]'))on(swatch,'click',()=>{color=swatch.dataset.color;for(const item of root.querySelectorAll('[data-color]'))item.setAttribute('aria-pressed',String(item===swatch));root.querySelector('#paper-color-name').textContent=swatch.getAttribute('aria-label');redraw();});
  on(button('preview'),'click',()=>{renderComposition(document.querySelector('#compose-preview-canvas'),model.objects,color);document.querySelector('#compose-preview').showModal();});
  on(button('download'),'click',async()=>{
    exporting=true;redraw();try{await downloader.download([],color,'一纸生花_百纹成画.png',null,c=>renderComposition(c,model.objects,color));notify('PNG 已生成并交给浏览器下载，不包含选框。');}catch(error){notify(`下载失败：${error.message}`);}finally{exporting=false;redraw();}
  });
  library('花卉');redraw();
  attachPersistence({root,snapshot:()=>({mode:'compose',color,objects:structuredClone(model.objects)}),notify,signal:listeners.signal,restore:data=>{model.objects=data.objects;model.past=[];model.future=[];color=data.color;selected=null;for(const item of root.querySelectorAll('[data-color]'))item.setAttribute('aria-pressed',String(item.dataset.color===color));root.querySelector('#paper-color-name').textContent=PAPER_COLORS.find(c=>c.value===color).name;redraw();}});
  const observer=new ResizeObserver(()=>{finish(false);redraw();});observer.observe(input);
  on(window,'pagehide',e=>{finish(false);downloader.release();if(!e.persisted){observer.disconnect();listeners.abort();}});
}
