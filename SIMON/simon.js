/* SIMON case-study interactions. Scene videos autoplay in a loop and toggle on click. */
(() => {
  'use strict';

  // Put future scene videos in assets/videos/ and set their local relative paths here.
  // An empty path keeps the Figma still image as the placeholder.
  const MEDIA = {
    'scene-01': 'assets/videos/simon-scene-01.m4v',
    'scene-02': 'assets/videos/simon-scene-02.m4v',
    'scene-03': 'assets/videos/simon-scene-03.m4v',
    'scene-04': 'assets/videos/simon-scene-04.m4v'
  };

  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.reading-progress');
  const directory = document.querySelector('.chapter-nav');
  const links = [...directory.querySelectorAll('[data-chapter-link]')];
  const uxLink = links.find(link => link.dataset.chapterLink === 'ux');
  const panels = [...document.querySelectorAll('.panel')];
  const arrow = document.querySelector('.cover-arrow');
  const uxPanel = document.getElementById('ux');
  const desktop = matchMedia('(min-width: 701px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let lenis = null;
  let lenisFrame = 0;
  let updateFrame = 0;
  let leaving = false;
  let navigationTimer;
  let activeChapter = '';

  panels.forEach(panel => panel.style.setProperty('--panel-h', `${Number(panel.dataset.height)}px`));

  function resize() {
    const scale = root.clientWidth / 1440;
    root.style.setProperty('--scale', String(scale));
    const coverScale = desktop.matches ? Math.max(scale, innerHeight / 785) : scale;
    root.style.setProperty('--cover-scale', String(coverScale));
    document.querySelector('.cover').style.height = `${785 * coverScale}px`;
    schedule();
  }

  function update() {
    updateFrame = 0;
    const referenceY = header.getBoundingClientRect().height + 2;
    const range = Math.max(1, root.scrollHeight - innerHeight);
    const fraction = Math.max(0, Math.min(1, scrollY / range));
    progress.firstElementChild.style.transform = `scaleX(${0.0572917 + 0.9427083 * fraction})`;
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));

    const currentPanel = panels.filter(panel => panel.getBoundingClientRect().top <= referenceY).at(-1) || panels[0];
    const chapterPanel = panels.filter(panel => panel.dataset.chapter && panel.getBoundingClientRect().top <= referenceY).at(-1);
    const uxBounds = uxPanel.getBoundingClientRect();
    const uxReachedDirectory = desktop.matches && uxBounds.top <= uxLink.getBoundingClientRect().bottom;
    const chapter = uxReachedDirectory ? 'ux' : chapterPanel?.dataset.chapter || '';
    const directoryVisible = Boolean(chapter) && uxBounds.bottom > directory.getBoundingClientRect().bottom;
    directory.classList.toggle('is-visible', directoryVisible);
    directory.inert = !directoryVisible;
    if (chapter !== activeChapter) {
      activeChapter = chapter;
      links.forEach(link => {
        if (link.dataset.chapterLink === chapter) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      if (innerWidth <= 700) {
        const selected = links.find(link => link.dataset.chapterLink === chapter);
        if (selected) directory.scrollTo({left:selected.offsetLeft - directory.clientWidth / 2 + selected.offsetWidth / 2,behavior:reduced.matches?'instant':'smooth'});
      }
    }
    header.dataset.theme = ['cover','ux','closing'].includes(currentPanel.id) || currentPanel.classList.contains('closing-mark') ? 'dark' : 'light';
    arrow.classList.toggle('is-scroll-active', scrollY > 2);
  }

  function schedule() {
    if (!updateFrame) updateFrame = requestAnimationFrame(update);
  }

  function goTo(target, smooth = true) {
    const top = Math.max(0, target.getBoundingClientRect().top + scrollY - header.getBoundingClientRect().height);
    if (lenis && smooth && !reduced.matches) lenis.scrollTo(top, {immediate:false});
    else scrollTo({top,behavior:smooth && !reduced.matches ? 'smooth' : 'instant'});
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
    lenis = new window.Lenis({lerp:0.15,wheelMultiplier:0.8,smoothWheel:true,syncTouch:false,autoRaf:false});
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
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      const delay = reduced.matches ? 0 : (lenis ? 650 : 550);
      setTimeout(() => target.focus({preventScroll:true}), delay);
    });
  });

  // Use native navigation so network waits never leave an opaque exit mask on screen.

  const translations = {
    zh:{back:'返回',film:'SIMON 宣传视频',overview:'项目简述',process:'设计流程',pain:'痛点发现',mechanism:'核心功能',map:'System Map',scenes:'使用场景',features:'核心特点',ux:'UX体验亮点',previous:'上一个项目',next:'下一个项目',top:'返回顶部 ↑'},
    en:{back:'Back',film:'SIMON Film',overview:'Overview',process:'Design process',pain:'Pain points',mechanism:'Core functions',map:'System Map',scenes:'Scenarios',features:'Key features',ux:'UX highlights',previous:'Previous project',next:'Next project',top:'Back to top ↑'}
  };
  function language(value) {
    document.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = translations[value][node.dataset.i18n];
      node.lang = value === 'zh' ? 'zh-CN' : 'en';
    });
    document.querySelectorAll('[data-language]').forEach(button => {
      button.classList.toggle('active',button.dataset.language === value);
      button.setAttribute('aria-pressed',String(button.dataset.language === value));
    });
    try { localStorage.setItem('portfolio-language',value); } catch {}
  }
  document.querySelectorAll('[data-video-slot]').forEach(slot => {
    const src = MEDIA[slot.dataset.videoSlot];
    if (!src) return;
    const video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('aria-label', `SIMON 使用场景 ${slot.dataset.videoSlot.slice(-2)} 演示视频，点击暂停或播放`);
    video.tabIndex = 0;
    const source = document.createElement('source');
    source.src = src;
    source.type = src.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4';
    video.append(source);
    video.append('你的浏览器不支持此视频播放。');
    const togglePlayback = () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    };
    video.addEventListener('click', togglePlayback);
    video.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        togglePlayback();
      }
    });
    slot.replaceChildren(video);
    video.play().catch(() => {});
  });

  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',resize);
  desktop.addEventListener('change',() => {resize();initLenis();});
  reduced.addEventListener('change',initLenis);
  addEventListener('pagehide',destroyLenis);
  addEventListener('pageshow',() => {
    clearTimeout(navigationTimer);
    leaving = false;
    document.body.classList.remove('is-leaving');
    initLenis();
    schedule();
  });
  resize();
  initLenis();
  schedule();
})();
