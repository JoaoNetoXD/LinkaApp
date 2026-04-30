import { getTopHTML } from './landing-top.js';
import { getBottomHTML } from './landing-bottom.js';
import { flowSteps, plansData, checkSvg, landingIcons as ico } from './landing-data.js';

export function renderLanding(container) {
  container.innerHTML = `<div class="page landing-page">${getTopHTML()}${getBottomHTML()}</div>`;
  initNavbar();
  initMobileMenu();
  initTypewriter();
  initScrollAnimations();
  initFlowTimeline();
  initFlowAccordion();
  initPlansToggle();
  initCountUp();
  initCouponDemo();
  initWhoCarousel();
  initCtaForm();
}

/* === NAVBAR === */
function initNavbar() {
  const nav = document.getElementById('lk-nav');
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 50);
    if (y > 300) {
      nav.classList.toggle('nav-hidden', y > lastY);
    } else {
      nav.classList.remove('nav-hidden');
    }
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

/* === TYPEWRITER === */
function initTypewriter() {
  const el = document.getElementById('lk-typewriter');
  if (!el) return;
  const code = 'LNK-BRW-7X92';
  let i = 0;
  function type() {
    if (i <= code.length) {
      el.textContent = code.slice(0, i);
      i++;
      setTimeout(type, 120);
    } else {
      setTimeout(() => { i = 0; type(); }, 3000);
    }
  }
  setTimeout(type, 1000);
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
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.lk-reveal, .lk-problem-card, .lk-who-card, .lk-feat-card, .lk-plan').forEach(el => obs.observe(el));
}

/* === FLOW TIMELINE (desktop) === */
function initFlowTimeline() {
  const nodes = document.querySelectorAll('.lk-flow__node');
  const preview = document.getElementById('lk-flow-preview');
  const progress = document.getElementById('lk-flow-progress');
  if (!nodes.length || !preview) return;

  function setStep(idx) {
    nodes.forEach((n, i) => n.classList.toggle('active', i <= idx));
    const step = flowSteps[idx];
    preview.innerHTML = `
      <div class="lk-flow__preview-icon">${step.icon}</div>
      <div>
        <div class="lk-flow__preview-title">${step.title}</div>
        <div class="lk-flow__preview-desc">${step.desc}</div>
      </div>`;
    if (progress) progress.style.width = `${(idx / (flowSteps.length - 1)) * 100}%`;
  }

  nodes.forEach((n, i) => {
    n.addEventListener('click', () => setStep(i));
    n.addEventListener('mouseenter', () => setStep(i));
  });

  // Auto-advance on scroll into view
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      let step = 0;
      const interval = setInterval(() => {
        if (step < flowSteps.length) { setStep(step); step++; }
        else clearInterval(interval);
      }, 800);
      obs.disconnect();
    }
  }, { threshold: 0.3 });
  const timeline = document.getElementById('lk-flow-timeline');
  if (timeline) obs.observe(timeline);
}

/* === FLOW ACCORDION (mobile) === */
function initFlowAccordion() {
  document.querySelectorAll('.lk-flow__acc-head').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.lk-flow__acc-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

/* === PLANS TOGGLE === */
function initPlansToggle() {
  const sw = document.getElementById('lk-toggle-switch');
  const grid = document.getElementById('lk-plans-grid');
  const mLabel = document.getElementById('lk-toggle-monthly');
  const aLabel = document.getElementById('lk-toggle-annual');
  if (!sw || !grid) return;
  let annual = false;

  function renderPlans() {
    const data = annual ? plansData.annual : plansData.monthly;
    const period = annual ? 'annual' : 'monthly';
    grid.innerHTML = data.map(p => {
      const priceHTML = p.price
        ? `<div class="lk-plan__price"><span>R$ </span>${p.price}<span>/mes</span></div>`
        : `<div class="lk-plan__price" style="font-size:1.5rem;">Sob consulta</div>`;
      return `
        <div class="lk-plan ${p.featured ? 'lk-plan--featured' : ''} in-view">
          ${p.featured ? '<div class="lk-plan__popular">Mais popular</div>' : ''}
          <div class="lk-plan__name">${p.name}</div>
          ${priceHTML}
          <div class="lk-plan__desc">${p.desc}</div>
          <ul class="lk-plan__features">
            ${p.features.map(f => `<li>${checkSvg} ${f}</li>`).join('')}
          </ul>
          <button class="lk-plan__cta ${p.ctaClass}" aria-label="${p.cta}">${p.cta}</button>
          <div class="lk-plan__guarantee">${ico.lock} 14 dias de garantia</div>
        </div>`;
    }).join('');
  }

  sw.addEventListener('click', () => {
    annual = !annual;
    sw.classList.toggle('annual', annual);
    mLabel.classList.toggle('active', !annual);
    aLabel.classList.toggle('active', annual);
    renderPlans();
  });
}

/* === COUNTUP === */
function initCountUp() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const target = parseInt(e.target.dataset.target);
        animateCount(e.target, target);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.lk-countup').forEach(el => obs.observe(el));
}

function animateCount(el, target) {
  const duration = 1500;
  const start = performance.now();
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target) + '%';
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/* === COUPON DEMO (features section) === */
function initCouponDemo() {
  const el = document.getElementById('lk-feat-coupon-code');
  if (!el) return;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function gen() {
    let code = 'LNK-';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
  function animate() {
    const code = gen();
    let i = 4;
    function step() {
      if (i <= code.length) {
        el.textContent = code.slice(0, i);
        i++;
        setTimeout(step, 80);
      } else {
        setTimeout(animate, 2500);
      }
    }
    el.textContent = 'LNK-';
    step();
  }
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { animate(); obs.disconnect(); }
  }, { threshold: 0.3 });
  obs.observe(el);
}

/* === WHO CAROUSEL (mobile dots) === */
function initWhoCarousel() {
  const grid = document.getElementById('lk-who-grid');
  const dotsWrap = document.getElementById('lk-who-dots');
  if (!grid || !dotsWrap) return;
  const cards = grid.querySelectorAll('.lk-who-card');
  if (cards.length === 0) return;

  // Create dots
  cards.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = `lk-who__dot ${i === 0 ? 'active' : ''}`;
    dotsWrap.appendChild(dot);
  });
  const dots = dotsWrap.querySelectorAll('.lk-who__dot');

  grid.addEventListener('scroll', () => {
    const scrollLeft = grid.scrollLeft;
    const cardWidth = cards[0].offsetWidth + 16;
    const idx = Math.round(scrollLeft / cardWidth);
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  });
}

/* === CTA FORM === */
function initCtaForm() {
  const form = document.getElementById('lk-cta-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = 'Enviado!';
    btn.style.background = '#00E5A0';
    setTimeout(() => {
      btn.textContent = 'Solicitar demonstração';
      form.reset();
    }, 3000);
  });
}
