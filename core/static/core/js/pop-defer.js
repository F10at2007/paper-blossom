/* 首屏 hover 用的透明裁件体量偏大，先让背景与标题出图，页面 load 后再补这些图 */
(() => {
  const fill = () => {
    document.querySelectorAll('img[data-src]').forEach((img) => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  };
  if (document.readyState === 'complete') {
    setTimeout(fill, 0);
    return;
  }
  window.addEventListener('load', () => setTimeout(fill, 0), { once: true });
})();
