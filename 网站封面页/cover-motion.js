(() => {
  const page = document.body;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function waitForCoverAssets() {
    const photo = document.querySelector('.motion-cover-photo');
    const imageReady = photo && typeof photo.decode === 'function'
      ? photo.decode().catch(() => undefined)
      : Promise.resolve();
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise((resolve) => window.setTimeout(resolve, 250));

    return Promise.race([Promise.all([imageReady, fontsReady]), timeout]);
  }

  function assignDelays() {
    document.querySelectorAll('.home-cover__roles > span').forEach((item, index) => {
      item.style.setProperty('--motion-delay', `${500 + index * 42}ms`);
    });

    document.querySelectorAll('.motion-cover-footer > span').forEach((item, index) => {
      item.style.setProperty('--motion-delay', `${820 + index * 90}ms`);
    });
  }

  function prepareCoverMotion() {
    if (page.classList.contains('cover-motion-prepared') || reducedMotion.matches) return;
    page.classList.add('cover-motion-prepared', 'cover-motion-enabled');
    assignDelays();

    waitForCoverAssets().finally(() => {
      requestAnimationFrame(() => page.classList.add('is-cover-visible'));
    });
  }

  page.addEventListener('animationend', (event) => {
    if (event.target.matches('.motion-cover-media, .motion-cover-photo, .home-canvas__veil, .portfolio-mark, .motion-cover-line, .home-cover__roles > span, .motion-cover-header, .motion-cover-footer > span')) {
      event.target.style.willChange = 'auto';
    }
  });

  reducedMotion.addEventListener('change', prepareCoverMotion);
  prepareCoverMotion();
})();
