/* Project-detail behavior, matching the existing POLSO / portfolio timings. */
(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.reading-progress');
  const directory = document.querySelector('.chapter-nav');
  const links = [...directory.querySelectorAll('a')];
  const sections = [...document.querySelectorAll('.panel')];
  const arrow = document.querySelector('.cover-arrow');
  const prototypeDivider = document.querySelector('#prototype .prototype-divider');
  const research = document.querySelector('#research');
  const researchBoundary = research.querySelector('[data-node-id="3651:1710"]');
  const chapterBoundaries = [
    { chapter: 'overview', element: document.querySelector('#overview') },
    { chapter: 'process', element: document.querySelector('#process') },
    { chapter: 'research', element: research },
    // This page intentionally overlaps Research, so its visual divider is the boundary.
    { chapter: 'requirements', element: researchBoundary, edge: 'bottom' },
    { chapter: 'users', element: document.querySelector('#users') },
    { chapter: 'video', element: document.querySelector('#video') },
    { chapter: 'concept', element: document.querySelector('#concept') },
    { chapter: 'prototype', element: document.querySelector('#prototype') }
  ].filter(({ element }) => element);
  const researchArtboard = research.querySelector('.artboard');
  const researchProgress = document.createElement('div');
  researchProgress.className = 'research-timeline-progress';
  researchProgress.setAttribute('aria-hidden', 'true');
  researchArtboard.append(researchProgress);
  const researchDots = [
    { y: 236.068, id: '3640:2462' }, { y: 520.168, id: '3640:2463' },
    { y: 762.809, id: '3642:2686' }, { y: 809.502, id: '3642:2719' },
    { y: 1035.466, id: '3642:2720' }, { y: 1263.932, id: '3642:2736' },
    { y: 1551.598, id: '3642:2744' }
  ];
  const researchLabels = [
    { y: 466.967, frame: '3642:2730', text: '3642:2731' },
    { y: 1498.396, frame: '3642:2742', text: '3642:2743' }
  ];
  const researchRuleProgresses = [
    { y: 466.967, left: 208, top: 466.5, width: 1055 },
    { y: 1498.396, left: 208, top: 1497.5, width: 1056 }
  ].map(rule => {
    const progress = document.createElement('div');
    progress.className = 'research-rule-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.style.setProperty('--rule-width', `${rule.width}px`);
    progress.style.left = `${rule.left}px`;
    progress.style.top = `${rule.top}px`;
    researchArtboard.append(progress);
    return {...rule, progress};
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Lenis runs only above the site's mobile breakpoint. The guard makes this
  // safe if the local vendor file is ever unavailable.
  const desktop = matchMedia('(min-width: 701px)');
  let lenis = null;
  let lenisFrame = 0;
  let scheduled = 0;
  let active = '';
  let leaving = false;
  let navigationTimer;

  function update() {
    scheduled = 0;
    const headerHeight = header.getBoundingClientRect().height;
    const range = Math.max(1, root.scrollHeight - innerHeight);
    const fraction = Math.max(0, Math.min(1, scrollY / range));
    progress.firstElementChild.style.transform = `scaleX(${.0572917 + .9427083 * fraction})`;
    progress.setAttribute('aria-valuenow', Math.round(fraction * 100));
    const referenceY = headerHeight + 2;
    // The visual page boundary, rather than panel height, determines each
    // directory item. This keeps the active item accurate through overlaps
    // and intentional white space between pages.
    const current = sections.filter(section => section.getBoundingClientRect().top <= referenceY).at(-1) || sections[0];
    const boundary = chapterBoundaries.filter(({ element, edge }) => {
      const bounds = element.getBoundingClientRect();
      return edge === 'bottom' ? bounds.bottom <= referenceY : bounds.top <= referenceY;
    }).at(-1);
    const chapter = boundary?.chapter || '';
    // The prototype footer is shorter than a desktop viewport, so its divider
    // cannot always reach the fixed header. Hide as soon as the divider moves
    // through the lower page boundary (75% of the viewport) instead.
    const dividerStillVisible = !prototypeDivider || prototypeDivider.getBoundingClientRect().top > innerHeight * .75;
    const visible = Boolean(chapter) && dividerStillVisible && fraction < .999;
    directory.classList.toggle('is-visible', visible);
    directory.inert = !visible;
    if (active !== chapter) {
      active = chapter;
      for (const link of links) {
        const selected = link.dataset.chapterLink === chapter;
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
        if (selected && innerWidth <= 700) {
          directory.scrollTo({left: link.offsetLeft - directory.clientWidth / 2 + link.offsetWidth / 2, behavior: reduced.matches ? 'instant' : 'smooth'});
        }
      }
    }
    header.dataset.theme = current.id === 'cover' ? 'dark' : 'light';
    arrow.classList.toggle('is-scroll-active', scrollY > 2);

    // The research timeline follows the viewport's centre point in both
    // directions. No scroll history is stored, so every state reverses
    // naturally while the visitor scrolls back up.
    const scale = parseFloat(getComputedStyle(root).getPropertyValue('--scale')) || 1;
    const researchBounds = research.getBoundingClientRect();
    const localY = (innerHeight * .5 - researchBounds.top) / scale;
    const timelineStart = 235.837;
    const timelineEnd = 2247;
    const progressEnd = Math.min(timelineEnd, Math.max(timelineStart, localY));
    researchProgress.style.height = `${progressEnd - timelineStart}px`;
    researchDots.forEach(({y, id}) => {
      research.querySelector(`[data-node-id="${id}"]`).classList.toggle('research-active-dot', localY >= y);
    });
    researchLabels.forEach(({y, frame, text}) => {
      research.querySelector(`[data-node-id="${frame}"]`).classList.toggle('research-active-label', localY >= y);
      research.querySelector(`[data-node-id="${text}"]`).classList.toggle('research-active-label-text', localY >= y);
    });
    researchRuleProgresses.forEach(({y, progress}) => {
      progress.classList.toggle('is-active', localY >= y);
    });
  }

  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(update);
  }
  function resize() {
    const scale = root.clientWidth / 1440;
    root.style.setProperty('--scale', scale);
    root.style.setProperty('--cover-scale', innerWidth > 700 ? Math.max(scale, innerHeight / 785) : scale);
    schedule();
  }
  function goTo(target, smooth = true) {
    const y = Math.max(0, target.getBoundingClientRect().top + scrollY - header.getBoundingClientRect().height);
    if (lenis && smooth && !reduced.matches) {
      lenis.scrollTo(y, {immediate: false});
      return;
    }
    scrollTo({top: y, behavior: smooth && !reduced.matches ? 'smooth' : 'instant'});
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
    if (!desktop.matches || reduced.matches || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({
      lerp: 0.15,
      wheelMultiplier: 0.8,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false
    });
    lenisFrame = requestAnimationFrame(lenisRaf);
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      goTo(target);
      history.replaceState(null, '', link.hash);
      // Move keyboard focus without interfering with the smooth scroll.
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({preventScroll: true});
    });
  });

  // Use native navigation so network waits never leave an opaque exit mask on screen.

  // Navigation language follows the portfolio preference. Case-study copy is
  // the original designer-supplied content, including the English TV screens.
  const translations = {
    zh: {back:'返回',previous:'上一个项目',next:'下一个项目',top:'返回顶部 ↑',overview:'项目简述',process:'设计流程',research:'研究方法',requirements:'设计需求',users:'目标用户群体',video:'宣传视频',concept:'最终方案简介',prototype:'遥控器物理原型'},
    en: {back:'Back',previous:'Previous project',next:'Next project',top:'Back to top ↑',overview:'Overview',process:'Design process',research:'Research methods',requirements:'Requirements',users:'Target users',video:'Film',concept:'Final concept',prototype:'Remote prototype'}
  };
  function language(value) {
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = translations[value][node.dataset.i18n]; node.lang=value==='zh'?'zh-CN':'en'; });
    document.querySelectorAll('[data-language]').forEach(button => {
      button.classList.toggle('active', button.dataset.language === value);
      button.setAttribute('aria-pressed', String(button.dataset.language === value));
    });
    try { localStorage.setItem('portfolio-language', value); } catch { /* File previews may restrict storage. */ }
  }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', resize);
  desktop.addEventListener('change', initLenis);
  reduced.addEventListener('change', initLenis);
  addEventListener('pagehide', destroyLenis);
  addEventListener('pageshow', event => {
    clearTimeout(navigationTimer);
    leaving = false;
    document.body.classList.remove('is-leaving');
    // pagehide destroys the instance before a back/forward cache restore.
    if (event.persisted) initLenis();
    resize();
  });
  document.fonts.ready.then(schedule);
  initLenis();
  resize();
})();
