import { MOTIFS,objectPoint } from './patterns.js';
import { traceCut } from './free-paper.js';

export class CompositionHistory {
  objects=[];past=[];future=[];
  commit(objects){this.past.push(structuredClone(this.objects));this.objects=structuredClone(objects);this.future=[];}
  undo(){if(this.past.length){this.future.push(this.objects);this.objects=this.past.pop();}}
  redo(){if(this.future.length){this.past.push(this.objects);this.objects=this.future.pop();}}
  clear(){if(this.objects.length)this.commit([]);}
}

export function containsObject(point,object) {
  const motif=MOTIFS.find(m=>m.id===object.motif),outline=motif.outline.map(p=>objectPoint(p,object));
  let inside=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const a=outline[i],b=outline[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

export function renderComposition(canvas,objects,color) {
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.fillStyle=color;
  for(const object of objects) {
    const motif=MOTIFS.find(m=>m.id===object.motif);if(!motif)continue;
    ctx.beginPath();
    for(const contour of [motif.outline,...motif.holes])traceCut(ctx,contour.map(p=>objectPoint(p,object)),canvas.width,canvas.height,false);
    // Fill one pierced piece in one pass. Its holes do not erase earlier pieces.
    ctx.fill('evenodd');
  }
  ctx.restore();
}
