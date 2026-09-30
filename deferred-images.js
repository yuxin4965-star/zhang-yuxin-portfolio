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

  function loadImage(image) {
    if (!image.dataset.src) return;
    image.src = image.dataset.src;
    image.removeAttribute('data-src');
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

  deferredImages.forEach((image) => observer.observe(image));
  window.addEventListener('beforeprint', loadAllImages, { once: true });
})();
