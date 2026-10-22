import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorks,saveWork,deleteWork,validateDocument,STORAGE_KEY,MAX_STORAGE_CHARACTERS } from '../core/static/core/js/work-store.js';
import { MOTIFS,CATEGORIES,REFERENCES } from '../core/static/core/js/patterns.js';
import { CompositionHistory,containsObject } from '../core/static/core/js/composition-model.js';
const thumb='data:image/png;base64,iVBORw0KGgo=';
const paths=[[{x:.1,y:.1},{x:.3,y:.1},{x:.2,y:.3}]];
const documents=[{mode:'free',color:'#a63127',paths},{mode:'fold',color:'#a63127',paths,foldMode:'quarter',foldState:'editing'},{mode:'trace',color:'#a63127',paths,referenceId:'leaves',completed:false},{mode:'compose',color:'#a63127',objects:[{id:'a',motif:'flower',x:.5,y:.5,size:.34,rotation:15}]}];
function memory(){const data=new Map();return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};}

test('three reference difficulties and twelve independently editable originals in four categories',()=>{
  assert.deepEqual(REFERENCES.map(r=>r.level),['简单','中等','较复杂']);assert.equal(MOTIFS.length,12);
  for(const category of CATEGORIES)assert.equal(MOTIFS.filter(m=>m.category===category).length,3);
});
test('all four documents save, restore, update in place and delete without affecting peers',()=>{
  const storage=memory();
  const saved=documents.map((document,i)=>saveWork({name:'作品 '+i,document,thumbnail:thumb},storage));
  assert.equal(readWorks(storage).length,4);
  for(const item of saved)assert.deepEqual(readWorks(storage).find(w=>w.id===item.id).document,item.document);
  const updated=saveWork({...saved[0],name:'更新'},storage);
  assert.equal(updated.id,saved[0].id);assert.equal(updated.createdAt,saved[0].createdAt);assert.equal(readWorks(storage).length,4);
  deleteWork(saved[1].id,storage);assert.equal(readWorks(storage).length,3);
  assert.throws(()=>saveWork({...saved[1],name:'已删'},storage),/已被删除/);
});
test('corrupt records and incompatible versions are not overwritten',()=>{
  for(const raw of ['bad json',JSON.stringify({version:9,works:[]}),JSON.stringify({version:1,works:[{}]})]){
    const storage=memory();storage.setItem(STORAGE_KEY,raw);
    assert.throws(()=>readWorks(storage));assert.throws(()=>saveWork({name:'new',document:documents[0],thumbnail:thumb},storage));
    assert.equal(storage.getItem(STORAGE_KEY),raw);
  }
});
test('invalid geometry, reference IDs, colours and malicious mode keys rejected',()=>{
  for(const document of [{...documents[0],mode:'__proto__'},{...documents[0],color:'url(x)'},{...documents[0],paths:[[{x:NaN,y:0}]]},{...documents[1],foldMode:'unknown'},{...documents[1],paths:[[{x:.9,y:.1},{x:.8,y:.1},{x:.9,y:.2}]]},{...documents[2],referenceId:'bad'},{...documents[3],objects:[{...documents[3].objects[0],motif:'bad'}]}])assert.throws(()=>validateDocument(document));
});
test('quota and security failures keep previous data, limits are enforced',()=>{
  const storage=memory();saveWork({name:'old',document:documents[0],thumbnail:thumb},storage);
  const before=storage.getItem(STORAGE_KEY);storage.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>saveWork({name:'new',document:documents[0],thumbnail:thumb},storage),/保存失败/);assert.equal(storage.getItem(STORAGE_KEY),before);
  assert.throws(()=>deleteWork(readWorks(storage)[0].id,storage),/删除失败/);assert.equal(storage.getItem(STORAGE_KEY),before);
  assert.throws(()=>readWorks({getItem:()=>{throw new Error('blocked');}}),/阻止/);
  assert.throws(()=>readWorks({getItem:()=>'.'.repeat(MAX_STORAGE_CHARACTERS+1)}),/安全容量/);
  const full=memory();for(let i=0;i<30;i++)saveWork({name:'作品'+i,document:documents[0],thumbnail:thumb},full);
  assert.throws(()=>saveWork({name:'31',document:documents[0],thumbnail:thumb},full),/最多保存/);
});
test('composition operation history preserves individual positions, branching, clear undo',()=>{
  const history=new CompositionHistory(),a=documents[3].objects[0];history.commit([a]);history.commit([{...a,x:.7}]);
  history.undo();assert.equal(history.objects[0].x,.5);history.redo();assert.equal(history.objects[0].x,.7);
  history.clear();assert.equal(history.objects.length,0);history.undo();assert.equal(history.objects[0].x,.7);
  history.undo();history.commit([{...a,rotation:30}]);assert.equal(history.future.length,0);
  assert.equal(containsObject({x:.5,y:.5},a),true);assert.equal(containsObject({x:.01,y:.01},a),false);
});
