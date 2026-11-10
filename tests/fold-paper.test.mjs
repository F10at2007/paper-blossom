import test from 'node:test';
import assert from 'node:assert/strict';
import { FoldSession, FOLDS, clipFold, inFold, unfoldPaths, toFoldView, fromFoldView, foldView, mapFoldView } from '../core/static/core/js/fold-paper.js';
import { validCut } from '../core/static/core/js/free-paper.js';
const triangle=[{x:.1,y:.1},{x:.3,y:.1},{x:.2,y:.3}];
const area=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p.x*q.y-q.x*p.y;},0)/2);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('folded paper bounds are centred; view inverse retains outside start coordinates',()=>{
  for(const mode of Object.keys(FOLDS)) {
    const display=FOLDS[mode].region.map(p=>toFoldView(p,mode));
    near((Math.max(...display.map(p=>p.x))+Math.min(...display.map(p=>p.x)))/2,.5);
    near((Math.max(...display.map(p=>p.y))+Math.min(...display.map(p=>p.y)))/2,.5);
    const p={x:-.1,y:.2},roundTrip=fromFoldView(toFoldView(p,mode),mode);
    near(roundTrip.x,p.x);near(roundTrip.y,p.y);
    assert.ok(display.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1));
  }
});

test('vertical, horizontal, quarter: independently known coordinates and no scaling',()=>{
  const p={x:.1,y:.2};
  assert.deepEqual(unfoldPaths([[p]],'vertical'),[[p],[{x:.9,y:.2}]]);
  assert.deepEqual(unfoldPaths([[p]],'horizontal'),[[p],[{x:.1,y:.8}]]);
  assert.deepEqual(unfoldPaths([[p]],'quarter'),[[p],[{x:.9,y:.2}],[{x:.1,y:.8}],[{x:.9,y:.8}]]);
  for(const mode of ['vertical','horizontal','quarter']) for(const copy of unfoldPaths([triangle],mode)) near(area(copy),area(triangle));
});

test('eight distinct sectors are centre isometries with independently known positions',()=>{
  const p={x:.4,y:.2};
  const copies=unfoldPaths([[p]],'eighth').map(path=>path[0]);
  assert.equal(copies.length,8);
  const expected=[[.4,.2],[.6,.2],[.4,.8],[.6,.8],[.2,.4],[.8,.4],[.2,.6],[.8,.6]];
  for(const [x,y] of expected) assert.ok(copies.some(p=>Math.abs(p.x-x)<1e-10&&Math.abs(p.y-y)<1e-10));
  const wedge=[{x:.3,y:.1},{x:.45,y:.15},{x:.4,y:.3}];
  for(const copy of unfoldPaths([wedge],'eighth')) {
    near(area(copy),area(wedge));
    for(const p of copy) assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
  }
});

test('domain checks block outside starts and convex clipping crops crossing polygons',()=>{
  assert.ok(inFold({x:.2,y:.8},'vertical'));
  assert.ok(!inFold({x:.8,y:.2},'vertical'));
  assert.ok(!inFold({x:.2,y:.8},'horizontal'));
  assert.ok(inFold({x:.4,y:.2},'eighth'));
  assert.ok(!inFold({x:.2,y:.4},'eighth'));
  const crossing=[{x:.3,y:.1},{x:.7,y:.1},{x:.7,y:.4},{x:.3,y:.4}];
  const clipped=clipFold(crossing,'vertical');
  near(area(clipped),.06);
  for(const mode of Object.keys(FOLDS)) {
    const result=clipFold([{x:-.2,y:-.2},{x:1.2,y:-.2},{x:1.2,y:1.2},{x:-.2,y:1.2}],mode);
    assert.ok(result.every(p=>inFold(p,mode)));
    near(area(result),area(FOLDS[mode].region));
    for(const copy of unfoldPaths([result],mode)) assert.ok(copy.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));
  }
  assert.equal(validCut(clipFold([{x:.8,y:.8},{x:.9,y:.8},{x:.9,y:.9}],'quarter')),false);
});

test('session reuses base cut history; unfolding never appends derived copies',()=>{
  const session=new FoldSession();
  assert.equal(session.state,'choose');
  session.select('quarter'); session.history.add(triangle);
  assert.equal(session.operations[0].fold,'quarter');
  assert.equal(session.operations[0].type,'polygon');
  const original=structuredClone(session.finalPaths);
  session.state='unfolded'; session.state='editing';
  assert.equal(session.history.paths.length,1);
  assert.deepEqual(session.finalPaths,original);
  session.history.undo(); assert.equal(session.finalPaths.length,0);
  session.history.redo(); assert.deepEqual(session.finalPaths,original);
  session.history.undo(); session.select('eighth');
  assert.equal(session.history.paths.length+session.history.future.length,0);
  assert.throws(()=>session.select('unknown'));
});

test('final geometry shares each expanded cut between flat paths and grouped knockout data',()=>{
  const session=new FoldSession();session.select('radial6');
  session.history.paths=[triangle,triangle.map(p=>({x:1-p.x,y:p.y}))];
  const final=session.finalGeometry;
  assert.deepEqual(final.groups,session.finalGroups);
  assert.deepEqual(final.paths,session.finalPaths);
  assert.equal(final.paths.length,24);
  assert.equal(final.groups.length,2);
  assert.ok(final.groups.every(group=>group.length===12));
  for(const [i,group] of final.groups.entries())for(const copy of group)assert.ok(final.paths.includes(copy),`path ${i} should be shared with grouped output`);
  const view=foldView('radial6'),point={x:.2,y:.7};
  assert.deepEqual(mapFoldView(point,view),toFoldView(point,'radial6'));
});

for(const [mode,n] of [['radial3',3],['radial6',6]]) {
  test(`${mode}: known polar orbits, rigid triangle/irregular geometry and exact coverage`,()=>{
    const polar=(r,d)=>({x:.5+r*Math.cos(d*Math.PI/180),y:.5+r*Math.sin(d*Math.PI/180)});
    const beta=180/n;
    const input=polar(.3,beta*.31);
    const copies=unfoldPaths([[input]],mode).map(p=>p[0]);
    assert.equal(copies.length,2*n);
    for(let k=0;k<n;k++)for(const sign of [1,-1]) {
      const expected=polar(.3,k*360/n+sign*beta*.31);
      assert.equal(copies.filter(p=>Math.hypot(p.x-expected.x,p.y-expected.y)<1e-10).length,1);
    }
    const triangle=[polar(.15,beta*.15),polar(.35,beta*.35),polar(.24,beta*.8)];
    const curve=Array.from({length:61},(_,i)=>{const t=i*2*Math.PI/61;return polar(.28+.05*Math.cos(t)+.008*Math.cos(3*t),beta*(.5+.22*Math.sin(t)))});
    for(const original of [triangle,curve])for(const copy of unfoldPaths([original],mode)) {
      near(area(copy),area(original));
      const radii=points=>points.map(p=>Math.hypot(p.x-.5,p.y-.5)).sort((a,b)=>a-b);
      radii(original).forEach((r,i)=>near(r,radii(copy)[i]));
    }
    near(area(FOLDS[mode].region)*2*n,area(FOLDS[mode].sheet));
    const outside=[polar(.2,-beta*.2),polar(.4,-beta*.2),polar(.4,beta*.3),polar(.2,beta*.3)];
    assert.ok(!inFold(outside[0],mode));
    assert.ok(validCut(clipFold(outside,mode)));
    assert.ok(clipFold(outside,mode).every(p=>inFold(p,mode)));
  });
  test(`${mode}: persistence-compatible clipped paths and history survive view changes`,async()=>{
    const {validateDocument}=await import('../core/static/core/js/work-store.js');
    const session=new FoldSession();session.select(mode);
    const points=clipFold([{x:.4,y:.4},{x:1.1,y:.4},{x:1.1,y:.9},{x:.4,y:.9}],mode);
    assert.ok(session.history.add(points));
    const data={mode:'fold',foldMode:mode,foldState:'editing',color:'#a63127',paths:session.history.paths};
    validateDocument(JSON.parse(JSON.stringify(data)));
    const final=structuredClone(session.finalPaths);
    session.state='unfolded';session.state='editing';
    session.history.undo();session.history.redo();
    assert.deepEqual(session.finalPaths,final);
    session.history.undo();session.history.add(points);assert.equal(session.history.future.length,0);
    session.select('vertical');assert.equal(session.history.paths.length,0);
  });
}
