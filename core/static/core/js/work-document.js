import { renderPaper } from './free-paper.js';
import { FoldSession } from './fold-paper.js';
import { renderComposition } from './composition-model.js';
export function renderDocument(canvas,data) {
  if(data.mode==='compose'){renderComposition(canvas,data.objects,data.color);return;}
  if(data.mode==='fold'){
    const fold=new FoldSession();fold.select(data.foldMode);fold.history.paths=data.paths;
    renderPaper(canvas,fold.finalPaths,data.color,fold.finalGroups);
  }else renderPaper(canvas,data.paths,data.color);
}
