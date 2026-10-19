// Image scheduling only: the original filtering, motion and return handlers stay untouched.
(() => {
  const covers = [...document.querySelectorAll('.project-image--all')];
  const alternates = [...document.querySelectorAll('.project-image--filtered')];
  const connection = navigator.connection;
  const ready = image => image.decode().catch(() => null);

  // A user's explicit filter choice takes priority over idle background work.
  document.querySelectorAll('.filter-button').forEach(button => {
    const prioritize = () => {
      const filter = button.dataset.filter;
      document.querySelectorAll('.project-card').forEach(card => {
        if (filter !== 'all' && card.dataset.category !== filter) return;
        card.querySelector(filter === 'all' ? '.project-image--all' : '.project-image--filtered').fetchPriority = 'high';
      });
    };
    for (const type of ['pointerenter', 'focus', 'click']) {
      button.addEventListener(type, prioritize, { capture: true, passive: true });
    }
  });

  // Decode the actual final images once, never a blurry placeholder or crossfade.
  Promise.all(covers.map(ready)).then(() => {
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    const warm = () => {
      const queue = [...alternates];
      const worker = async () => {
        while (queue.length) {
          const image = queue.shift();
          if (image.fetchPriority !== 'high') image.fetchPriority = 'low';
          image.loading = 'eager';
          await ready(image);
        }
      };
      // Only two idle requests; first-screen images have already finished.
      Promise.all([worker(), worker()]);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1800 });
    else setTimeout(warm, 200);
  });
})();
