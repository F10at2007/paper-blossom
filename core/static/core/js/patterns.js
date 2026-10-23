/** Original practice geometry, not reproductions of named heritage artefacts. */
export const ellipse=(x,y,rx,ry,rotation=0,n=48)=>Array.from({length:n},(_,i)=>{
  const t=i*Math.PI*2/n,a=rx*Math.cos(t),b=ry*Math.sin(t);
  return {x:x+a*Math.cos(rotation)-b*Math.sin(rotation),y:y+a*Math.sin(rotation)+b*Math.cos(rotation)};
});
const ring=(count,radius,rx,ry,phase=-Math.PI/2)=>Array.from({length:count},(_,i)=>{
  const a=i*Math.PI*2/count+phase;
  return ellipse(.5+radius*Math.cos(a),.5+radius*Math.sin(a),rx,ry,a);
});
export const REFERENCES = [
  {id:'bloom',name:'初绽',level:'简单',description:'先剪中心圆，再围绕中心剪出六片细长花瓣。注意留住瓣与瓣之间的纸桥。',paths:[ellipse(.5,.5,.055,.055),...ring(6,.22,.12,.048)]},
  {id:'leaves',name:'叶语',level:'中等',description:'观察叶片的长短与朝向，逐片画出轮廓。左右呼应，保留贯穿中间的纸脉。',paths:[...Array.from({length:3},(_,i)=>[ellipse(.35,.28+i*.2,.13,.048,-.6),ellipse(.65,.28+i*.2,.13,.048,.6)]).flat(),ellipse(.5,.16,.035,.065)]},
  {id:'lattice',name:'花窗',level:'较复杂',description:'从内圈到外圈分次剪裁，留出连续的连接。练习大小变化与对称留白，不必一笔完成。',paths:[ellipse(.5,.5,.04,.04),...ring(8,.15,.065,.028),...ring(8,.32,.09,.045),...ring(8,.43,.022,.022)]},
];

// Filled, pierced paper pieces for composition. Coordinates are local to a unit square.
export const MOTIFS = [
  {id:'petal',name:'花瓣',outline:ellipse(.5,.5,.37,.19,-.5),holes:[ellipse(.5,.5,.23,.06,-.5)]},
  {id:'leaf',name:'叶片',outline:[{x:.08,y:.82},{x:.16,y:.22},{x:.82,y:.08},{x:.92,y:.65},{x:.38,y:.92}],holes:[ellipse(.5,.5,.27,.035,-.75)]},
  {id:'flower',name:'团花',outline:Array.from({length:120},(_,i)=>{const a=i*Math.PI*2/120,r=.3+.09*Math.cos(6*a);return {x:.5+r*Math.cos(a),y:.5+r*Math.sin(a)};}),holes:[ellipse(.5,.5,.08,.08),...ring(6,.22,.068,.025,0)]},
  {id:'diamond',name:'菱花',outline:[{x:.5,y:.05},{x:.95,y:.5},{x:.5,y:.95},{x:.05,y:.5}],holes:[ellipse(.5,.5,.17,.17),...ring(4,.29,.05,.025)]},
];

MOTIFS.push(
  {id:'butterfly',name:'蝶影',outline:[[.5,.36],[.22,.12],[.07,.2],[.15,.48],[.32,.53],[.13,.67],[.2,.88],[.44,.72],[.5,.58],[.56,.72],[.8,.88],[.87,.67],[.68,.53],[.85,.48],[.93,.2],[.78,.12]].map(([x,y])=>({x,y})),holes:[ellipse(.28,.34,.11,.04,.6),ellipse(.72,.34,.11,.04,-.6),ellipse(.29,.69,.055,.03,-.5),ellipse(.71,.69,.055,.03,.5)]},
  {id:'bird',name:'小鸟',outline:[[.1,.55],[.3,.5],[.48,.18],[.64,.48],[.85,.32],[.9,.42],[.95,.45],[.83,.52],[.7,.7],[.35,.75],[.18,.9],[.22,.65]].map(([x,y])=>({x,y})),holes:[ellipse(.81,.43,.018,.018),ellipse(.48,.58,.12,.04,-.25)]},
  {id:'fish',name:'游鱼',outline:[[.07,.5],[.25,.25],[.55,.18],[.79,.4],[.94,.25],[.9,.5],[.94,.75],[.79,.6],[.55,.82],[.25,.75]].map(([x,y])=>({x,y})),holes:[ellipse(.26,.44,.035,.035),ellipse(.46,.44,.035,.09),ellipse(.58,.5,.035,.1)]},
  {id:'circle',name:'圆环',outline:ellipse(.5,.5,.43,.43),holes:[ellipse(.5,.5,.29,.29),...ring(8,.365,.025,.018)]},
  {id:'star',name:'六角',outline:Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,r=i%2?.25:.44;return {x:.5+r*Math.cos(a),y:.5+r*Math.sin(a)};}),holes:[ellipse(.5,.5,.08,.08),...ring(6,.22,.055,.025,0)]},
  {id:'frame',name:'回廊',outline:[[.06,.06],[.94,.06],[.94,.94],[.06,.94]].map(([x,y])=>({x,y})),holes:[[{x:.16,y:.16},{x:.84,y:.16},{x:.84,y:.84},{x:.16,y:.84}],ellipse(.5,.11,.15,.015),ellipse(.5,.89,.15,.015),ellipse(.11,.5,.015,.15),ellipse(.89,.5,.015,.15)]},
  {id:'ribbon',name:'波带',outline:[[.05,.3],[.25,.4],[.5,.3],[.75,.4],[.95,.3],[.95,.6],[.75,.7],[.5,.6],[.25,.7],[.05,.6]].map(([x,y])=>({x,y})),holes:[ellipse(.25,.54,.055,.035),ellipse(.5,.46,.055,.035),ellipse(.75,.54,.055,.035)]},
  {id:'corner',name:'折角',outline:[[.1,.1],[.9,.1],[.9,.25],[.25,.25],[.25,.9],[.1,.9]].map(([x,y])=>({x,y})),holes:[ellipse(.5,.175,.16,.018),ellipse(.175,.5,.018,.16)]},
);
export const CATEGORIES=['花卉','动物','几何','边框'];
for(const motif of MOTIFS)motif.category=['petal','leaf','flower'].includes(motif.id)?'花卉':['butterfly','bird','fish'].includes(motif.id)?'动物':['diamond','circle','star'].includes(motif.id)?'几何':'边框';

export function objectPoint(point,object) {
  const angle=object.rotation*Math.PI/180,x=(point.x-.5)*object.size,y=(point.y-.5)*object.size;
  return {x:object.x+x*Math.cos(angle)-y*Math.sin(angle),y:object.y+x*Math.sin(angle)+y*Math.cos(angle)};
}
