import test from 'node:test';
import assert from 'node:assert/strict';
import { FoldSession, FOLDS, clipFold, inFold, unfoldPaths, toFoldView, fromFoldView } from '../core/static/core/js/fold-paper.js';
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
