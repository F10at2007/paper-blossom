import { PAPER_COLORS } from './free-paper.js';
import { FOLDS,inFold } from './fold-paper.js';
import { MOTIFS,REFERENCES } from './patterns.js';
import { createCompatibleId } from './compatible-id.js';
export const STORAGE_KEY='paper-blooms.works.v1';
export const MAX_STORAGE_CHARACTERS=1500000;
export const MODE_NAMES={fold:'对称之美',free:'自由剪艺',trace:'纹样临摹',compose:'百纹成画'};
const fail=(field)=>{throw new Error(field?`${field}不合法或版本不兼容。原记录未修改，请先检查备份。`:'本地作品数据损坏或版本不兼容。原记录未修改，请先在我的作品中导出备份。');};
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;

export function validateDocument(d,field='作品数据') {
  const bad=(name)=>fail(`${field}的${name}字段`);
  if(!d||typeof d!=='object'||Array.isArray(d))bad('document');
  if(typeof d.mode!=='string'||!Object.hasOwn(MODE_NAMES,d.mode))bad('mode');
  if(typeof d.color!=='string'||!PAPER_COLORS.some(c=>c.value===d.color))bad('color');
  if(d.mode==='compose') {
    if(!Array.isArray(d.objects)||d.objects.length>80)bad('objects');
    const ids=new Set();
    for(let i=0;i<d.objects.length;i++){
      const o=d.objects[i],name=`objects[${i}]`;
      if(!o||typeof o!=='object'||Array.isArray(o))bad(name);
      if(typeof o.id!=='string'||!o.id||ids.has(o.id))bad(`${name}.id`);
      if(typeof o.motif!=='string'||!MOTIFS.some(m=>m.id===o.motif))bad(`${name}.motif`);
      if(!finite(o.x,0,1))bad(`${name}.x`);
      if(!finite(o.y,0,1))bad(`${name}.y`);
      if(!finite(o.size,.08,.8))bad(`${name}.size`);
      if(!finite(o.rotation,0,359))bad(`${name}.rotation`);
      ids.add(o.id);
    }
  }else{
    if(!Array.isArray(d.paths)||d.paths.length>500)bad('paths');
    let count=0;
    for(let i=0;i<d.paths.length;i++){
      const points=d.paths[i];
      if(!Array.isArray(points)||points.length<3)bad(`paths[${i}]`);
      count+=points.length;
      for(let j=0;j<points.length;j++){
        const p=points[j];
        if(!p||typeof p!=='object'||!finite(p.x,0,1))bad(`paths[${i}][${j}].x`);
        if(!finite(p.y,0,1))bad(`paths[${i}][${j}].y`);
      }
    }
    if(count>100000)throw new Error('作品路径过大，暂不支持本地保存；请先下载 PNG。');
    if(d.mode==='fold'){
      if(typeof d.foldMode!=='string'||!Object.hasOwn(FOLDS,d.foldMode))bad('foldMode');
      if(typeof d.foldState!=='string'||!['editing','unfolded'].includes(d.foldState))bad('foldState');
      if(d.paths.some(points=>points.some(p=>!inFold(p,d.foldMode))))bad('paths');
    }
    if(d.mode==='trace'){
      if(typeof d.referenceId!=='string'||!REFERENCES.some(r=>r.id===d.referenceId))bad('referenceId');
      if(typeof d.completed!=='boolean')bad('completed');
    }
  }
  return d;
}

export function readWorks(storage=localStorage) {
  let raw;try{raw=storage.getItem(STORAGE_KEY);}catch{throw new Error('浏览器阻止了本地存储。可以继续创作并下载 PNG。');}
  if(raw===null)return [];
  if(raw.length>MAX_STORAGE_CHARACTERS)throw new Error('作品记录超过安全容量，请先导出备份。');
  let data;try{data=JSON.parse(raw);}catch{fail();}
  if(data?.version!==1||!Array.isArray(data.works)||data.works.length>30)fail();
  const ids=new Set();
  for(let i=0;i<data.works.length;i++){
    const work=data.works[i],label=`第 ${i+1} 幅作品${typeof work?.name==='string'&&work.name.trim()?`「${work.name}」`:''}`;
    if(!work||typeof work!=='object'||Array.isArray(work))fail(`${label}记录`);
    if(typeof work.id!=='string'||!/^[\w-]{1,80}$/.test(work.id)||ids.has(work.id))fail(`${label}id字段`);
    if(typeof work.name!=='string'||!work.name.trim()||work.name.length>50)fail(`${label}name字段`);
    if(!Number.isFinite(Date.parse(work.updatedAt)))fail(`${label}updatedAt字段`);
    if(!Number.isFinite(Date.parse(work.createdAt)))fail(`${label}createdAt字段`);
    if(typeof work.thumbnail!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(work.thumbnail)||work.thumbnail.length>250000)fail(`${label}thumbnail字段`);
    ids.add(work.id);validateDocument(work.document,label);
  }
  return data.works;
}

export const workVersion = work => JSON.stringify(work);

export function saveWork({id,name,document,thumbnail,expectedVersion},storage=localStorage) {
  validateDocument(document);
  name=name.trim();if(!name||name.length>50)throw new Error('作品名称请填写 1–50 个字符。');
  const works=readWorks(storage),existing=id?works.find(w=>w.id===id):null;
  if(id&&!existing)throw new Error('该作品已被删除。当前画布仍保留，请点击另存副本。');
  if(existing&&expectedVersion!==undefined&&workVersion(existing)!==expectedVersion)throw new Error('该作品已在其他页面修改。为避免覆盖，请将当前画布另存副本。');
  if(!existing&&works.length>=30)throw new Error('本地最多保存 30 幅作品，请先备份或删除部分作品。');
  const now=new Date().toISOString();
  const work={id:existing?.id||createCompatibleId(),name,document:structuredClone(document),thumbnail,createdAt:existing?.createdAt||now,updatedAt:now};
  const result=existing?works.map(w=>w.id===id?work:w):[work,...works];
  const raw=JSON.stringify({version:1,works:result});
  readWorks({getItem:()=>raw}); // Validate the new record before any mutation.
  try{storage.setItem(STORAGE_KEY,raw);}catch{throw new Error('保存失败：本地存储空间不足或被禁用。旧记录未改动，请下载 PNG 或备份作品后再试。');}
  return work;
}

export function deleteWork(id,storage=localStorage) {
  const works=readWorks(storage);
  try{storage.setItem(STORAGE_KEY,JSON.stringify({version:1,works:works.filter(w=>w.id!==id)}));}catch{throw new Error('删除失败：无法写入本地存储，原记录仍保留。');}
}
