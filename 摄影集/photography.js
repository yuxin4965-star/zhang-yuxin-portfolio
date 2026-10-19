(() => {
  'use strict';

  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) {
    document.querySelectorAll('a[href]').forEach(anchor => {
      if (anchor.getAttribute('href').startsWith('#')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.endsWith('/index.html')) url.pathname = url.pathname.slice(0, -10);
      else if (url.pathname.endsWith('.html')) url.pathname = url.pathname.slice(0, -5);
      else return;
      anchor.href = url.href;
    });
  }

  const photos = window.PHOTOGRAPHY_PHOTOS || [];
  const stage = document.querySelector('.photo-stage');
  const track = document.querySelector('.photo-track');
  const status = document.querySelector('.gallery-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const imageQueue = [];
  const photoEntries = [];
  const strips = [];
  let inFlight = 0;
  let activationVersion = 0;
  let pending = -1;
  let active = -1;
  let tabStop = -1;
  let language = 'zh';
  let ready = false;
  let touch = null;
  let announcementTimer;
  let inputMode = 'mouse';
  let mousePoint = null;
  let pointerFrame = 0;
  let hasMouseSelection = false;
  let hoverSuppressed = false;
  let clippedStrips = new Set();
  const pointerStorageKey = 'photography-test-pointer-v2';
  let restoredPoint = null;
  try {
    const previous = JSON.parse(sessionStorage.getItem(pointerStorageKey));
    if (previous && Date.now() - previous.time < 30000 &&
        previous.width === innerWidth && previous.height === innerHeight) restoredPoint = previous;
  } catch (_) {}
  const earlyPoint = window.__takeGalleryPointer?.();
  if (earlyPoint) restoredPoint = earlyPoint;

  function displaySize(photo) {
    const style = getComputedStyle(document.body);
    const pixels = value => value.endsWith('vw') ? parseFloat(value) * innerWidth / 100 : parseFloat(value);
    const expanded = pixels(style.getPropertyValue('--expanded-width').trim());
    const inset = pixels(style.getPropertyValue('--photo-inset').trim());
    const height = Math.max(1, stage.clientHeight - (innerWidth < 768 ? 116 : 130));
    return Math.max(1, Math.round(Math.min(expanded - inset * 2, height * photo.width / photo.height)));
  }

  function pumpImages() {
    while (inFlight < 6 && imageQueue.length) {
      const entry = imageQueue.shift();
      entry.state = 'loading';
      inFlight++;
      const { image, photo } = entry;
      image.fetchPriority = entry.priority ? 'high' : 'low';
      if (photo) {
        image.sizes = `${displaySize(photo)}px`;
        image.srcset = photo.srcset;
      }
      image.src = entry.src;
      image.decode().then(() => {
        entry.state = 'loaded';
        image.classList.add('is-ready');
        entry.resolve(image);
        syncInitialHover();
      }).catch(() => {
        entry.state = 'error';
        entry.resolve(null);
      }).finally(() => {
        inFlight--;
        pumpImages();
      });
    }
  }

  function queueImage(image, src, photo = null) {
    const entry = { image, src, photo, state: 'queued', priority: false };
    entry.promise = new Promise(resolve => { entry.resolve = resolve; });
    imageQueue.push(entry);
    return entry;
  }

  function prioritize(entry) {
    entry.priority = true;
    entry.image.fetchPriority = 'high';
    if (entry.state === 'queued') {
      imageQueue.splice(imageQueue.indexOf(entry), 1);
      imageQueue.unshift(entry);
    }
  }

  function releaseEdgeImage(slot) {
    if (!slot || slot.decorationIndex < 0) return;
    slot.detailImage?.remove();
    slot.detailImage = null;
    slot.detailPromise = null;
  }

  function cancelPending() {
    activationVersion++;
    if (pending >= 0 && pending !== active) releaseEdgeImage(strips[pending]);
    pending = -1;
  }

  function clearDetail(index) {
    const slot = strips[index];
    slot.node.classList.remove('is-active', 'is-loaded');
    slot.node.setAttribute('aria-expanded', 'false');
    slot.node.tabIndex = -1;
    releaseEdgeImage(slot);
  }

  function layoutPhoto(index) {
    if (index < 0) return;
    const slot = strips[index];
    const photo = photos[slot.photoIndex];
    const value = getComputedStyle(document.body).getPropertyValue('--photo-inset').trim();
    const inset = value.endsWith('vw') ? parseFloat(value) * innerWidth / 100 : parseFloat(value);
    const width = Math.max(1, slot.node.clientWidth - inset * 2);
    const height = Math.max(1, stage.clientHeight - (innerWidth < 768 ? 116 : 130));
    const scale = Math.min(width / photo.width, height / photo.height);
    slot.node.style.setProperty('--image-width', `${Math.round(photo.width * scale)}px`);
    slot.node.style.setProperty('--image-height', `${Math.round(photo.height * scale)}px`);
  }

  function updateStripEdges(layout = null) {
    const next = new Set();
    if (layout) {
      const { frame, band, stripWidth, openedWidth, openedLeft } = layout;
      const openedRight = openedLeft + openedWidth;
      const epsilon = 1 / 32; // Ignore browser subpixel layout rounding.
      strips.forEach((slot, index) => {
        if (index === active) return;
        // Use untransformed flex positions, not the entrance scaleX animation.
        const left = band.left + index * stripWidth + (index > active ? openedWidth - stripWidth : 0);
        const visibleLeft = Math.max(frame.left, left);
        const visibleRight = Math.min(frame.right, left + stripWidth);
        const covered = Math.max(0, Math.min(visibleRight, openedRight) - Math.max(visibleLeft, openedLeft));
        const visibleWidth = Math.max(0, visibleRight - visibleLeft) - covered;
        if (visibleWidth > epsilon && visibleWidth < stripWidth - epsilon) next.add(index);
      });
    }
    clippedStrips.forEach(index => {
      if (!next.has(index)) strips[index].node.classList.remove('is-edge-clipped');
    });
    next.forEach(index => {
      if (!clippedStrips.has(index)) strips[index].node.classList.add('is-edge-clipped');
    });
    clippedStrips = next;
  }

  function positionPhoto() {
    // Preserve the original accordion layout, but clamp only the expanded
    // photo inside the stage. Never pan the band to reveal more edge strips.
    stage.scrollLeft = 0;
    if (active < 0) { updateStripEdges(); return; }
    const frame = stage.getBoundingClientRect();
    const band = track.getBoundingClientRect();
    const node = strips[active].node;
    const style = getComputedStyle(node);
    const stripWidth = parseFloat(style.getPropertyValue('--strip-width'));
    const width = parseFloat(style.width);
    const naturalLeft = band.left + active * stripWidth;
    const left = Math.max(frame.left, Math.min(frame.right - width, naturalLeft));
    node.style.setProperty('--opened-offset', `${left - naturalLeft}px`);
    updateStripEdges({ frame, band, stripWidth, openedWidth: width, openedLeft: left });
  }

  function announce(index) {
    clearTimeout(announcementTimer);
    if (index < 0) { status.textContent = ''; return; }
    announcementTimer = setTimeout(() => {
      const photoIndex = strips[index].photoIndex;
      const photo = photos[photoIndex];
      status.textContent = `${photoIndex + 1} / ${photos.length} — ${photo.title} — ${photo.details}`;
    }, 180);
  }

  function openReadyPhoto(index, image) {
    if (active >= 0) clearDetail(active);
    if (tabStop >= 0) strips[tabStop].node.tabIndex = -1;
    active = index;
    tabStop = index;
    const slot = strips[index];
    if (slot.decorationIndex >= 0) slot.detail.prepend(image);
    slot.node.classList.add('is-active', 'is-loaded');
    slot.node.setAttribute('aria-expanded', 'true');
    slot.node.tabIndex = 0;
    positionPhoto();
    layoutPhoto(index);
    announce(index);
  }

  // Edges keep their decorative crop and share the source photo's cached URL.
  // Only the currently selected edge needs an additional full-image node.
  function edgeImage(slot, source) {
    if (slot.detailPromise) return slot.detailPromise;
    const image = new Image();
    image.className = 'photo-detail__image';
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.src = source.currentSrc || source.src;
    slot.detailImage = image;
    slot.detailPromise = image.decode().then(() => image).catch(() => null);
    return slot.detailPromise;
  }

  function activate(index, mode = inputMode) {
    if (!ready || index < 0 || index >= strips.length) return;
    inputMode = mode;
    if (index === active) { cancelPending(); return; }
    if (index === pending) return;
    cancelPending();
    pending = index;
    const version = activationVersion;
    const slot = strips[index];
    const entry = photoEntries[slot.photoIndex];
    for (const neighbor of [slot.photoIndex + 1, slot.photoIndex - 1]) {
      if (photoEntries[neighbor]) prioritize(photoEntries[neighbor]);
    }
    prioritize(entry);
    pumpImages();
    const finish = image => {
      if (version !== activationVersion || pending !== index) return;
      pending = -1;
      if (image) openReadyPhoto(index, image);
      else status.textContent = language === 'zh' ? '照片暂时无法读取，请刷新后重试。' : 'Photo unavailable. Please refresh to retry.';
    };
    if (entry.state === 'loaded' && slot.decorationIndex < 0) finish(entry.image);
    else entry.promise.then(image => {
      if (version !== activationVersion || pending !== index) return null;
      return image && slot.decorationIndex >= 0 ? edgeImage(slot, image) : image;
    }).then(finish);
  }

  function close() {
    cancelPending();
    if (active < 0) return;
    const previous = active;
    clearDetail(previous);
    active = -1;
    strips[previous].node.tabIndex = 0;
    positionPhoto();
    announce(-1);
  }

  function createStrip(photoIndex, decorationIndex = -1) {
    const photo = photos[photoIndex];
    const node = document.createElement('button');
    node.type = 'button';
    node.className = decorationIndex < 0 ? 'photo-strip' : 'photo-strip photo-decoration';
    node.tabIndex = -1;
    node.dataset.photoId = photo.id;
    node.dataset.photoIndex = photoIndex;
    if (decorationIndex >= 0) node.dataset.decorationIndex = decorationIndex;
    node.setAttribute('aria-label', `${photo.title} — ${photo.details}`);
    node.setAttribute('aria-expanded', 'false');
    const preview = new Image();
    preview.className = 'photo-strip__sliver';
    preview.alt = '';
    preview.draggable = false;
    preview.decoding = 'async';
    if (decorationIndex < 0) {
      preview.width = photo.width;
      preview.height = photo.height;
      photoEntries[photoIndex] = queueImage(preview, photo.src, photo);
    } else queueImage(preview, window.PHOTOGRAPHY_DECORATIONS[decorationIndex]);
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
    node.append(preview, detail);
    const slot = { node, photoIndex, decorationIndex, detail, detailImage: null, detailPromise: null };
    node.addEventListener('focus', () => {
      if (node.matches(':focus-visible')) activate(slot.index, 'keyboard');
    });
    node.addEventListener('click', event => activate(slot.index, event.detail === 0 ? 'keyboard' : inputMode));
    return slot;
  }

  if (photos.length) {
    const central = photos.map((_, index) => createStrip(index));
    const extraCount = Math.max(0, 200 - photos.length);
    const beforeCount = Math.ceil(extraCount / 2);
    const decoration = index => createStrip((index * 37 + 11) % photos.length, index);
    for (let i = 0; i < beforeCount; i++) strips.push(decoration(i));
    strips.push(...central);
    for (let i = beforeCount; i < extraCount; i++) strips.push(decoration(i));
    const fragment = document.createDocumentFragment();
    strips.forEach((slot, index) => {
      slot.index = index;
      slot.node.dataset.index = index;
      fragment.appendChild(slot.node);
    });
    tabStop = beforeCount;
    central[0].node.tabIndex = 0;
    track.appendChild(fragment);
  }

  const frame = stage.getBoundingClientRect();
  const center = frame.left + frame.width / 2;
  imageQueue.forEach(entry => {
    const rect = entry.image.parentElement.getBoundingClientRect();
    entry.visible = rect.right > frame.left && rect.left < frame.right;
    entry.distance = Math.abs(rect.left + rect.width / 2 - center);
  });
  imageQueue.sort((a, b) => Number(b.visible) - Number(a.visible) ||
    Number(Boolean(b.photo)) - Number(Boolean(a.photo)) || a.distance - b.distance);
  imageQueue.slice(0, 6).forEach(entry => { entry.priority = true; });
  pumpImages();

  function insideStage(x, y) {
    const r = stage.getBoundingClientRect();
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }

  function selectAtPointer() {
    pointerFrame = 0;
    if (!mousePoint || inputMode !== 'mouse' || hoverSuppressed) return;
    const { x, y } = mousePoint;
    if (!insideStage(x, y)) { close(); return; }
    const node = document.elementFromPoint(x, y)?.closest('.photo-strip');
    // The expanded photo owns its fixed footprint; moving toward an edge
    // cannot expose a new strip under the pointer and start a panning loop.
    if (node && track.contains(node)) activate(Number(node.dataset.index), 'mouse');
  }

  function recordMouse(event) {
    if (event.pointerType !== 'mouse') return;
    const point = { x: event.clientX, y: event.clientY };
    const moved = !mousePoint || point.x !== mousePoint.x || point.y !== mousePoint.y;
    mousePoint = point;
    if (!moved) return;
    inputMode = 'mouse';
    hasMouseSelection = true;
    hoverSuppressed = false;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(selectAtPointer);
    rememberMouse();
  }

  function rememberMouse() {
    try {
      if (mousePoint && insideStage(mousePoint.x, mousePoint.y)) {
        sessionStorage.setItem(pointerStorageKey, JSON.stringify({ ...mousePoint,
          width: innerWidth, height: innerHeight, time: Date.now() }));
      } else sessionStorage.removeItem(pointerStorageKey);
    } catch (_) {}
  }

  function syncInitialHover() {
    if (!ready || hasMouseSelection || hoverSuppressed || inputMode !== 'mouse' || document.hidden) return;
    const node = stage.querySelector('.photo-strip:hover');
    if (node) {
      hasMouseSelection = true;
      restoredPoint = null;
      activate(Number(node.dataset.index), 'mouse');
    } else if (restoredPoint && insideStage(restoredPoint.x, restoredPoint.y)) {
      // Reload can clear CSS :hover without generating a new pointer event.
      // Restore only a recent point from this tab and the same viewport.
      mousePoint = { x: restoredPoint.x, y: restoredPoint.y };
      restoredPoint = null;
      hasMouseSelection = true;
      selectAtPointer();
    }
  }

  document.addEventListener('pointermove', recordMouse, { capture: true, passive: true });
  stage.addEventListener('scroll', () => { if (stage.scrollLeft) stage.scrollLeft = 0; }, { passive: true });
  stage.addEventListener('pointerenter', recordMouse);
  stage.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && !insideStage(event.clientX, event.clientY)) {
      mousePoint = { x: event.clientX, y: event.clientY };
      rememberMouse();
      close();
    }
  });
  document.addEventListener('pointerover', event => {
    if (!hasMouseSelection && stage.contains(event.target)) recordMouse(event);
  }, { passive: true });
  document.addEventListener('pointerdown', event => {
    inputMode = event.pointerType === 'mouse' ? 'mouse' : 'touch';
    if (!stage.contains(event.target)) close();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') inputMode = 'keyboard';
  }, true);

  track.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    const node = event.target.closest('.photo-strip');
    if (!node) return;
    const index = Number(node.dataset.index);
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, index, dragging: false };
    activate(index, 'touch');
  });
  track.addEventListener('pointermove', event => {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    if (!touch.dragging) {
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { touch = null; return; }
      touch.dragging = true;
      track.setPointerCapture(event.pointerId);
    }
    const step = Math.max(12, stage.clientWidth / strips.length);
    activate(Math.max(0, Math.min(strips.length - 1, touch.index + Math.round(dx / step))), 'touch');
  });
  track.addEventListener('pointerup', () => { touch = null; });
  track.addEventListener('pointercancel', () => { touch = null; });
  track.addEventListener('focusout', event => {
    if (inputMode === 'keyboard' && !track.contains(event.relatedTarget)) close();
  });
  track.addEventListener('keydown', event => {
    inputMode = 'keyboard';
    if (event.key === 'Escape') {
      hoverSuppressed = true;
      close();
      return;
    }
    const current = pending >= 0 ? pending : active >= 0 ? active : Number(event.target.dataset.index || 0);
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(strips.length - 1, current + 1);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, current - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = strips.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      activate(next, 'keyboard');
      strips[next].node.focus({ preventScroll: true });
    }
  });

  new ResizeObserver(() => {
    positionPhoto();
    layoutPhoto(active);
    photoEntries.forEach(entry => {
      if (entry.state !== 'queued') entry.image.sizes = `${displaySize(entry.photo)}px`;
    });
    syncInitialHover();
  }).observe(stage);
  window.addEventListener('blur', () => { rememberMouse(); mousePoint = null; close(); });
  window.addEventListener('pagehide', () => { if (mousePoint) rememberMouse(); });
  const resumeHover = () => {
    if (inputMode !== 'mouse') return;
    hasMouseSelection = false;
    requestAnimationFrame(syncInitialHover);
  };
  window.addEventListener('focus', resumeHover);
  window.addEventListener('pageshow', resumeHover);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) close();
    else resumeHover();
  });

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
    document.querySelector('.gallery-nav-link')?.setAttribute('aria-label', next === 'zh' ? '个人影集' : 'Personal album');
    const toggle = document.querySelector('.language-toggle');
    toggle?.setAttribute('aria-pressed', String(next === 'en'));
    toggle?.setAttribute('aria-label', next === 'zh' ? '切换为英文' : 'Switch to Chinese');
    toggle?.children[0]?.classList.toggle('active', next === 'zh');
    toggle?.children[1]?.classList.toggle('active', next === 'en');
    try { localStorage.setItem('portfolio-language', next); } catch (_) {}
  }
  try { language = localStorage.getItem('portfolio-language') === 'en' ? 'en' : 'zh'; } catch (_) {}
  applyLanguage(language);
  document.querySelector('.language-toggle')?.addEventListener('click', () => applyLanguage(language === 'zh' ? 'en' : 'zh'));

  ready = true;
  if (!photos.length) {
    status.classList.remove('sr-only');
    status.textContent = '照片列表加载失败，请刷新页面。';
    return;
  }
  const focused = document.activeElement?.closest('.photo-strip');
  if (focused) activate(Number(focused.dataset.index), 'keyboard');
  requestAnimationFrame(syncInitialHover);
  document.fonts?.ready.then(syncInitialHover);
  window.addEventListener('load', syncInitialHover, { once: true });
  if (!reducedMotion.matches) {
    const entrances = strips.map((slot, index) => slot.node.animate(
      [{ opacity: 0, transform: 'scaleX(4)' }, { opacity: 1, transform: 'scaleX(1)' }],
      { duration: 140, delay: Math.min(index, 48) * 8, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }
    ).finished);
    Promise.allSettled(entrances).then(syncInitialHover);
  }
})();
