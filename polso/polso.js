/* Shared project-detail interactions. Layout and content live in index.html/data/design.json. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 701px)');
  let lenis = null;
  let lenisFrame = 0;
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.reading-progress');
  const progressFill = progress.firstElementChild;
  const nav = document.querySelector('.chapter-nav');
  const chapterLinks = [...nav.querySelectorAll('a')];
  const sections = [...document.querySelectorAll('.panel')];
  const coverArrow = document.querySelector('.cover-arrow');
  const palette = document.getElementById('cmf-colors');
  const paletteSlides = [...document.querySelectorAll('[data-palette-slide]')];
  const paletteIndicators = [...document.querySelectorAll('[data-palette-indicator]')];
  const appSequence = document.getElementById('app-screens');
  const appScreens = ['3574:2882', '3574:2881', '3574:2880', '3574:2879']
    .map(id => document.querySelector(`[data-node-id="${id}"]`))
    .filter(Boolean);
  let lastY = scrollY;
  let direction = 0;
  let activeChapter = '';
  let selectedPalette = -1;
  let appWasVisible = false;
  const appRevealTimers = [];
  let frame = 0;
  let pendingAnchorFocus = null;

  function sequenceProgress(section) {
    if (!section) return 0;
    const pin = section.querySelector('.sequence-pin');
    const headerHeight = header.getBoundingClientRect().height;
    const start = section.offsetTop - headerHeight;
    const travel = Math.max(1, section.offsetHeight - (pin?.offsetHeight || 0));
    // Near the document end, narrow viewports may not have the full nominal
    // travel available. Compress the sequence into the remaining scroll range.
    const end = Math.min(start + travel, root.scrollHeight - innerHeight);
    return Math.min(1, Math.max(0, (scrollY - start) / Math.max(1, end - start)));
  }

  function selectPalette(index) {
    if (index === selectedPalette) return;
    selectedPalette = index;
    paletteSlides.forEach((slide, i) => {
      const active = i === selectedPalette;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    paletteIndicators.forEach((dot, i) => dot.classList.toggle('is-active', i === selectedPalette));
  }

  function setAppScreensInstant(visible) {
    appRevealTimers.forEach(clearTimeout);
    appRevealTimers.length = 0;
    appScreens.forEach(screen => {
      screen.classList.add('app-screen-instant');
      screen.classList.toggle('app-screen-is-visible', visible);
      screen.setAttribute('aria-hidden', String(!visible));
    });
  }

  function playAppScreenReveal() {
    if (reducedMotion.matches) {
      setAppScreensInstant(true);
      return;
    }
    // Reset without a fade-out before each fresh downward entrance.
    setAppScreensInstant(false);
    void appSequence.offsetWidth;
    appScreens.forEach((screen, index) => {
      screen.classList.remove('app-screen-instant');
      const reveal = () => {
        screen.classList.add('app-screen-is-visible');
        screen.setAttribute('aria-hidden', 'false');
      };
      appRevealTimers.push(setTimeout(reveal, index * 144));
    });
  }

  function updateSequences(scrollDirection) {
    const paletteProgress = sequenceProgress(palette);
    selectPalette(Math.min(paletteSlides.length - 1, Math.floor(paletteProgress * paletteSlides.length)));

    const appRect = appSequence.getBoundingClientRect();
    const headerBottom = header.getBoundingClientRect().height;
    const appIsVisible = appRect.top <= innerHeight * .55 && appRect.bottom > headerBottom;
    if (appRect.top >= innerHeight) {
      // Prepare offscreen; scrolling upward never visibly hides the screens.
      setAppScreensInstant(false);
    } else if (appRect.bottom <= headerBottom || scrollDirection < 0) {
      // Cancel unfinished entrances and keep the return trip completely still.
      setAppScreensInstant(true);
    } else if (appIsVisible && !appWasVisible) {
      if (scrollDirection > 0) playAppScreenReveal();
      else setAppScreensInstant(true); // Restored position or resize, no scroll.
    }
    appWasVisible = appIsVisible;
  }

  function resize() {
    root.style.setProperty('--scale', root.clientWidth / 1440);
    schedule();
  }

  function update() {
    frame = 0;
    const y = window.scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) > .5) direction = Math.sign(delta);
    lastY = y;
    if (pendingAnchorFocus && Math.abs(y - pendingAnchorFocus.top) <= 1) {
      const target = pendingAnchorFocus.target;
      pendingAnchorFocus = null;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({preventScroll: true});
    }
    const max = Math.max(1, root.scrollHeight - innerHeight);
    const fraction = Math.min(1, Math.max(0, y / max));
    // Keep the initial 82.5 / 1440 orange line shown in Figma, then fill to 100%.
    progressFill.style.transform = `scaleX(${.0572917 + .9427083 * fraction})`;
    progress.setAttribute('aria-valuenow', Math.round(fraction * 100));
    const sample = header.getBoundingClientRect().height + 2;
    const current = sections.find(section => {
      const r = section.getBoundingClientRect();
      return r.top <= sample && r.bottom > sample;
    }) || sections[0];
    const chapter = current.dataset.chapter;
    updateSequences(Math.abs(delta) > .5 ? Math.sign(delta) : 0);
    // Hide the directory as soon as the closing panel enters the viewport,
    // rather than waiting until its top has reached the header sample line.
    const closingRect = document.getElementById('closing').getBoundingClientRect();
    const showNav = Boolean(chapter) && closingRect.top > innerHeight;
    nav.classList.toggle('is-visible', showNav);
    nav.inert = !showNav;
    if (chapter !== activeChapter) {
      activeChapter = chapter;
      for (const link of chapterLinks) {
        const isActive = link.dataset.chapterLink === chapter;
        if (isActive) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
        if (isActive && innerWidth <= 700) {
          nav.scrollTo({left:link.offsetLeft - nav.clientWidth / 2 + link.offsetWidth / 2, behavior:reducedMotion.matches ? 'instant' : 'smooth'});
        }
      }
    }
    const scale = root.clientWidth / 1440;
    header.dataset.theme = closingRect.top <= sample && closingRect.top + 785 * scale > sample ? 'dark' : 'light';
    coverArrow.classList.toggle('is-scroll-active', direction > 0 && y > 2 && sections[0].getBoundingClientRect().bottom > 0);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
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
    if (!desktop.matches || reducedMotion.matches || typeof window.Lenis !== 'function') return;
    lenis = new window.Lenis({
      lerp: 0.15,
      wheelMultiplier: 0.8,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false
    });
    lenisFrame = requestAnimationFrame(lenisRaf);
  }

  // Smooth anchor scrolling remains interruptible.
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      if (link === coverArrow) coverArrow.classList.add('is-scroll-active');
      const top = Math.max(0, Math.min(
        target.getBoundingClientRect().top + scrollY - header.getBoundingClientRect().height,
        root.scrollHeight - innerHeight
      ));
      pendingAnchorFocus = {target, top};
      if (lenis) lenis.scrollTo(top);
      else scrollTo({top, behavior:reducedMotion.matches ? 'instant' : 'smooth'});
      schedule();
      history.replaceState(null, '', link.getAttribute('href'));
    });
  });

  // An interrupted anchor jump must not move focus later during manual scrolling.
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => {
    addEventListener(type, () => { pendingAnchorFocus = null; }, {passive:true});
  });

  // Same calm blur / opacity timing as the archived portfolio cover.
  document.querySelectorAll('.project-switch,.back-link').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || reducedMotion.matches) return;
      event.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(() => { window.location.href = link.href; }, 350);
    });
  });
  desktop.addEventListener('change', initLenis);
  reducedMotion.addEventListener('change', initLenis);
  addEventListener('pagehide', destroyLenis);
  addEventListener('pageshow', event => {
    document.body.classList.remove('is-leaving');
    if (event.persisted) initLenis();
    schedule();
  });
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', resize);
  document.fonts.ready.then(schedule);
  resize();
  initLenis();

  // English is a UI translation. Original image content stays exactly as supplied in Figma.
  const english = {
    '3573:31':'Shared charging for cafés',
    '3573:34':'A product system for mobile work and shared power in cafés',
    '3573:123':'Let work happen anywhere,\nfree from fixed power outlets.',
    '3573:124':'A shared power system for café work, connecting people, devices and spaces.',
    '3573:210':'About the product',
    '3573:211':'POLSO is a modular power bank and charging station for café work. Interchangeable socket modules, a wall-mounted station and a companion service let individuals and teams move freely between spaces, with flexible, tidy and reliable access to power.',
    '3573:215':'My role','3573:216':'Research · Product · Industrial design · UX/UI',
    '3573:219':'Context','3573:220':'Cafés · Mobile work · Shared use',
    '3573:223':'Output','3573:224':'Hardware · Charging station · App',
    '3573:616':'From user pain points\nto five design requirements',
    '3573:617':'Surveys, café observations, interviews and competitor analysis show that charging is about more than sockets: it is about space, accessibility and order in shared work.',
    '3573:623':'Space efficiency','3573:624':'Free up desks and floors for a tidy working environment.',
    '3573:629':'Flexible placement','3573:630':'Bring power where it is needed, across different settings.',
    '3573:635':'Shared use','3573:636':'Support multiple users, collaboration and teamwork.',
    '3573:641':'Integrated storage','3573:642':'Manage charging, cables and modules in one place.',
    '3573:647':'Spatial harmony','3573:648':'Fit naturally into the visual character of cafés.',
    '3573:738':'Inspiration: Flos Arco Floor Lamp','3573:742':'Inspiration','3573:741':'Balance in the cantilever',
    '3573:743':'Inspired by the balance of the Flos Arco Floor Lamp: a stable base supports a curved arm, bringing light where it is needed. POLSO translates this relationship into a structure that hangs, lifts and adapts to different settings.',
    '3573:825':'Form development','3574:2825':'Companion app',
    '3574:2826':'Maps, availability, rental, module selection and live status form one connected journey, reducing uncertainty before arrival and keeping information clear during use.',
    '3574:2885':'Find cafés offering shared charging on a map, scan an on-site QR code to rent a device, and check live availability across partner cafés.',
    '3574:2886':'Home shows average battery level and recommends nearby cafés.\nChoose an interchangeable module and view the selected device’s battery status.',
    '3574:2166':'Take a power bank from the station','3574:2173':'Choose the socket type you need',
    '3574:2180':'Attach the selected socket module','3574:2189':'Switch on (green means powered)',
    '3574:2197':'Connect your device','3574:2205':'Hang the power bank on the table edge',
    '3574:2304':'One modular system.\nMultiple charging needs.',
    '3574:2311':'Connection','3574:2312':'A snap-fit structure joins the body and interchangeable module.',
    '3574:2315':'Compact spring-loaded contacts transfer power between the bank, socket module and station.',
    '3574:2317':'Three socket modules','3574:2318':'Three options based on common EU standards: three-pin, two-pin and USB / Type-C, supporting different devices.',
    '3574:2320':'Battery module','3574:2321':'Cell type: Lithium-ion\nCapacity: 5,000mAh × 4 (20,000mAh total)\nRated: 12,000mAh (5V, 3A)\nDimensions: 75 × 46 × 48 mm\nCell weight: 82g × 4 (328g total)',
    '3574:2414':'Top counterweight module','3574:2416':'Middle connection module','3574:2418':'Bottom battery module',
    '3574:2426':'Curved metal connecting rod','3574:2429':'Triangular metal connecting rod',
    '3574:2432':'Upper connection housing','3574:2435':'Interchangeable module',
    '3574:2438':'Rectangular metal connecting rod','3574:2441':'Pogo Pin connector',
    '3574:2444':'Counterweight','3574:2446':'Rubber base pad','3574:2449':'LED strip',
    '3574:2452':'Lower connection housing','3574:2455':'Battery housing','3574:2458':'Housing counterweight structure',
    '3574:2561':'Metal support frame','3574:2569':'Socket module storage',
    '3574:2571':'Charging station','3574:2572':'The station continues the power bank’s design language. Matching materials and tones create visual harmony, while a consistent functional logic connects charging, storage and everyday use.',
    '3574:2663':'Soft colors and materials,\nat home in different spaces.',
    '3574:2678':'Designed for shared café settings, POLSO combines muted neutrals with orange interaction cues. Matte surfaces, soft touch and translucent light retain clear functionality while helping the device blend naturally into its surroundings.',
    '3573:305':'Research process','3573:307':'survey responses','3573:308':'observed sites','3573:309':'interview groups','3573:310':'competitors',
    '3573:326':'Quantitative research','3573:339':'charge devices in cafés','3573:340':'Not enough sockets',
    '3573:347':'Messy charging cables','3573:348':'No storage for belongings','3573:349':'Inconvenient sockets',
    '3573:350':'Limited desk space','3573:351':'Limited socket types','3573:352':'find shared desks cluttered',
    '3573:353':'lack space to work and charge together','3573:354':'Devices carried','3573:355':'Pain point ranking',
    '3573:356':'User profile','3573:357':'Laptop','3573:358':'Phone','3573:359':'Tablet','3573:363':'aged 29–43',
    '3573:366':'Solo / team work','3573:369':'Students / employed','3573:401':'Pain point',
    '3573:402':'Multiple people and devices regularly need power at once. Existing setups struggle to serve them.',
    '3573:413':'Field observations','3573:416':'Qualitative research','3573:419':'Market research','3573:425':'sites',
    '3573:429':'Fixed sockets and limited desk space make flexible charging difficult.',
    '3573:438':'Existing solutions struggle to combine mobility, multiple connections, cable management and space efficiency.',
    '3573:442':'Shared power banks; few socket types and inconvenient placement.',
    '3573:444':'Individual work','3573:445':'“I keep changing seats to find a socket.”',
    '3573:446':'High sockets take up space; low ones make cables hard to manage.\nToo few sockets mean taking turns to charge.\nChargers crowd an already limited work surface.',
    '3573:452':'Closest to the needs, but falls short for intensive sharing.',
    '3573:469':'Team work','3573:470':'“We come together, but seats with sockets are hard to find.”',
    '3573:471':'Too few sockets and types for everyone’s devices.\nCables cross the table and disrupt neighbors.\nLaptop stands and equipment reduce desk space further.',
    '3573:474':'Some seats have no power; cables stretch across desks and floors.',
    '3573:477':'Low wall sockets force users to adapt their seating.',
    '3573:480':'Only two outlets for 4–6 people, taking up substantial desk space.',
    '3573:484':'user groups','3573:486':'4 solo · 4 teams',
    '3573:489':'Individuals adapt to socket locations; teams face shortages, incompatibility and tangled cables.',
    '3573:522':'Socket types','3573:524':'Flexibility','3573:525':'Mobility','3573:526':'Socket count',
    '3767:3713':'Fixed','3767:3714':'Saves desk space, but limits mobility.',
    '3767:3718':'Modular','3767:3719':'Flexible ports, constrained by cables and placement.',
    '3767:3723':'Wireless','3767:3724':'Portable and simple, with limited compatibility.',
    '3767:3728':'Desk-integrated','3767:3729':'Combines functions but still occupies the work surface.'
  };
  const textNodes=[...document.querySelectorAll('.text')];
  const originals=new Map(textNodes.map(n=>[n,{html:n.innerHTML,text:n.textContent,font:n.style.fontSize,height:n.style.height}]));
  const byText=new Map();
  textNodes.forEach(n=>{if(english[n.dataset.nodeId])byText.set(n.textContent,english[n.dataset.nodeId]);});
  const navEnglish=['Overview','Research','Requirements','Form development','Final concept','Structure','Charging system','CMF strategy','Companion app'];
  const navChinese=chapterLinks.map(n=>n.lastElementChild.textContent);
  function setLanguage(lang) {
    root.lang=lang==='en'?'en':'zh-CN';
    textNodes.forEach(n=>{
      const o=originals.get(n);n.innerHTML=o.html;n.style.fontSize=o.font;n.style.height=o.height;
      const translation=byText.get(o.text);
      if(lang==='en'&&translation){
        n.textContent=translation;
        // Fit translated copy inside the original text box without changing the layout.
        let size=parseFloat(o.font);const min=size*.65;
        while((n.scrollHeight>parseFloat(o.height)+1||n.scrollWidth>parseFloat(n.style.width)+1)&&size>min){size-=.5;n.style.fontSize=size+'px';}
      }
    });
    chapterLinks.forEach((n,i)=>{n.lastElementChild.textContent=lang==='en'?navEnglish[i]:navChinese[i];});
    document.querySelector('.back-link span:last-child').textContent=lang==='en'?'Back':'返回';
    document.querySelector('.previous .thumb-label > span').textContent=lang==='en'?'Previous project':'上一个项目';
    document.querySelector('.next .thumb-label > span').textContent=lang==='en'?'Next project':'下一个项目';
    document.querySelectorAll('[data-language]').forEach(b=>{const active=b.dataset.language===lang;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    try{localStorage.setItem('polso-language',lang);}catch{}
  }
})();
