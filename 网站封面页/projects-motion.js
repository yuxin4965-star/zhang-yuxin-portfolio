(() => {
  const root = document.documentElement;
  const page = document.body;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;

  function finishEntrance() {
    active = false;
    page.classList.remove('projects-motion-enabled');
    root.dataset.motion = 'ready';
  }

  // A restored page must never be hidden again, including explicit detail returns.
  if (root.dataset.motion !== 'pending' || reducedMotion.matches) {
    finishEntrance();
    return;
  }

  active = true;
  const started = performance.now();
  document.querySelectorAll('.filter-button').forEach((button, index) => {
    button.style.setProperty('--project-motion-delay', `${180 + index * 55}ms`);
  });
  document.querySelectorAll('.projects-page__footer > span').forEach((span, index) => {
    span.style.setProperty('--project-motion-delay', `${680 + index * 80}ms`);
  });
  const cards = [...document.querySelectorAll('.project-card')];
  // Follow visual order: the desktop grid swaps POLSO and BATTLELIGHT.
  const ordered = cards.map(card => ({ card, rect: card.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  page.classList.add('projects-motion-enabled');
  root.dataset.motion = 'running';

  ordered.forEach(({ card }, index) => {
    const image = card.querySelector('.project-image--all');
    let revealed = false;
    card.addEventListener('animationend', event => {
      if (event.target !== card || event.animationName !== 'projects-mask-out') return;
      card.classList.add('is-project-image-settled');
    });
    const ready = () => {
      if (!active || revealed) return;
      revealed = true;
      // Late images reveal on arrival; don't add the whole stagger again.
      const delay = Math.max(0, 240 + index * 55 - (performance.now() - started));
      card.style.setProperty('--project-motion-delay', `${delay}ms`);
      image.classList.add('is-project-image-ready');
      card.classList.add('is-project-image-ready');
    };
    const decode = () => {
      if (typeof image.decode === 'function') image.decode().then(ready, ready);
      else ready();
    };
    if (image.complete) decode();
    else {
      image.addEventListener('load', decode, { once: true });
      image.addEventListener('error', ready, { once: true });
    }
  });

  // Filtering owns card geometry; finish entrance before it starts.
  document.addEventListener('projects:filter-start', finishEntrance);
  window.addEventListener('pageshow', event => {
    if (event.persisted) finishEntrance();
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) finishEntrance();
  });
})();
