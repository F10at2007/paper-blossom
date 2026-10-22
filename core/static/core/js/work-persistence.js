import { readWorks,saveWork } from './work-store.js';
import { renderDocument } from './work-document.js';

/** Shared manual persistence for all four modes. No automatic writes. */
export function attachPersistence({root,snapshot,restore,notify,signal}) {
  let id=null,name='';
  const title=root.querySelector('[data-work-name]');
  const requested=new URLSearchParams(location.search).get('work');
  if(requested){
    try{
      const work=readWorks().find(w=>w.id===requested);
      if(!work)throw new Error('未找到这幅本地作品，可能已被删除。当前为新画布。');
      if(work.document.mode!==root.dataset.mode)throw new Error('作品与当前模式不匹配，请从我的作品进入。');
      restore(structuredClone(work.document));id=work.id;name=work.name;
      if(title)title.textContent=name;
      notify(`已恢复「${name}」，可继续编辑并保存。`);
    }catch(error){notify(error.message);const url=new URL(location.href);url.searchParams.delete('work');history.replaceState(null,'',url);}
  }
  root.querySelector('[data-action="save"]').addEventListener('click',()=>{
    const answer=window.prompt(id?'保存修改，作品名称：':'给这份心意起个名字（1–50 字）：',name||'我的纸上心意');
    if(answer===null)return;
    try{
      const data=snapshot(),canvas=document.createElement('canvas');canvas.width=canvas.height=160;
      renderDocument(canvas,data);
      const work=saveWork({id,name:answer,document:data,thumbnail:canvas.toDataURL('image/png')});
      id=work.id;name=work.name;
      if(title)title.textContent=name;
      const url=new URL(location.href);url.searchParams.set('work',id);history.replaceState(null,'',url);
      notify(`「${name}」已保存到当前浏览器。可在“我的作品”继续编辑。`);
    }catch(error){notify(error.message);}
  },{signal});
}
