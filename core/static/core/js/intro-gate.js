// 静音开场门厅。所有事件和控件绑定完成后才显示，失败时首页入口始终可用。
const KEY = 'pb-intro-seen';
const gate = document.getElementById('gate');
const video = document.getElementById('intro-video');
const skip = document.getElementById('gate-skip');
const sound = document.getElementById('gate-sound');
const replay = document.getElementById('gate-replay');

if (gate && video && skip && sound && replay) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let closed = true, epoch = 0, watchdogId = 0, stallId = 0, fadeId = 0, srcRef = video.getAttribute('src') || '';
  const STALL_MS = 7000;
  const clearTimers = () => { clearTimeout(watchdogId); clearTimeout(stallId); clearTimeout(fadeId); };
  const syncHeadHeight = () => {
    const head = document.querySelector('.site-head');
    if (head) document.documentElement.style.setProperty('--head-h', head.offsetHeight + 'px');
  };
  const lockScroll = () => {
    document.body.classList.add('gate-open');
    for (const item of document.body.children) if (item !== gate && !item.contains(gate)) item.inert = true;
    for (const item of document.querySelector('main').children) if (item !== gate) item.inert = true;
  };
  const unlockScroll = () => {
    document.body.classList.remove('gate-open');
    for (const item of document.body.children) item.inert = false;
    for (const item of document.querySelector('main').children) item.inert = false;
  };
  const armWatchdog = token => {
    clearTimeout(watchdogId);
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) watchdogId = setTimeout(() => { if (!closed && token === epoch) close(true, token); }, (Math.min(duration, 30) + 2.4) * 1000);
  };
  function close(remember = true, token = epoch) {
    if (closed || token !== epoch) return;
    closed = true; clearTimers();
    if (remember) { try { sessionStorage.setItem(KEY, '1'); } catch {} }
    gate.classList.add('is-done'); unlockScroll();
    replay.focus({ preventScroll: true });
    fadeId = setTimeout(() => {
      if (token !== epoch || !closed) return;
      gate.hidden = true;
      try { video.pause(); } catch {}
    }, 950);
  }
  const play = token => {
    if (closed || token !== epoch) return;
    try {
      video.muted = true; sound.textContent = '开启声音'; sound.setAttribute('aria-pressed', 'false');
      const result = video.play(); armWatchdog(token);
      if (result?.catch) result.catch(() => { if (!closed && token === epoch) setTimeout(() => close(false, token), 2600); });
    } catch { setTimeout(() => close(false, token), 2600); }
  };
  const open = () => {
    clearTimers(); const token = ++epoch; closed = false;
    gate.hidden = false; gate.classList.remove('is-done'); lockScroll();
    if (!video.getAttribute('src') && srcRef) { video.setAttribute('src', srcRef); try { video.load(); } catch {} }
    try { scrollTo(0, 0); } catch {}
    sound.focus({ preventScroll: true });
    stallId = setTimeout(() => {
      if (closed || token !== epoch || (video.readyState >= 2 && video.currentTime >= 1)) return;
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
      close(true, token);
    }, STALL_MS);
    const start = () => {
      if (closed || token !== epoch) return;
      if (!video.ended && video.currentTime <= .05) { play(token); return; }
      let started = false;
      const once = () => { if (started || closed || token !== epoch) return; started = true; video.removeEventListener('seeked', once); play(token); };
      video.addEventListener('seeked', once);
      try { video.currentTime = 0; } catch { once(); }
      setTimeout(once, 500);
    };
    start();
    skip.classList.remove('is-visible');
    setTimeout(() => { if (!closed && token === epoch) skip.classList.add('is-visible'); }, 1800);
  };
  const seen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

  // Bind all exit paths before a successful setup can expose the gate.
  skip.addEventListener('click', () => close(true));
  sound.addEventListener('click', () => {
    if (closed) return;
    const muted = !video.muted; video.muted = muted;
    sound.textContent = muted ? '开启声音' : '关闭声音'; sound.setAttribute('aria-pressed', String(!muted));
    if (!muted) video.play().catch(() => {});
  });
  replay.addEventListener('click', () => { try { sessionStorage.removeItem(KEY); } catch {} open(); });
  video.addEventListener('ended', () => { if (video.ended) close(true); });
  video.addEventListener('error', () => close(false));
  video.addEventListener('loadedmetadata', () => { if (!closed) armWatchdog(epoch); });
  video.addEventListener('durationchange', () => { if (!closed) armWatchdog(epoch); });
  video.addEventListener('play', () => { if (!closed) armWatchdog(epoch); });
  window.addEventListener('keydown', event => {
    if (closed) return;
    if (event.key === 'Escape' || event.key === ' ') { event.preventDefault(); close(true); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const canSkip = skip.classList.contains('is-visible');
      (canSkip && document.activeElement === sound ? skip : sound).focus();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!closed && !document.hidden && video.paused && !video.ended) video.play().catch(() => {});
  });
  window.addEventListener('resize', syncHeadHeight); syncHeadHeight();
  if (!reduce && !seen() && new URLSearchParams(location.search).get('intro') !== '0') { open(); }
  else { gate.hidden = true; closed = true; unlockScroll(); }
}
