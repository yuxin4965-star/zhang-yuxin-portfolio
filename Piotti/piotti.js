/* Shared portfolio interactions. Figma geometry stays in data/design.json. */
(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.reading-progress');
  const directory = document.querySelector('.chapter-nav');
  const links = [...directory.querySelectorAll('a')];
  const panels = [...document.querySelectorAll('.panel')];
  const chapters = panels.filter(p => p.dataset.chapter && p.id !== 'closing');
  const closing = document.querySelector('#closing');
  const footer = document.querySelector('#project-pagination');
  const arrow = document.querySelector('.cover-arrow');
  const demoVideo = document.querySelector('.demo-video');
  const demoSound = document.querySelector('.demo-video-sound');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 701px)');
  let lenis = null, frame = 0, dirty = true, active = '', leaving = false, suspended = false;
  let navigationTimer, focusTimer, cancelFocus = () => {};

  function syncDemoSound() {
    if (!demoVideo || !demoSound) return;
    const audible = !demoVideo.muted && demoVideo.volume > 0;
    demoSound.classList.toggle('is-unmuted', audible);
    demoSound.setAttribute('aria-pressed', String(audible));
    demoSound.setAttribute('aria-label', audible ? '静音视频' : '打开视频声音');
  }
  if (demoVideo && demoSound) {
    demoSound.addEventListener('click', () => {
      demoVideo.muted = !demoVideo.muted;
      demoVideo.play().catch(() => {});
      syncDemoSound();
    });
    demoVideo.addEventListener('volumechange', syncDemoSound);
    syncDemoSound();
  }

  function update() {
    dirty = false;
    // Read layout first; apply all visual changes afterwards.
    const headerHeight = header.getBoundingClientRect().height;
    const reference = headerHeight + 2;
    const bounds = panels.map(panel => ({panel, top: panel.getBoundingClientRect().top}));
    const footerTop = footer.getBoundingClientRect().top;
    const closingTop = closing.getBoundingClientRect().top;
    const directoryBottom = directory.getBoundingClientRect().bottom;
    const current = bounds.filter(b => b.top <= reference).at(-1)?.panel || panels[0];
    const navSurface = bounds.filter(b => b.top <= innerHeight * .5).at(-1)?.panel || current;
    const chapter = bounds.filter(b => chapters.includes(b.panel) && b.top <= reference).at(-1)?.panel.id || '';
    const fraction = Math.max(0, Math.min(1, scrollY / Math.max(1, root.scrollHeight - innerHeight)));
    // Hide the directory as soon as its bottom meets the top edge of the closing page.
    const visible = Boolean(chapter) && closingTop > directoryBottom && footerTop > reference;
    progress.firstElementChild.style.transform = `scaleX(${.0572917 + .9427083 * fraction})`;
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    header.dataset.theme = footerTop <= reference ? 'light' : current.dataset.theme;
    directory.dataset.theme = desktop.matches ? navSurface.dataset.theme : current.dataset.theme;
    directory.classList.toggle('is-visible', visible);
    directory.inert = !visible;
    arrow.classList.toggle('is-scroll-active', scrollY > 2);
    if (chapter !== active) {
      active = chapter;
      for (const link of links) {
        const selected = link.dataset.chapterLink === chapter;
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
        if (selected && !desktop.matches) directory.scrollTo({left: link.offsetLeft - directory.clientWidth / 2 + link.offsetWidth / 2, behavior: reduced.matches ? 'instant' : 'smooth'});
      }
    }
  }
  function tick(time) {
    frame = 0;
    if (suspended) return;
    lenis?.raf(time);
    if (dirty) update();
    if (lenis) frame = requestAnimationFrame(tick);
  }
  function schedule() {
    dirty = true;
    if (!suspended && !frame) frame = requestAnimationFrame(tick);
  }
  function resize() {
    root.style.setProperty('--scale', root.clientWidth / 1440);
    lenis?.resize();
    schedule();
  }
  function destroyLenis() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lenis?.destroy();
    lenis = null;
    root.dataset.scrollEngine = 'native';
  }
  function initLenis() {
    destroyLenis();
    if (!suspended && desktop.matches && !reduced.matches && typeof window.Lenis === 'function') {
      lenis = new window.Lenis({lerp: .15, wheelMultiplier: .8, smoothWheel: true, syncTouch: false, autoRaf: false});
      root.dataset.scrollEngine = 'lenis';
    }
    schedule();
  }
  function goTo(target) {
    cancelFocus();
    const y = Math.min(Math.max(0, root.scrollHeight - innerHeight), Math.max(0, target.getBoundingClientRect().top + scrollY - header.getBoundingClientRect().height));
    let cancelled = false;
    const focus = () => {
      clearTimeout(focusTimer);
      removeEventListener('scrollend', focus);
      if (cancelled) return;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({preventScroll:true});
      schedule();
    };
    cancelFocus = () => {cancelled = true; clearTimeout(focusTimer); removeEventListener('scrollend', focus);};
    if (reduced.matches || Math.abs(scrollY - y) < 2) {
      scrollTo({top:y,behavior:'instant'});
      focus();
    } else if (lenis) lenis.scrollTo(y, {onComplete:focus});
    else {
      addEventListener('scrollend', focus, {once:true});
      scrollTo({top:y,behavior:'smooth'});
      focusTimer = setTimeout(focus, 1600);
    }
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    goTo(target);
    history.replaceState(null, '', link.hash);
  }));
  document.querySelectorAll('.project-switch,.back-link').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || reduced.matches) return;
    event.preventDefault();
    if (leaving) return;
    leaving = true;
    document.body.classList.add('is-leaving');
    navigationTimer = setTimeout(() => location.assign(link.href), 350);
  }));
  const zh = {back:'返回',previous:'上一个项目',next:'下一个项目',top:'返回顶部 ↑',overview:'方案概览',process:'设计流程',direction:'设计方向定义',findings:'调研发现总结',journey:'用户旅程图',concept:'Piotti最终概念',iteration:'设计方案迭代',validation:'设计方案验证',prototype:'最终原型界面',system:'设计系统',accessibility:'无障碍标准',demo:'无障碍使用演示'};
  const en = {back:'Back',previous:'Previous project',next:'Next project',top:'Back to top ↑',overview:'Overview',process:'Design process',direction:'Design direction',findings:'Research findings',journey:'User journeys',concept:'Final concept',iteration:'Design iterations',validation:'User testing',prototype:'Final interfaces',system:'Design system',accessibility:'Accessibility',demo:'Accessible interaction'};
  function language(value) {
    const translations = value === 'en' ? en : zh;
    document.querySelectorAll('[data-i18n]').forEach(node => {node.textContent = translations[node.dataset.i18n]; node.lang = value === 'en' ? 'en' : 'zh-CN';});
    document.querySelectorAll('[data-language]').forEach(button => {
      const selected = button.dataset.language === value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    try {localStorage.setItem('portfolio-language', value);} catch { /* Local-file previews may restrict storage. */ }
  }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', resize, {passive:true});
  desktop.addEventListener('change', initLenis);
  reduced.addEventListener('change', initLenis);
  addEventListener('pagehide', () => {suspended = true; cancelFocus(); destroyLenis();});
  addEventListener('pageshow', event => {
    clearTimeout(navigationTimer);
    leaving = false;
    document.body.classList.remove('is-leaving');
    suspended = false;
    if (event.persisted) initLenis();
    resize();
  });
  document.fonts.ready.then(schedule);
  initLenis();
  resize();
})();
