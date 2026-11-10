/* Desktop-only hover cutouts: match the stage's actual 900px layout breakpoint. */
(() => {
  const desktop = window.matchMedia('(min-width: 901px)');
  let loaded = false;
  const fill = () => {
    if (!desktop.matches || loaded) return;
    loaded = true;
    document.querySelectorAll('.stage img[data-src]').forEach((img) => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  };
  if (document.readyState === 'complete') setTimeout(fill, 0);
  else window.addEventListener('load', () => setTimeout(fill, 0), { once: true });
  desktop.addEventListener('change', fill);
})();
