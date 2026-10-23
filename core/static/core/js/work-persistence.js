import { readWorks,saveWork,workVersion,STORAGE_KEY } from './work-store.js';
import { renderDocument } from './work-document.js';
import { attachWorkshopControls } from './workshop-controls.js';

/** Manual saves, optimistic conflict checks and navigation protection. */
export function attachPersistence({root,snapshot,restore,notify,signal}) {
  let id=null,name='',version,baseline,dirty=false,leaving=false;
  const title=root.querySelector('[data-work-name]');
  const on=(target,event,handler)=>target.addEventListener(event,handler,{signal});
  const beforeUnload=event=>{if(dirty&&!leaving&&navigator.userActivation?.hasBeenActive!==false){event.preventDefault();event.returnValue='';}};
  const allowNavigation=()=>{leaving=true;window.removeEventListener('beforeunload',beforeUnload);};
  function refresh(){
    if(baseline===undefined)return;
    const next=JSON.stringify(snapshot())!==baseline;
    if(next!==dirty){dirty=next;window.removeEventListener('beforeunload',beforeUnload);if(dirty&&!leaving)window.addEventListener('beforeunload',beforeUnload);}
    root.dataset.dirty=String(dirty);
    if(title)title.textContent=(name||'未命名作品')+(dirty?' · 有未保存修改':id?' · 已保存':' · 未保存');
    const save=root.querySelector('[data-action="save"]');
    root.querySelector('[data-action="save-copy"]').disabled=save.disabled;
  }
  const requested=new URLSearchParams(location.search).get('work');
  if(requested){
    try{
      const work=readWorks().find(w=>w.id===requested);
      if(!work)throw new Error('未找到这幅本地作品，可能已被删除。当前为新画布。');
      if(work.document.mode!==root.dataset.mode)throw new Error('作品与当前模式不匹配，请从我的作品进入。');
      restore(structuredClone(work.document));id=work.id;name=work.name;version=workVersion(work);
      notify(`已恢复「${name}」，可继续编辑并保存。`);
    }catch(error){notify(error.message);const url=new URL(location.href);url.searchParams.delete('work');history.replaceState(null,'',url);}
  }
  baseline=JSON.stringify(snapshot());
  const saveButton=root.querySelector('[data-action="save"]');
  const copy=document.createElement('button');copy.type='button';copy.className='button secondary full';copy.dataset.action='save-copy';copy.textContent='另存副本 ＋';saveButton.after(copy);
  function save(asCopy){
    if(saveButton.disabled)return;
    const answer=window.prompt(asCopy?'另存副本，原作品保持不变：':id?'保存修改，作品名称：':'给这份心意起个名字（1–50 字）：',asCopy?(name||'我的纸上心意')+' 副本':name||'我的纸上心意');
    if(answer===null)return;
    try{
      const data=snapshot(),canvas=document.createElement('canvas');canvas.width=canvas.height=160;
      renderDocument(canvas,data);
      const work=saveWork({id:asCopy?null:id,name:answer,document:data,thumbnail:canvas.toDataURL('image/png'),expectedVersion:asCopy?undefined:version});
      id=work.id;name=work.name;version=workVersion(work);baseline=JSON.stringify(data);
      const url=new URL(location.href);url.searchParams.set('work',id);history.replaceState(null,'',url);
      refresh();notify(`「${name}」已保存到当前浏览器。可在“我的作品”继续编辑。`);
    }catch(error){notify(error.message);}
  }
  on(saveButton,'click',()=>save(false));on(copy,'click',()=>save(true));
  on(root,'workchange',refresh);
  // Pointer lifecycle can disable save without changing the document.
  const observer=new MutationObserver(()=>{copy.disabled=saveButton.disabled;});
  observer.observe(saveButton,{attributes:true,attributeFilter:['disabled']});
  on(document,'click',event=>{
    const link=event.target.closest('a[href]');
    if(!dirty||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!link||link.target==='_blank'||link.hasAttribute('download'))return;
    const target=new URL(link.href,location.href);
    if(target.origin===location.origin&&target.pathname===location.pathname&&target.search===location.search&&target.hash)return;
    if(!window.confirm('当前作品有未保存修改。离开后可能丢失，确定离开？')){event.preventDefault();return;}
    allowNavigation();
  });
  on(window,'storage',event=>{
    if(!id||(event.key!==STORAGE_KEY&&event.key!==null))return;
    try{const latest=readWorks().find(w=>w.id===id);if(!latest||workVersion(latest)!==version)notify('此作品的本地记录已在其他页面更改或删除。当前画布仍保留，请另存副本以免覆盖。');}catch(error){notify(error.message);}
  });
  on(window,'pageshow',()=>{leaving=false;window.removeEventListener('beforeunload',beforeUnload);if(dirty)window.addEventListener('beforeunload',beforeUnload);});
  on(window,'pagehide',event=>{if(!event.persisted){observer.disconnect();window.removeEventListener('beforeunload',beforeUnload);}});
  signal?.addEventListener('abort',()=>{observer.disconnect();window.removeEventListener('beforeunload',beforeUnload);},{once:true});
  attachWorkshopControls(root,signal);refresh();
  return {allowNavigation};
}
