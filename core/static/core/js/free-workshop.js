import { CutHistory, PAPER_COLORS, traceCut, renderPaper } from './free-paper.js';
import { createPaperDownloader } from './paper-download.js';
import { FoldSession, FOLDS, clipFold, foldView, toFoldView, mapFoldView, fromFoldView } from './fold-paper.js';
import { renderFoldPaper } from './fold-render.js';
import { attachPersistence } from './work-persistence.js';

/** Owns one page's pointer lifecycle. Geometry and rendering live in free-paper. */
export function mountWorkshop(root, extension = {}) {
  const paper = root.querySelector('#paper-canvas');
  const drawing = root.querySelector('#drawing-canvas');
  const preview = root.querySelector('#preview-canvas');
  const largePreview = document.querySelector('#large-preview-canvas');
  const previewDialog = document.querySelector('#paper-preview-dialog');
  const status = root.querySelector('#workshop-status');
  const button = action => root.querySelector(`[data-action="${action}"]`);
  const history = new CutHistory();
  const fold = root.dataset.mode === 'fold' ? new FoldSession(history) : null;
  const foldedPaper = fold ? document.createElement('canvas') : null;
  if (foldedPaper) foldedPaper.width=foldedPaper.height=1024;
  const downloader = createPaperDownloader();
  const finalPaths = () => fold ? fold.finalPaths : history.paths;
  const overlay = drawing.getContext('2d');
  const listeners = new AbortController();
  let color = PAPER_COLORS[0].value;
  let stroke = null;
  let frame = null;
  let exporting = false;

  function announce(message) { status.textContent = message; }

  function updateButtons() {
    button('undo').disabled = !!stroke || !history.paths.length;
    button('redo').disabled = !!stroke || !history.future.length;
    button('clear').disabled = !!stroke || !(history.paths.length || history.future.length);
    button('download').disabled = !!stroke || exporting || !!(fold && fold.state !== 'unfolded');
    if(button('preview'))button('preview').disabled=!!stroke || !!(fold && fold.state!=='unfolded');
    button('save').disabled = !!stroke || !!(fold && !fold.mode);
    if (fold) {
      button('unfold').disabled = !fold.mode || !!stroke;
    }
  }

  const renderFinal = canvas => fold ? renderFoldPaper(canvas,fold,color) : renderPaper(canvas,history.paths,color);

  function rebuild() {
    if (fold && fold.state !== 'unfolded') renderFoldedPaper();
    else renderFinal(paper);
    if (preview && (!fold || fold.state==='unfolded')) renderFinal(preview);
    if (previewDialog?.open) renderFinal(largePreview);
    if (fold) updateFoldView();
    root.querySelector('#cut-count').textContent = `已剪 ${history.paths.length} 次 / 1 : 1`;
    updateButtons();
    extension.onRebuild?.();
    root.dispatchEvent(new Event('workchange'));
  }

  function renderFoldedPaper() {
    const ctx=paper.getContext('2d');
    ctx.clearRect(0,0,paper.width,paper.height);
    if (!fold.mode) return;
    renderPaper(foldedPaper,history.paths,color);
    const view=foldView(fold.mode);
    ctx.save();
    traceCut(ctx,fold.definition.region.map(p=>toFoldView(p,fold.mode)),paper.width,paper.height);
    ctx.clip();
    ctx.setTransform(view.scale,0,0,view.scale,view.x*paper.width,view.y*paper.height);
    ctx.drawImage(foldedPaper,0,0);
    ctx.restore();
  }

  function updateFoldView() {
    root.dataset.state = fold.state;
    for (const step of document.querySelectorAll('[data-step]')) {
      if (step.dataset.step === fold.state) step.setAttribute('aria-current','step');
      else step.removeAttribute('aria-current');
    }
    root.querySelector('#fold-name').textContent = fold.definition?.name || '请选择折叠方式';
    const unfolded = fold.state === 'unfolded';
    button('unfold').innerHTML = unfolded ? '返回剪裁 <span>←</span>' : '展开作品 <span>↗</span>';
    root.querySelector('#fold-caption').textContent = unfolded ? '纸已展开，对称由你而生' : fold.mode ? '纸片居中 · 可从纸外起笔' : '先选折法，再落下第一剪';
    const background=root.querySelector('.fold-paper-background');
    background.hidden=!fold.mode;
    const region=unfolded ? (fold.definition.sheet || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]) : fold.definition?.region.map(p=>toFoldView(p,fold.mode));
    if(region) background.style.clipPath=`polygon(${region.map(p=>`${p.x*100}% ${p.y*100}%`).join(',')})`;
    drawFoldGuides();
  }

  function drawFoldGuides() {
    const canvas = root.querySelector('#fold-guides');
    const ctx = canvas.getContext('2d'), size=canvas.width;
    const pixel=size/drawing.getBoundingClientRect().width;
    ctx.clearRect(0,0,size,size);
    if (fold.state === 'unfolded') return;
    if (!fold.mode) {
      ctx.fillStyle='#716456'; ctx.font=`${14*pixel}px "Microsoft YaHei",sans-serif`; ctx.textAlign='center';
      ctx.fillText('请选择一种折叠方式',size/2,size/2);
      return;
    }
    // Show only the centred paper and its folded edges, never the hidden sectors.
    ctx.save();ctx.setLineDash([7*pixel,5*pixel]);ctx.strokeStyle='#746454';ctx.lineWidth=1*pixel;
    const line=(x1,y1,x2,y2)=>{const a=toFoldView({x:x1,y:y1},fold.mode),b=toFoldView({x:x2,y:y2},fold.mode);ctx.beginPath();ctx.moveTo(a.x*size,a.y*size);ctx.lineTo(b.x*size,b.y*size);ctx.stroke();};
    if (fold.mode==='vertical') line(.5,0,.5,1);
    if (fold.mode==='horizontal') line(0,.5,1,.5);
    if (fold.mode==='quarter') {line(.5,0,.5,.5);line(0,.5,.5,.5);}
    if (fold.mode==='eighth') {line(0,0,.5,.5);line(.5,0,.5,.5);}
    if (fold.definition.order) {
      const region=fold.definition.region, start=region[1], end=region.at(-1);
      line(.5,.5,start.x,start.y);line(.5,.5,end.x,end.y);
      const center=toFoldView({x:.5,y:.5},fold.mode);
      ctx.setLineDash([]);ctx.beginPath();ctx.arc(center.x*size,center.y*size,3*pixel,0,Math.PI*2);ctx.fillStyle='#746454';ctx.fill();
    }
    ctx.restore();
  }

  function drawGuide() {
    frame = null;
    overlay.clearRect(0, 0, drawing.width, drawing.height);
    if (!stroke) return;
    const view = fold ? foldView(fold.mode) : null;
    const points = fold ? stroke.points.map(p=>mapFoldView(p,view)) : stroke.points;
    const pixel = drawing.width / drawing.getBoundingClientRect().width;
    overlay.save();
    traceCut(overlay, points, drawing.width, drawing.height);
    overlay.fillStyle = 'rgba(255,255,255,.25)';
    overlay.fill('evenodd');
    overlay.lineJoin = 'round';
    overlay.lineCap = 'round';
    // Two contrasting strokes remain legible on all four paper colors.
    overlay.lineWidth = 4 * pixel;
    overlay.strokeStyle = 'rgba(35,35,30,.7)';
    overlay.stroke();
    overlay.lineWidth = 2 * pixel;
    overlay.strokeStyle = '#fff9e9';
    overlay.stroke();
    overlay.beginPath();
    overlay.arc(points[0].x * drawing.width, points[0].y * drawing.height, 4 * pixel, 0, Math.PI * 2);
    overlay.fillStyle = '#fff9e9';
    overlay.fill();
    overlay.restore();
  }

  function requestGuide() {
    if (frame === null) frame = requestAnimationFrame(drawGuide);
  }

  function point(event) {
    const rect = drawing.getBoundingClientRect();
    const position={x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};
    if (fold) return fromFoldView(position,fold.mode);
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function addPoint(event) {
    const next = point(event);
    const last = stroke.points.at(-1);
    if (Math.hypot(next.x - last.x, next.y - last.y) > 0.001) stroke.points.push(next);
  }

  function endStroke(commit) {
    if (!stroke) return;
    const ended = stroke;
    stroke = null; // Clear before releasePointerCapture emits lostpointercapture.
    if (drawing.hasPointerCapture(ended.id)) drawing.releasePointerCapture(ended.id);
    if (commit) {
      const added = history.add(fold ? clipFold(ended.points,fold.mode) : ended.points);
      announce(added ? (fold ? '已剪去轮廓与纸片相交的部分。继续剪裁，或点击展开揭晓作品。' : '已剪去圈内区域。可以继续剪裁，或下载透明底 PNG。') : '轮廓太小或未与纸张形成有效区域，请重新画一个形状。');
    } else {
      announce('已取消当前未完成的轮廓，之前的剪裁仍然保留。');
    }
    requestGuide();
    rebuild();
  }

  const on = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: listeners.signal });

  on(drawing, 'pointerdown', event => {
    if (stroke || !event.isPrimary || event.button !== 0) return;
    if (extension.canDraw?.() === false) return;
    if (fold && fold.state !== 'editing') return;
    event.preventDefault();
    if (!fold) drawing.focus({ preventScroll: true });
    stroke = { id: event.pointerId, points: [point(event)] };
    drawing.setPointerCapture(event.pointerId);
    announce('正在绘制；松手自动闭合，圈内将被剪去。');
    updateButtons();
    requestGuide();
  }, { passive: false });

  on(drawing, 'pointermove', event => {
    if (!stroke || event.pointerId !== stroke.id) return;
    event.preventDefault();
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) { endStroke(false); return; }
    const events = event.getCoalescedEvents?.() || [];
    for (const sample of events) addPoint(sample);
    addPoint(event);
    requestGuide();
  }, { passive: false });

  on(drawing, 'pointerup', event => {
    if (!stroke || event.pointerId !== stroke.id) return;
    event.preventDefault();
    addPoint(event);
    endStroke(true);
  }, { passive: false });
  on(drawing, 'pointercancel', () => endStroke(false));
  on(drawing, 'lostpointercapture', () => endStroke(false));
  on(drawing, 'contextmenu', event => event.preventDefault());
  on(window, 'blur', () => endStroke(false));
  on(document, 'visibilitychange', () => { if (document.hidden) endStroke(false); });
  on(drawing, 'keydown', event => { if (event.key === 'Escape') endStroke(false); });
  if (fold) on(window,'keydown',event=>{if(event.key==='Escape')endStroke(false);});

  on(button('undo'), 'click', () => { history.undo(); rebuild(); announce('已撤销上一次剪裁。'); });
  on(button('redo'), 'click', () => { history.redo(); rebuild(); announce('已重做剪裁。'); });
  on(button('clear'), 'click', () => {
    if (!window.confirm('清空全部剪裁并恢复完整纸张？此操作会同时清除撤销与重做记录。')) return;
    history.clear();
    extension.onClear?.();
    if (fold) fold.state='editing';
    rebuild();
    announce('已恢复完整纸张，可以重新开始创作。');
  });
  for (const swatch of root.querySelectorAll('[data-color]')) {
    on(swatch, 'click', () => {
      endStroke(false);
      color = swatch.dataset.color;
      for (const item of root.querySelectorAll('[data-color]')) item.setAttribute('aria-pressed', String(item === swatch));
      root.querySelector('#paper-color-name').textContent = swatch.getAttribute('aria-label');
      rebuild();
      announce(`已换为${swatch.getAttribute('aria-label')}，剪裁区域保持透明。`);
    });
  }
  if (button('preview')) on(button('preview'), 'click', () => {
    if(fold && fold.state!=='unfolded')return;
    renderFinal(largePreview);
    previewDialog.showModal();
  });

  if (fold) {
    for (const choice of root.querySelectorAll('[data-fold]')) {
      on(choice,'click',()=>{
        const mode=choice.dataset.fold;
        if (mode===fold.mode) return;
        if ((history.paths.length || history.future.length) && !window.confirm('切换折叠方式需要清除当前剪裁和撤销记录，重新开始。是否继续？')) return;
        endStroke(false);
        fold.select(mode);
        for (const item of root.querySelectorAll('[data-fold]')) item.setAttribute('aria-pressed',String(item===choice));
        root.querySelector('#fold-hint').textContent=FOLDS[mode].hint;
        rebuild();
        announce(`${FOLDS[mode].name}已折好。在亮色区域剪裁，再点击展开作品。`);
      });
    }
    on(button('unfold'),'click',()=>{
      if (!fold.mode || stroke) return;
      fold.state=fold.state==='unfolded' ? 'editing' : 'unfolded';
      rebuild();
      announce(fold.state==='unfolded' ? `已展开为 ${fold.definition.order ? `${fold.definition.order} 向团花（${fold.definition.copies} 个镜像扇区）` : `${fold.definition.copies} 个对称区域`}，可下载完整作品或返回剪裁。` : '已返回折纸剪裁，原有路径和折叠方式已保留。');
    });
    announce('先选择折法。可从纸外起笔，点击展开后再看完整作品。');
  }

  on(button('download'), 'click', async () => {
    if (exporting || stroke || (fold && fold.state !== 'unfolded')) return;
    exporting = true;
    updateButtons();
    announce('正在生成 2048 × 2048 透明底 PNG…');
    try {
      const filename=root.dataset.mode==='trace'?'一纸生花_纹样临摹.png':fold?'一纸生花_对称之美.png':'一纸生花_自由剪艺.png';
      await downloader.download(fold?null:finalPaths(),color,filename,null,fold?renderFinal:null);
      announce('PNG 已生成并交给浏览器下载，请在下载列表中查看。');
    } catch (error) {
      announce(`下载失败：${error.message || '请检查浏览器下载设置后重试。'}`);
    } finally {
      exporting = false;
      updateButtons();
    }
  });

  // Canvas bitmap size is fixed; only CSS dimensions change. Every input sample
  // uses the current bounding rect. Cancel a live gesture during layout changes.
  let previousSize = '';
  const resize = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    const size = `${width}:${height}`;
    if (previousSize && size !== previousSize) endStroke(false);
    previousSize = size;
    if (fold) drawFoldGuides();
  });
  resize.observe(drawing);
  on(window, 'pagehide', event => {
    endStroke(false);
    downloader.release();
    if (!event.persisted) {
      resize.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      listeners.abort();
    }
  });

  try { rebuild(); } catch (error) {
    announce(error.message);
    drawing.style.pointerEvents = 'none';
    for (const control of root.querySelectorAll('button:not([data-placeholder])')) control.disabled = true;
  }
  const snapshot=()=>({mode:root.dataset.mode,color,paths:structuredClone(history.paths),...(fold?{foldMode:fold.mode,foldState:fold.state}:{}),...extension.snapshot?.()});
  const persistence=attachPersistence({root,snapshot,notify:announce,signal:listeners.signal,restore:data=>{
    color=data.color;history.paths=structuredClone(data.paths);history.future=[];
    if(fold){fold.mode=data.foldMode;fold.state=data.foldState;for(const item of root.querySelectorAll('[data-fold]'))item.setAttribute('aria-pressed',String(item.dataset.fold===fold.mode));root.querySelector('#fold-hint').textContent=fold.definition.hint;}
    extension.restore?.(data);
    for(const item of root.querySelectorAll('[data-color]'))item.setAttribute('aria-pressed',String(item.dataset.color===color));
    root.querySelector('#paper-color-name').textContent=PAPER_COLORS.find(c=>c.value===color).name;
    rebuild();
  }});
  return {snapshot,notify:announce,hasCuts:()=>history.paths.length>0,cancel:()=>endStroke(false),allowNavigation:persistence.allowNavigation,paper};
}

const root = document.querySelector('#free-workspace, #fold-workspace');
if (root) mountWorkshop(root);
