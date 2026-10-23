import test from 'node:test';
import assert from 'node:assert/strict';
import {objectBox,inObjectBox,cornerAt,scaleFromCorner} from '../core/static/core/js/composition-box.js';
import {MOTIFS,objectPoint} from '../core/static/core/js/patterns.js';
test('tight rotated bounds enclose every motif vertex, including transparent centres',()=>{
 for(const motif of MOTIFS)for(const rotation of [0,15,90,225]){
  const o={motif:motif.id,x:.4,y:.6,size:.34,rotation},b=objectBox(o);
  for(const p of motif.outline)assert.ok(inObjectBox(objectPoint(p,o),o));
  b.corners.forEach((p,i)=>assert.equal(cornerAt(p,o,.01),i));
  assert.equal(inObjectBox({x:-1,y:-1},o),false);
 }
 assert.ok(inObjectBox({x:.5,y:.5},{motif:'circle',x:.5,y:.5,size:.34,rotation:45}));
});
test('all corners scale uniformly about original centre, with limits and finite results',()=>{
 for(const rotation of [0,30,90,225]){
  const o={motif:'leaf',x:.4,y:.6,size:.34,rotation};
  objectBox(o).corners.forEach((p,i)=>{
   const target={x:o.x+(p.x-o.x)*1.5,y:o.y+(p.y-o.y)*1.5};
   assert.ok(Math.abs(scaleFromCorner(o,i,p,target)-.51)<1e-12);
   assert.equal(scaleFromCorner(o,i,p,{x:o.x,y:o.y}),.08);
   assert.equal(scaleFromCorner(o,i,p,{x:NaN,y:0}),o.size);
  });
 }
});
