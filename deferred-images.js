(() => {
  'use strict';

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
