import { PAPER_COLORS } from './free-paper.js';
import { FOLDS,inFold } from './fold-paper.js';
import { MOTIFS,REFERENCES } from './patterns.js';
export const STORAGE_KEY='paper-blooms.works.v1';
export const MAX_STORAGE_CHARACTERS=1500000;
export const MODE_NAMES={fold:'对称之美',free:'自由剪艺',trace:'纹样临摹',compose:'百纹成画'};
const fail=()=>{throw new Error('本地作品数据损坏或版本不兼容。原记录未修改，请先在我的作品中导出备份。');};
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;

export function validateDocument(d) {
  if(!d||!Object.hasOwn(MODE_NAMES,d.mode)||!PAPER_COLORS.some(c=>c.value===d.color))fail();
  if(d.mode==='compose') {
    if(!Array.isArray(d.objects)||d.objects.length>80)fail();
    const ids=new Set();
    for(const o of d.objects){if(!o||typeof o.id!=='string'||ids.has(o.id)||!MOTIFS.some(m=>m.id===o.motif)||!finite(o.x,0,1)||!finite(o.y,0,1)||!finite(o.size,.08,.8)||!finite(o.rotation,0,359))fail();ids.add(o.id);}
  }else{
    if(!Array.isArray(d.paths)||d.paths.length>500)fail();
    let count=0;
    for(const points of d.paths){if(!Array.isArray(points)||points.length<3)fail();count+=points.length;for(const p of points)if(!p||!finite(p.x,0,1)||!finite(p.y,0,1))fail();}
    if(count>100000)throw new Error('作品路径过大，暂不支持本地保存；请先下载 PNG。');
    if(d.mode==='fold'&&(!Object.hasOwn(FOLDS,d.foldMode)||!['editing','unfolded'].includes(d.foldState)||d.paths.some(points=>points.some(p=>!inFold(p,d.foldMode)))))fail();
    if(d.mode==='trace'&&(!REFERENCES.some(r=>r.id===d.referenceId)||typeof d.completed!=='boolean'))fail();
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
  for(const work of data.works){
    if(!work||typeof work.id!=='string'||!/^[\w-]{1,80}$/.test(work.id)||ids.has(work.id)||typeof work.name!=='string'||!work.name.trim()||work.name.length>50||!Number.isFinite(Date.parse(work.updatedAt))||!Number.isFinite(Date.parse(work.createdAt))||typeof work.thumbnail!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(work.thumbnail)||work.thumbnail.length>250000)fail();
    ids.add(work.id);validateDocument(work.document);
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
  const work={id:existing?.id||crypto.randomUUID(),name,document:structuredClone(document),thumbnail,createdAt:existing?.createdAt||now,updatedAt:now};
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
