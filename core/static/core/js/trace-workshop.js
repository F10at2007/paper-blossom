import { mountWorkshop } from './free-workshop.js';
import { REFERENCES } from './patterns.js';
import { renderPaper,traceCut } from './free-paper.js';

const root=document.querySelector('#trace-workspace');
if(root){
  const requested=new URLSearchParams(location.search).get('reference');
  let referenceId=REFERENCES.some(r=>r.id===requested)?requested:'bloom',completed=false,guideVisible=true;
  const guide=root.querySelector('#trace-guide');
  function drawReferenceGuide(){
    const ctx=guide.getContext('2d'),pixel=guide.width/(guide.getBoundingClientRect().width||guide.width);
    ctx.clearRect(0,0,guide.width,guide.height);
    if(!guideVisible||completed)return;
    ctx.save();ctx.setLineDash([6*pixel,5*pixel]);
    for(const points of reference().paths){
      traceCut(ctx,points,guide.width,guide.height);ctx.lineWidth=3*pixel;ctx.strokeStyle='#292923aa';ctx.stroke();
      ctx.lineWidth=1.3*pixel;ctx.strokeStyle='#fff9e9';ctx.stroke();
    }
    ctx.restore();
  }
  const reference=()=>REFERENCES.find(r=>r.id===referenceId);
  const compare=document.querySelector('#trace-compare');
  function update(){
    drawReferenceGuide();
    root.dispatchEvent(new Event('workchange'));
    root.dataset.phase=completed?'completed':'editing';
    for(const item of root.querySelectorAll('[data-reference]'))item.setAttribute('aria-pressed',String(item.dataset.reference===referenceId));
    root.querySelector('#reference-description').textContent=reference().description;
    renderPaper(root.querySelector('#reference-canvas'),reference().paths,'#a63127');
    root.querySelector('[data-action="complete"]').textContent=completed?'继续临摹 ←':'完成作品 ✓';
    root.querySelector('#drawing-canvas').style.pointerEvents=completed?'none':'';
    root.querySelector('[data-trace-state]').textContent=completed?'已完成 · 可保存或下载':'临摹中 · 按你的节奏来';
  }
  const workshop=mountWorkshop(root,{snapshot:()=>({referenceId,completed}),restore:data=>{referenceId=data.referenceId;completed=data.completed;},onRebuild:update,onClear:()=>{completed=false;},canDraw:()=>!completed});
  function showCompare(){
    renderPaper(document.querySelector('#compare-reference'),reference().paths,'#a63127');
    const data=workshop.snapshot();renderPaper(document.querySelector('#compare-user'),data.paths,data.color);
    if(!compare.open)compare.showModal();
  }
  for(const item of root.querySelectorAll('[data-reference]'))item.addEventListener('click',()=>{
    if(item.dataset.reference===referenceId)return;
    if((workshop.hasCuts()||root.dataset.dirty==='true')&&!window.confirm('更换参考图将开始新的练习并清空当前剪裁。请先保存作品。是否继续？'))return;
    // A new reference uses a fresh page so saved works are never overwritten.
    const url=new URL(location.href);url.search='';url.searchParams.set('reference',item.dataset.reference);workshop.allowNavigation();location.assign(url);
  });
  root.querySelector('[data-action="toggle-reference"]').addEventListener('click',event=>{
    const panel=root.querySelector('#reference-panel');panel.hidden=!panel.hidden;
    event.currentTarget.textContent=panel.hidden?'显示参考图':'隐藏参考图';event.currentTarget.setAttribute('aria-expanded',String(!panel.hidden));
  });
  root.querySelector('[data-action="compare"]').addEventListener('click',()=>{workshop.cancel();showCompare();});
  root.querySelector('[data-action="complete"]').addEventListener('click',()=>{
    workshop.cancel();completed=!completed;update();
    workshop.notify(completed?'临摹已完成，可以对比、保存或下载自己的作品。':'已返回临摹，可继续剪裁。');
    if(completed)showCompare();
  });
  compare.querySelector('[data-action="resume-tracing"]').addEventListener('click',()=>{
    completed=false;update();workshop.notify('已返回临摹，可继续剪裁。');
  });
  root.querySelector('[data-action="toggle-guide"]').addEventListener('click',event=>{
    guideVisible=!guideVisible;event.currentTarget.setAttribute('aria-pressed',String(guideVisible));event.currentTarget.textContent=guideVisible?'隐藏画布虚线':'显示画布虚线';drawReferenceGuide();
  });
  const observer=new ResizeObserver(drawReferenceGuide);observer.observe(guide);
  window.addEventListener('pagehide',event=>{if(!event.persisted)observer.disconnect();});
  update();
}
