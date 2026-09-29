(() => {
  const page = document.body;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function assignDelays() {
    document.querySelectorAll('.contact-page__list a').forEach((row, index) => {
      const baseDelay = 500 + index * 150;
      row.style.setProperty('--row-delay', `${baseDelay}ms`);
      row.style.setProperty('--arrow-delay', `${baseDelay + 90}ms`);
      row.style.setProperty('--line-delay', `${baseDelay + 130}ms`);
    });

    document.querySelectorAll('.motion-contact-footer > span').forEach((item, index) => {
      item.style.setProperty('--motion-delay', `${850 + index * 90}ms`);
    });
  }

  function waitForFonts() {
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise((resolve) => window.setTimeout(resolve, 700));
    return Promise.race([fontsReady, timeout]);
  }

  function prepareContactMotion() {
    if (page.classList.contains('contact-motion-prepared') || reducedMotion.matches) return;
    page.classList.add('contact-motion-prepared', 'contact-motion-enabled');
    assignDelays();

    waitForFonts().finally(() => {
      requestAnimationFrame(() => page.classList.add('is-contact-visible'));
    });
  }

  page.addEventListener('animationend', (event) => {
    if (event.target.matches('.motion-contact-header, .motion-contact-line, .contact-page__list a > span, .motion-contact-footer > span')) {
      event.target.style.willChange = 'auto';
    }
  });

  reducedMotion.addEventListener('change', prepareContactMotion);
  prepareContactMotion();
})();
