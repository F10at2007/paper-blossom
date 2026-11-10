import { CutHistory } from './free-paper.js';

// Coordinates follow the existing unit square: x right, y down, centre (.5,.5).
// Matrices [a,b,c,d,e,f] map x'=a*x+c*y+e, y'=b*x+d*y+f.
const I = [1, 0, 0, 1, 0, 0];
const X = [-1, 0, 0, 1, 1, 0];
const Y = [1, 0, 0, -1, 0, 1];
const XY = [-1, 0, 0, -1, 1, 1];
const D4 = [I, X, Y, XY, [0, 1, 1, 0, 0, 0], [0, 1, -1, 0, 1, 0], [0, -1, 1, 0, 0, 1], [0, -1, -1, 0, 1, 1]];
const rectangle = (w, h) => [{ x:0,y:0 },{ x:w,y:0 },{ x:w,y:h },{ x:0,y:h }];

// Shared polygonal circle: the same vertices bound the sheet and folded sector.
// At 2048px the 360-sided approximation differs from a circle by < .04px.
const circlePoint = degree => ({x:.5+.5*Math.cos(degree*Math.PI/180),y:.5+.5*Math.sin(degree*Math.PI/180)});
const ROUND_SHEET = Array.from({length:360},(_,i)=>circlePoint(i));
function radialFold(order, name) {
  const angle=180/order;
  const region=[{x:.5,y:.5},...Array.from({length:angle+1},(_,i)=>circlePoint(i))];
  const transforms=[];
  for(let k=0;k<order;k++) {
    const t=2*Math.PI*k/order, cos=Math.cos(t), sin=Math.sin(t);
    for(const mirror of [1,-1]) {
      const a=cos,b=sin,c=-sin*mirror,d=cos*mirror;
      transforms.push([a,b,c,d,.5-.5*(a+c),.5-.5*(b+d)]);
    }
  }
  return {name,order,angle,copies:2*order,region,transforms,sheet:ROUND_SHEET,
    hint:`${angle}° 扇区已居中，可从纸外起笔。松手剪去相交部分，点击展开查看${order===3?'三':'六'}向镜像团花。圆形外缘为几何化纸张边界。`};
}

export const FOLDS = Object.freeze({
  vertical: { name:'垂直对折', copies:2, region:rectangle(.5,1), transforms:[I,X], hint:'右半向左折，纸片已居中。可从纸外起笔，展开后形成左右镜像。' },
  horizontal: { name:'水平对折', copies:2, region:rectangle(1,.5), transforms:[I,Y], hint:'下半向上折，纸片已居中。可从纸外起笔，展开后形成上下镜像。' },
  quarter: { name:'四折', copies:4, region:rectangle(.5,.5), transforms:[I,X,Y,XY], hint:'两次对折后的纸片已居中。可从纸外起笔，展开后形成四个对应区域。' },
  eighth: { name:'八折', copies:8, region:[{x:0,y:0},{x:.5,y:0},{x:.5,y:.5}], transforms:D4, hint:'45° 三角纸片已居中。可从纸外起笔，点击展开后查看八个对应区域。' },
  radial3: radialFold(3,'三折团花'),
  radial6: radialFold(6,'六折团花'),
});

const side = (a,b,p) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
export function inFold(point, mode) {
  const region = FOLDS[mode]?.region;
  return !!region && region.every((a,i) => side(a,region[(i+1)%region.length],point) >= -1e-10);
}

/** Display-only transform: centre the folded paper, with space to start outside. */
export function foldView(mode) {
  const region=FOLDS[mode].region;
  const xs=region.map(p=>p.x), ys=region.map(p=>p.y);
  const width=Math.max(...xs)-Math.min(...xs), height=Math.max(...ys)-Math.min(...ys);
  const scale=.76/Math.max(width,height);
  return {scale,x:.5-scale*(Math.max(...xs)+Math.min(...xs))/2,y:.5-scale*(Math.max(...ys)+Math.min(...ys))/2};
}

export function toFoldView(point, mode) {
  const view=foldView(mode);
  return mapFoldView(point,view);
}

export function mapFoldView(point, view) {
  return {x:point.x*view.scale+view.x,y:point.y*view.scale+view.y};
}

export function fromFoldView(point, mode) {
  const view=foldView(mode);
  // Keep outside-paper coordinates until polygon clipping at commit time.
  return {x:(point.x-view.x)/view.scale,y:(point.y-view.y)/view.scale};
}

/** Sutherland-Hodgman clipping against a convex fold domain. */
export function clipFold(points, mode) {
  const region = FOLDS[mode]?.region;
  if (!region) return [];
  let result = points.map(p => ({...p}));
  for (let i=0;i<region.length && result.length;i++) {
    const a=region[i], b=region[(i+1)%region.length], input=result;
    result=[];
    let previous=input.at(-1), pd=side(a,b,previous);
    for (const current of input) {
      const cd=side(a,b,current), wasInside=pd>=0, inside=cd>=0;
      if (wasInside !== inside) {
        const t=pd/(pd-cd);
        result.push({x:previous.x+t*(current.x-previous.x),y:previous.y+t*(current.y-previous.y)});
      }
      if (inside) result.push(current);
      previous=current; pd=cd;
    }
  }
  // Intersection arithmetic can leave an epsilon outside the unit paper.
  return result.map(p => ({x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))}));
}

export function mapPoint(p, matrix) {
  const [a,b,c,d,e,f]=matrix;
  return {x:a*p.x+c*p.y+e,y:b*p.x+d*p.y+f};
}

export function unfoldPaths(paths, mode) {
  if (!FOLDS[mode]) return [];
  return paths.flatMap(points => FOLDS[mode].transforms.map(matrix => {
    const copy=points.map(p => {
      const q=mapPoint(p,matrix);
      // Radial trigonometry can put boundary vertices an epsilon outside paper.
      return FOLDS[mode].order ? {x:Math.max(0,Math.min(1,q.x)),y:Math.max(0,Math.min(1,q.y))} : q;
    });
    // Keep a consistent winding across reflected sectors, including fold seams.
    if (matrix[0]*matrix[3]-matrix[1]*matrix[2]<0) copy.reverse();
    return copy;
  }));
}

function unfoldPathGroups(paths, mode) {
  const groups=paths.map(points => unfoldPaths([points],mode));
  return {groups,paths:groups.flat()};
}

/** Fold type belongs to the session. Switching resets both history branches. */
export class FoldSession {
  constructor(history = new CutHistory()) { this.history=history; }
  mode = null;
  state = 'choose';
  select(mode) {
    if (!FOLDS[mode]) throw new Error('未知折叠方式');
    if (mode !== this.mode) this.history.clear();
    this.mode=mode;
    this.state='editing';
  }
  get finalPaths() { return unfoldPaths(this.history.paths,this.mode); }
  get finalGroups() { return this.history.paths.map(points => unfoldPaths([points],this.mode)); }
  get finalGeometry() { return unfoldPathGroups(this.history.paths,this.mode); }
  get definition() { return FOLDS[this.mode]; }
  get operations() {
    return this.history.paths.map(points => ({ type:'polygon',fold:this.mode,points }));
  }
}
