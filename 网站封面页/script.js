function useCanonicalCloudflareLinks() {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) return;
  document.querySelectorAll('a[href]').forEach((anchor) => {
    if (anchor.getAttribute('href').startsWith('#')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname.endsWith('/index.html')) {
      url.pathname = url.pathname.slice(0, -'index.html'.length);
    } else if (url.pathname.endsWith('.html')) {
      url.pathname = url.pathname.slice(0, -'.html'.length);
    } else return;
    anchor.href = url.href;
  });
}

useCanonicalCloudflareLinks();

const header = document.querySelector('.site-header');
const themeSections = [...document.querySelectorAll('[data-header-theme]')];

function updateHeaderTheme() {
  if (!header || themeSections.length === 0) return;
  const sampleY = header.offsetHeight * .5;
  const activeSection = themeSections.find((section) => {
    const rect = section.getBoundingClientRect();
    return rect.top <= sampleY && rect.bottom > sampleY;
  });
  if (activeSection?.dataset.headerTheme) header.dataset.theme = activeSection.dataset.headerTheme;
}

let themeFrame;
function scheduleHeaderUpdate() {
  cancelAnimationFrame(themeFrame);
  themeFrame = requestAnimationFrame(updateHeaderTheme);
}

window.addEventListener('scroll', scheduleHeaderUpdate, { passive: true });
window.addEventListener('resize', scheduleHeaderUpdate);
updateHeaderTheme();

const filterButtons = [...document.querySelectorAll('.filter-button')];
const projectCards = [...document.querySelectorAll('.project-card')];
const projectGrid = document.querySelector('.project-grid');
const projectCardAnimations = new Map();
const prefetchedDocuments = new Set();
let projectFilterRun = 0;
let requestedFilter = 'all';
let imageRequestRun = 0;
const filterImageLoads = new WeakMap();

function prefetchDocument(href) {
  if (!href) return;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.href === window.location.href) return;
  if (prefetchedDocuments.has(url.href)) return;
  prefetchedDocuments.add(url.href);
  const hint = document.createElement('link');
  hint.rel = 'prefetch';
  hint.as = 'document';
  hint.href = url.href;
  document.head.appendChild(hint);
}

function warmProjectCard(card) {
  prefetchDocument(card.href);
}

function resetReturnedCardState() {
  projectCards.forEach((card) => {
    cancelProjectCardAnimation(card);
    card.classList.remove('is-return-preview', 'is-return-focus-muted');
    card.classList.add('is-return-suppressed');
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  document.documentElement.dataset.input = 'keyboard';
  projectCards.forEach((card) => card.classList.remove('is-return-suppressed'));
});
document.addEventListener('pointerdown', () => {
  document.documentElement.dataset.input = 'pointer';
}, { passive: true });

projectCards.forEach((card) => {
  card.addEventListener('click', () => {
    try {
      sessionStorage.setItem('portfolio-project-return', JSON.stringify({
        card: card.id, filter: projectGrid.dataset.layout
      }));
    } catch (_) {}
  });
  card.addEventListener('pointerenter', () => {
    warmProjectCard(card);
    if (!card.classList.contains('is-return-preview')) {
      card.classList.remove('is-return-suppressed');
    }
  });
  card.addEventListener('focus', () => warmProjectCard(card), { once: true });
  card.addEventListener('pointermove', () => card.classList.remove('is-return-suppressed'), { passive: true });
  card.addEventListener('pointerleave', () => {
    if (!card.classList.contains('is-return-preview')) {
      card.classList.remove('is-return-suppressed');
    }
  });
  card.addEventListener('blur', () => {
    card.classList.remove('is-return-focus-muted');
    if (!card.matches(':hover')) card.classList.remove('is-return-suppressed');
  });
});

function cancelProjectCardAnimation(card) {
  const animation = projectCardAnimations.get(card);
  if (!animation) return;
  animation.cancel();
  projectCardAnimations.delete(card);
}

function updateProjectFilterButtons(filter) {
  filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === filter;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function commitProjectFilter(filter, oldRects, runId, shouldAnimate) {
  if (!projectGrid || runId !== projectFilterRun) return;

  projectGrid.dataset.layout = filter;
  projectCards.forEach((card) => {
    card.hidden = filter !== 'all' && card.dataset.category !== filter;
  });

  if (!shouldAnimate) return;

  projectCards.filter((card) => !card.hidden).forEach((card, index) => {
    cancelProjectCardAnimation(card);
    const nextRect = card.getBoundingClientRect();
    const previousRect = oldRects.get(card);
    const hasPreviousPosition = previousRect && previousRect.width && previousRect.height;
    const translateX = hasPreviousPosition ? previousRect.left - nextRect.left : 0;
    const translateY = hasPreviousPosition ? previousRect.top - nextRect.top : 0;
    const scaleX = hasPreviousPosition ? previousRect.width / nextRect.width : .72;
    const scaleY = hasPreviousPosition ? previousRect.height / nextRect.height : .5;

    const animation = card.animate(
      [
        {
          opacity: hasPreviousPosition ? 1 : 0,
          transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
          transformOrigin: '50% 0%'
        },
        {
          opacity: 1,
          transform: 'translate(0, 0) scale(1, 1)',
          transformOrigin: '50% 0%'
        }
      ],
      {
        duration: 620,
        delay: hasPreviousPosition ? 0 : index * 35,
        easing: 'cubic-bezier(.18, .78, .16, 1)',
        fill: 'both'
      }
    );

    projectCardAnimations.set(card, animation);
    animation.addEventListener('finish', () => {
      if (projectCardAnimations.get(card) !== animation) return;
      animation.cancel();
      projectCardAnimations.delete(card);
    }, { once: true });
  });
}

function applyProjectFilter(filter, { animate = true } = {}) {
  if (!projectGrid) return;
  const runId = ++projectFilterRun;
  projectCards.forEach(cancelProjectCardAnimation);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = animate && !reduceMotion;
  const visibleCards = projectCards.filter((card) => !card.hidden);
  const oldRects = new Map(visibleCards.map((card) => [card, card.getBoundingClientRect()]));
  const departingCards = visibleCards.filter(
    (card) => filter !== 'all' && card.dataset.category !== filter
  );

  updateProjectFilterButtons(filter);

  if (!shouldAnimate || departingCards.length === 0) {
    commitProjectFilter(filter, oldRects, runId, shouldAnimate);
    return;
  }

  const departures = departingCards.map((card) => {
    cancelProjectCardAnimation(card);
    const animation = card.animate(
      [
        { opacity: 1, transform: 'scale(1, 1)', transformOrigin: '50% 0%' },
        { opacity: 0, transform: 'scale(.82, .72)', transformOrigin: '50% 0%' }
      ],
      { duration: 180, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'both' }
    );
    projectCardAnimations.set(card, animation);
    return animation.finished.catch(() => undefined);
  });

  Promise.all(departures).then(() => {
    if (runId !== projectFilterRun) return;
    departingCards.forEach(cancelProjectCardAnimation);
    commitProjectFilter(filter, oldRects, runId, shouldAnimate);
  });
}

function loadFilterImages(filter) {
  return Promise.all(projectCards
    .filter((card) => filter === 'all' || card.dataset.category === filter)
    .map((card) => {
      const image = card.querySelector(filter === 'all' ? '.project-image--all' : '.project-image--filtered');
      if (filterImageLoads.has(image)) return filterImageLoads.get(image);
      image.loading = 'eager';
      const ready = image.decode().then(() => true, () => {
        filterImageLoads.delete(image);
        return false;
      });
      filterImageLoads.set(image, ready);
      return ready;
    }));
}

filterButtons.forEach((button) => {
  const warmFilterImages = () => loadFilterImages(button.dataset.filter);
  button.addEventListener('pointerenter', warmFilterImages, { once: true });
  button.addEventListener('focus', warmFilterImages, { once: true });
  button.addEventListener('click', async () => {
    const request = ++imageRequestRun;
    document.dispatchEvent(new Event('projects:filter-start'));
    ++projectFilterRun;
    projectCards.forEach(cancelProjectCardAnimation);
    updateProjectFilterButtons(projectGrid.dataset.layout);
    requestedFilter = button.dataset.filter;
    projectGrid.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    let loadTimeout;
    const loaded = await Promise.race([
      warmFilterImages(),
      new Promise((resolve) => { loadTimeout = setTimeout(() => resolve([false]), 15000); })
    ]);
    clearTimeout(loadTimeout);
    button.classList.remove('is-loading');
    if (request !== imageRequestRun) return;
    projectGrid.removeAttribute('aria-busy');
    if (loaded.some((success) => !success)) {
      document.querySelector('.project-filter-status').textContent = language === 'en'
        ? 'Images could not load. Please try the filter again.' : '图片暂时未加载成功，请再次点击筛选重试。';
      return;
    }
    document.querySelector('.project-filter-status').textContent = '';
    if (projectGrid.dataset.layout !== requestedFilter) applyProjectFilter(requestedFilter);
  });
});

window.addEventListener('pageshow', (event) => {
  if (!projectGrid) return;
  if (event.persisted) {
    ++imageRequestRun;
    ++projectFilterRun;
    projectGrid.removeAttribute('aria-busy');
    filterButtons.forEach((button) => button.classList.remove('is-loading'));
    updateProjectFilterButtons(projectGrid.dataset.layout);
  }
  resetReturnedCardState();
});

if (projectGrid) {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem('portfolio-project-return')); } catch (_) {}
  const returned = projectCards.find((card) => `#${card.id}` === location.hash);
  const historyReturn = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (saved && (returned?.id === saved.card || historyReturn) &&
      filterButtons.some((button) => button.dataset.filter === saved.filter) &&
      (!returned || saved.filter === 'all' || returned.dataset.category === saved.filter)) {
    requestedFilter = saved.filter;
    applyProjectFilter(saved.filter, { animate: false });
    loadFilterImages(saved.filter);
  }
  resetReturnedCardState();
  if (!document.body.classList.contains('projects-page')) document.documentElement.dataset.motion = 'ready';
}

const translations = {
  zh: {
    navHome: '首页',
    navWork: '项目',
    navAbout: '关于',
    navContact: '联系',
    roleInteraction: '交互设计师',
    roleIndustrial: '工业设计师',
    lifeImages: '生活影像',
    viewAll: '查看全部',
    filterAll: '全部',
    filterSoftware: '软件产品',
    filterHardware: '硬件产品',
    filterHybrid: '软硬交互产品',
    contactTitle: '联系我（张雨馨）',
    backTop: '返回顶部 ↑',
    backHome: '返回首页',
    back: '返回',
    resume: '简历',
    skills: '技能',
    education: '教育经历',
    personalAlbum: '个人影集',
    comingSoon: '敬请期待'
  },
  en: {
    navHome: 'Home',
    navWork: 'Work',
    navAbout: 'About',
    navContact: 'Contact',
    roleInteraction: 'Interaction Designer',
    roleIndustrial: 'Industrial Designer',
    lifeImages: 'Life in Frames',
    viewAll: 'View all',
    filterAll: 'All',
    filterSoftware: 'Software',
    filterHardware: 'Hardware',
    filterHybrid: 'Hybrid',
    contactTitle: 'Contact Zhang Yuxin',
    backTop: 'Back to top ↑',
    backHome: 'Back home',
    back: 'Back',
    resume: 'Résumé',
    skills: 'Skills',
    education: 'Education',
    personalAlbum: 'Personal Album',
    comingSoon: 'Coming Soon'
  }
};

const languageToggle = document.querySelector('.language-toggle');
let language = 'zh';
try { language = localStorage.getItem('portfolio-language') === 'en' ? 'en' : 'zh'; } catch (_) {}

function applyLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = translations[language][node.dataset.i18n];
    if (value) node.textContent = value;
  });

  if (languageToggle) {
    const [zhLabel, enLabel] = languageToggle.querySelectorAll('span');
    zhLabel?.classList.toggle('active', language === 'zh');
    enLabel?.classList.toggle('active', language === 'en');
    languageToggle.setAttribute('aria-pressed', String(language === 'en'));
    languageToggle.setAttribute('aria-label', language === 'zh' ? '切换为英文' : 'Switch to Chinese');
  }

  try { localStorage.setItem('portfolio-language', language); } catch (_) {}
}

languageToggle?.addEventListener('click', () => {
  applyLanguage(language === 'zh' ? 'en' : 'zh');
});

applyLanguage(language);

function prefetchPrimaryNavigation() {
  document.querySelectorAll('.main-nav a, .gallery-nav-link').forEach((anchor) => {
    prefetchDocument(anchor.href);
  });
  projectCards.forEach((card) => prefetchDocument(card.href));
}

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(prefetchPrimaryNavigation, { timeout: 1600 });
} else {
  window.setTimeout(prefetchPrimaryNavigation, 700);
}
