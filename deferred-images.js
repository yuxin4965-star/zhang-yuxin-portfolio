(() => {
  'use strict';

  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      if (anchor.getAttribute('href').startsWith('#')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.endsWith('/index.html')) {
        url.pathname = url.pathname.slice(0, -'index.html'.length);
      } else if (url.pathname.endsWith('.html')) {
        url.pathname = url.pathname.slice(0, -'.html'.length);
      } else return;
      anchor.href = url.href;
    });
  }

  function prefetchAdjacentProjects() {
    document.querySelectorAll('.project-pagination a[href]').forEach((anchor) => {
      const hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.as = 'document';
      hint.href = anchor.href;
      document.head.appendChild(hint);
    });
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchAdjacentProjects, { timeout: 1800 });
  } else {
    window.setTimeout(prefetchAdjacentProjects, 900);
  }

  const deferredImages = [...document.querySelectorAll('img[data-src]')];
  if (!deferredImages.length) return;
  const loadingImages = new WeakSet();

  function loadImage(image) {
    if (!image.dataset.src || loadingImages.has(image)) return;
    loadingImages.add(image);
    image.loading = 'eager';
    image.src = image.dataset.src;
    image.decode().catch(() => {
      image.classList.add('image-load-error');
    }).finally(() => {
      image.removeAttribute('data-src');
      loadingImages.delete(image);
    });
  }

  function loadAllImages() {
    deferredImages.forEach(loadImage);
  }

  if (!('IntersectionObserver' in window)) {
    loadAllImages();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      loadImage(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '1200px 0px' });

  // Observe the section too: hidden palette/app frames still need their images
  // decoded before an existing scroll animation reveals them.
  const sections = new Map();
  deferredImages.forEach((image) => {
    const section = image.closest('.panel, .project-pagination');
    if (!section) { observer.observe(image); return; }
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(image);
  });
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      sections.get(entry.target).forEach(loadImage);
      sectionObserver.unobserve(entry.target);
    });
  }, { rootMargin: '1600px 0px' });
  sections.forEach((_, section) => sectionObserver.observe(section));
  window.addEventListener('beforeprint', loadAllImages, { once: true });
})();
