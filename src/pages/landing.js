import { getTopHTML } from './landing-top.js';
import { getBottomHTML } from './landing-bottom.js';
import { flowSteps, plansData, checkSvg, landingIcons as ico } from './landing-data.js';

export function renderLanding(container) {
  container.innerHTML = `<div class="page landing-page">${getTopHTML()}${getBottomHTML()}</div>`;
  initNavbar();
  initMobileMenu();
  initScrollAnimations();
  initTimelineScroll();
  initSnapDots('lk-problem-snap', 'lk-problem-dots');
  initCtaForm();
}

/* === NAVBAR === */
function initNavbar() {
  const nav = document.getElementById('lk-nav');
  if (!nav) return;
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 50);
    lastY = y;
  });
}

/* === MOBILE MENU === */
function initMobileMenu() {
  const btn = document.getElementById('lk-hamburger');
  const menu = document.getElementById('lk-mobile-menu');
  const close = document.getElementById('lk-mobile-close');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => { menu.classList.add('open'); menu.setAttribute('aria-hidden','false'); });
  close.addEventListener('click', () => { menu.classList.remove('open'); menu.setAttribute('aria-hidden','true'); });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { menu.classList.remove('open'); menu.setAttribute('aria-hidden','true'); }));
}

/* === SCROLL ANIMATIONS === */
function initScrollAnimations() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.lk-reveal').forEach(el => obs.observe(el));
}

/* === TIMELINE GLOW === */
function initTimelineScroll() {
  const timeline = document.getElementById('lk-timeline');
  const glow = document.getElementById('lk-timeline-glow');
  if (!timeline || !glow) return;

  window.addEventListener('scroll', () => {
    const rect = timeline.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    
    // Calculate how much of the timeline has been scrolled past the middle of the screen
    if (rect.top < windowHeight * 0.7 && rect.bottom > 0) {
      let progress = ((windowHeight * 0.7) - rect.top) / rect.height;
      progress = Math.max(0, Math.min(1, progress));
      glow.style.height = `${progress * 100}%`;
    }
  });
}

/* === SNAP CAROUSEL DOTS === */
function initSnapDots(carouselId, dotsWrapId) {
  const carousel = document.getElementById(carouselId);
  const dotsWrap = document.getElementById(dotsWrapId);
  if (!carousel || !dotsWrap) return;

  const cards = Array.from(carousel.children);
  if (cards.length === 0) return;

  dotsWrap.style.display = 'flex';
  dotsWrap.style.justifyContent = 'center';
  dotsWrap.style.gap = '8px';
  dotsWrap.style.marginTop = '24px';

  cards.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.background = i === 0 ? 'var(--lk-mint)' : 'var(--lk-border2)';
    dot.style.transition = 'background 0.3s';
    dotsWrap.appendChild(dot);
  });
  const dots = Array.from(dotsWrap.children);

  carousel.addEventListener('scroll', () => {
    const scrollLeft = carousel.scrollLeft;
    const cardWidth = cards[0].offsetWidth + 16;
    const idx = Math.min(Math.max(Math.round(scrollLeft / cardWidth), 0), cards.length - 1);
    
    dots.forEach((d, i) => {
      d.style.background = i === idx ? 'var(--lk-mint)' : 'var(--lk-border2)';
    });
  });
}

/* === CTA FORM === */
function initCtaForm() {
  const form = document.getElementById('lk-cta-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = 'SOLICITAÇÃO ENVIADA!';
    btn.style.background = '#00E5A0';
    btn.style.color = '#000';
    
    setTimeout(() => {
      btn.textContent = originalText;
      form.reset();
    }, 3000);
  });
}
