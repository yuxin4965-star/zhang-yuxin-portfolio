(() => {
  const page = document.body;
  const desktop = window.matchMedia('(min-width: 701px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lenis = null;
  let lenisFrame = 0;

  function updateProfileState(scrollPosition = window.scrollY) {
    page.classList.toggle('is-profile-scrolled', scrollPosition > 16);
  }

  function destroyLenis() {
    if (lenisFrame) cancelAnimationFrame(lenisFrame);
    lenisFrame = 0;
    if (lenis) lenis.destroy();
    lenis = null;
  }

  function lenisRaf(time) {
    if (!lenis) return;
    lenis.raf(time);
    lenisFrame = requestAnimationFrame(lenisRaf);
  }

  function initLenis() {
    destroyLenis();
    if (!desktop.matches || reducedMotion.matches || typeof window.Lenis !== 'function') {
      updateProfileState();
      return;
    }

    lenis = new window.Lenis({
      lerp: 0.15,
      wheelMultiplier: 0.8,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false,
      anchors: true
    });
    lenis.on('scroll', ({ scroll }) => updateProfileState(scroll));
    lenisFrame = requestAnimationFrame(lenisRaf);
  }

  function waitForHeroAssets() {
    const portrait = document.querySelector('.motion-hero-image');
    const imageReady = portrait && typeof portrait.decode === 'function'
      ? portrait.decode().catch(() => undefined)
      : Promise.resolve();
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise((resolve) => window.setTimeout(resolve, 300));

    return Promise.race([Promise.all([imageReady, fontsReady]), timeout]);
  }

  function revealHero() {
    waitForHeroAssets().finally(() => {
      requestAnimationFrame(() => page.classList.add('is-hero-visible'));
    });
  }

  function prepareSection(section) {
    const selectors = [
      '.about-section__heading h2',
      'time',
      '.about-entry__copy h3',
      '.about-entry__copy > p',
      '.about-entry__description > p',
      '.about-skills__column h3',
      '.about-plus-list > li'
    ];
    const targets = [...new Set(section.querySelectorAll(selectors.join(',')))];

    targets.forEach((target, index) => {
      target.classList.add('motion-reveal');
      target.style.setProperty('--motion-delay', `${Math.min(120 + index * 58, 760)}ms`);
    });
  }

  function prepareScrollMotion() {
    const sections = [...document.querySelectorAll('.about-section')];
    sections.forEach(prepareSection);

    if (!('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add('is-motion-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-motion-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.01,
      rootMargin: '0px 0px -14% 0px'
    });

    sections.forEach((section) => observer.observe(section));
  }

  function prepareMotion() {
    if (page.classList.contains('motion-prepared') || reducedMotion.matches) return;
    page.classList.add('motion-prepared', 'motion-enabled');
    prepareScrollMotion();
    revealHero();
  }

  page.addEventListener('animationend', (event) => {
    if (event.target.matches('.motion-reveal, .motion-line__inner, .motion-hero-media, .motion-hero-image, .about-section__rule, .about-profile-link__arrow')) {
      event.target.style.willChange = 'auto';
    }
  });

  window.addEventListener('scroll', () => updateProfileState(), { passive: true });
  desktop.addEventListener('change', initLenis);
  reducedMotion.addEventListener('change', () => {
    initLenis();
    prepareMotion();
  });
  window.addEventListener('pagehide', destroyLenis);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) initLenis();
    updateProfileState();
  });

  prepareMotion();
  initLenis();
  updateProfileState();
})();
