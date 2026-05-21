import { renderLanding } from './pages/landing.js';
import { renderBuyer } from './pages/buyer.js';
import { renderSeller } from './pages/seller.js';
import { renderAdmin } from './pages/admin.js';
import { renderAuth } from './pages/auth.js';
import { getCurrentSession, onAuthStateChange, getCurrentProfile, getHomePathForRole } from './services/auth-service.js';
// Import all styles via JS for Vite HMR support
import './styles/tokens.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/components.css';
import './styles/landing-core.css';
import './styles/landing-sections.css';
import './styles/landing-bottom.css';
import './styles/buyer.css';
import './styles/seller.css';
import './styles/payment.css';
import './styles/auth.css';
import './styles/admin.css';
import './styles/app-dark.css';
import './styles/polish.css';
import './styles/mobile-redesign.css';

const app = document.getElementById('app');

const THEME_STORAGE_KEY = 'linka_theme';
const themeToggleIcons = {
  moon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
};

function normalizeTheme(theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

function getInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function getCurrentTheme() {
  return normalizeTheme(document.documentElement.dataset.theme || getInitialTheme());
}

export function setAppTheme(theme, { persist = true } = {}) {
  const normalizedTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
  updateThemeToggle();
  return normalizedTheme;
}

export function toggleAppTheme() {
  return setAppTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

function updateThemeToggle() {
  const button = document.getElementById('themeToggleFab');
  if (!button) return;

  const currentTheme = getCurrentTheme();
  const nextLabel = currentTheme === 'dark' ? 'Claro' : 'Black';
  button.dataset.theme = currentTheme;
  button.setAttribute('aria-label', `Alternar para tema ${nextLabel.toLowerCase()}`);
  button.setAttribute('title', `Tema ${nextLabel}`);
  button.innerHTML = `
    <span class="theme-toggle-icon">${currentTheme === 'dark' ? themeToggleIcons.sun : themeToggleIcons.moon}</span>
    <span class="theme-toggle-label">${nextLabel}</span>
  `;
}

function mountThemeToggle() {
  let button = document.getElementById('themeToggleFab');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'themeToggleFab';
    button.className = 'theme-toggle-fab';
    button.addEventListener('click', () => {
      const theme = toggleAppTheme();
      showToast(theme === 'dark' ? 'Tema black ativado.' : 'Tema claro ativado.', 'success');
    });
    document.body.appendChild(button);
  }
  updateThemeToggle();
}

setAppTheme(getInitialTheme(), { persist: false });

// SVG icons used across the app
export const icons = {
  home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  grid: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  ticket: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  settings: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  chevronDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  arrowDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  whatsapp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
  alertTriangle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  fileText: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  upload: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  package: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  dollarSign: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  checkCircle: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  loader: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',
  wallet: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/></svg>',
  pix: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13.59 14.41l3.89 3.89c.51.51 1.18.79 1.9.79h1.27l-5.07-5.07c-.39-.39-1.02-.39-1.41 0l-.58.39zm-3.18 0l-.58-.39c-.39-.39-1.02-.39-1.41 0L3.35 19.09h1.27c.72 0 1.39-.28 1.9-.79l3.89-3.89zm3.18-4.82c.39-.39.39-1.02 0-1.41L9.7 4.29c-.51-.51-1.18-.79-1.9-.79H6.53l5.07 5.07.58.39.39.58 5.07 5.07V13c0-.72-.28-1.39-.79-1.9l-3.89-3.89c-.39.39-.39 1.02 0 1.41l.58.39-.58.39c-.39.39-.39 1.02 0 1.41l3.89 3.89c.51.51.79 1.18.79 1.9v1.27l-5.07-5.07-.39-.58-.58-.39-5.07-5.07H6.53c-.72 0-1.39.28-1.9.79L.74 14.41h1.27c.72 0 1.39-.28 1.9-.79l3.89-3.89z"/></svg>',
  food: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  fashion: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  services: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  digital: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.16 3.84a2.76 2.76 0 0 0-3.92 0L5.3 15.78a2 2 0 0 0-.5.98l-.78 3.93a1 1 0 0 0 1.18 1.18l3.93-.78a2 2 0 0 0 .98-.5l11.94-11.94a2.76 2.76 0 0 0 0-3.93z"/><path d="M16.5 7.5l2 2"/></svg>',
  others: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  all: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
  refresh: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.13 15.57a10 10 0 1 0 3.43-11.02L21.5 8"/></svg>'
};

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    if (['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) return url.href;
  } catch {
    if (String(value).startsWith('blob:') || String(value).startsWith('data:')) return String(value);
  }
  return '';
}

// Toast notification system
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-root');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? icons.check : type === 'error' ? icons.x : ''} ${escapeHTML(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Placeholder fine line icons
const placeholderIcons = {
  food: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2A40" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  fashion: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2A40" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  services: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2A40" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  digital: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2A40" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
  others: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2A2A40" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
};

const mockImages = {
  brownie: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&q=80',
  camiseta: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&q=80',
  aula: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&q=80',
  'logo-design': 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400&q=80',
  acai: 'https://images.unsplash.com/photo-1590137876181-2a5a7e340308?w=400&q=80',
  caderno: 'https://images.unsplash.com/photo-1531346878377-a5445203b57f?w=400&q=80',
  brigadeiro: 'https://images.unsplash.com/photo-1541783245831-57d6fb0926d3?w=400&q=80',
  bolo: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80',
  sanduiche: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&q=80',
  salgado: 'https://images.unsplash.com/photo-1628198758814-14227183e2f5?w=400&q=80',
  espetinho: 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=400&q=80',
  corte: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&q=80',
  pulseira: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400&q=80'
};

// Product image placeholder generator — handles mock keys, real URLs, and blob URLs
export function getProductImage(imageKey, width = 400, height = 300, categoryId = 'others') {
  // Real URL (Supabase Storage, Unsplash, or blob preview)
  if (imageKey && (imageKey.startsWith('http') || imageKey.startsWith('blob:'))) {
    const src = sanitizeUrl(imageKey);
    return `<img src="${src}" alt="Produto" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />`;
  }
  // Mock image key lookup
  if (mockImages[imageKey]) {
    return `<img src="${sanitizeUrl(mockImages[imageKey])}" alt="${escapeHTML(imageKey)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />`;
  }
  // Placeholder with category icon
  const iconSvg = placeholderIcons[categoryId] || placeholderIcons.others;
  const dotGrid = `url("data:image/svg+xml,%3Csvg width='18' height='18' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='1' fill='%231A1A24'/%3E%3C/svg%3E")`;
  return `<div style="width:100%;height:100%;background-color:#161620;background-image:${dotGrid};background-size:18px 18px;display:flex;align-items:center;justify-content:center;opacity:0.8;">${iconSvg}</div>`;
}

// Format currency
export function formatCurrency(value) {
  const num = Number(value) || 0;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

// Global auth state
export let globalSession = null;
export let globalProfile = null;

async function loadProfileForSession(session, { force = false } = {}) {
  if (!session?.user?.id) return null;
  if (!force && globalProfile?.id === session.user.id) return globalProfile;
  globalProfile = await getCurrentProfile(session.user.id);
  return globalProfile;
}

export async function refreshCurrentProfile() {
  const session = await getCurrentSession();
  globalSession = session;
  return loadProfileForSession(session, { force: true });
}

function getSessionRole(session, profile = globalProfile) {
  return profile?.role || session?.user?.user_metadata?.role || 'buyer';
}

// Simple client-side routing (supports both hash and path)
async function handleRoute() {
  const rawRoute = window.location.hash.slice(1) || window.location.pathname;
  const [path] = rawRoute.split('?');

  // Ignore hash changes for intra-page anchors (e.g. #problema, #contato)
  if (window.location.hash && !window.location.hash.startsWith('#/')) {
    return;
  }

  // Clear any open modals when navigating between pages
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) modalRoot.innerHTML = '';

  const session = await getCurrentSession();
  globalSession = session;
  if (!session?.user?.id) {
    globalProfile = null;
  }

  // Check auth for protected routes
  const isProtectedRoute = path.startsWith('/seller') || path.startsWith('/admin') || path === 'seller' || path === 'admin';
  
  if (isProtectedRoute) {
    if (!session) {
      window.location.hash = path.startsWith('/seller') || path === 'seller' ? '#/auth?role=seller' : '#/auth';
      return;
    }
    // Load profile if missing and validate role
    await loadProfileForSession(session);
    let role = getSessionRole(session);
    const wantsAdmin = path.startsWith('/admin') || path === 'admin';
    const wantsSeller = path.startsWith('/seller') || path === 'seller';

    if ((wantsSeller && !['seller', 'admin'].includes(role)) || (wantsAdmin && role !== 'admin')) {
      await loadProfileForSession(session, { force: true });
      role = getSessionRole(session);
    }

    if ((wantsAdmin && role !== 'admin') || (wantsSeller && !['seller', 'admin'].includes(role))) {
      window.location.hash = '#/buyer';
      showToast('Acesso restrito ao seu perfil.', 'error');
      return;
    }
  }

  if (path.startsWith('/auth') || path === 'auth') {
    renderAuth(app);
    if (session) {
      const profile = await loadProfileForSession(session);
      if (window.location.hash === '#/auth' || window.location.hash.startsWith('#/auth')) {
        window.location.hash = getHomePathForRole(getSessionRole(session, profile));
      }
    }
  } else if (path.startsWith('/buyer') || path === 'buyer') {
    const parts = path.split('/').filter(Boolean);
    renderBuyer(app, parts[1]?.split('?')[0]);
  } else if (path.startsWith('/seller') || path === 'seller') {
    const parts = path.split('/').filter(Boolean);
    renderSeller(app, parts[1]?.split('?')[0]);
  } else if (path.startsWith('/admin') || path === 'admin') {
    const parts = path.split('/').filter(Boolean);
    renderAdmin(app, parts[1]?.split('?')[0]);
  } else if (path.startsWith('/landing') || path === 'landing') {
    renderLanding(app);
  } else {
    if (session) {
      const profile = await loadProfileForSession(session);
      const home = getHomePathForRole(getSessionRole(session, profile));
      if (home !== '#/buyer') {
        window.location.hash = home;
        return;
      }
    }
    renderBuyer(app);
  }
}

// Listen to auth changes
onAuthStateChange(async (event, session) => {
  globalSession = session;
  if (event === 'SIGNED_IN' && session) {
    try {
      globalProfile = await getCurrentProfile(session.user.id);
    } catch { globalProfile = null; }
    const rawRoute = window.location.hash.slice(1) || window.location.pathname;
    const [path] = rawRoute.split('?');
    if (!path || path === '/' || path === 'auth' || path.startsWith('/auth')) {
      window.location.hash = getHomePathForRole(getSessionRole(session));
    } else {
      handleRoute();
    }
  } else if (event === 'SIGNED_OUT') {
    globalProfile = null;
    globalSession = null;
    window.location.hash = '#/';
  }
});

// Add event listener for hash changes to support SPA navigation
window.addEventListener('hashchange', handleRoute);

// Init
mountThemeToggle();
handleRoute().finally(mountThemeToggle);

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
  });
}
