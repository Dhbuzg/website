const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const projects = [...document.querySelectorAll('.project-details')];
const animations = new Map();

// Interactive project card stacks -------------------------------------------
const mediaStacks = [...document.querySelectorAll('[data-media-stack]')];
const STACK_EXIT_DURATION = 330;
const STACK_RETURN_DURATION = 430;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function setupStackCard(card) {
  let rotation = randomBetween(-4.5, 4.5);
  if (Math.abs(rotation) < 1.4) rotation = rotation < 0 ? -1.4 : 1.4;

  card.dataset.rotation = rotation.toFixed(2);
  card.dataset.x = randomBetween(-5, 5).toFixed(1);
  card.dataset.y = randomBetween(-3, 3).toFixed(1);
}

function stackCards(stack) {
  return [...stack.querySelectorAll('.stack-card')].sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
}

function sendCardToBack(stack, card) {
  const cards = stackCards(stack);
  card.dataset.order = 0;
  cards.filter(item => item !== card).forEach((item, index) => { item.dataset.order = index + 1; });
}

function renderMediaStack(stack) {
  const cards = stackCards(stack);
  cards.forEach((card, index) => {
    card.classList.toggle('is-top', index === cards.length - 1);
    card.setAttribute('aria-hidden', String(index !== cards.length - 1));
    card.style.setProperty('--stack-z', index + 1);
    card.style.setProperty('--stack-x', `${card.dataset.x || 0}px`);
    card.style.setProperty('--stack-y', `${card.dataset.y || 0}px`);
    card.style.setProperty('--stack-rotation', `${card.dataset.rotation || 0}deg`);
  });
  const current = cards.at(-1)?.dataset.clip;
  stack.setAttribute('aria-label', `Vidéo ${current} sur ${cards.length}. Afficher la suivante`);
  stack.querySelector('.stack-count').textContent = `${current} / ${cards.length} · Suivante ↗`;
}

mediaStacks.forEach(stack => {
  stack.setAttribute('role', 'button');
  stack.tabIndex = 0;
  const count = document.createElement('span');
  count.className = 'stack-count';
  count.setAttribute('aria-hidden', 'true');
  stack.append(count);
  const cards = [...stack.querySelectorAll('.stack-card')];
  cards.forEach((card, index) => { card.dataset.order = index; card.dataset.clip = cards.length - index; setupStackCard(card); });
  renderMediaStack(stack);
});

// Play only visible videos. Cards behind a stack remain paused.
const videos = [...document.querySelectorAll('.portfolio video')];
const visibleVideos = new Set();
let initialPageReady = document.readyState === 'complete';

window.addEventListener('load', () => {
  initialPageReady = true;
  videos.forEach(syncVideo);
}, { once: true });

function syncVideo(video) {
  if (!video) return;

  const project = video.closest('.project-details');
  const stackCard = video.closest('.stack-card');
  const isActiveStackCard = !stackCard || stackCard.classList.contains('is-top');
  const allowed = project
    ? project.open && project.dataset.closing !== 'true' && isActiveStackCard
    : initialPageReady && !reducedMotion.matches && !navigator.connection?.saveData;

  if (!document.hidden && visibleVideos.has(video) && allowed) {
    const source = video.querySelector('source[data-src]');
    if (source) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
      video.load();
    }
    video.play().catch(() => { /* Keep the poster if autoplay is unavailable. */ });
  } else {
    video.pause();
  }
}

function syncProjectVideos(details) {
  if (!details) return;
  details.querySelectorAll('video').forEach(syncVideo);
}

function syncStackVideos(stack) {
  stack.querySelectorAll('video').forEach(syncVideo);
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(({ target, isIntersecting }) => {
    if (isIntersecting) visibleVideos.add(target);
    else visibleVideos.delete(target);
    syncVideo(target);
  });
}, { threshold: .05 });

videos.forEach(video => observer.observe(video));

document.addEventListener('visibilitychange', () => videos.forEach(syncVideo));
reducedMotion.addEventListener('change', () => videos.forEach(syncVideo));

// Decode the next clip before revealing it; keep the current card visible meanwhile.
function prepareStackVideo(video) {
  return new Promise(resolve => {
    let frame;
    let settled = false;
    const finish = ready => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.removeEventListener('error', failed);
      video.removeEventListener('loadeddata', decoded);
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      video.pause();
      if (ready) video.removeAttribute('poster');
      resolve(ready);
    };
    const failed = () => finish(false);
    const decoded = () => finish(true);
    const timeout = setTimeout(failed, 12000);
    video.addEventListener('error', failed, { once: true });
    const source = video.querySelector('source[data-src]');
    if (source) {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
      video.load();
    }
    if (video.requestVideoFrameCallback) {
      frame = video.requestVideoFrameCallback(decoded);
    } else if (video.readyState >= 2) {
      decoded();
      return;
    } else {
      video.addEventListener('loadeddata', decoded, { once: true });
    }
    video.play().catch(failed);
  });
}

mediaStacks.forEach(stack => {
  stack.addEventListener('keydown', event => {
    if (['Enter', ' ', 'ArrowRight'].includes(event.key)) { event.preventDefault(); stack.click(); }
  });
  stack.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    if (stack.dataset.animating === 'true') return;

    const cards = stackCards(stack);
    const topCard = cards.at(-1);
    const nextVideo = cards.at(-2)?.querySelector('video');
    if (!topCard || !nextVideo) return;
    stack.dataset.animating = 'true';
    stack.setAttribute('aria-busy', 'true');
    const ready = await prepareStackVideo(nextVideo);
    stack.removeAttribute('aria-busy');
    const project = stack.closest('.project-details');
    if (!ready || document.hidden || (project && (!project.open || project.dataset.closing === 'true'))) {
      delete stack.dataset.animating;
      syncStackVideos(stack);
      return;
    }
    if (reducedMotion.matches) {
      sendCardToBack(stack, topCard);
      renderMediaStack(stack);
      syncStackVideos(stack);
      delete stack.dataset.animating;
      return;
    }

    const rotation = Number(topCard.dataset.rotation || 0);
    const x = Number(topCard.dataset.x || 0);
    const y = Number(topCard.dataset.y || 0);
    const direction = rotation >= 0 ? 1 : -1;
    const exitX = stack.clientWidth * 0.08 * direction;

    topCard.style.transition = `transform ${STACK_EXIT_DURATION}ms cubic-bezier(.4, 0, .2, 1)`;
    topCard.style.transform = `translate3d(${x + exitX}px, ${y}px, 0) rotate(${rotation + direction * 6}deg)`;

    window.setTimeout(() => {
      // Change visual order without detaching the video from the DOM.
      sendCardToBack(stack, topCard);
      setupStackCard(topCard);

      const newRotation = Number(topCard.dataset.rotation || 0);
      const newY = Number(topCard.dataset.y || 0);

      topCard.style.transition = 'none';
      topCard.style.transform = `translate3d(${exitX}px, ${newY}px, 0) rotate(${newRotation + direction * 4}deg)`;

      renderMediaStack(stack);
      syncStackVideos(stack);
      void topCard.offsetWidth;

      topCard.style.transition = `transform ${STACK_RETURN_DURATION}ms cubic-bezier(.22, 1, .36, 1)`;
      topCard.style.transform = '';

      window.setTimeout(() => {
        topCard.style.transition = '';
        delete stack.dataset.animating;
        syncStackVideos(stack);
      }, STACK_RETURN_DURATION);
    }, STACK_EXIT_DURATION);
  });
});

let selectedProject = projects.find(project => project.open) || null;
let transitionId = 0;
let releaseAnchor = () => {};

async function animatePanel(details, opening) {
  const panel = details.querySelector('.project-panel');
  const start = details.open ? panel.getBoundingClientRect().height : 0;
  const previous = animations.get(details);
  if (previous) previous.cancel();
  animations.delete(details);
  panel.style.height = '';
  panel.style.overflow = '';

  if (opening) {
    details.open = true;
    delete details.dataset.closing;
  } else {
    details.dataset.closing = 'true';
    details.querySelectorAll('video').forEach(video => video.pause());
  }

  const end = opening ? panel.getBoundingClientRect().height : 0;
  if (reducedMotion.matches || Math.abs(start - end) < 1) {
    details.open = opening;
    delete details.dataset.closing;
    syncProjectVideos(details);
    return;
  }

  panel.style.overflow = 'hidden';
  const animation = panel.animate([
    { height: `${start}px` }, { height: `${end}px` }
  ], { duration: opening ? 360 : 320, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'both' });

  animations.set(details, animation);
  syncProjectVideos(details);

  try {
    await animation.finished;
  } catch {
    return; // A newer click now owns this panel.
  }

  if (animations.get(details) !== animation) return;
  details.open = opening;
  delete details.dataset.closing;
  animations.delete(details);
  animation.cancel();
  panel.style.overflow = '';
  syncProjectVideos(details);
}

// Compensate only layout movement above the selected card, not user scrolling.
function holdSelectedPosition(details) {
  const summary = details.querySelector('summary');
  const viewportTop = summary.getBoundingClientRect().top;
  let userScrolling = false;
  const stopTracking = () => { userScrolling = true; };
  window.addEventListener('wheel', stopTracking, { passive: true });
  window.addEventListener('touchmove', stopTracking, { passive: true });
  let frame;
  document.documentElement.classList.add('project-switching');

  function compensate() {
    if (userScrolling) return;
    const nextTop = summary.getBoundingClientRect().top;
    const delta = nextTop - viewportTop;
    if (Math.abs(delta) > .1) window.scrollBy({ top: delta, behavior: 'instant' });
  }

  function tick() {
    compensate();
    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stopTracking);
    window.removeEventListener('touchmove', stopTracking);
    compensate();
    document.documentElement.classList.remove('project-switching');
  };
}

async function selectProject(details) {
  const id = ++transitionId;
  releaseAnchor();
  releaseAnchor = () => {};

  if (selectedProject === details) {
    selectedProject = null;
    await Promise.all(projects.filter(project => project.open).map(project => animatePanel(project, false)));
    return;
  }

  selectedProject = details;
  // Hold the clicked card steady throughout opening and the delayed closure.
  releaseAnchor = holdSelectedPosition(details);
  await animatePanel(details, true);
  if (id !== transitionId) return;

  await Promise.all(projects.filter(project => project !== details && project.open).map(project => animatePanel(project, false)));
  if (id !== transitionId) return;

  releaseAnchor();
  releaseAnchor = () => {};
}

projects.forEach(details => {
  details.querySelector('summary').addEventListener('click', event => {
    event.preventDefault();
    selectProject(details);
  });

  details.addEventListener('toggle', () => syncProjectVideos(details));
});
