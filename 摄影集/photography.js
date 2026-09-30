(() => {
  'use strict';

  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.endsWith('/index.html')) {
        url.pathname = url.pathname.slice(0, -'index.html'.length);
      } else if (url.pathname.endsWith('.html')) {
        url.pathname = url.pathname.slice(0, -'.html'.length);
      }
      anchor.href = url.href;
    });
  }

  const photos = window.PHOTOGRAPHY_PHOTOS || [];
  const stage = document.querySelector('.photo-stage');
  const track = document.querySelector('.photo-track');
  const status = document.querySelector('.gallery-status');
  const loader = document.querySelector('.photo-loader');
  const progress = document.querySelector('.photo-loader__progress');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fullImages = new Map();
  const imageQueue = [];
  const previewQueue = [];
  let inFlight = 0;
  let previewInFlight = 0;
  let activationVersion = 0;
  const strips = [];
  // Exactly one interactive strip per photo. The remaining visual slivers
  // extend the band at both ends without duplicating any preview controls.
  const visualStripCount = Math.max(200, photos.length);
  let active = -1;
  let language = 'zh';
  let ready = false;
  let touch = null;
  let announcementTimer;

  function pumpPreviews() {
    while (previewInFlight < 8 && previewQueue.length) {
      const entry = previewQueue.shift();
      previewInFlight++;
      const finish = () => {
        entry.image.onload = null;
        entry.image.onerror = null;
        previewInFlight--;
        entry.resolve();
        pumpPreviews();
      };
      entry.image.onload = finish;
      entry.image.onerror = finish;
      entry.image.fetchPriority = entry.priority ? 'high' : 'low';
      entry.image.src = entry.src;
      if (entry.image.complete) finish();
    }
  }

  function queuePreview(image, src, priority = false) {
    return new Promise((resolve) => {
      previewQueue.push({ image, src, priority, resolve });
    });
  }

  // No low-resolution placeholder or pixel shader. Decode the native-size
  // image before inserting it. Limit full-resolution requests and memory.
  function trimImageCache() {
    for (const [index, entry] of fullImages) {
      if (fullImages.size <= 4) break;
      if (entry.state === 'loaded' && Math.abs(index - active) > 1) fullImages.delete(index);
    }
  }

  function pumpImages() {
    while (inFlight < 2 && imageQueue.length) {
      const entry = imageQueue.shift();
      entry.state = 'loading';
      inFlight++;
      const image = new Image();
      image.className = 'photo-detail__image';
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.fetchPriority = entry.index === active ? 'high' : 'low';
      image.src = photos[entry.index].src;
      image.decode().then(() => {
        entry.state = 'loaded';
        entry.resolve(image);
      }).catch(() => {
        fullImages.delete(entry.index);
        entry.resolve(null);
      }).finally(() => {
        inFlight--;
        trimImageCache();
        pumpImages();
      });
    }
  }

  function getFullImage(index, priority = false) {
    let entry = fullImages.get(index);
    if (!entry) {
      entry = { index, state: 'queued' };
      entry.promise = new Promise(resolve => { entry.resolve = resolve; });
      fullImages.set(index, entry);
      imageQueue.push(entry);
    }
    if (priority && entry.state === 'queued') {
      imageQueue.splice(imageQueue.indexOf(entry), 1);
      imageQueue.unshift(entry);
    }
    pumpImages();
    return entry.promise;
  }

  function discardStaleRequests() {
    for (let i = imageQueue.length - 1; i >= 0; i--) {
      const entry = imageQueue[i];
      if (active < 0 || Math.abs(entry.index - active) > 1) {
        imageQueue.splice(i, 1);
        fullImages.delete(entry.index);
        entry.resolve(null);
      }
    }
    trimImageCache();
  }

  function clearDetail(index) {
    const strip = strips[index];
    strip.querySelector('.photo-detail__image')?.remove();
    strip.classList.remove('is-loaded', 'is-loading', 'is-error');
    strip.removeAttribute('aria-busy');
  }

  function layoutPhoto(index) {
    if (index < 0) return;
    const strip = strips[index];
    const photo = photos[index];
    const insetText = getComputedStyle(document.body).getPropertyValue('--photo-inset').trim();
    const inset = insetText.endsWith('vw') ? parseFloat(insetText) * innerWidth / 100 : parseFloat(insetText);
    const availableWidth = Math.max(1, strip.clientWidth - inset * 2);
    // Allow two or three caption lines under both portrait and landscape images.
    const availableHeight = Math.max(1, stage.clientHeight - (innerWidth < 768 ? 116 : 130));
    const scale = Math.min(availableWidth / photo.width, availableHeight / photo.height);
    strip.style.setProperty('--image-width', `${Math.round(photo.width * scale)}px`);
    strip.style.setProperty('--image-height', `${Math.round(photo.height * scale)}px`);
  }

  function positionTrack() {
    track.style.setProperty('--track-shift', '0px');
    if (active < 0) return;
    const frame = stage.getBoundingClientRect();
    const opened = strips[active].getBoundingClientRect();
    const margin = 6;
    let shift = 0;
    // Match centered overflow cropping, but keep the selected photograph
    // accessible at the ends of the collection and on narrow screens.
    if (opened.left < frame.left + margin) shift = frame.left + margin - opened.left;
    else if (opened.right > frame.right - margin) shift = frame.right - margin - opened.right;
    track.style.setProperty('--track-shift', `${shift}px`);
  }

  function announce(index) {
    clearTimeout(announcementTimer);
    if (index < 0) { status.textContent = ''; return; }
    announcementTimer = setTimeout(() => {
      const p = photos[index];
      status.textContent = `${index + 1} / ${photos.length} — ${p.title} — ${p.details}`;
    }, 180);
  }

  function activate(index) {
    if (!ready || index === active || index < 0 || index >= photos.length) return;
    if (active >= 0) {
      clearDetail(active);
      strips[active].classList.remove('is-active');
      strips[active].setAttribute('aria-expanded', 'false');
      strips[active].tabIndex = -1;
    }
    active = index;
    const version = ++activationVersion;
    discardStaleRequests();
    strips[0].tabIndex = index === 0 ? 0 : -1;
    const strip = strips[index];
    strip.classList.add('is-active');
    strip.setAttribute('aria-expanded', 'true');
    strip.tabIndex = 0;
    positionTrack();
    layoutPhoto(index);
    const detail = strip.querySelector('.photo-detail');
    strip.classList.add('is-loading');
    strip.setAttribute('aria-busy', 'true');
    getFullImage(index, true).then(image => {
      if (active !== index || version !== activationVersion) return;
      strip.classList.remove('is-loading');
      strip.setAttribute('aria-busy', 'false');
      if (!image) {
        strip.classList.add('is-error');
        status.textContent = language === 'zh' ? '照片加载失败，请移开后重试。' : 'Photo could not load. Move away and try again.';
        return;
      }
      detail.prepend(image);
      strip.classList.add('is-loaded');
      // Nearby originals load only after the selected photo is ready.
      if (index > 0) getFullImage(index - 1);
      if (index + 1 < photos.length) getFullImage(index + 1);
    });
    announce(index);
  }

  function close() {
    if (active < 0) return;
    clearDetail(active);
    activationVersion++;
    strips[active].classList.remove('is-active');
    strips[active].setAttribute('aria-expanded', 'false');
    // Preserve the focused item's tab stop for keyboard users.
    if (!track.contains(document.activeElement)) {
      strips[active].tabIndex = -1;
      strips[0].tabIndex = 0;
    }
    active = -1;
    discardStaleRequests();
    positionTrack();
    announce(-1);
  }

  const fragment = document.createDocumentFragment();
  let loaded = 0;
  photos.forEach((photo, index) => {
    const strip = document.createElement('button');
    strip.type = 'button';
    strip.className = 'photo-strip';
    strip.dataset.index = index;
    strip.dataset.photoId = photo.id;
    strip.tabIndex = index === 0 ? 0 : -1;
    strip.setAttribute('aria-label', `${photo.title} — ${photo.details}`);
    strip.setAttribute('aria-expanded', 'false');
    const preview = new Image();
    preview.className = 'photo-strip__sliver';
    preview.alt = '';
    preview.draggable = false;
    preview.decoding = 'async';
    preview.dataset.src = photo.preview;
    const detail = document.createElement('span');
    detail.className = 'photo-detail';
    detail.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span');
    caption.className = 'photo-caption';
    for (const value of [photo.title, photo.details]) {
      const line = document.createElement('span');
      line.textContent = value;
      caption.appendChild(line);
    }
    detail.appendChild(caption);
    strip.append(preview, detail);
    strip.addEventListener('focus', () => activate(index));
    strip.addEventListener('click', () => activate(index));
    strips.push(strip);
    fragment.appendChild(strip);
  });
  function decoration(index) {
    const sliver = document.createElement('span');
    sliver.className = 'photo-decoration';
    sliver.setAttribute('aria-hidden', 'true');
    const preview = new Image();
    preview.className = 'photo-strip__sliver';
    preview.alt = '';
    preview.draggable = false;
    preview.decoding = 'async';
    // Sample different narrow portions of existing previews for texture only.
    // No photo id, button, detail view or event handler is attached here.
    preview.dataset.src = window.PHOTOGRAPHY_DECORATIONS?.[index] || photos[(index * 37 + 11) % photos.length].preview;
    sliver.appendChild(preview);
    return sliver;
  }
  if (photos.length) {
    const extraCount = visualStripCount - photos.length;
    const beforeCount = Math.ceil(extraCount / 2);
    for (let i = 0; i < beforeCount; i++) track.appendChild(decoration(i));
    track.appendChild(fragment);
    for (let i = beforeCount; i < extraCount; i++) track.appendChild(decoration(i));
  }

  const previewImages = [...track.querySelectorAll('.photo-strip__sliver')];
  const priorityStep = Math.max(1, Math.floor(previewImages.length / 24));
  const priorityImages = previewImages.filter((_, index) => index % priorityStep === 0);
  const regularImages = previewImages.filter((_, index) => index % priorityStep !== 0);
  const previewLoads = new Map();
  [...priorityImages, ...regularImages].forEach((preview) => {
    const promise = queuePreview(preview, preview.dataset.src, priorityImages.includes(preview)).then(() => {
      loaded++;
      progress.style.transform = `scaleX(${loaded / previewImages.length})`;
    });
    previewLoads.set(preview, promise);
  });
  pumpPreviews();

  track.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') {
      const strip = event.target.closest('.photo-strip');
      if (strip) activate(Number(strip.dataset.index));
      else close();
      return;
    }
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    if (!touch.dragging) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { touch = null; return; }
      touch.dragging = true;
      track.setPointerCapture(event.pointerId);
    }
    const step = Math.max(12, stage.clientWidth / photos.length);
    activate(Math.max(0, Math.min(photos.length - 1, touch.index + Math.round(dx / step))));
  });
  track.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    const strip = event.target.closest('.photo-strip');
    if (!strip) return;
    const index = Number(strip.dataset.index);
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, index, dragging: false };
    activate(index);
  });
  track.addEventListener('pointerup', () => { touch = null; });
  track.addEventListener('pointercancel', () => { touch = null; });
  track.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') close();
  });
  document.addEventListener('pointerdown', event => {
    if (!track.contains(event.target)) close();
  });
  track.addEventListener('focusout', event => {
    if (!track.contains(event.relatedTarget)) close();
  });
  track.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); return; }
    let next;
    const current = active >= 0 ? active : Number(event.target.dataset.index || 0);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(photos.length - 1, current + 1);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, current - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = photos.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      activate(next);
      strips[next].focus({ preventScroll: true });
    }
  });
  new ResizeObserver(() => { positionTrack(); layoutPhoto(active); }).observe(stage);

  const words = {
    zh: { collection: '影集', navWork: '项目', navAbout: '关于', navContact: '联系', help: '鼠标划过照片展开查看；手机可点按或横向滑动。键盘左右方向键切换，Escape 收起。' },
    en: { collection: 'Photography', navWork: 'Work', navAbout: 'About', navContact: 'Contact', help: 'Hover to explore. On touch screens, tap or drag sideways. Use arrow keys to browse and Escape to close.' },
  };
  function applyLanguage(next) {
    language = next;
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    document.title = `${words[next].collection} — Zhang Yuxin`;
    document.querySelectorAll('[data-label]').forEach(el => { el.textContent = words[next][el.dataset.label]; });
    document.getElementById('gallery-help').textContent = words[next].help;
    const toggle = document.querySelector('.language-toggle');
    const albumLink = document.querySelector('.gallery-nav-link');
    albumLink?.setAttribute('aria-label', next === 'zh' ? '个人影集' : 'Personal album');
    toggle?.setAttribute('aria-pressed', String(next === 'en'));
    toggle?.setAttribute('aria-label', next === 'zh' ? '切换为英文' : 'Switch to Chinese');
    toggle?.children[0]?.classList.toggle('active', next === 'zh');
    toggle?.children[1]?.classList.toggle('active', next === 'en');
    try { localStorage.setItem('portfolio-language', next); } catch (_) {}
  }
  try { language = localStorage.getItem('portfolio-language') === 'en' ? 'en' : 'zh'; } catch (_) {}
  applyLanguage(language);
  document.querySelector('.language-toggle')?.addEventListener('click', () => applyLanguage(language === 'zh' ? 'en' : 'zh'));

  async function start() {
    await Promise.all([
      new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : 250)),
      Promise.race([
        Promise.all(priorityImages.map(image => previewLoads.get(image))),
        new Promise(resolve => setTimeout(resolve, 1800)),
      ]),
    ]);
    ready = true;
    loader.classList.add('is-done');
    setTimeout(() => loader.remove(), 350);
    if (!photos.length) {
      status.classList.remove('sr-only');
      status.textContent = '照片列表加载失败，请刷新页面。';
      return;
    }
    if (!reducedMotion.matches) {
      [...track.children].forEach((strip, index) => {
        strip.animate([{ opacity: 0, transform: 'scaleX(4)' }, { opacity: 1, transform: 'scaleX(1)' }],
          { duration: 140, delay: Math.min(index, 48) * 8, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      });
    }
  }
  start();
})();
