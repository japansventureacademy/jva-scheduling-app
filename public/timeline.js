import { animate } from './motion-mini.js';

const timeline = document.querySelector('#recruitmentTimeline');
const timelineTrigger = document.querySelector('#timelineTrigger');
const timelineStartBtn = document.querySelector('#timelineStartBtn');
const startBtn = document.querySelector('#startBtn');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let hasAnimated = false;

timeline?.classList.add('is-motion-ready');

function revealTimeline() {
  if (hasAnimated || !timeline) return;
  hasAnimated = true;

  const heading = timeline.querySelector('.timeline-heading');
  const steps = [...timeline.querySelectorAll('.timeline-step')];
  const callout = timeline.querySelector('.timeline-cta');

  if (reduceMotion) {
    animate([heading, ...steps, callout], { opacity: [0, 1] }, { duration: .2 });
    return;
  }

  animate(heading, { opacity: [0, 1], transform: ['translateY(18px)', 'translateY(0)'] }, { duration: .42, easing: [.23, 1, .32, 1] });
  steps.forEach((step, index) => {
    animate(step, { opacity: [0, 1], transform: ['translateY(22px)', 'translateY(0)'] }, { duration: .44, delay: .08 + index * .065, easing: [.23, 1, .32, 1] });
  });
  animate(callout, { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0)'] }, { duration: .38, delay: .31, easing: [.23, 1, .32, 1] });
}

if (timeline) {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    revealTimeline();
    observer.disconnect();
  }, { threshold: .16 });
  observer.observe(timeline);
}

timelineTrigger?.addEventListener('click', () => {
  timeline?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
});

timelineStartBtn?.addEventListener('click', () => startBtn?.click());
