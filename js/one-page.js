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

function renderMediaStack(stack) {
  const cards = [...stack.querySelectorAll('.stack-card')];
  cards.forEach((card, index) => {
    card.classList.toggle('is-top', index === cards.length - 1);
    card.style.setProperty('--stack-z', index + 1);
    card.style.setProperty('--stack-x', `${card.dataset.x || 0}px`);
    card.style.setProperty('--stack-y', `${card.dataset.y || 0}px`);
    card.style.setProperty('--stack-rotation', `${card.dataset.rotation || 0}deg`);
  });
}

mediaStacks.forEach(stack => {
  [...stack.querySelectorAll('.stack-card')].forEach(setupStackCard);
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

mediaStacks.forEach(stack => {
  stack.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (stack.dataset.animating === 'true') return;

    const cards = [...stack.querySelectorAll('.stack-card')];
    const topCard = cards.at(-1);
    if (!topCard) return;

    stack.dataset.animating = 'true';

    const rotation = Number(topCard.dataset.rotation || 0);
    const x = Number(topCard.dataset.x || 0);
    const y = Number(topCard.dataset.y || 0);
    const direction = rotation >= 0 ? 1 : -1;
    const exitX = stack.clientWidth * 0.24 * direction;

    topCard.style.transition = `transform ${STACK_EXIT_DURATION}ms cubic-bezier(.4, 0, .2, 1)`;
    topCard.style.transform = `translate3d(${x + exitX}px, ${y}px, 0) rotate(${rotation + direction * 6}deg)`;

    window.setTimeout(() => {
      // Move the clicked card to the back of this stack.
      stack.prepend(topCard);
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
