/** Serializable, normalized cut geometry; independent of DOM and display size. */
export const PAPER_COLORS = Object.freeze([
  { name: '朱砂红', value: '#a63127' },
  { name: '正红', value: '#c62828' },
  { name: '暖米白', value: '#f4e9d5' },
  { name: '墨黑', value: '#292923' },
]);

export function validCut(points) {
  if (points.length < 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  // Absolute triangle areas allow self-intersections (filled with even-odd rule),
  // while ignoring clicks and collinear strokes which cannot remove an area.
  const origin = points[0];
  let area = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    area += Math.abs((a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y));
  }
  return area > 0.00001;
}

export class CutHistory {
  paths = [];
  future = [];

  add(points) {
    if (!validCut(points)) return false;
    this.paths.push(points.map(p => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) })));
    this.future = [];
    return true;
  }

  undo() {
    if (this.paths.length) this.future.push(this.paths.pop());
  }

  redo() {
    if (this.future.length) this.paths.push(this.future.pop());
  }

  clear() {
    this.paths = [];
    this.future = [];
  }
}

export function traceCut(ctx, points, width, height, begin = true) {
  if (begin) ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x * width, p.y * height);
    else ctx.lineTo(p.x * width, p.y * height);
  });
  ctx.closePath();
}

/** Always rebuild from solid paper. Never composite against a previous result. */
export function renderPaper(canvas, paths, color, groups = null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法使用 Canvas 2D，请更换浏览器后重试。');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  // Reflected copies of ONE base cut occupy disjoint fold domains. Fill them
  // together so shared fold edges are resolved geometrically before rasterizing,
  // avoiding semi-transparent seams from separately erased adjacent polygons.
  for (const group of groups || paths.map(points => [points])) {
    ctx.beginPath();
    for (const points of group) traceCut(ctx, points, canvas.width, canvas.height, false);
    ctx.fill('evenodd');
  }
  ctx.restore();
}

export function pngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('PNG 生成失败，请重试或减少剪裁后再导出。'));
      }, 'image/png');
    } catch {
      reject(new Error('无法导出 PNG，请重试或检查浏览器的下载设置。'));
    }
  });
}
