import { CutHistory, PAPER_COLORS, traceCut, renderPaper, pngBlob } from './free-paper.js';

/** Owns one page's pointer lifecycle. Geometry and rendering live in free-paper. */
function mountWorkshop(root) {
  const paper = root.querySelector('#paper-canvas');
  const drawing = root.querySelector('#drawing-canvas');
  const preview = root.querySelector('#preview-canvas');
  const largePreview = document.querySelector('#large-preview-canvas');
  const previewDialog = document.querySelector('#paper-preview-dialog');
  const status = root.querySelector('#workshop-status');
  const button = action => root.querySelector(`[data-action="${action}"]`);
  const history = new CutHistory();
  const overlay = drawing.getContext('2d');
  const listeners = new AbortController();
  const urls = new Set();
  let color = PAPER_COLORS[0].value;
  let stroke = null;
  let frame = null;
  let exporting = false;

  function announce(message) { status.textContent = message; }

  function updateButtons() {
    button('undo').disabled = !!stroke || !history.paths.length;
    button('redo').disabled = !!stroke || !history.future.length;
    button('clear').disabled = !!stroke || !(history.paths.length || history.future.length);
    button('download').disabled = !!stroke || exporting;
  }

  function rebuild() {
    renderPaper(paper, history.paths, color);
    renderPaper(preview, history.paths, color);
    if (previewDialog.open) renderPaper(largePreview, history.paths, color);
    root.querySelector('#cut-count').textContent = `已剪 ${history.paths.length} 次 / 1 : 1`;
    updateButtons();
  }

  function drawGuide() {
    frame = null;
    overlay.clearRect(0, 0, drawing.width, drawing.height);
    if (!stroke) return;
    const points = stroke.points;
    const pixel = drawing.width / drawing.getBoundingClientRect().width;
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
  }

  function requestGuide() {
    if (frame === null) frame = requestAnimationFrame(drawGuide);
  }

  function point(event) {
    const rect = drawing.getBoundingClientRect();
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
      const added = history.add(ended.points);
      announce(added ? '已剪去圈内区域。可以继续剪裁，或下载透明底 PNG。' : '轮廓太小或未形成区域，请拖动画出一个形状。');
    } else {
      announce('已取消当前未完成的轮廓，之前的剪裁仍然保留。');
    }
    requestGuide();
    rebuild();
  }

  const on = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: listeners.signal });

  on(drawing, 'pointerdown', event => {
    if (stroke || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drawing.focus({ preventScroll: true });
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

  on(button('undo'), 'click', () => { history.undo(); rebuild(); announce('已撤销上一次剪裁。'); });
  on(button('redo'), 'click', () => { history.redo(); rebuild(); announce('已重做剪裁。'); });
  on(button('clear'), 'click', () => {
    if (!window.confirm('清空全部剪裁并恢复完整纸张？此操作会同时清除撤销与重做记录。')) return;
    history.clear();
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
  on(button('preview'), 'click', () => {
    renderPaper(largePreview, history.paths, color);
    previewDialog.showModal();
  });

  on(button('download'), 'click', async () => {
    if (exporting || stroke) return;
    exporting = true;
    updateButtons();
    announce('正在生成 2048 × 2048 透明底 PNG…');
    try {
      const output = document.createElement('canvas');
      output.width = output.height = 2048;
      renderPaper(output, history.paths, color);
      const blob = await pngBlob(output);
      const url = URL.createObjectURL(blob);
      urls.add(url);
      // Schedule cleanup even if creating or clicking the download link fails.
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 10000);
      const link = document.createElement('a');
      link.href = url;
      link.download = '一纸生花_自由剪纸.png';
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      // The browser needs time to consume the Blob before its URL is released.
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
  });
  resize.observe(drawing);
  on(window, 'pagehide', event => {
    endStroke(false);
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
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
}

const root = document.querySelector('#free-workspace');
if (root) mountWorkshop(root);
