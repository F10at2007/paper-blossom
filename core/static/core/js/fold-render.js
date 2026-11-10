import { renderPaper, traceCut } from './free-paper.js';

/** One final-paper renderer for the workspace, saved thumbnails and PNG output. */
export function renderFoldPaper(canvas, fold, color) {
  const {paths,groups}=fold.finalGeometry;
  renderPaper(canvas,paths,color,groups);
  if(!fold.definition?.sheet)return;
  const ctx=canvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation='destination-in';
  traceCut(ctx,fold.definition.sheet,canvas.width,canvas.height);
  ctx.fillStyle='#000';
  ctx.fill();
  ctx.restore();
}
