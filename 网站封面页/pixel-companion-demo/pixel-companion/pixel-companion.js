(() => {
  "use strict";

  const CONFIG = Object.freeze({
    offsetX: 20,
    offsetY: 20,
    followResponsiveness: 12.5,
    maxFollowDistance: 500,
    stopDelay: 110,
    resumeDistance: 3,
    movementEpsilon: 0.4,
    slowingDelay: 90,
    movingImageInterval: 120,
    slowingImageInterval: 260,
    maxDelta: 1 / 30,
  });

  const SETTLING_IMAGE_INTERVALS = Object.freeze([25, 35, 45, 55, 80]);

  const IMAGE_POOL = [
    { name: "cat", file: "猫.png" },
    { name: "rabbit", file: "兔子.png" },
    { name: "octopus", file: "章鱼.png" },
    { name: "paw", file: "爪子.png" },
  ];

  const INTERACTIVE_SELECTOR = [
    "a",
    "button",
    "input",
    "textarea",
    "select",
    "summary",
    "label[for]",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='tab']",
    "[role='checkbox']",
    "[role='switch']",
    "[tabindex]",
    "[contenteditable]:not([contenteditable='false'])",
    "[data-clickable]",
    ".project-card",
    ".clickable-card",
    ".project-filter",
    ".filter-controls",
  ].join(",");

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scriptBase = document.currentScript?.src
    ? new URL(".", document.currentScript.src)
    : new URL(".", document.baseURI);
  const assetUrl = (filename) => new URL(`assets/${filename}`, scriptBase).href;

  let cleanup = null;

  function canRun() {
    return finePointer.matches && !reducedMotion.matches;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createPixelCompanion() {
    if (!canRun() || document.querySelector("[data-pixel-companion]")) {
      return null;
    }

    const companion = document.createElement("div");
    companion.className = "pixel-companion";
    companion.dataset.pixelCompanion = "";
    companion.dataset.state = "stopped";
    companion.dataset.image = IMAGE_POOL[0].name;
    companion.setAttribute("aria-hidden", "true");
    companion.innerHTML = IMAGE_POOL.map(
      (item, index) => `
        <img
          class="pixel-companion__image"
          data-image="${item.name}"
          src="${assetUrl(item.file)}"
          alt=""
          draggable="false"
          ${index === 0 ? "" : "hidden"}
        />
      `,
    ).join("");
    document.body.append(companion);

    const images = [...companion.querySelectorAll(".pixel-companion__image")];
    const pointer = { x: 0, y: 0 };
    const position = { x: 0, y: 0 };
    const stopAnchor = { x: 0, y: 0 };
    const movementSample = { x: 0, y: 0 };

    let hasPointer = false;
    let state = "stopped";
    let currentImageIndex = 0;
    let lastSignificantMoveTime = performance.now();
    let lastImageSwitchTime = performance.now();
    let settlingStep = 0;
    let previousFrameTime = performance.now();
    let frameId = 0;
    let isOverInteractive = false;

    function updateInteractiveVisibility(target) {
      const element = target instanceof Element ? target : target?.parentElement;
      const nextIsOverInteractive = Boolean(
        element?.closest(INTERACTIVE_SELECTOR),
      );

      if (nextIsOverInteractive === isOverInteractive) return;

      isOverInteractive = nextIsOverInteractive;
      companion.classList.toggle("is-over-interactive", isOverInteractive);
    }

    function showImage(index) {
      if (index === currentImageIndex) return;
      images[currentImageIndex].hidden = true;
      images[index].hidden = false;
      currentImageIndex = index;
      companion.dataset.image = IMAGE_POOL[index].name;
    }

    function showNextImage() {
      showImage((currentImageIndex + 1) % IMAGE_POOL.length);
    }

    function settleAtRandomImage() {
      state = "stopped";
      companion.dataset.state = state;
      stopAnchor.x = pointer.x;
      stopAnchor.y = pointer.y;
      showImage(Math.floor(Math.random() * IMAGE_POOL.length));
    }

    function enterMovingState(now) {
      state = "moving";
      companion.dataset.state = state;
      lastSignificantMoveTime = now;
      movementSample.x = pointer.x;
      movementSample.y = pointer.y;
      settlingStep = 0;
      showNextImage();
      lastImageSwitchTime = now;
    }

    function enterSlowingState() {
      state = "slowing";
      companion.dataset.state = state;
    }

    function enterSettlingState(now) {
      state = "settling";
      companion.dataset.state = state;
      stopAnchor.x = pointer.x;
      stopAnchor.y = pointer.y;
      settlingStep = 0;
      lastImageSwitchTime = now;
    }

    function onPointerMove(event) {
      if (event.pointerType === "touch") return;

      updateInteractiveVisibility(event.target);

      const now = performance.now();
      const nextX = event.clientX;
      const nextY = event.clientY;

      if (!hasPointer) {
        hasPointer = true;
        pointer.x = nextX;
        pointer.y = nextY;
        position.x = pointer.x + CONFIG.offsetX;
        position.y = pointer.y + CONFIG.offsetY;
        movementSample.x = pointer.x;
        movementSample.y = pointer.y;
        lastSignificantMoveTime = now;
        state = "moving";
        companion.dataset.state = state;
        companion.classList.add("is-visible");
        return;
      }

      if (state === "stopped" || state === "settling") {
        const distanceFromStop = Math.hypot(
          nextX - stopAnchor.x,
          nextY - stopAnchor.y,
        );

        if (distanceFromStop >= CONFIG.resumeDistance) {
          pointer.x = nextX;
          pointer.y = nextY;
          enterMovingState(now);
        }
        return;
      }

      pointer.x = nextX;
      pointer.y = nextY;

      const sampleDistance = Math.hypot(
        pointer.x - movementSample.x,
        pointer.y - movementSample.y,
      );

      if (sampleDistance >= CONFIG.movementEpsilon) {
        movementSample.x = pointer.x;
        movementSample.y = pointer.y;
        lastSignificantMoveTime = now;

        if (state === "slowing") {
          enterMovingState(now);
        }
      }
    }

    function onPointerLeave(event) {
      if (!event.relatedTarget) companion.classList.remove("is-visible");
    }

    function onPointerEnter() {
      if (hasPointer) companion.classList.add("is-visible");
    }

    function slowingImageInterval(timeSinceMove) {
      const slowingProgress = clamp(
        (timeSinceMove - CONFIG.slowingDelay) /
          (CONFIG.stopDelay - CONFIG.slowingDelay),
        0,
        1,
      );
      const easedProgress = slowingProgress * (2 - slowingProgress);

      return (
        CONFIG.movingImageInterval +
        (CONFIG.slowingImageInterval - CONFIG.movingImageInterval) *
          easedProgress
      );
    }

    function update(frameTime) {
      const dt = Math.min((frameTime - previousFrameTime) / 1000, CONFIG.maxDelta);
      previousFrameTime = frameTime;

      if (hasPointer) {
        const targetX = pointer.x + CONFIG.offsetX;
        const targetY = pointer.y + CONFIG.offsetY;
        const targetDeltaX = targetX - position.x;
        const targetDeltaY = targetY - position.y;
        const targetDistance = Math.hypot(targetDeltaX, targetDeltaY);

        if (targetDistance > CONFIG.maxFollowDistance) {
          const excessRatio =
            (targetDistance - CONFIG.maxFollowDistance) / targetDistance;
          position.x += targetDeltaX * excessRatio;
          position.y += targetDeltaY * excessRatio;
        }

        const followBlend = 1 - Math.exp(-CONFIG.followResponsiveness * dt);

        position.x += (targetX - position.x) * followBlend;
        position.y += (targetY - position.y) * followBlend;
        companion.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;

        if (state === "moving" || state === "slowing") {
          const timeSinceMove = frameTime - lastSignificantMoveTime;

          if (timeSinceMove >= CONFIG.stopDelay) {
            enterSettlingState(frameTime);
          } else {
            if (
              state === "moving" &&
              timeSinceMove >= CONFIG.slowingDelay
            ) {
              enterSlowingState();
            }

            const imageInterval =
              state === "moving"
                ? CONFIG.movingImageInterval
                : slowingImageInterval(timeSinceMove);

            if (frameTime - lastImageSwitchTime >= imageInterval) {
              showNextImage();
              lastImageSwitchTime = frameTime;
            }
          }
        } else if (state === "settling") {
          const imageInterval = SETTLING_IMAGE_INTERVALS[settlingStep];

          if (frameTime - lastImageSwitchTime >= imageInterval) {
            if (settlingStep < SETTLING_IMAGE_INTERVALS.length - 1) {
              showNextImage();
              settlingStep += 1;
              lastImageSwitchTime = frameTime;
            } else {
              settleAtRandomImage();
            }
          }
        }
      }

      frameId = requestAnimationFrame(update);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onPointerLeave);
    document.documentElement.addEventListener("mouseenter", onPointerEnter);
    frameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onPointerLeave);
      document.documentElement.removeEventListener("mouseenter", onPointerEnter);
      companion.remove();
    };
  }

  function sync() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    if (canRun()) cleanup = createPixelCompanion();
  }

  finePointer.addEventListener("change", sync);
  reducedMotion.addEventListener("change", sync);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();
