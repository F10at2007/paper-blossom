import test from 'node:test';
import assert from 'node:assert/strict';
import { CutHistory, validCut, pngBlob } from '../core/static/core/js/free-paper.js';

const a = [{ x: .1, y: .1 }, { x: .4, y: .1 }, { x: .4, y: .4 }];
const b = [{ x: .5, y: .5 }, { x: .8, y: .5 }, { x: .8, y: .8 }];

test('multiple undo/redo round trips, new cut discards redo, history owns point copies', () => {
  const history = new CutHistory();
  history.add(a); history.add(b);
  const expected = structuredClone(history.paths);
  history.undo(); history.undo(); history.undo();
  assert.equal(history.paths.length, 0);
  history.redo(); history.redo(); history.redo();
  assert.deepEqual(history.paths, expected);
  history.undo();
  history.add(a);
  assert.equal(history.future.length, 0);
  history.paths[0][0].x = .2;
  assert.equal(a[0].x, .1);
});

test('clear resets both branches, allows restart', () => {
  const history = new CutHistory();
  history.add(a); history.add(b); history.undo(); history.clear();
  assert.equal(history.paths.length + history.future.length, 0);
  assert.equal(history.add(b), true);
  assert.equal(history.paths.length, 1);
});

test('clicks, lines, non-finite coordinates are ignored without discarding redo', () => {
  const history = new CutHistory();
  history.add(a); history.undo();
  for (const points of [[], [a[0]], [a[0], a[1]], [{x:0,y:0},{x:.5,y:.5},{x:1,y:1}], [{x:NaN,y:0}, ...a]]) {
    assert.equal(history.add(points), false);
  }
  assert.equal(history.future.length, 1);
});

test('self-intersections retain area and normalize out-of-range points', () => {
  assert.equal(validCut([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]), true);
  const history = new CutHistory();
  history.add([{x:-.1,y:.1},{x:.9,y:1.1},{x:1.1,y:.1}]);
  assert.ok(history.paths[0].every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
});

test('PNG encoding handles success, null blob, and synchronous failure', async () => {
  const blob = new Blob(['png'], {type: 'image/png'});
  assert.equal(await pngBlob({toBlob: cb => cb(blob)}), blob);
  await assert.rejects(pngBlob({toBlob: cb => cb(null)}), /PNG 生成失败/);
  await assert.rejects(pngBlob({toBlob: () => { throw new Error('encoding error'); }}), /无法导出 PNG/);
});
