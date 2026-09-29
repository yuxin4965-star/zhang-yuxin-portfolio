/* Shared portfolio interactions. Journey movement is derived from scroll position. */
(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.reading-progress');
  const directory = document.querySelector('.chapter-nav');
  const links = [...directory.querySelectorAll('a')];
  const sections = [...document.querySelectorAll('.panel')];
  const chapters = links.map(a => document.getElementById(a.dataset.chapterLink));
  const pagination = document.querySelector('.project-pagination');
  const cover = document.querySelector('.cover');
  const arrow = document.querySelector('.cover-arrow');
  const journey = document.querySelector('#journey');
  const chart = document.querySelector('.journey-chart');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 701px)');
  let lenis = null, frame = 0, dirty = true, active = '', leaving = false;
  let scale = 1, journeyTop = 0, journeyDistance = Number(journey.dataset.mapWidth) - 1440, navigationTimer;
  let pendingFocus = null;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function update() {
    const headerHeight = header.getBoundingClientRect().height;
    const referenceY = headerHeight + 2;
    const fraction = clamp(scrollY / Math.max(1, root.scrollHeight - innerHeight), 0, 1);
    const current = chapters.filter(s => s.getBoundingClientRect().top <= referenceY).at(-1);
    const chapter = current?.id || '';
    // Footer's top rule is the exact visibility boundary, including short viewports.
    const visible = Boolean(chapter) && pagination.getBoundingClientRect().top >= innerHeight;
    const journeyBounds = journey.getBoundingClientRect();
    // Ignore subpixel anchor rounding so the mask stays hidden on the first frame.
    const travelled = Math.max(0, journeyTop - journeyBounds.top - 1);
    const journeyProgress = reduced.matches ? 0 : clamp(travelled / Math.max(1, journeyDistance * scale - 1), 0, 1);
    progress.firstElementChild.style.transform = `scaleX(${.0572917 + .9427083 * fraction})`;
    progress.setAttribute('aria-valuenow', Math.round(fraction * 100));
    directory.classList.toggle('is-visible', visible);
    directory.inert = !visible;
    if (active !== chapter) {
      active = chapter;
      for (const link of links) {
        const selected = link.dataset.chapterLink === chapter;
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
        if (selected && !desktop.matches) directory.scrollTo({left:link.offsetLeft-directory.clientWidth/2+link.offsetWidth/2,behavior:reduced.matches?'instant':'smooth'});
      }
    }
    header.dataset.theme = cover.getBoundingClientRect().bottom > headerHeight ? 'cover' : 'light';
    arrow.classList.toggle('is-scroll-active', scrollY > 2);
    chart.style.setProperty('--journey-x', `${-journeyProgress * journeyDistance}px`);
    journey.dataset.progress = journeyProgress.toFixed(4);
    journey.classList.toggle('is-moving', journeyProgress > 0);
  }

  function resize() {
    scale = root.clientWidth / 1440;
    root.style.setProperty('--scale', scale);
    root.style.setProperty('--cover-scale', desktop.matches ? Math.max(scale, innerHeight / 785) : scale);
    const h = header.getBoundingClientRect().height;
    // Fit the whole map between the header and viewport bottom before pinning.
    journeyTop = Math.min(h, innerHeight - 785 * scale);
    root.style.setProperty('--journey-top', `${journeyTop}px`);
    journey.style.height = `${(785 + (reduced.matches ? 0 : journeyDistance)) * scale}px`;
    lenis?.resize();
    dirty = true;
  }
  function finishFocus() {
    if (!pendingFocus) return;
    pendingFocus.focus({preventScroll:true});
    pendingFocus = null;
  }
  function goTo(target) {
    const offset = target === cover ? 0 : target === journey ? journeyTop : header.getBoundingClientRect().height;
    const y = Math.max(0, target.getBoundingClientRect().top + scrollY - offset);
    pendingFocus = target;
    if (lenis && !reduced.matches) lenis.scrollTo(y, {onComplete:finishFocus});
    else {
      scrollTo({top:y,behavior:reduced.matches?'instant':'smooth'});
      if (reduced.matches) finishFocus();
    }
  }
  function destroyLenis() { lenis?.destroy(); lenis = null; }
  function initLenis() {
    destroyLenis();
    if (desktop.matches && !reduced.matches && typeof window.Lenis === 'function') {
      lenis = new window.Lenis({lerp:.15,wheelMultiplier:.8,smoothWheel:true,syncTouch:false,autoRaf:false});
    }
  }
  // Exactly one animation loop drives Lenis and all scroll-linked visual updates.
  function tick(time) {
    lenis?.raf(time);
    if (dirty) { dirty = false; update(); }
    frame = requestAnimationFrame(tick);
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    history.replaceState(null,'',link.hash);
    goTo(target);
  }));
  document.querySelectorAll('.project-switch,.back-link').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || reduced.matches) return;
    event.preventDefault();
    if (leaving) return;
    leaving = true;
    document.body.classList.add('is-leaving');
    navigationTimer = setTimeout(() => location.assign(link.href),350);
  }));
  const translations = {
    zh:{back:'返回',previous:'上一个项目',next:'下一个项目',top:'返回顶部 ↑',background:'项目背景',persona:'目标用户画像',journey:'用户旅程图',research:'现有产品调研',sketches:'概念草图迭代',concept:'最终概念',highlights:'设计亮点',lighting:'灯效交互',scenarios:'多场景适配',details:'设计细节',manual:'产品说明书',prototype:'实体原型'},
    en:{back:'Back',previous:'Previous project',next:'Next project',top:'Back to top ↑',background:'Background',persona:'Persona',journey:'User journey',research:'Product research',sketches:'Concept sketches',concept:'Final concept',highlights:'Design highlights',lighting:'Light interaction',scenarios:'Different scenarios',details:'Design details',manual:'User manual',prototype:'Physical prototype'}
  };
  function language(value) {
    document.querySelectorAll('[data-i18n]').forEach(n => {n.textContent=translations[value][n.dataset.i18n];n.lang=value==='zh'?'zh-CN':'en';});
    document.querySelectorAll('[data-language]').forEach(b => {b.classList.toggle('active',b.dataset.language===value);b.setAttribute('aria-pressed',String(b.dataset.language===value));});
    try {localStorage.setItem('portfolio-language',value);} catch {}
  }
  addEventListener('scroll',()=>{dirty=true;},{passive:true});
  addEventListener('scrollend',finishFocus,{passive:true});
  addEventListener('resize',resize);
  for(const media of [desktop,reduced]) media.addEventListener('change',()=>{initLenis();resize();});
  addEventListener('pagehide',()=>{destroyLenis();cancelAnimationFrame(frame);frame=0;});
  addEventListener('pageshow',event=>{
    clearTimeout(navigationTimer);leaving=false;document.body.classList.remove('is-leaving');
    if(event.persisted){initLenis();if(!frame)frame=requestAnimationFrame(tick);}
    resize();
  });
  document.fonts.ready.then(()=>{dirty=true;});
  initLenis();resize();frame=requestAnimationFrame(tick);
})();
