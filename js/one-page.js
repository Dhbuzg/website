const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const projects = [...document.querySelectorAll('.project-details')];
const animations = new Map();

// Play only visible videos; hidden or collapsed projects never keep playing.
const videos = [...document.querySelectorAll('.portfolio video')];
const visibleVideos = new Set();
function syncVideo(video) {
  const project = video.closest('.project-details');
  const allowed = project ? project.open && project.dataset.closing !== 'true' : !reducedMotion.matches;
  if (!document.hidden && visibleVideos.has(video) && allowed) {
    video.play().catch(() => { /* Keep the poster if autoplay is unavailable. */ });
  } else {
    video.pause();
  }
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
    details.querySelector('video')?.pause();
  }
  const end = opening ? panel.getBoundingClientRect().height : 0;
  if (reducedMotion.matches || Math.abs(start - end) < 1) {
    details.open = opening;
    delete details.dataset.closing;
    syncVideo(details.querySelector('video'));
    return;
  }
  panel.style.overflow = 'hidden';
  const animation = panel.animate([
    { height: `${start}px` }, { height: `${end}px` }
  ], { duration: opening ? 360 : 320, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'both' });
  animations.set(details, animation);
  syncVideo(details.querySelector('video'));
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
  syncVideo(details.querySelector('video'));
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
  function tick() { compensate(); frame = requestAnimationFrame(tick); }
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
  details.addEventListener('toggle', () => syncVideo(details.querySelector('video')));
});
