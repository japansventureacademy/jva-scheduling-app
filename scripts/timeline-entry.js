import { animate } from 'motion/mini';

const timeline = document.querySelector('#recruitmentTimeline');
const timelineTrigger = document.querySelector('#timelineTrigger');
const timelineClose = document.querySelector('#timelineClose');
const timelineStartBtn = document.querySelector('#timelineStartBtn');
const startBtn = document.querySelector('#startBtn');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let hasAnimatedContent = false;

timeline?.classList.add('is-motion-ready');

function revealContent() {
  if (hasAnimatedContent || !timeline) return;
  hasAnimatedContent = true;
  const heading = timeline.querySelector('.timeline-heading');
  const steps = [...timeline.querySelectorAll('.timeline-step')];
  const callout = timeline.querySelector('.timeline-cta');
  if (reduceMotion) {
    animate([heading, ...steps, callout], { opacity: [0, 1] }, { duration: .18 });
    return;
  }
  animate(heading, { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] }, { duration: .26, easing: [.23, 1, .32, 1] });
  steps.forEach((step, index) => animate(step, { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0)'] }, { duration: .28, delay: .04 + index * .045, easing: [.23, 1, .32, 1] }));
  animate(callout, { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] }, { duration: .24, delay: .19, easing: [.23, 1, .32, 1] });
}

function openTimeline() {
  if (!timeline || timeline.open) return;
  timeline.showModal();
  if (!reduceMotion) animate(timeline, { opacity: [0, 1], transform: window.innerWidth <= 760 ? ['translateY(3%)', 'translateY(0)'] : ['translate(-50%, -48%) scale(.98)', 'translate(-50%, -50%) scale(1)'] }, { duration: .22, easing: [.23, 1, .32, 1] });
  revealContent();
}

function closeTimeline() {
  if (!timeline?.open) return;
  if (reduceMotion) { timeline.close(); return; }
  const exit = animate(timeline, { opacity: [1, 0], transform: window.innerWidth <= 760 ? ['translateY(0)', 'translateY(2%)'] : ['translate(-50%, -50%) scale(1)', 'translate(-50%, -49%) scale(.985)'] }, { duration: .14, easing: [.23, 1, .32, 1] });
  exit.then(() => { timeline.close(); timeline.style.opacity = ''; timeline.style.transform = ''; });
}

timelineTrigger?.addEventListener('click', openTimeline);
timelineClose?.addEventListener('click', closeTimeline);
timeline?.addEventListener('click', event => { if (event.target === timeline) closeTimeline(); });
timelineStartBtn?.addEventListener('click', () => { timeline?.close(); startBtn?.click(); });
