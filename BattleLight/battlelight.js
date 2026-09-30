(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.reading-progress');
  const directory = document.querySelector('.chapter-nav');
  const links = [...directory.querySelectorAll('a')];
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  const coverArrow = document.querySelector('.cover-arrow');
  const projectPagination = document.querySelector('#project-pagination');
  const firstProjectSwitch = projectPagination.querySelector('.project-switch');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 701px)');
  document.querySelectorAll('.board-keys').forEach(grid => {
    for (let i = 0; i < 64; i++) grid.append(document.createElement('i'));
  });
  let lenis = null;
  let lenisFrame = 0;
  let frame = 0;
  let activeChapter = '';
  let leaving = false;
  let navigationTimer = 0;

  function update() {
    frame = 0;
    const headerHeight = header.getBoundingClientRect().height;
    const total = Math.max(1, root.scrollHeight - innerHeight);
    const fraction = Math.max(0, Math.min(1, scrollY / total));
    progress.firstElementChild.style.transform = `scaleX(${.0572917 + .9427083 * fraction})`;
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    coverArrow.classList.toggle('is-scroll-active', scrollY > 2);
    const reference = headerHeight + 2;
    const lastChapter = chapters.at(-1);
    const current = !desktop.matches && lastChapter.getBoundingClientRect().top <= innerHeight * .5
      ? lastChapter
      : chapters.filter(section => section.getBoundingClientRect().top <= reference).at(-1);
    const chapter = current?.dataset.chapter || '';
    const footerTop = projectPagination.getBoundingClientRect().top;
    const visible = Boolean(chapter) && footerTop > innerHeight - firstProjectSwitch.offsetTop;
    directory.classList.toggle('is-visible', visible);
    directory.inert = !visible;
    if (activeChapter !== chapter) {
      activeChapter = chapter;
      for (const link of links) {
        const selected = link.dataset.chapterLink === chapter;
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
        if (selected && innerWidth <= 700) {
          directory.scrollTo({left:link.offsetLeft - directory.clientWidth / 2 + link.offsetWidth / 2,behavior:reduced.matches?'instant':'smooth'});
        }
      }
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function resize() {
    root.style.setProperty('--scale', root.clientWidth / 1440);
    schedule();
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
  function focusTarget(target) {
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({preventScroll:true});
  }
  function goTo(target) {
    const y = Math.max(0, target.getBoundingClientRect().top + scrollY - header.getBoundingClientRect().height);
    if (lenis && !reduced.matches) {
      lenis.scrollTo(y, {onComplete:() => focusTarget(target)});
    } else if (reduced.matches) {
      scrollTo({top:y,behavior:'instant'});
      focusTarget(target);
    } else {
      scrollTo({top:y,behavior:'smooth'});
      let timeout;
      const done = () => { clearTimeout(timeout); removeEventListener('scrollend', done); focusTarget(target); };
      addEventListener('scrollend', done, {once:true});
      timeout = setTimeout(done, 1000);
    }
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      history.replaceState(null, '', link.hash);
      goTo(target);
    });
  });
  // Native navigation keeps the current page visible until the destination is ready.
  const translations = {
    zh:{back:'返回',overview:'项目简述',video:'玩法视频',rules:'使用规则',features:'核心特质',hardware:'硬件架构',flow:'逻辑流程图',story:'幕后故事',previous:'上一个项目',next:'下一个项目',top:'返回顶部 ↑'},
    en:{back:'Back',overview:'Overview',video:'Gameplay video',rules:'How to play',features:'Key features',hardware:'Hardware',flow:'Logic flow',story:'Behind the scenes',previous:'Previous project',next:'Next project',top:'Back to top ↑'}
  };
  function language(value) {
    document.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = translations[value][node.dataset.i18n];
      node.lang = value === 'zh' ? 'zh-CN' : 'en';
    });
    document.querySelectorAll('[data-language]').forEach(button => {
      const selected = button.dataset.language === value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    try { localStorage.setItem('portfolio-language', value); } catch { /* Local file previews can restrict storage. */ }
  }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', resize, {passive:true});
  desktop.addEventListener('change', initLenis);
  reduced.addEventListener('change', initLenis);
  addEventListener('pagehide', destroyLenis);
  addEventListener('pageshow', event => {
    clearTimeout(navigationTimer);
    leaving = false;
    document.body.classList.remove('is-leaving');
    if (event.persisted) initLenis();
    resize();
  });
  resize();
  initLenis();
})();
