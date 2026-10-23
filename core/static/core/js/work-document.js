import { renderPaper } from './free-paper.js';
import { renderFoldPaper } from './fold-render.js';
import { FoldSession } from './fold-paper.js';
import { renderComposition } from './composition-model.js';
export function renderDocument(canvas,data) {
  if(data.mode==='compose'){renderComposition(canvas,data.objects,data.color);return;}
  if(data.mode==='fold'){
    const fold=new FoldSession();fold.select(data.foldMode);fold.history.paths=data.paths;
    renderFoldPaper(canvas,fold,data.color);
  }else renderPaper(canvas,data.paths,data.color);
}
