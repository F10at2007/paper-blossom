import { readWorks,deleteWork,saveWork,STORAGE_KEY,MODE_NAMES,MAX_STORAGE_CHARACTERS,workVersion } from './work-store.js';
import { renderDocument } from './work-document.js';
import { createPaperDownloader } from './paper-download.js';

const root=document.querySelector('#works-manager');
if(root){
  const list=root.querySelector('#works-list'),empty=root.querySelector('#works-empty'),status=root.querySelector('#works-status'),filter=root.querySelector('#works-filter'),downloader=createPaperDownloader();
  const notify=text=>status.textContent=text;
  const text=(tag,content,className)=>{const el=document.createElement(tag);el.textContent=content;if(className)el.className=className;return el;};
  function render(){
    list.replaceChildren();empty.hidden=true;
    try{
      const all=readWorks().sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
      root.querySelector('#works-count').textContent=all.length;
      const works=all.filter(w=>!filter.value||w.document.mode===filter.value);
      empty.hidden=!!works.length;
      root.querySelector('#empty-title').textContent=all.length?'这个模式还没有作品':'第一朵花，等你来剪';
      root.querySelector('#empty-description').textContent=all.length?'试试切换筛选，或开始一份新创作。':'创作后点击“保存作品”，这里就会收好你的心意。';
      for(const work of works){
        const card=document.createElement('article');card.className='saved-work';card.dataset.workId=work.id;
        const image=document.createElement('img');image.src=work.thumbnail;image.alt=work.name+'的作品缩略图';image.width=image.height=160;image.loading='lazy';
        const cover=document.createElement('div');cover.className='saved-thumbnail checkerboard';cover.append(image);
        const info=document.createElement('div');info.className='saved-info';
        info.append(text('p',MODE_NAMES[work.document.mode],'eyebrow'),text('h2',work.name),text('p','修改于 '+new Date(work.updatedAt).toLocaleString('zh-CN',{hour12:false}),'saved-time'));
        const actions=document.createElement('div');actions.className='saved-actions';
        const edit=document.createElement('a');edit.href=`/workshop/${work.document.mode}/?work=${encodeURIComponent(work.id)}`;edit.textContent='继续编辑';actions.append(edit);
        for(const [action,label] of [['download','下载 PNG'],['rename','重命名'],['delete','删除']]){
          const button=text('button',label);button.type='button';button.dataset.workAction=action;
          button.addEventListener('click',async()=>{
            button.disabled=true;
            try{
              const current=readWorks().find(w=>w.id===work.id);if(!current)throw new Error('作品已被删除，请刷新列表。');
              if(action==='download'){
                await downloader.download([],current.document.color,`${current.name.replace(/[\\/:*?"<>|]/g,'_')}.png`,null,c=>renderDocument(c,current.document));
                notify('PNG 已生成并交给浏览器下载。');
              }else if(action==='delete'){
                if(!window.confirm(`删除「${current.name}」？本地记录删除后无法直接撤销，请先下载或备份。`))return;
                deleteWork(current.id);render();notify('作品已删除。');
              }else{
                const answer=window.prompt('新的作品名称（1–50 字）：',current.name);if(answer===null)return;
                saveWork({id:current.id,name:answer,document:current.document,thumbnail:current.thumbnail,expectedVersion:workVersion(current)});render();notify('名称已更新。');
              }
            }catch(error){notify(error.message);}finally{button.disabled=false;}
          });actions.append(button);
        }
        info.append(actions);card.append(cover,info);list.append(card);
      }
    }catch(error){root.querySelector('#works-count').textContent='—';notify(error.message+' 可导出原始备份，或返回工坊继续创作。');}
  }
  filter.addEventListener('change',render);
  root.querySelector('[data-action="backup"]').addEventListener('click',()=>{
    try{const raw=localStorage.getItem(STORAGE_KEY)||JSON.stringify({version:1,works:[]});downloader.file(new Blob([raw],{type:'application/json'}),'一纸生花_作品备份.json');notify('已导出本地原始记录备份。');}catch{notify('备份失败：浏览器无法读取本地记录。');}
  });
  const input=root.querySelector('#works-import');
  root.querySelector('[data-action="import"]').addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    try{
      const file=input.files[0];if(!file)return;
      if(file.size>MAX_STORAGE_CHARACTERS*4)throw new Error('备份文件过大，请检查文件是否正确。');
      const raw=await file.text();const works=readWorks({getItem:()=>raw});
      if(!window.confirm(`导入 ${works.length} 幅作品并替换当前本地记录？请先备份现有作品。`))return;
      try{localStorage.setItem(STORAGE_KEY,raw);}catch{throw new Error('导入失败：存储空间不足或被禁用，旧记录未改动。');}
      render();notify('备份已恢复，可继续编辑。');
    }catch(error){notify(error.message);}finally{input.value='';}
  });
  window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY||e.key===null)render();});
  window.addEventListener('pagehide',()=>downloader.release());
  render();
}
