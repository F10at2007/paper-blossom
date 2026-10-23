import { MOTIFS,objectPoint } from './patterns.js';

// A tight local rectangle, transformed with the same similarity as the paper.
export function objectBox(object){
  const points=MOTIFS.find(m=>m.id===object.motif).outline;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const local=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
  return {left,right,top,bottom,corners:local.map(p=>objectPoint(p,object))};
}
export function inObjectBox(point,object){
  const a=object.rotation*Math.PI/180,dx=point.x-object.x,dy=point.y-object.y;
  const x=(dx*Math.cos(a)+dy*Math.sin(a))/object.size+.5,y=(-dx*Math.sin(a)+dy*Math.cos(a))/object.size+.5;
  const b=objectBox(object);
  return x>=b.left-1e-9&&x<=b.right+1e-9&&y>=b.top-1e-9&&y<=b.bottom+1e-9;
}
export function cornerAt(point,object,tolerance){
  const corners=objectBox(object).corners;
  const radius=Math.min(tolerance,Math.min(...corners.map(p=>Math.hypot(p.x-object.x,p.y-object.y)))*.65);
  let nearest=-1,distance=radius;
  corners.forEach((p,i)=>{const d=Math.hypot(p.x-point.x,p.y-point.y);if(d<=distance){distance=d;nearest=i;}});
  return nearest;
}
export function scaleFromCorner(object,corner,start,point){
  const c=objectBox(object).corners[corner],dx=c.x-object.x,dy=c.y-object.y;
  const length=dx*dx+dy*dy;
  const factor=1+((point.x-start.x)*dx+(point.y-start.y)*dy)/length;
  return Number.isFinite(factor)?Math.max(.08,Math.min(.8,object.size*factor)):object.size;
}
