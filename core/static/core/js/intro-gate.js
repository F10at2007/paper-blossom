// 开场动画门厅：静音自动播放，播完自动淡出，露出本来就在下面渲染好了的首屏。
// 门厅不再铺黑底，视频直接叠在页面首屏上，淡出时同构图交接，所以是「接上」而不是「切一刀」。
// 只播一次（sessionStorage 记住），可手动重看。

const KEY = 'pb-intro-seen';
const gate = document.getElementById('gate');
const video = document.getElementById('intro-video');
const skip = document.getElementById('gate-skip');
const sound = document.getElementById('gate-sound');
const replay = document.getElementById('gate-replay');

if (gate && video) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let closed = false;
  let watchdogId = 0;
  let stallId = 0;
  let srcRef = video.getAttribute('src') || '';

  // 带宽不够时视频要十几秒才拿到元数据，人却被锁在门厅里干等。
  // 起播后 7 秒还没真正走动，就直接收场，把下载也停掉，不跟首屏抢带宽。
  const STALL_MS = 7000;
  const armStall = () => {
    window.clearTimeout(stallId);
    stallId = window.setTimeout(() => {
      if (closed) return;
      if (video.readyState >= 2 && video.currentTime >= 1) return;
      try { video.pause(); } catch (e) { /* 忽略 */ }
      srcRef = video.getAttribute('src') || srcRef;
      try { video.removeAttribute('src'); video.load(); } catch (e) { /* 忽略 */ }
      close(true);
    }, STALL_MS);
  };

  // 首屏那张图从 header 下面开始，视频要对齐同一个盒子
  const syncHeadHeight = () => {
    const head = document.querySelector('.site-head');
    if (head) document.documentElement.style.setProperty('--head-h', head.offsetHeight + 'px');
  };
  syncHeadHeight();
  window.addEventListener('resize', syncHeadHeight);

  const lockScroll = () => document.body.classList.add('gate-open');
  const unlockScroll = () => document.body.classList.remove('gate-open');

  // 保底：ended 不一定每次都触发（重看时手动把 currentTime 拨回 0、系统休眠被外部暂停等），
  // 每次开播都按片长自己再挂一次闹钟，走到片尾还没收场就收场。
  const armWatchdog = () => {
    window.clearTimeout(watchdogId);
    const dur = video.duration;
    if (!dur || !isFinite(dur) || dur <= 0) return;
    watchdogId = window.setTimeout(() => {
      // 已经等了比片长还长：不管是卡在片尾还是压根没往下走，都不再让人等一个手动结束
      if (!closed) close(false);
    }, (Math.min(dur, 30) + 2.4) * 1000);
  };

  const close = (remember = true) => {
    if (closed) return;
    closed = true;
    window.clearTimeout(watchdogId);
    window.clearTimeout(stallId);
    if (remember) {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* 隐私模式下忽略 */ }
    }
    gate.classList.add('is-done');
    unlockScroll();
    window.setTimeout(() => {
      gate.hidden = true;
      try { video.pause(); } catch (e) { /* 忽略 */ }
    }, 950);
  };

  const start = () => {
    const playNow = () => {
      try {
        video.muted = true;
        if (sound) { sound.textContent = '开启声音'; sound.setAttribute('aria-pressed', 'false'); }
        const played = video.play();
        armWatchdog();
        // 自动播放被浏览器拒绝时，不能让用户卡在门厅里等一个「手动结束」
        if (played && typeof played.catch === 'function') {
          played.catch(() => { window.setTimeout(() => close(false), 2600); });
        }
      } catch (e) {
        window.setTimeout(() => close(false), 2600);
      }
    };
    // 重看时视频停在片尾，直接 play() 有的环境不会重新从 0 走，
    // 先拨回开头、等 seeked 再播；seek 没回调也照常开播，不靠这一个事件卡住流程。
    const fromStart = video.ended || video.currentTime > 0.05;
    if (!fromStart) { playNow(); return; }
    let started = false;
    const once = () => {
      if (started || closed) return;
      started = true;
      playNow();
    };
    try { video.pause(); } catch (e) { /* 忽略 */ }
    video.addEventListener('seeked', once, { once: true });
    try { video.currentTime = 0; } catch (e) { once(); }
    window.setTimeout(once, 500);
  };

  const open = () => {
    closed = false;
    gate.hidden = false;
    gate.classList.remove('is-done');
    lockScroll();
    // 上次因为带宽不足把 src 摘掉了，重看时补回来
    if (!video.getAttribute('src') && srcRef) {
      video.setAttribute('src', srcRef);
      try { video.load(); } catch (e) { /* 忽略 */ }
    }
    armStall();
    try { window.scrollTo(0, 0); } catch (e) { /* 忽略 */ }
    start();
    if (skip) skip.classList.remove('is-visible');
    window.setTimeout(() => { if (skip && !closed) skip.classList.add('is-visible'); }, 1800);
  };

  const seen = () => {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  };

  if (reduce || seen() || new URLSearchParams(location.search).get('intro') === '0') {
    gate.hidden = true;
    closed = true;
    unlockScroll();
  } else {
    open();
    video.addEventListener('ended', () => close(true), { once: false });
    video.addEventListener('error', () => close(false), { once: false });
    // 元数据到手才知道片长，拿到就把保底闹钟挂上（重看时同样会重新挂）
    video.addEventListener('loadedmetadata', armWatchdog, { once: false });
    video.addEventListener('durationchange', armWatchdog, { once: false });
    video.addEventListener('play', armWatchdog, { once: false });
    // 切走标签页 / 系统休眠会把视频暂停，回来后接着播，别让人盯着一张定格图
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || closed || !gate || gate.hidden) return;
      if (video.paused && !video.ended) video.play().catch(() => { /* 忽略 */ });
    });
  }

  if (skip) skip.addEventListener('click', () => close(true));

  if (sound) {
    sound.addEventListener('click', () => {
      const muted = !video.muted;
      video.muted = muted;
      sound.textContent = muted ? '开启声音' : '关闭声音';
      sound.setAttribute('aria-pressed', muted ? 'false' : 'true');
      if (!muted) video.play().catch(() => { /* 忽略 */ });
    });
  }

  if (replay) {
    replay.addEventListener('click', () => {
      try { sessionStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
      open();
    });
  }

  // 空格 / 回车可直接跳过，照顾只想尽快进入的用户
  window.addEventListener('keydown', (event) => {
    if (closed) return;
    if (event.key === 'Escape' || event.key === ' ') {
      event.preventDefault();
      close(true);
    }
  });
}
