import { icons, showToast, getProductImage, formatCurrency, escapeHTML, brandCaseHTML, globalSession, globalProfile, refreshCurrentProfile, replayFirstRunTour, renderBrandLogo } from '../main.js';
import { products as mockProducts, categories as mockCategories, currentUser, institution } from '../data/mock.js';
import { getActiveProducts, getProductById, incrementProductClicks } from '../services/product-service.js';
import { getBuyerCoupons, claimCoupon } from '../services/coupon-service.js';
import { getNotifications, getUnreadCount, markAllAsRead, markAsRead } from '../services/notification-service.js';
import { getInstitution } from '../services/institution-service.js';
import { getCategories } from '../services/category-service.js';
import { supabase } from '../lib/supabase.js';
import { becomeSeller, signOutUser } from '../services/auth-service.js';
import { resetAppScroll } from '../utils/scroll.js';
import { navigate, goBack, getHashParams, offerRoute, offerShareUrl, authRoute, isValidOfferId } from '../utils/navigation.js';
import { copyText, shareLink, offerShareText } from '../utils/share.js';
import { hasVisibleDiscount } from '../utils/pricing.js';
import { formatPhoneBR, bindPhoneFormatting } from '../utils/phone.js';

const USE_MOCKS = import.meta.env.DEV;
const guestUser = {
  id: null,
  name: 'Visitante',
  fullName: 'Visitante',
  email: '',
  role: 'buyer',
  avatar: '',
  whatsapp: '',
  verified: false,
};

const CATEGORY_COVERS = {
  food: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=720&q=80',
  fashion: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=720&q=80',
  services: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=720&q=80',
  digital: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=720&q=80',
  others: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=720&q=80',
};

const CATEGORY_DESCRIPTIONS = {
  food: 'Lanches, bebidas e produtos prontos para retirar.',
  fashion: 'Roupas, acessórios e itens de uso pessoal.',
  services: 'Aulas, reparos, atendimentos e ajuda presencial.',
  digital: 'Design, arquivos, aulas online e serviços criativos.',
  others: 'Ofertas variadas, aprovadas pela equipe.',
};

// wa.me needs the full international number; profiles store Brazilian numbers without +55.
function getWhatsAppUrl(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function getInitials(name, fallback = 'U') {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || fallback;
}

function isAuthenticated() {
  return Boolean(globalSession?.user?.id);
}

// Helper: get current user from real auth or mock
function getUser() {
  const baseUser = USE_MOCKS ? currentUser : guestUser;

  if (globalProfile) {
    const name = globalProfile.name || baseUser.name || 'Usuário';
    return {
      ...baseUser,
      ...globalProfile,
      name,
      fullName: name,
      avatar: globalProfile.avatar || getInitials(name),
    };
  }

  if (globalSession?.user) {
    const metadata = globalSession.user.user_metadata || {};
    const name = metadata.full_name || metadata.name || globalSession.user.email?.split('@')[0] || baseUser.name || 'Usuário';
    return {
      ...baseUser,
      id: globalSession.user.id,
      email: globalSession.user.email || '',
      name,
      fullName: name,
      role: metadata.role || baseUser.role || 'buyer',
      whatsapp: metadata.whatsapp || baseUser.whatsapp || '',
      avatar: getInitials(name, 'U'),
    };
  }

  return baseUser;
}

function getAccountRole() {
  if (!isAuthenticated()) return 'buyer';
  return globalProfile?.role || globalSession?.user?.user_metadata?.role || 'buyer';
}

function canUseSellerMode() {
  return ['seller', 'admin'].includes(getAccountRole());
}

async function openSellerFlow() {
  if (!globalSession?.user?.id) {
    window.location.hash = '#/auth?role=seller';
    return;
  }

  if (canUseSellerMode()) {
    window.location.hash = '#/seller';
    return;
  }

  const result = await becomeSeller();
  if (!result.success) {
    showToast(result.error === 'AUTH_REQUIRED' ? 'Entre para cadastrar sua empresa.' : result.error || 'Não foi possível ativar sua empresa agora.', 'error');
    if (result.error === 'AUTH_REQUIRED') window.location.hash = '#/auth?role=seller';
    return;
  }

  await refreshCurrentProfile();
  showToast('Empresa ativada. Crie sua primeira oferta.', 'success');
  window.location.hash = '#/seller';
}

let activeCategory = 'all';
let searchQuery = '';
let sortBy = 'newest';
let minDiscount = '0';
let filtersOpen = false;
let currentView = 'home'; // home | categories | detail | coupons | profile | notifications
let selectedProduct = null;
let selectedProductImageIndex = 0;
// Offer requested by the #/buyer/offer?id=… address (null when the id is not valid).
let routeOfferId = null;
let cachedProducts = null;
let activeInstitution = institution;
let buyerIntroPlayed = false;
let loadedCategories = mockCategories;
let focusSearchAfterRender = false;
let buyerShellLoadedAt = 0;
let buyerShellPromise = null;
let buyerShellUserKey = null;
const BUYER_SHELL_TTL_MS = 30000;
const BUYER_PRODUCTS_TTL_MS = 20000;
const BUYER_UNREAD_TTL_MS = 30000;
const BUYER_COUPONS_TTL_MS = 20000;
const buyerProductsCache = new Map();
const buyerProductsRequests = new Map();
const unreadCountCache = new Map();
const buyerCouponsCache = new Map();
// The last offer request failed (offline, timeout): the home offers a retry instead of "no offers".
let productsLoadFailed = false;
let buyerRenderId = 0;
let buyerHomeRenderId = 0;

function isBuyerRoute() {
  const path = window.location.hash.startsWith('#/')
    ? window.location.hash.slice(1)
    : window.location.pathname;
  return path === '/' || path === '/buyer' || path.startsWith('/buyer/') || path.startsWith('/buyer?');
}

// Intersection Observer for card entrance animation
let observer = null;
let buyerCountdownInterval = null;
const INST_BANNER_SESSION_KEY = 'empreende_inst_banner_hidden';

function getMarketCategories(includeAll = true) {
  const rows = Array.isArray(loadedCategories) && loadedCategories.length ? loadedCategories : mockCategories;
  return includeAll ? rows : rows.filter((category) => category.id !== 'all');
}

function shouldShowInstitutionBanner() {
  return !sessionStorage.getItem(INST_BANNER_SESSION_KEY);
}

function hideInstitutionBanner(container) {
  sessionStorage.setItem(INST_BANNER_SESSION_KEY, '1');
  const banner = container.querySelector('.inst-banner');
  if (!banner) return;
  banner.classList.add('inst-banner-hiding');
  setTimeout(() => banner.remove(), 260);
}

async function syncInstitutionForUser() {
  const institutionId = isAuthenticated()
    ? globalProfile?.institution_id || globalSession?.user?.user_metadata?.institution_id || null
    : null;
  if (institutionId) {
    const realInstitution = await getInstitution(institutionId);
    if (realInstitution) {
      activeInstitution = realInstitution;
      return;
    }
  }
  activeInstitution = USE_MOCKS ? institution : { name: 'iCEV', fullName: 'iCEV', domain: '' };
}

async function syncCategories() {
  try {
    loadedCategories = await getCategories();
    if (!getMarketCategories().some((category) => category.id === activeCategory)) {
      activeCategory = 'all';
    }
  } catch {
    loadedCategories = USE_MOCKS ? mockCategories : [{ id: 'all', name: 'Todos' }];
  }
}

function getProductsCacheKey({ categoryId = activeCategory, search = searchQuery } = {}) {
  return `${categoryId || 'all'}::${String(search || '').trim().toLowerCase()}`;
}

async function loadBuyerShellData({ force = false } = {}) {
  const userKey = globalSession?.user?.id || 'guest';
  const isFresh = buyerShellLoadedAt && buyerShellUserKey === userKey && Date.now() - buyerShellLoadedAt < BUYER_SHELL_TTL_MS;
  if (!force && isFresh) return;
  if (!force && buyerShellPromise) return buyerShellPromise;

  buyerShellPromise = Promise.allSettled([
    syncInstitutionForUser(),
    syncCategories(),
  ])
    .then(() => {
      buyerShellLoadedAt = Date.now();
      buyerShellUserKey = userKey;
    })
    .finally(() => {
      buyerShellPromise = null;
    });

  return buyerShellPromise;
}

async function loadBuyerProducts({ categoryId = activeCategory, search = searchQuery, force = false } = {}) {
  const cacheKey = getProductsCacheKey({ categoryId, search });
  const cached = buyerProductsCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.loadedAt < BUYER_PRODUCTS_TTL_MS) {
    return cached.products;
  }

  if (!force && buyerProductsRequests.has(cacheKey)) {
    return buyerProductsRequests.get(cacheKey);
  }

  const request = getActiveProducts({ categoryId, search })
    .then((rows) => {
      const products = Array.isArray(rows) ? rows : [];
      buyerProductsCache.set(cacheKey, { products, loadedAt: Date.now() });
      productsLoadFailed = false;
      return products;
    })
    .catch(() => {
      // Not cached: the next render (or "Tentar de novo") asks the server again.
      productsLoadFailed = true;
      return cached?.products || (USE_MOCKS ? (cachedProducts || mockProducts) : []);
    })
    .finally(() => {
      buyerProductsRequests.delete(cacheKey);
    });

  buyerProductsRequests.set(cacheKey, request);
  return request;
}

async function loadUnreadCount(userId) {
  if (!userId) return 0;
  const cached = unreadCountCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < BUYER_UNREAD_TTL_MS) {
    return cached.count;
  }
  const count = await getUnreadCount(userId);
  unreadCountCache.set(userId, { count, loadedAt: Date.now() });
  return count;
}

async function loadBuyerCoupons(userId) {
  if (!userId) return [];
  const cached = buyerCouponsCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < BUYER_COUPONS_TTL_MS) {
    return cached.coupons;
  }

  const rows = await getBuyerCoupons(userId);
  const normalizedRows = Array.isArray(rows) ? rows : [];
  buyerCouponsCache.set(userId, { coupons: normalizedRows, loadedAt: Date.now() });
  return normalizedRows;
}

async function saveCurrentProfileFields({ name, whatsapp }) {
  if (!globalSession?.user?.id) return;
  const { data, error } = await supabase
    .from('profiles')
    .update({ name, whatsapp })
    .eq('id', globalSession.user.id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Perfil não encontrado ou sem permissão para salvar. Entre novamente e tente de novo.');
  }
  await refreshCurrentProfile();
}

export function renderBuyer(container, subpage) {
  if (['coupons', 'categories', 'profile', 'notifications'].includes(subpage)) currentView = subpage;
  else if (subpage === 'offer') enterOfferRoute();
  else currentView = 'home';
  renderBuyerPage(container);
}

// #/buyer/offer?id=… : opened from the list the offer is already in memory; from a
// shared link or a refresh it is fetched when the page renders.
function enterOfferRoute() {
  const offerId = getHashParams().get('id');
  routeOfferId = isValidOfferId(offerId) ? offerId : null;
  if (String(selectedProduct?.id) !== String(routeOfferId)) {
    selectedProduct = null;
    selectedProductImageIndex = 0;
  }
  currentView = 'detail';
  if (routeOfferId) incrementProductClicks(routeOfferId);
}

function findKnownProduct(productId) {
  const key = String(productId);
  const pools = [cachedProducts || [], ...[...buyerProductsCache.values()].map((entry) => entry.products || [])];
  if (USE_MOCKS) pools.push(mockProducts);
  for (const pool of pools) {
    const match = pool.find((product) => String(product.id) === key);
    if (match) return match;
  }
  return null;
}

// Resolves to the offer, null when it is gone, or 'failed' when it could not be loaded.
async function resolveRouteOffer(container) {
  if (!routeOfferId) return null;
  if (String(selectedProduct?.id) === String(routeOfferId)) return selectedProduct;
  const known = findKnownProduct(routeOfferId);
  if (known) return known;
  renderOfferSkeleton(container);
  try {
    const product = await getProductById(routeOfferId);
    return product?.status === 'active' ? product : null;
  } catch {
    return 'failed';
  }
}

function bindBottomNav(container) {
  container.querySelectorAll('.bottom-nav-item[data-nav]').forEach((item) => {
    if (item.dataset.bound) return;
    item.dataset.bound = '1';
    item.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (item.dataset.nav === 'home') {
        // "Início" always opens the whole vitrine, whatever search or filter was on.
        searchQuery = '';
        activeCategory = 'all';
      }
      navigate(item.getAttribute('href'));
    });
  });
}

function initObserver() {
  if (observer) {
    observer.disconnect();
  }
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  
  document.querySelectorAll('.product-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = 'opacity 0.35s ease-out, transform 0.35s ease-out';
    observer.observe(card);
  });
}

async function renderBuyerPage(container) {
  const renderId = ++buyerRenderId;
  stopBuyerCountdowns();

  if (currentView === 'home' && !container.querySelector('.buyer-wrapper')) {
    renderHome(container, { skipFetch: true, loading: true });
    bindBottomNav(container);
  }

  await loadBuyerShellData();
  if (renderId !== buyerRenderId || !isBuyerRoute()) return;

  if (currentView !== 'home' && container.querySelector('.buyer-home-loading')) {
    return renderBuyerPage(container);
  }

  if (currentView === 'home') {
    await renderHome(container);
    if (renderId !== buyerRenderId || !isBuyerRoute()) return;
    initObserver();
    if (focusSearchAfterRender) {
      // Arrived from "Buscar uma oferta específica" on the categories page.
      focusSearchAfterRender = false;
      resetAppScroll(container);
      container.querySelector('#searchInput')?.focus({ preventScroll: true });
    } else {
      resetAppScroll(container);
    }
  } else if (currentView === 'detail') {
    const product = await resolveRouteOffer(container);
    if (renderId !== buyerRenderId || !isBuyerRoute()) return;
    selectedProduct = product === 'failed' ? null : product;
    if (product === 'failed') renderOfferUnavailable(container, { failed: true });
    else if (product) renderProductDetail(container);
    else renderOfferUnavailable(container);
    resetAppScroll(container);
  } else if (currentView === 'categories') {
    await renderCategories(container);
    resetAppScroll(container);
  } else if (currentView === 'coupons') {
    await renderCoupons(container);
    resetAppScroll(container);
  } else if (currentView === 'profile') {
    renderProfile(container);
    resetAppScroll(container);
  } else if (currentView === 'notifications') {
    await renderNotifications(container);
    resetAppScroll(container);
  }

  bindBottomNav(container);
  refreshBuyerNavBadges(container);
}

// Offers usually stay up for 24h, so urgency is counted in hours: the last hour
// is critical (red, pulsing), under 6h is a heads-up (amber), anything else is calm.
function getTimerTone(hours) {
  if (hours < 1) return { colorClass: 'timer-critical', isCritical: true };
  if (hours < 6) return { colorClass: 'timer-amber', isCritical: false };
  return { colorClass: 'timer-neutral', isCritical: false };
}

function getTimerInfo(expiresIn) {
  const safeExpiresIn = expiresIn || '24h 00min';
  const hoursMatch = safeExpiresIn.match(/(\d+)\s*h/);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : /min/.test(safeExpiresIn) ? 0 : 24;
  return { text: `Expira em ${safeExpiresIn}`, ...getTimerTone(hours) };
}

function normalizeExpirationDate(expiresAt) {
  if (!expiresAt) return null;
  if (typeof expiresAt === 'number') {
    return new Date(expiresAt < 10000000000 ? expiresAt * 1000 : expiresAt);
  }
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCountdownInfo(expiresAt, fallbackExpiresIn = '24h 00min') {
  const end = normalizeExpirationDate(expiresAt);
  if (!end) return getTimerInfo(fallbackExpiresIn);

  const diff = end.getTime() - Date.now();
  if (diff <= 0) {
    return { text: 'Expirado', colorClass: 'timer-critical', isCritical: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const { colorClass, isCritical } = getTimerTone(hours);

  let label;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    label = `${days}d ${hours % 24}h`;
  } else if (hours >= 1) {
    label = `${hours}h ${minutes}min`;
  } else {
    label = `${minutes}min ${seconds}s`;
  }

  return { text: `Expira em ${label}`, colorClass, isCritical };
}

function stopBuyerCountdowns() {
  if (buyerCountdownInterval) {
    clearInterval(buyerCountdownInterval);
    buyerCountdownInterval = null;
  }
}

function startBuyerCountdowns(container) {
  stopBuyerCountdowns();
  const timers = () => Array.from(container.querySelectorAll('[data-countdown-expires]'));
  const tick = () => {
    const nodes = timers();
    if (!nodes.length) {
      stopBuyerCountdowns();
      return;
    }
    nodes.forEach((node) => {
      const info = getCountdownInfo(node.dataset.countdownExpires, node.dataset.countdownFallback || '24h 00min');
      node.classList.remove('timer-neutral', 'timer-amber', 'timer-critical', 'expiry--urgent');
      node.classList.add(info.colorClass);
      node.classList.toggle('expiry--urgent', info.isCritical);
      const label = node.querySelector('[data-countdown-label]');
      if (label) label.textContent = info.text;
      node.querySelector('.timer-icon')?.classList.toggle('pulse', info.isCritical);
    });
  };

  tick();
  if (timers().length) buyerCountdownInterval = setInterval(tick, 1000);
}

function getOfferDiscountPercent(product) {
  return Number(product?.discountPercent ?? product?.discount ?? 0) || 0;
}

function getOfferPrice(product) {
  return Number(product?.discountPrice ?? product?.price ?? product?.originalPrice ?? 0) || 0;
}

function getOfferDate(product, fieldName) {
  const value = product?.[fieldName];
  const parsed = normalizeExpirationDate(value);
  return parsed?.getTime() || 0;
}

function applyBuyerFeedFilters(products) {
  let result = Array.isArray(products) ? [...products] : [];
  const min = Number(minDiscount || 0);

  if (min > 0) {
    result = result.filter((product) => getOfferDiscountPercent(product) >= min);
  }

  result.sort((a, b) => {
    switch (sortBy) {
      case 'discount':
        return getOfferDiscountPercent(b) - getOfferDiscountPercent(a);
      case 'price_asc':
        return getOfferPrice(a) - getOfferPrice(b);
      case 'price_desc':
        return getOfferPrice(b) - getOfferPrice(a);
      case 'expiring':
        return getOfferDate(a, 'expiresAt') - getOfferDate(b, 'expiresAt');
      case 'newest':
      default:
        return getOfferDate(b, 'createdAt') - getOfferDate(a, 'createdAt');
    }
  });

  return result;
}

function getSearchSuggestions(products) {
  const q = String(searchQuery || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const categoryNameById = new Map(getMarketCategories().map((category) => [category.id, category.name]));
  return (Array.isArray(products) ? products : [])
    .filter((product) => {
      const title = String(product.title || '').toLowerCase();
      const category = String(categoryNameById.get(product.category) || product.category || '').toLowerCase();
      return title.includes(q) || category.includes(q);
    })
    .slice(0, 5)
    .map((product) => ({
      id: product.id,
      label: product.title || 'Oferta',
      category: categoryNameById.get(product.category) || 'Categoria',
    }));
}

async function refreshBuyerNavBadges(container) {
  const userId = globalSession?.user?.id;
  const couponsBadges = container.querySelectorAll('[data-nav-coupon-badge]');
  const notificationBadges = container.querySelectorAll('[data-nav-notification-badge]');
  if (!userId) {
    [...couponsBadges, ...notificationBadges].forEach((badge) => { badge.hidden = true; });
    return;
  }

  try {
    const [coupons, unread] = await Promise.all([
      loadBuyerCoupons(userId).catch(() => []),
      loadUnreadCount(userId).catch(() => 0),
    ]);
    const activeCoupons = (Array.isArray(coupons) ? coupons : []).filter((coupon) => coupon.status === 'active').length;
    couponsBadges.forEach((badge) => {
      badge.textContent = activeCoupons > 99 ? '99+' : String(activeCoupons);
      badge.hidden = !(activeCoupons > 0);
    });
    notificationBadges.forEach((badge) => {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = !(unread > 0);
    });
  } catch {
    [...couponsBadges, ...notificationBadges].forEach((badge) => { badge.hidden = true; });
  }
}

/**
 * Single source of truth for the buyer bottom navigation bar.
 * @param {'home'|'cats'|'coupons'|'profile'|null} activeTab
 */
function renderBuyerBottomNav(activeTab) {
  const item = (id, href, content) => `
      <a class="bottom-nav-item ${activeTab === id ? 'active' : ''}" href="${href}" data-nav="${id}"${activeTab === id ? ' aria-current="page"' : ''}>
        ${content}<div class="nav-indicator"></div>
      </a>`;
  return `
    <nav class="bottom-nav" aria-label="Navegação principal">
      ${item('home', '#/buyer', `${icons.home}<span>Início</span>`)}
      ${item('cats', '#/buyer/categories', `${icons.grid}<span>Categorias</span>`)}
      ${item('coupons', '#/buyer/coupons', `<span class="nav-icon-wrapper">${icons.ticket}<span class="nav-badge" data-nav-coupon-badge hidden>0</span></span><span>Cupons</span>`)}
      ${item('profile', '#/buyer/profile', `${icons.user}<span>Perfil</span>`)}
    </nav>
  `;
}

// Opened from the company panel: the profile keeps the company's dock, so
// "Cupons" still means validating codes, not the student wallet.
function renderSellerContextNav() {
  const item = (href, icon, label) => `<a class="bottom-nav-item" href="${href}">${icon}<span>${label}</span><div class="nav-indicator"></div></a>`;
  return `
    <nav class="bottom-nav seller-nav" aria-label="Navegação de Minha empresa">
      ${item('#/seller', icons.chart, 'Painel')}
      ${item('#/seller/ads', icons.tag, 'Ofertas')}
      ${item('#/seller/coupons', icons.ticket, 'Cupons')}
    </nav>
  `;
}

function isSellerContextProfile(role) {
  const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
  return query.get('from') === 'seller' && ['seller', 'admin', 'superadmin'].includes(role);
}

function renderProductsLoadError() {
  return `
    <div class="market-empty-state" role="alert">
      <div class="market-empty-icon">${icons.refresh}</div>
      <h3>Não foi possível carregar as ofertas</h3>
      <p>Confira sua conexão com a internet e tente de novo.</p>
      <div class="market-empty-actions">
        <button class="btn-primary" id="btnRetryProducts" type="button">${icons.refresh} Tentar de novo</button>
      </div>
    </div>
  `;
}

function renderEmptyProductsState() {
  const hasFilters = Boolean(searchQuery.trim() || activeCategory !== 'all' || Number(minDiscount) > 0);
  const onlySearch = Boolean(searchQuery.trim()) && activeCategory === 'all' && !(Number(minDiscount) > 0);
  return `
    <div class="market-empty-state">
      <div class="market-empty-icon">${icons.package}</div>
      <h3>${hasFilters ? 'Nenhuma oferta encontrada' : 'Os primeiros cupons estão chegando'}</h3>
      <p>${hasFilters ? 'Tente outra busca ou remova os filtros.' : 'As empresas dos alunos estão preparando as ofertas. Volte em breve.'}</p>
      <div class="market-empty-actions">
        ${hasFilters ? `<button class="btn-primary" id="btnClearBuyerFilters" type="button">${onlySearch ? 'Limpar busca' : 'Limpar filtros'}</button>` : !isAuthenticated() ? '<button class="btn-primary" id="btnEmptyLogin">Entrar na sua conta</button>' : ''}
      </div>
    </div>
  `;
}

async function renderHome(container, { skipFetch = false, loading = false } = {}) {
  const renderId = ++buyerHomeRenderId;
  // Load products from Supabase (or mock fallback)
  let products;
  if (skipFetch) {
    products = loading ? [] : (cachedProducts || (USE_MOCKS ? mockProducts : []));
  } else {
    products = await loadBuyerProducts({ categoryId: activeCategory, search: searchQuery });
  }

  if (renderId !== buyerHomeRenderId || currentView !== 'home' || !isBuyerRoute()) return;
  const activeSearch = container.querySelector('#searchInput');
  const restoreSearchFocus = document.activeElement === activeSearch;
  if (restoreSearchFocus && activeSearch.value !== searchQuery) return;
  const selectionStart = restoreSearchFocus ? activeSearch.selectionStart : null;
  const selectionEnd = restoreSearchFocus ? activeSearch.selectionEnd : null;
  if (!loading) cachedProducts = products;

  const filteredProducts = applyBuyerFeedFilters(products);
  const searchSuggestions = getSearchSuggestions(cachedProducts || products);
  const user = getUser();
  const showSellerAccess = isAuthenticated();
  const greetingName = isAuthenticated()
    ? String(user.name || user.fullName || '').trim().split(' ')[0] || null
    : null;
  // Only offers a student can still take are featured.
  const claimable = filteredProducts.filter(hasCouponsLeft);
  const featuredProduct = claimable.length
    ? [...claimable].sort((a, b) => Number(b.discount || 0) - Number(a.discount || 0))[0]
    : null;
  const showFeatured = Boolean(featuredProduct && hasVisibleDiscount(featuredProduct) && !searchQuery.trim());
  const runnerUp = showFeatured ? pickRunnerUp(claimable, featuredProduct) : null;

  // Draw the highlighter once per session, not on every search re-render.
  const introMark = buyerIntroPlayed ? '' : ' hl--draw';
  if (!loading) buyerIntroPlayed = true;
  const institutionName = activeInstitution?.name || '';
  // Dated like the top of a notebook page.
  const todayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const offersLabel = `${filteredProducts.length} ${filteredProducts.length === 1 ? 'oferta' : 'ofertas'}`;
  const activeCategoryName = getMarketCategories().find(c => c.id === activeCategory)?.name || 'Ofertas';
  const listTitle = searchQuery.trim()
    ? `Resultados para “${escapeHTML(searchQuery.trim())}”`
    : activeCategory !== 'all' ? escapeHTML(activeCategoryName) : 'Todas as ofertas';

  container.innerHTML = `
    <div class="page buyer-page buyer-wrapper">
      <header class="buyer-header canopy${showFeatured ? ' buyer-header--featured' : ''}">
        <div class="buyer-header-top">
          <h1 class="buyer-brand">${renderBrandLogo('wordmark-on-dark', 'brand-logo buyer-brand-logo')}</h1>
          <div class="buyer-actions">
            ${showSellerAccess ? `
              <button class="buyer-mode-btn" id="btnSellerMode" type="button" title="${canUseSellerMode() ? 'Abrir minha empresa' : 'Cadastrar minha empresa'}">
                ${icons.plus}
                <span>Anunciar</span>
              </button>
            ` : `
              <button class="buyer-mode-btn" id="btnLoginHeader" type="button">
                ${icons.user}
                <span>Entrar</span>
              </button>
            `}
            <button class="icon-btn notification-btn" id="btnNotifications" type="button" aria-label="Notificações">
              ${icons.bell}
              ${isAuthenticated() ? '<span class="badge" id="notifBadge" hidden>0</span>' : ''}
            </button>
            ${isAuthenticated() ? `<a class="user-avatar buyer-avatar-link" href="#/buyer/profile" aria-label="Abrir seu perfil">${escapeHTML(user.avatar || 'U')}</a>` : ''}
          </div>
        </div>

        <div class="buyer-greeting">
          <p class="buyer-eyebrow">${institutionName ? `${brandCaseHTML(institutionName)} · ` : ''}${todayLabel}</p>
          <h2 class="buyer-greeting-title">${greetingName ? `Olá, <span class="hl${introMark}">${escapeHTML(greetingName)}</span>` : `Descontos de quem <span class="hl${introMark}">empreende</span>`}</h2>
        </div>

        <div class="search-wrapper">
          <div class="search-bar">
            ${icons.search}
            <input type="search" placeholder="Brownie, camiseta, aula…" id="searchInput" value="${escapeHTML(searchQuery)}" autocomplete="off" aria-label="Buscar ofertas" enterkeyhint="search" />
            <button class="buyer-filter-btn ${filtersOpen ? 'active' : ''}" type="button" id="btnBuyerFilter" aria-label="Filtros" aria-expanded="${filtersOpen ? 'true' : 'false'}">${icons.adjustments}</button>
          </div>
          ${searchSuggestions.length ? `
            <div class="search-suggestions" role="listbox" aria-label="Sugestões de busca">
              ${searchSuggestions.map((suggestion) => `
                <button class="suggestion-item" type="button" data-search-suggestion="${escapeHTML(suggestion.label)}">
                  ${icons.search}
                  <span class="suggestion-text">
                    <span class="suggestion-name">${escapeHTML(suggestion.label)}</span>
                    <small class="suggestion-cat">${escapeHTML(suggestion.category)}</small>
                  </span>
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="category-scroll">
          <div class="category-chips">
            ${getMarketCategories().map(c => `
              <button class="chip ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}" type="button" aria-pressed="${activeCategory === c.id ? 'true' : 'false'}">
                ${icons[c.id] || icons.others}
                <span>${escapeHTML(c.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="feed-filters ${filtersOpen ? 'open' : ''}" aria-label="Filtros de ofertas">
          <label class="feed-filter">
            <span>Ordenar</span>
            <select id="sortBySelect" class="filter-select">
              <option value="newest" ${sortBy === 'newest' ? 'selected' : ''}>Mais recentes</option>
              <option value="discount" ${sortBy === 'discount' ? 'selected' : ''}>Maior desconto</option>
              <option value="price_asc" ${sortBy === 'price_asc' ? 'selected' : ''}>Menor preço</option>
              <option value="price_desc" ${sortBy === 'price_desc' ? 'selected' : ''}>Maior preço</option>
              <option value="expiring" ${sortBy === 'expiring' ? 'selected' : ''}>Terminando antes</option>
            </select>
          </label>
          <label class="feed-filter">
            <span>Desconto</span>
            <select id="minDiscountSelect" class="filter-select">
              <option value="0" ${minDiscount === '0' ? 'selected' : ''}>Qualquer</option>
              <option value="10" ${minDiscount === '10' ? 'selected' : ''}>A partir de 10%</option>
              <option value="20" ${minDiscount === '20' ? 'selected' : ''}>A partir de 20%</option>
              <option value="30" ${minDiscount === '30' ? 'selected' : ''}>A partir de 30%</option>
            </select>
          </label>
        </div>

        ${showFeatured ? `
          <div class="buyer-featured-row${runnerUp ? ' has-pair' : ''}">
            ${renderFeaturedTicket(featuredProduct, 'Maior desconto')}
            ${runnerUp ? renderFeaturedTicket(runnerUp.product, runnerUp.label, 'is-secondary') : ''}
          </div>
        ` : ''}
      </header>

      ${shouldShowInstitutionBanner() && !searchQuery.trim() ? `
        <div class="inst-banner">
          <div class="banner-icon">${icons.shield}</div>
          <div class="banner-text">
            <strong>Só empresas de alunos do iCEV</strong>
            <span>Toda oferta é aprovada pela equipe. Você pega o código aqui e compra direto com a empresa.</span>
          </div>
          <button class="inst-banner-close" id="btnHideInstBanner" type="button" aria-label="Fechar aviso">${icons.x}</button>
        </div>
      ` : ''}

      <div class="list-header">
        <h2>${listTitle}</h2>
        <span class="offers-count">${loading || (productsLoadFailed && !products.length) ? '' : offersLabel}</span>
      </div>

      <div class="products-list ${loading ? 'buyer-home-loading' : ''}">
        ${loading && filteredProducts.length === 0 ? renderProductSkeletons() : filteredProducts.length === 0 ? (productsLoadFailed && !products.length ? renderProductsLoadError() : renderEmptyProductsState()) : filteredProducts.map(p => {
          const catName = getMarketCategories().find(c => c.id === p.category)?.name || 'Outros';
          const timer = getCountdownInfo(p.expiresAt, p.expiresIn);
          const slotsLeft = Math.max((p.slots?.total || 0) - (p.slots?.used || 0), 0);
          const isSoldOut = slotsLeft === 0;
          const hasDiscount = hasVisibleDiscount(p);

          return `
          <article class="product-card ${isSoldOut ? 'sold-out' : ''}" data-product-card="${p.id}" role="button" tabindex="0" aria-label="${escapeHTML(p.title)}, ${formatCurrency(p.discountPrice)}${isSoldOut ? ', esgotado' : ''}">
            <div class="card-image-area">
              ${getProductImage(p.images?.[0], 400, 300, p.category)}
              ${isSoldOut
                ? '<span class="discount-badge soldout-badge">Esgotado</span>'
                : hasDiscount ? `<span class="discount-badge">−${p.discount}%</span>` : ''
              }
            </div>
            <div class="perforation" aria-hidden="true"></div>
            <div class="card-body">
              <span class="card-category">${escapeHTML(catName)}</span>
              <h3 class="card-title">${escapeHTML(p.title)}</h3>
              <div class="card-price-row">
                <span class="price-discount">${formatCurrency(p.discountPrice)}</span>
                ${hasDiscount ? `<span class="price-original">${formatCurrency(p.originalPrice)}</span>` : ''}
              </div>
              <div class="card-meta">
                ${isSoldOut
                  ? '<span class="card-soldout-note">Cupons esgotados</span>'
                  : slotsLeft <= 3
                  ? `<span class="card-slots-low">${slotsLeft === 1 ? 'Último cupom' : `Últimos ${slotsLeft} cupons`}</span>`
                  : `<span class="card-timer ${timer.colorClass} ${timer.isCritical ? 'expiry--urgent' : ''}" data-countdown-expires="${escapeHTML(p.expiresAt || '')}" data-countdown-fallback="${escapeHTML(p.expiresIn || '')}">
                      <span class="timer-icon">${icons.clock}</span>
                      <span data-countdown-label>${escapeHTML(timer.text)}</span>
                    </span>`}
              </div>
            </div>
          </article>
        `}).join('')}
      </div>
    </div>

    ${renderBuyerBottomNav(currentView === 'coupons' ? 'coupons' : 'home')}
  `;

  if (restoreSearchFocus) {
    const nextSearch = container.querySelector('#searchInput');
    nextSearch?.focus({ preventScroll: true });
    if (selectionStart !== null && selectionEnd !== null) {
      nextSearch?.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  // Search input with debounce
  let searchTimer = null;
  const searchInput = container.querySelector('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchInput.value;
        renderBuyerPage(container);
      }, 400);
    });
  }

  container.querySelectorAll('[data-search-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      searchQuery = button.dataset.searchSuggestion || '';
      renderBuyerPage(container);
    });
  });

  container.querySelector('#sortBySelect')?.addEventListener('change', (event) => {
    sortBy = event.target.value || 'newest';
    renderBuyerPage(container);
  });

  container.querySelector('#minDiscountSelect')?.addEventListener('change', (event) => {
    minDiscount = event.target.value || '0';
    renderBuyerPage(container);
  });

  // Notification button
  container.querySelector('#btnNotifications')?.addEventListener('click', () => {
    navigate('#/buyer/notifications');
  });

  container.querySelector('#btnSellerMode')?.addEventListener('click', openSellerFlow);
  container.querySelector('#btnEmptySellerFlow')?.addEventListener('click', openSellerFlow);
  container.querySelector('#btnLoginHeader')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });
  container.querySelector('#btnBuyerFilter')?.addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    renderBuyerPage(container);
  });
  container.querySelector('#btnEmptyLogin')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });
  container.querySelector('#btnRetryProducts')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Carregando…';
    await loadBuyerProducts({ force: true });
    renderBuyerPage(container);
  });
  container.querySelector('#btnClearBuyerFilters')?.addEventListener('click', () => {
    searchQuery = '';
    activeCategory = 'all';
    minDiscount = '0';
    renderBuyerPage(container);
  });

  const instBannerTimer = container.querySelector('.inst-banner')
    ? setTimeout(() => hideInstitutionBanner(container), 8500)
    : null;
  container.querySelector('#btnHideInstBanner')?.addEventListener('click', () => {
    if (instBannerTimer) clearTimeout(instBannerTimer);
    hideInstitutionBanner(container);
  });

  // Load notification badge count
  const userId = globalSession?.user?.id;
  if (userId) {
    loadUnreadCount(userId).then(count => {
      const badge = container.querySelector('#notifBadge');
      if (!badge) return;
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.hidden = !(count > 0);
    }).catch(() => {});
  }
  refreshBuyerNavBadges(container);
  startBuyerCountdowns(container);

  // Category clicks
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const list = container.querySelector('.products-list');
      if (list) {
        list.style.opacity = '0';
        list.style.transform = 'scale(0.98)';
        list.style.transition = 'all 0.15s ease-out';
      }
      
      setTimeout(() => {
        activeCategory = chip.dataset.cat;
        renderBuyerPage(container);
      }, 150);
    });
  });

  container.querySelectorAll('[data-featured-product]').forEach((ticket) => {
    ticket.addEventListener('click', () => openProductDetail(ticket.dataset.featuredProduct));
  });

  container.querySelectorAll('[data-product-card]').forEach(card => {
    const open = () => openProductDetail(card.dataset.productCard);
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

async function renderCategories(container) {
  const products = await loadBuyerProducts({ categoryId: 'all', search: '' });
  const allProducts = Array.isArray(products) ? products : [];
  cachedProducts = allProducts;
  const categories = getMarketCategories(false);
  const totalOffers = allProducts.length;
  const stats = categories.map((category) => {
    const categoryProducts = allProducts.filter(product => product.category === category.id);
    const bestDeal = categoryProducts.filter(hasVisibleDiscount).reduce((best, product) => {
      if (!best) return product;
      return Number(product.discount || 0) > Number(best.discount || 0) ? product : best;
    }, null);
    return {
      ...category,
      count: categoryProducts.length,
      bestDeal,
      sample: categoryProducts[0],
    };
  });
  const institutionName = activeInstitution?.name || '';

  container.innerHTML = `
    <div class="page buyer-wrapper acct-page buyer-categories-page">
      <div class="category-intro canopy">
        <header class="acct-header">
          <div class="acct-heading">
            <div class="acct-header-copy">
              <p class="t-eyebrow">Explorar${institutionName ? ` · ${brandCaseHTML(institutionName)}` : ''}</p>
              <h1 class="acct-title">Categorias</h1>
            </div>
            <button class="icon-btn acct-icon-btn" id="btnBackBuyerHome" type="button" aria-label="Voltar para o início">
              ${icons.home}
            </button>
          </div>
        </header>

        <button class="category-search-shortcut" id="btnFocusSearchFromCategories" type="button">
          ${icons.search}
          <span>Buscar uma oferta específica</span>
        </button>

        <section class="category-spotlight" aria-label="Todas as ofertas">
          <div class="category-spotlight-copy">
            <span class="category-spotlight-eyebrow">Vitrine ativa</span>
            <h2><span class="category-spotlight-count">${totalOffers}</span> ${totalOffers === 1 ? 'oferta verificada' : 'ofertas verificadas'}</h2>
            <p>Escolha uma área para ver só o que interessa.</p>
          </div>
          <button type="button" class="category-spotlight-action" data-open-category="all">
            <span>Ver tudo</span>
            ${icons.arrowRight}
          </button>
        </section>
      </div>

      <section class="category-section" aria-labelledby="categorySectionTitle">
        <div class="acct-section-head category-section-head">
          <h2 class="acct-section-title" id="categorySectionTitle">Todas as categorias</h2>
          <span class="acct-count">${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'}</span>
        </div>
        <div class="category-app-grid">
          ${stats.map(category => `
            <button class="category-app-card ${category.count === 0 ? 'empty' : ''}" type="button" data-open-category="${escapeHTML(category.id)}">
              <span class="category-app-icon" aria-hidden="true">${icons[category.id] || icons.others}</span>
              ${hasVisibleDiscount(category.bestDeal) ? `<span class="category-deal-pill">até −${Number(category.bestDeal.discount)}%</span>` : ''}
              <span class="category-app-copy">
                <strong>${escapeHTML(category.name)}</strong>
                <small>${category.count ? `${category.count} ${category.count === 1 ? 'oferta' : 'ofertas'}` : 'Sem ofertas agora'}</small>
                <span class="category-app-desc">${escapeHTML(CATEGORY_DESCRIPTIONS[category.id] || CATEGORY_DESCRIPTIONS.others)}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </section>
    </div>

    ${renderBuyerBottomNav('cats')}
  `;

  container.querySelector('#btnBackBuyerHome')?.addEventListener('click', () => {
    navigate('#/buyer');
  });

  container.querySelector('#btnFocusSearchFromCategories')?.addEventListener('click', () => {
    focusSearchAfterRender = true;
    navigate('#/buyer');
  });

  container.querySelectorAll('[data-open-category]').forEach(button => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.openCategory || 'all';
      searchQuery = '';
      navigate('#/buyer');
    });
  });
}

function openProductDetail(productId) {
  if (!isValidOfferId(productId)) return;
  const product = findKnownProduct(productId);
  if (product) {
    selectedProduct = product;
    selectedProductImageIndex = 0;
  }
  navigate(offerRoute(productId));
}

async function shareOffer(product) {
  const result = await shareLink({
    title: product.title,
    text: offerShareText(product, formatCurrency),
    url: offerShareUrl(product.id),
  });
  if (result === 'copied') showToast('Link da oferta copiado.', 'success');
  else if (result === 'failed') showToast('Não foi possível copiar o link da oferta.', 'error');
}

const ICON_BACK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';

// Shown while an offer opened by link loads.
function renderOfferSkeleton(container) {
  container.innerHTML = `
    <div class="page buyer-wrapper detail-page" aria-busy="true">
      <header class="detail-header">
        <button class="icon-btn" id="btnBackHome" type="button" aria-label="Voltar para ofertas">${ICON_BACK}</button>
        <span class="detail-header-label">Oferta</span>
        <span class="detail-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="detail-container">
        <div class="detail-gallery-shell"><div class="detail-carousel skeleton" aria-hidden="true"></div></div>
        <section class="detail-ticket" aria-hidden="true">
          <div class="detail-ticket-main">
            <div class="skeleton skeleton-line is-short"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line is-price"></div>
          </div>
        </section>
      </div>
    </div>
  `;
  container.querySelector('#btnBackHome')?.addEventListener('click', () => goBack('#/buyer'));
}

// A link to an offer that expired, was removed or never existed, or that failed to load.
function renderOfferUnavailable(container, { failed = false } = {}) {
  document.title = `${failed ? 'Oferta indisponível' : 'Oferta fora do ar'} — Empreende iCEV`;
  container.innerHTML = `
    <div class="page buyer-wrapper acct-page acct-page--narrow offer-missing-page">
      <header class="acct-header canopy">
        <div class="acct-topbar">
          <button class="icon-btn acct-icon-btn" id="btnBackFromOffer" type="button" aria-label="Voltar para ofertas">${ICON_BACK}</button>
        </div>
        <div class="acct-header-copy">
          <p class="t-eyebrow">Link de oferta</p>
          <h1 class="acct-title">${failed ? 'Oferta indisponível' : 'Oferta fora do ar'}</h1>
        </div>
      </header>
      <div class="acct-empty"${failed ? ' role="alert"' : ''}>
        <span class="acct-empty-icon">${failed ? icons.refresh : icons.ticket}</span>
        <h2>${failed ? 'Não foi possível abrir a oferta' : 'Esta oferta saiu da vitrine'}</h2>
        <p>${failed ? 'Confira sua conexão com a internet e tente de novo.' : 'Ela expirou ou foi retirada pela empresa. Veja as ofertas que estão no ar agora.'}</p>
        ${failed
          ? `<button class="btn-primary acct-empty-action" id="btnOfferRetry" type="button">${icons.refresh} Tentar de novo</button>`
          : '<button class="btn-primary acct-empty-action" id="btnOfferMissingExplore" type="button">Ver ofertas</button>'}
      </div>
    </div>
    ${renderBuyerBottomNav('home')}
  `;
  container.querySelector('#btnBackFromOffer')?.addEventListener('click', () => goBack('#/buyer'));
  container.querySelector('#btnOfferMissingExplore')?.addEventListener('click', () => navigate('#/buyer'));
  container.querySelector('#btnOfferRetry')?.addEventListener('click', () => renderBuyerPage(container));
}

function hasCouponsLeft(product) {
  return (Number(product.slots?.total) || 0) - (Number(product.slots?.used) || 0) > 0;
}

// Wide screens have room for a second ticket next to the biggest discount: the offer
// students open most, or the newest one while nothing has been opened yet.
function pickRunnerUp(products, featured) {
  const others = products.filter((product) => String(product.id) !== String(featured.id));
  if (!others.length) return null;
  const mostOpened = others.reduce((best, product) => (Number(product.clicks) || 0) > (Number(best.clicks) || 0) ? product : best);
  if ((Number(mostOpened.clicks) || 0) > 0) return { product: mostOpened, label: 'Mais procurada' };
  return { product: others[0], label: 'Nova na vitrine' };
}

function renderFeaturedTicket(product, label, variant = '') {
  return `
    <button class="buyer-featured-strip${variant ? ` ${variant}` : ''}" type="button" data-featured-product="${escapeHTML(product.id)}" aria-label="${escapeHTML(label)}: ${escapeHTML(product.title)}, ${formatCurrency(product.discountPrice)}">
      <span class="buyer-featured-media">${getProductImage(product.images?.[0], 240, 240, product.category)}</span>
      <span class="buyer-featured-copy">
        <span class="buyer-featured-badge">${escapeHTML(label)}</span>
        <strong>${escapeHTML(product.title)}</strong>
        <span class="buyer-featured-price">
          <span class="buyer-featured-now">${formatCurrency(product.discountPrice)}</span>
          ${hasVisibleDiscount(product) ? `<s>${formatCurrency(product.originalPrice)}</s>` : ''}
        </span>
      </span>
      <span class="buyer-featured-stub" aria-hidden="true">
        ${hasVisibleDiscount(product) ? `<span class="buyer-featured-percent">−${Number(product.discount)}%</span>` : `<span class="buyer-featured-go">${icons.arrowRight}</span>`}
      </span>
    </button>
  `;
}

function renderProductSkeletons() {
  return Array.from({ length: 4 }, () => `
    <div class="product-card product-card-skeleton" aria-hidden="true">
      <div class="card-image-area skeleton"></div>
      <div class="card-body">
        <div class="skeleton skeleton-line is-short"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line is-price"></div>
      </div>
    </div>
  `).join('');
}

function showLoginRequiredModal(product, container) {
  container.querySelector('#couponSheet')?.remove();
  const modalHTML = `
    <div class="coupon-sheet-overlay" id="couponSheet">
      <div class="coupon-sheet" role="dialog" aria-modal="true" aria-labelledby="couponSheetTitle">
        <div class="modal-handle" aria-hidden="true"></div>
        <div class="coupon-sheet-header">
          <div class="coupon-sheet-heading">
            <p class="t-eyebrow">Pegar cupom</p>
            <h3 id="couponSheetTitle">Entre com seu <span class="nowrap">e-mail</span> do iCEV</h3>
          </div>
          <button class="icon-btn coupon-sheet-close" type="button" aria-label="Fechar">${icons.x}</button>
        </div>
        <div class="coupon-sheet-body">
          <div class="offer-summary">
            <div class="offer-summary-product">
              <span class="t-eyebrow">${escapeHTML(product.seller?.name || 'Empresa de aluno')}</span>
              <strong>${escapeHTML(product.title)}</strong>
            </div>
            <div class="offer-summary-price">
              <span class="offer-summary-amount">${formatCurrency(product.discountPrice)}</span>
            </div>
          </div>
          <p class="coupon-sheet-desc">Os cupons são só para alunos do iCEV. Entre ou crie sua conta com o e-mail institucional para pegar o código.</p>
          <div class="coupon-sheet-actions">
            <button class="btn-primary btn-block btn-lg" id="btnLoginToClaim" type="button">
              ${icons.user}
              <span>Entrar e pegar o cupom</span>
            </button>
            <button class="btn-ghost btn-block" id="btnSignupToClaim" type="button">Criar conta de aluno</button>
          </div>
        </div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', modalHTML);
  const modal = document.getElementById('couponSheet');
  setTimeout(() => modal.classList.add('visible'), 10);

  const close = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('.coupon-sheet-close').addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector('#btnLoginToClaim').addEventListener('click', () => {
    close();
    navigate(authRoute({ next: offerRoute(product.id) }));
  });
  modal.querySelector('#btnSignupToClaim').addEventListener('click', () => {
    close();
    navigate(authRoute({ intent: 'signup', next: offerRoute(product.id) }));
  });
}

// Coupons the student retrieved in this session, by offer id: lets the detail
// page offer "Ver meu cupom" right away, before the coupon list reloads.
const recentClaims = new Map();

function getActiveCouponForProduct(productId) {
  const key = String(productId);
  const recent = recentClaims.get(key);
  if (recent?.status === 'active') return recent;
  const cached = buyerCouponsCache.get(globalSession?.user?.id || '')?.coupons || [];
  return cached.find((coupon) => String(coupon.productId) === key && coupon.status === 'active') || null;
}

/** Retrieve the student's code for an offer; asking again returns the same live code. */
async function claimProductCoupon(product, container, trigger) {
  if (!isAuthenticated()) {
    showLoginRequiredModal(product, container);
    return;
  }

  const idleLabel = trigger?.innerHTML;
  if (trigger) {
    trigger.disabled = true;
    trigger.innerHTML = '<span class="spinner" aria-hidden="true"></span> Gerando seu código…';
  }

  const result = await claimCoupon(product);

  if (trigger?.isConnected) {
    trigger.disabled = false;
    trigger.innerHTML = result.success ? `${icons.ticket} Ver meu cupom` : idleLabel;
  }

  if (!result.success) {
    if (result.code === 'AUTH_REQUIRED') {
      showLoginRequiredModal(product, container);
      return;
    }
    showToast(result.error, result.code === 'SOLD_OUT' || result.code === 'OWN_OFFER' ? 'warning' : 'error');
    return;
  }

  recentClaims.set(String(product.id), result.coupon);
  const userId = globalSession?.user?.id;
  if (userId) buyerCouponsCache.delete(userId);
  showBuyerCouponDetail(result.coupon, { justClaimed: true });
  refreshBuyerNavBadges(container);
}

function getBuyerCouponStatusMeta(status) {
  if (status === 'used') return { label: 'Usado', className: 'used', tone: 'acct-tone-neutral', hint: 'A empresa já confirmou este código na compra.' };
  if (status === 'expired') return { label: 'Expirado', className: 'expired', tone: 'acct-tone-danger', hint: 'O prazo deste cupom terminou. Pegue outro se a oferta ainda estiver no ar.' };
  return { label: 'Ativo', className: 'active', tone: 'acct-tone-success', hint: 'Mostre este código para a empresa na hora da compra.' };
}

async function copyBuyerCouponCode(code) {
  if (!code) return;
  if (await copyText(code)) showToast(`Código ${code} copiado.`, 'success');
  else showToast('Não foi possível copiar o código.', 'error');
}

function showBuyerCouponDetail(coupon, { justClaimed = false } = {}) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot || !coupon) return;
  const meta = getBuyerCouponStatusMeta(coupon.status);
  const whatsappUrl = coupon.status === 'active'
    ? getWhatsAppUrl(coupon.sellerWhatsapp, `Oi! Peguei o cupom ${coupon.code} no Empreende iCEV para "${coupon.product}". Quero comprar com o desconto.`)
    : '';

  const isActive = coupon.status === 'active';
  const pill = justClaimed ? { tone: 'acct-tone-success', label: 'Cupom retirado' } : meta;

  modalRoot.innerHTML = `
    <div class="modal-backdrop buyer-coupon-modal-backdrop" id="buyerCouponModal">
      <div class="modal-content buyer-coupon-modal" role="dialog" aria-modal="true" aria-labelledby="buyerCouponTitle">
        <div class="modal-handle" aria-hidden="true"></div>
        <button class="icon-btn modal-close-btn buyer-coupon-close" type="button" aria-label="Fechar">${icons.x}</button>
        <span class="status-pill ${pill.tone} coupon-detail-status">${pill.label}</span>
        <h2 id="buyerCouponTitle">${escapeHTML(coupon.product)}</h2>
        <p class="coupon-detail-hint">${escapeHTML(meta.hint)}</p>
        ${justClaimed ? `
          <ol class="coupon-claim-steps" aria-label="Como usar o cupom">
            <li><span class="coupon-claim-step-num">1</span><span>Chame a empresa${coupon.sellerWhatsapp ? ' no WhatsApp' : ''} e combine o pedido.</span></li>
            <li><span class="coupon-claim-step-num">2</span><span>Mostre o código na hora da compra.</span></li>
            <li><span class="coupon-claim-step-num">3</span><span>Pague direto para a empresa, já com o desconto.</span></li>
          </ol>
        ` : ''}
        <div class="coupon-detail-ticket ${meta.className}">
          <span class="t-eyebrow">Código do cupom</span>
          <strong class="coupon-code coupon-detail-code">${escapeHTML(coupon.code)}</strong>
          ${isActive ? '' : `<span class="coupon-stamp ${meta.className}" aria-hidden="true">${meta.label}</span>`}
          <div class="perforation" aria-hidden="true"></div>
          <button class="${isActive && !whatsappUrl ? 'btn-primary' : 'btn-secondary'} btn-block" type="button" data-copy-coupon-detail="${escapeHTML(coupon.code)}">${icons.copy} Copiar código</button>
        </div>
        <dl class="coupon-detail-grid">
          <div class="coupon-detail-item"><dt>Empresa</dt><dd>${escapeHTML(coupon.seller || 'Empresa')}</dd></div>
          <div class="coupon-detail-item"><dt>Retirado em</dt><dd>${escapeHTML(coupon.createdAt || '—')}</dd></div>
          <div class="coupon-detail-item"><dt>Válido até</dt><dd>${escapeHTML(coupon.validUntil || '—')}</dd></div>
          ${coupon.status === 'used' ? `<div class="coupon-detail-item"><dt>Usado em</dt><dd>${escapeHTML(coupon.usedAt || '—')}</dd></div>` : ''}
        </dl>
        <p class="coupon-detail-note">
          ${icons.shield}
          <span>Cada código vale uma compra. A empresa marca como usado na hora e ele deixa de valer.</span>
        </p>
        ${whatsappUrl ? `<div class="coupon-detail-footer"><a class="btn-primary btn-block btn-lg btn-whatsapp coupon-detail-whatsapp" href="${escapeHTML(whatsappUrl)}" target="_blank" rel="noopener">${icons.whatsapp} Chamar a empresa no WhatsApp</a></div>` : isActive ? `<p class="coupon-detail-note coupon-detail-note--contact">${icons.alertTriangle}<span>A empresa ainda não informou WhatsApp. Procure-a no campus e mostre o código.</span></p>` : ''}
      </div>
    </div>
  `;

  const close = () => { modalRoot.innerHTML = ''; };
  modalRoot.querySelector('.buyer-coupon-close')?.addEventListener('click', close);
  modalRoot.querySelector('#buyerCouponModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'buyerCouponModal') close();
  });
  modalRoot.querySelector('[data-copy-coupon-detail]')?.addEventListener('click', (event) => {
    copyBuyerCouponCode(event.currentTarget.dataset.copyCouponDetail);
  });
}

async function renderCoupons(container) {
  let userCoupons = [];
  let loadFailed = false;
  const isLoggedIn = isAuthenticated();
  try {
    userCoupons = isLoggedIn ? await loadBuyerCoupons(globalSession.user.id) : [];
  } catch {
    loadFailed = true;
  }

  const activeCoupons = userCoupons.filter(c => c.status === 'active');
  const pastCoupons = userCoupons.filter(c => c.status !== 'active');
  const hasDate = (value) => Boolean(value) && value !== '—';

  const renderCouponTicket = (c) => {
    const meta = getBuyerCouponStatusMeta(c.status);
    const dateLine = c.status === 'used' && hasDate(c.usedAt)
      ? `Usado em ${escapeHTML(c.usedAt)}`
      : hasDate(c.validUntil) ? `Válido até ${escapeHTML(c.validUntil)}` : '';
    return `
      <article class="coupon-ticket coupon-card buyer-real-coupon ${meta.className}" role="button" tabindex="0" data-coupon-detail="${escapeHTML(c.id)}" aria-label="Cupom ${escapeHTML(c.product)}, ${meta.label}">
        <div class="coupon-ticket-main">
          <div class="coupon-ticket-top">
            <span class="coupon-ticket-seller">${icons.user}<span>${escapeHTML(c.seller)}</span></span>
            <span class="status-pill ${meta.tone}">${meta.label}</span>
          </div>
          <h3 class="coupon-ticket-title">${escapeHTML(c.product)}</h3>
          ${dateLine ? `<p class="coupon-ticket-date">${dateLine}</p>` : ''}
        </div>
        <div class="perforation" aria-hidden="true"></div>
        <div class="coupon-ticket-stub">
          <div class="coupon-ticket-code">
            <span class="t-eyebrow">Código</span>
            <strong class="coupon-code coupon-ticket-value">${escapeHTML(c.code)}</strong>
          </div>
          <div class="coupon-ticket-actions">
            ${c.status === 'active' && getWhatsAppUrl(c.sellerWhatsapp, '') ? `<a href="${escapeHTML(getWhatsAppUrl(c.sellerWhatsapp, `Oi! Tenho o cupom ${c.code} para ${c.product}.`))}" target="_blank" rel="noopener" class="icon-btn btn-whatsapp" aria-label="Falar com ${escapeHTML(c.seller)} no WhatsApp">${icons.whatsapp}</a>` : ''}
            <button class="icon-btn copy-btn" type="button" data-code="${escapeHTML(c.code)}" aria-label="Copiar código ${escapeHTML(c.code)}">${icons.copy}</button>
          </div>
        </div>
        ${c.status === 'active' ? '' : `<span class="coupon-stamp ${meta.className}" aria-hidden="true">${meta.label}</span>`}
      </article>
    `;
  };

  const summary = userCoupons.length
    ? `${activeCoupons.length} ${activeCoupons.length === 1 ? 'ativo' : 'ativos'} · ${userCoupons.length} no total`
    : 'Sua carteira';

  container.innerHTML = `
    <div class="page buyer-wrapper acct-page acct-page--narrow coupons-page">
      <header class="acct-header canopy">
        <div class="acct-header-copy">
          <p class="t-eyebrow">${summary}</p>
          <h1 class="acct-title">Meus <span class="hl">cupons</span></h1>
          ${activeCoupons.length ? '<p class="acct-lede">Mostre o código para a empresa na hora da compra.</p>' : ''}
        </div>
      </header>

      ${loadFailed ? `
        <div class="coupon-empty-ticket coupons-empty-state" role="alert">
          <div class="coupon-empty-main">
            <span class="acct-empty-icon">${icons.refresh}</span>
            <h2>Não foi possível carregar seus cupons</h2>
            <p>Seus códigos continuam salvos na sua conta. Confira sua conexão e tente de novo.</p>
          </div>
          <div class="perforation" aria-hidden="true"></div>
          <div class="coupon-empty-stub">
            <span class="coupon-code coupon-empty-code" aria-hidden="true">······</span>
            <button class="btn-primary" id="btnCouponsRetry" type="button">${icons.refresh} Tentar de novo</button>
          </div>
        </div>
      ` : userCoupons.length === 0 ? `
        <div class="coupon-empty-ticket coupons-empty-state">
          <div class="coupon-empty-main">
            <span class="acct-empty-icon">${icons.ticket}</span>
            <h2>${isLoggedIn ? 'Nenhum cupom ainda' : 'Entre para ver seus cupons'}</h2>
            <p>${isLoggedIn ? 'Pegue um cupom na vitrine e ele fica guardado aqui.' : 'Seus cupons ficam guardados na sua conta, prontos para usar.'}</p>
          </div>
          <div class="perforation" aria-hidden="true"></div>
          <div class="coupon-empty-stub">
            <span class="coupon-code coupon-empty-code" aria-hidden="true">······</span>
            ${isLoggedIn
              ? '<button class="btn-primary" id="btnCouponsExplore" type="button">Explorar ofertas</button>'
              : '<button class="btn-primary" id="btnCouponsLogin" type="button">Entrar na conta</button>'}
          </div>
        </div>
      ` : `
        ${activeCoupons.length ? `
          <section class="coupon-group" aria-labelledby="couponsActiveTitle">
            <div class="acct-section-head">
              <h2 class="acct-section-title" id="couponsActiveTitle">Prontos para usar</h2>
              <span class="acct-count">${activeCoupons.length}</span>
            </div>
            <div class="coupons-list">${activeCoupons.map(renderCouponTicket).join('')}</div>
          </section>
        ` : ''}
        ${pastCoupons.length ? `
          <section class="coupon-group" aria-labelledby="couponsPastTitle">
            <div class="acct-section-head">
              <h2 class="acct-section-title" id="couponsPastTitle">Histórico</h2>
              <span class="acct-count">${pastCoupons.length}</span>
            </div>
            <div class="coupons-list">${pastCoupons.map(renderCouponTicket).join('')}</div>
          </section>
        ` : ''}
      `}
    </div>

    ${renderBuyerBottomNav('coupons')}
  `;

  container.querySelector('#btnCouponsLogin')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });

  container.querySelector('#btnCouponsExplore')?.addEventListener('click', () => {
    navigate('#/buyer');
  });
  container.querySelector('#btnCouponsRetry')?.addEventListener('click', (event) => {
    event.currentTarget.disabled = true;
    renderBuyerPage(container);
  });

  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      copyBuyerCouponCode(btn.dataset.code);
    });
  });

  container.querySelectorAll('[data-coupon-detail]').forEach(card => {
    const open = () => {
      const coupon = userCoupons.find(item => String(item.id) === String(card.dataset.couponDetail));
      showBuyerCouponDetail(coupon);
    };
    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function getProfileRoleMeta(role) {
  if (role === 'admin') {
    return {
      label: 'Administrador',
      status: 'Acesso total',
      description: 'Cuide da moderação, das categorias e dos relatórios.',
    };
  }

  if (role === 'seller') {
    return {
      label: 'Empresa',
      status: 'Empresa ativa',
      description: 'Publique ofertas com cupom, receba os pedidos no WhatsApp e confira os códigos usados.',
    };
  }

  return {
    label: 'Aluno',
    status: 'Conta de aluno ativa',
    description: 'Pegue cupons das empresas dos colegas. Tem uma empresa? Cadastre e divulgue suas ofertas.',
  };
}

function renderProfileActions(role) {
  const sellerAccess = ['seller', 'admin'].includes(role);
  const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  return `
    <div class="profile-list profile-action-grid">
      <button type="button" class="profile-row profile-row--link profile-action-card" id="btnOpenBuyerHome">
        <span class="profile-row-icon">${icons.home}</span>
        <span class="profile-row-copy">
          <strong>Vitrine</strong>
          <small>Ver ofertas e pegar cupons</small>
        </span>
        <span class="profile-row-chevron">${chevron}</span>
      </button>

      ${sellerAccess ? `
        <button type="button" class="profile-row profile-row--link profile-action-card" id="btnOpenSellerPanel">
          <span class="profile-row-icon">${icons.package}</span>
          <span class="profile-row-copy">
            <strong>Minha empresa</strong>
            <small>Ofertas, cupons e contato</small>
          </span>
          <span class="profile-row-chevron">${chevron}</span>
        </button>
      ` : `
        <button type="button" class="profile-row profile-row--link profile-action-card profile-action-card--accent" id="btnProfileSellerFlow">
          <span class="profile-row-icon profile-row-icon--ink">${icons.plus}</span>
          <span class="profile-row-copy">
            <strong>Cadastrar minha empresa</strong>
            <small>Divulgue cupons para os colegas</small>
          </span>
          <span class="profile-row-chevron">${chevron}</span>
        </button>
      `}

      ${role === 'admin' ? `
        <button type="button" class="profile-row profile-row--link profile-action-card profile-action-card--admin" id="btnOpenAdminPanel">
          <span class="profile-row-icon">${icons.shield}</span>
          <span class="profile-row-copy">
            <strong>Administração</strong>
            <small>Moderação e relatórios</small>
          </span>
          <span class="profile-row-chevron">${chevron}</span>
        </button>
      ` : ''}
    </div>
  `;
}

function renderProfileHelpPanel() {
  const chevron = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  return `
    <section class="profile-group profile-help-panel" aria-labelledby="profileHelpTitle">
      <h2 class="t-eyebrow profile-group-label" id="profileHelpTitle">Ajuda</h2>
      <div class="profile-list">
        <button type="button" class="profile-row profile-row--link profile-tour-btn" id="btnReplayTour">
          <span class="profile-row-icon">${icons.ticket}</span>
          <span class="profile-row-copy">
            <strong>Como funciona o Empreende&nbsp;iCEV</strong>
            <small>Rever a apresentação rápida do app</small>
          </span>
          <span class="profile-row-chevron">${chevron}</span>
        </button>
      </div>
    </section>
  `;
}

function renderProfile(container) {
  const user = getUser();
  const isLoggedIn = isAuthenticated();
  const role = getAccountRole();
  const roleMeta = getProfileRoleMeta(role);
  const displayName = user.fullName || user.name || 'Usuário';
  const email = user.email || '';
  const initials = user.avatar || displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || 'U';
  const whatsappStatus = user.whatsapp ? formatPhoneBR(user.whatsapp) : 'Não informado';
  const fromSeller = isSellerContextProfile(role);
  const logoutIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

  container.innerHTML = `
    <div class="page buyer-wrapper acct-page acct-page--narrow profile-page">
      <header class="acct-header canopy">
        ${fromSeller ? `
          <div class="acct-topbar">
            <a class="icon-btn acct-icon-btn" href="#/seller" aria-label="Voltar para Minha empresa"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></a>
          </div>
        ` : ''}
        <div class="acct-header-copy">
          <p class="t-eyebrow">${isLoggedIn ? `${brandCaseHTML(activeInstitution.name || 'iCEV')} · ${escapeHTML(roleMeta.label)}` : 'Visitante'}</p>
          <h1 class="acct-title">Perfil</h1>
        </div>
      </header>

      <div class="profile-container">
        ${!isLoggedIn ? `
          <section class="profile-login-panel">
            <span class="profile-login-icon">${icons.user}</span>
            <h2>Entre para personalizar sua conta</h2>
            <p>Com uma conta do iCEV você guarda seus cupons e pode cadastrar sua empresa quando quiser.</p>
            <button type="button" class="btn-primary profile-login-action" id="btnGoLogin">Entrar na conta</button>
          </section>

          ${renderProfileHelpPanel()}
        ` : `
          <section class="profile-hero-panel">
            <div class="avatar-lg profile-avatar-large" aria-hidden="true">${escapeHTML(initials)}</div>
            <div class="profile-identity">
              <h2>${escapeHTML(displayName)}</h2>
              ${email ? `<p class="profile-email">${escapeHTML(email)}</p>` : ''}
              <span class="status-pill acct-tone-success profile-status">${escapeHTML(roleMeta.status)}</span>
            </div>
          </section>

          <section class="profile-group profile-account-panel" aria-labelledby="profileAccountTitle">
            <h2 class="t-eyebrow profile-group-label" id="profileAccountTitle">Sua conta</h2>
            <div class="profile-list">
              <div class="profile-row profile-row--stacked">
                <div class="profile-row-line">
                  <span class="profile-row-label">Perfil</span>
                  <span class="profile-row-value">${escapeHTML(roleMeta.label)}</span>
                </div>
                <p class="profile-row-note">${escapeHTML(roleMeta.description)}</p>
              </div>
              <div class="profile-row">
                <span class="profile-row-label">Instituição</span>
                <span class="profile-row-value">${escapeHTML(activeInstitution.name || 'Instituição')}</span>
              </div>
              <div class="profile-row">
                <span class="profile-row-label">WhatsApp</span>
                <span class="profile-row-value ${user.whatsapp ? '' : 'is-muted'}">${escapeHTML(whatsappStatus)}</span>
              </div>
            </div>
          </section>

          <section class="profile-group" aria-labelledby="profileShortcutsTitle">
            <h2 class="t-eyebrow profile-group-label" id="profileShortcutsTitle">Acessos rápidos</h2>
            ${renderProfileActions(role)}
          </section>

          <section class="profile-group" aria-labelledby="profileDataTitle">
            <h2 class="t-eyebrow profile-group-label" id="profileDataTitle">Dados do perfil</h2>
            <div class="profile-list profile-form-card">
              <label class="profile-field" for="profileName">
                <span>Nome completo</span>
                <input type="text" value="${escapeHTML(displayName)}" id="profileName" class="profile-input" autocomplete="name" />
              </label>

              <label class="profile-field" for="profileWhatsapp">
                <span>WhatsApp</span>
                <input type="tel" value="${escapeHTML(formatPhoneBR(user.whatsapp))}" id="profileWhatsapp" class="profile-input" autocomplete="tel" inputmode="tel" placeholder="(86) 99900-1122" />
              </label>

              <p class="profile-form-hint">Aparece nos seus cupons e para as empresas quando você usar um código.</p>

              <button type="button" class="btn-primary btn-block profile-save-btn" id="btnSaveProfile">${icons.check} Salvar dados</button>
            </div>
          </section>

          ${renderProfileHelpPanel()}

          <section class="profile-group profile-session-panel" aria-label="Sessão">
            <div class="profile-list">
              <button type="button" class="profile-row profile-row--link profile-row--danger profile-logout-btn" id="btnLogout">
                <span class="profile-row-icon">${logoutIcon}</span>
                <span class="profile-row-copy">
                  <strong>Sair da conta</strong>
                  <small>Encerrar a sessão neste navegador</small>
                </span>
              </button>
            </div>
          </section>
        `}
      </div>
    </div>

    ${fromSeller ? renderSellerContextNav() : renderBuyerBottomNav('profile')}
  `;

  bindPhoneFormatting(document.getElementById('profileWhatsapp'));

  document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const whatsapp = document.getElementById('profileWhatsapp').value.trim();
    if (!name) { showToast('Preencha seu nome.', 'error'); return; }

    const btn = document.getElementById('btnSaveProfile');
    btn.textContent = 'Salvando…';
    btn.disabled = true;

    try {
      if (globalSession?.user?.id) {
        await saveCurrentProfileFields({ name, whatsapp });
      }
      showToast('Perfil atualizado.', 'success');
    } catch (err) {
      showToast(err.message || 'Não foi possível atualizar o perfil.', 'error');
    }
    btn.innerHTML = `${icons.check} Salvar dados`;
    btn.disabled = false;
  });

  document.getElementById('btnGoLogin')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });

  document.getElementById('btnProfileSellerFlow')?.addEventListener('click', openSellerFlow);
  document.getElementById('btnOpenSellerPanel')?.addEventListener('click', () => { window.location.hash = '#/seller'; });
  document.getElementById('btnOpenAdminPanel')?.addEventListener('click', () => { window.location.hash = '#/admin'; });
  document.getElementById('btnOpenBuyerHome')?.addEventListener('click', () => {
    navigate('#/buyer');
  });
  document.getElementById('btnReplayTour')?.addEventListener('click', replayFirstRunTour);

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await signOutUser();
      showToast('Você saiu da conta.', 'success');
      window.location.hash = '#/';
    } catch {
      window.location.hash = '#/';
    }
  });

}

// ─── PRODUCT DETAIL PAGE ────────────────────────────────

function bindSwipeNavigation(element, onSwipeLeft, onSwipeRight) {
  if (!element) return;
  let startX = 0;
  let startY = 0;
  let isTracking = false;

  element.addEventListener('touchstart', (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    isTracking = true;
  }, { passive: true });

  element.addEventListener('touchend', (event) => {
    if (!isTracking) return;
    isTracking = false;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }, { passive: true });
}

function renderProductDetail(container) {
  {
    const p = selectedProduct;
    if (!p) { renderOfferUnavailable(container); return; }
    document.title = `${p.title} — Empreende iCEV`;

    const catName = getMarketCategories().find(c => c.id === p.category)?.name || 'Outros';
    const timer = getCountdownInfo(p.expiresAt, p.expiresIn || '24h 00min');
    const slotsLeft = Math.max((p.slots?.total || 5) - (p.slots?.used || 0), 0);
    const isSoldOut = slotsLeft === 0;
    const hasDiscount = hasVisibleDiscount(p);
    const sellerInitials = p.seller?.avatar || p.seller?.name?.split(' ').map(n => n[0]).join('').slice(0,2) || '??';
    const images = Array.isArray(p.images) && p.images.length > 0 ? p.images : [];
    selectedProductImageIndex = Math.min(Math.max(selectedProductImageIndex, 0), Math.max(images.length - 1, 0));
    const sellerWhatsappUrl = getWhatsAppUrl(p.seller?.whatsapp, `Oi! Vi a oferta "${p.title}" no Empreende iCEV.`);
    const ownedCoupon = getActiveCouponForProduct(p.id);

    container.innerHTML = `
      <div class="page buyer-wrapper detail-page${isSoldOut ? ' is-sold-out' : ''}">
        <header class="detail-header">
          <button class="icon-btn" id="btnBackHome" type="button" aria-label="Voltar para ofertas">${ICON_BACK}</button>
          <span class="detail-header-label">${escapeHTML(catName)}</span>
          <button class="icon-btn" id="btnShareOffer" type="button" aria-label="Compartilhar oferta">${icons.share}</button>
        </header>

        <div class="detail-container">
          <section class="detail-gallery-shell">
            <div class="detail-carousel" id="detailCarousel" aria-label="Fotos do produto" tabindex="0">
              ${(images.length ? images : ['']).map((image, index) => `
                <button type="button" class="detail-carousel-slide" data-photo-index="${index}" aria-label="Ampliar foto ${index + 1}">
                  ${getProductImage(image, 840, 630, p.category)}
                </button>
              `).join('')}
            </div>
            ${isSoldOut
              ? '<span class="discount-badge soldout-badge detail-discount-badge">Esgotado</span>'
              : hasDiscount ? `<span class="discount-badge detail-discount-badge">−${p.discount}%</span>` : ''
            }
            ${images.length > 1 ? `
              <div class="detail-gallery-dots" id="detailGalleryDots" aria-hidden="true">
                ${images.map((_, index) => `<span class="${index === selectedProductImageIndex ? 'active' : ''}" data-gallery-dot="${index}"></span>`).join('')}
              </div>
            ` : ''}
          </section>

          ${images.length > 1 ? `
            <div class="detail-thumbnails">
              ${images.map((image, index) => `
                <button type="button" class="detail-thumb ${index === selectedProductImageIndex ? 'active' : ''}" data-thumb-index="${index}" aria-label="Ver foto ${index + 1}">
                  ${getProductImage(image, 96, 72, p.category)}
                </button>
              `).join('')}
            </div>
          ` : ''}

          <section class="detail-ticket">
            <div class="detail-ticket-main">
              <h1 class="detail-title">${escapeHTML(p.title)}</h1>
              <p class="detail-desc">${escapeHTML(p.description || 'Oferta aprovada pela equipe Empreende iCEV.')}</p>
            </div>
            <div class="perforation" aria-hidden="true"></div>
            <div class="detail-ticket-stub">
              <div class="detail-price-row">
                <span class="detail-price-current"><span class="hl hl--draw">${formatCurrency(p.discountPrice)}</span></span>
                ${hasDiscount ? `<s class="detail-price-original">${formatCurrency(p.originalPrice)}</s>` : ''}
              </div>
              <ul class="detail-facts">
                ${isSoldOut ? '' : `<li class="card-timer ${timer.colorClass} ${timer.isCritical ? 'expiry--urgent' : ''}" data-countdown-expires="${escapeHTML(p.expiresAt || '')}" data-countdown-fallback="${escapeHTML(p.expiresIn || '')}">
                  <span class="timer-icon">${icons.clock}</span>
                  <span data-countdown-label>${escapeHTML(timer.text)}</span>
                </li>`}
                <li>
                  ${icons.ticket}
                  <span>${isSoldOut ? 'Sem cupons disponíveis' : `${slotsLeft} ${slotsLeft === 1 ? 'cupom disponível' : 'cupons disponíveis'}`}</span>
                </li>
                <li>
                  ${icons.whatsapp}
                  <span>Você compra direto com a empresa</span>
                </li>
                <li>
                  ${icons.shield}
                  <span>Oferta aprovada pela equipe Empreende iCEV</span>
                </li>
              </ul>
            </div>
          </section>

          <section class="seller-detail-card">
            <div class="seller-detail-head">
              <div class="user-avatar seller-detail-avatar" aria-hidden="true">${escapeHTML(sellerInitials)}</div>
              <div>
                <div class="seller-detail-name">${escapeHTML(p.seller?.name || 'Empresa')}</div>
                <div class="seller-detail-subtitle">Empresa de aluno do iCEV</div>
              </div>
            </div>
            ${sellerWhatsappUrl ? `
              <a href="${escapeHTML(sellerWhatsappUrl)}" target="_blank" rel="noopener" class="btn-secondary seller-whatsapp-button">
                ${icons.whatsapp} Conversar
              </a>
            ` : ''}
          </section>

          <div class="detail-buy-bar">
            <div class="detail-buy-summary">
              <span>${isSoldOut ? 'Esgotado' : 'Com o cupom'}</span>
              <strong>${formatCurrency(p.discountPrice)}</strong>
            </div>
            <button class="btn-primary detail-buy-button" id="btnClaimCoupon" type="button" ${isSoldOut && !ownedCoupon ? 'disabled' : ''}>
              ${ownedCoupon ? `${icons.ticket} Ver meu cupom` : isSoldOut ? 'Cupons esgotados' : `${icons.ticket} Pegar cupom`}
            </button>
          </div>
        </div>

      </div>
    `;

    container.querySelector('#btnBackHome').addEventListener('click', () => goBack('#/buyer'));
    container.querySelector('#btnShareOffer')?.addEventListener('click', () => shareOffer(p));

    container.querySelector('#btnClaimCoupon')?.addEventListener('click', (event) => {
      const existing = getActiveCouponForProduct(p.id);
      if (existing) {
        showBuyerCouponDetail(existing);
        return;
      }
      if (!isSoldOut) claimProductCoupon(p, container, event.currentTarget);
    });

    // A coupon retrieved on another visit turns the button into "Ver meu cupom".
    const detailUserId = globalSession?.user?.id;
    if (detailUserId && !ownedCoupon) {
      loadBuyerCoupons(detailUserId).then(() => {
        const button = container.querySelector('#btnClaimCoupon');
        if (!button || currentView !== 'detail' || selectedProduct?.id !== p.id || !getActiveCouponForProduct(p.id)) return;
        button.disabled = false;
        button.innerHTML = `${icons.ticket} Ver meu cupom`;
      }).catch(() => {});
    }

    const carousel = container.querySelector('#detailCarousel');
    const updateGalleryState = (nextIndex) => {
      if (!images.length) return;
      selectedProductImageIndex = Math.min(Math.max(nextIndex, 0), images.length - 1);
      container.querySelectorAll('[data-gallery-dot]').forEach((dot, index) => {
        dot.classList.toggle('active', index === selectedProductImageIndex);
      });
      container.querySelectorAll('[data-thumb-index]').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === selectedProductImageIndex);
      });
    };

    let galleryScrollTimer;
    carousel?.addEventListener('scroll', () => {
      window.clearTimeout(galleryScrollTimer);
      galleryScrollTimer = window.setTimeout(() => {
        const width = carousel.clientWidth || 1;
        updateGalleryState(Math.round(carousel.scrollLeft / width));
      }, 80);
    }, { passive: true });

    container.querySelectorAll('[data-thumb-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.thumbIndex);
        carousel?.scrollTo({ left: carousel.clientWidth * index, behavior: 'smooth' });
        updateGalleryState(index);
      });
    });

    container.querySelectorAll('[data-photo-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.photoIndex);
        selectedProductImageIndex = Number.isFinite(index) ? index : selectedProductImageIndex;
        if (!images.length) return;
        showProductImageLightbox(container, p, images, selectedProductImageIndex);
      });
    });

    if (carousel && selectedProductImageIndex > 0) {
      requestAnimationFrame(() => {
        carousel.scrollLeft = carousel.clientWidth * selectedProductImageIndex;
        updateGalleryState(selectedProductImageIndex);
      });
    }
    startBuyerCountdowns(container);
    return;
  }
}

function showProductImageLightbox(container, product, images, startIndex = 0) {
  let index = startIndex;
  const modalRoot = document.getElementById('modal-root');
  const chevronLeft = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  const chevronRight = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  const render = () => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop visible product-lightbox-backdrop" id="product-image-lightbox" role="dialog" aria-modal="true" aria-label="Fotos de ${escapeHTML(product.title)}">
        <div class="product-lightbox-panel">
          <div class="product-lightbox-header">
            <strong>${escapeHTML(product.title)}</strong>
            <button class="icon-btn product-lightbox-close" id="closeLightbox" type="button" aria-label="Fechar">${icons.x}</button>
          </div>
          <div id="lightboxImageFrame" class="product-lightbox-frame">
            ${getProductImage(images[index], 900, 720, product.category)}
            ${images.length > 1 ? `
              <button class="icon-btn product-lightbox-arrow is-prev" id="lightboxPrev" type="button" aria-label="Foto anterior">${chevronLeft}</button>
              <button class="icon-btn product-lightbox-arrow is-next" id="lightboxNext" type="button" aria-label="Próxima foto">${chevronRight}</button>
              <div class="product-lightbox-count">${index + 1} / ${images.length}</div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    modalRoot.querySelector('#product-image-lightbox')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) modalRoot.innerHTML = '';
    });
    modalRoot.querySelector('#closeLightbox')?.addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
    modalRoot.querySelector('#lightboxPrev')?.addEventListener('click', (event) => {
      event.stopPropagation();
      index = (index - 1 + images.length) % images.length;
      selectedProductImageIndex = index;
      render();
    });
    modalRoot.querySelector('#lightboxNext')?.addEventListener('click', (event) => {
      event.stopPropagation();
      index = (index + 1) % images.length;
      selectedProductImageIndex = index;
      render();
    });
    bindSwipeNavigation(
      modalRoot.querySelector('#lightboxImageFrame'),
      () => {
        index = (index + 1) % images.length;
        selectedProductImageIndex = index;
        render();
      },
      () => {
        index = (index - 1 + images.length) % images.length;
        selectedProductImageIndex = index;
        render();
      }
    );
  };
  render();
}

// ─── NOTIFICATIONS PAGE ─────────────────────────────────

// Notifications may carry an in-app address ("#/buyer/coupons"); anything else is ignored.
function getNotificationLink(url) {
  const value = String(url || '');
  return /^#\/[A-Za-z0-9/_?=&%.-]*$/.test(value) ? value : '';
}

async function renderNotifications(container) {
  const userId = globalSession?.user?.id;
  const backIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
  if (!userId) {
    container.innerHTML = `
      <div class="page buyer-wrapper acct-page acct-page--narrow notifications-page">
        <header class="acct-header canopy">
          <div class="acct-topbar">
            <button class="icon-btn acct-icon-btn" id="btnBackFromNotif" type="button" aria-label="Voltar para o início">${backIcon}</button>
          </div>
          <div class="acct-header-copy">
            <p class="t-eyebrow">Atividade</p>
            <h1 class="acct-title">Notificações</h1>
          </div>
        </header>
        <div class="acct-empty notifications-empty-state">
          <span class="acct-empty-icon">${icons.bell}</span>
          <h2>Entre para ver suas notificações</h2>
          <p>Avisos sobre seus cupons e ofertas ficam salvos na sua conta.</p>
          <button class="btn-primary acct-empty-action" id="btnNotifLogin" type="button">Entrar na conta</button>
        </div>
      </div>
      ${renderBuyerBottomNav(null)}
    `;
    container.querySelector('#btnBackFromNotif')?.addEventListener('click', () => goBack('#/buyer'));
    container.querySelector('#btnNotifLogin')?.addEventListener('click', () => {
      window.location.hash = '#/auth';
    });
    return;
  }

  const notifs = await getNotifications(userId);
  const typeIcons = { success: icons.checkCircle, warning: icons.alertTriangle, error: icons.x, info: icons.bell };
  const typeTones = { success: 'success', warning: 'warning', error: 'danger', info: 'info' };
  const unreadTotal = notifs.filter(n => !n.read).length;
  const formatNotifTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  container.innerHTML = `
    <div class="page buyer-wrapper acct-page acct-page--narrow notifications-page">
      <header class="acct-header canopy">
        <div class="acct-topbar">
          <button class="icon-btn acct-icon-btn" id="btnBackFromNotif" type="button" aria-label="Voltar para o início">${backIcon}</button>
          <button class="btn-ghost btn-sm acct-topbar-action" id="btnMarkAllRead" type="button">${icons.check} Marcar como lidas</button>
        </div>
        <div class="acct-header-copy">
          <p class="t-eyebrow">${unreadTotal ? `${unreadTotal} ${unreadTotal === 1 ? 'não lida' : 'não lidas'}` : 'Tudo em dia'}</p>
          <h1 class="acct-title">Notificações</h1>
        </div>
      </header>
      ${notifs.length === 0 ? `
        <div class="acct-empty notifications-empty-state">
          <span class="acct-empty-icon">${icons.bell}</span>
          <h2>Nada por aqui ainda</h2>
          <p>Avisos sobre seus cupons e ofertas aparecem aqui assim que acontecerem.</p>
        </div>
      ` : `
        <div class="notifications-list">
          ${notifs.map(n => {
            const link = getNotificationLink(n.action_url);
            const tag = link ? 'a' : 'div';
            return `
            <${tag} class="notif-item ${n.read ? 'notif-read' : 'notif-unread'}"${link ? ` href="${escapeHTML(link)}"` : ''} data-notif-id="${escapeHTML(n.id || '')}">
              <span class="notif-icon notif-icon--${typeTones[n.type] || typeTones.info}" aria-hidden="true">${typeIcons[n.type] || typeIcons.info}</span>
              <div class="notif-content">
                <div class="notif-head">
                  <p class="notif-title ${n.read ? '' : 'notif-title-bold'}">${n.read ? '' : '<span class="sr-only">Não lida: </span>'}${escapeHTML(n.title)}</p>
                  <time class="notif-time" datetime="${escapeHTML(n.created_at || '')}">${formatNotifTime(n.created_at)}</time>
                </div>
                ${n.body ? `<p class="notif-body">${escapeHTML(n.body)}</p>` : ''}
              </div>
            </${tag}>
          `; }).join('')}
        </div>
      `}
    </div>
    ${renderBuyerBottomNav(null)}
  `;

  container.querySelector('#btnBackFromNotif').addEventListener('click', () => goBack('#/buyer'));

  container.querySelector('#btnMarkAllRead')?.addEventListener('click', async () => {
    await markAllAsRead(userId);
    unreadCountCache.set(userId, { count: 0, loadedAt: Date.now() });
    showToast('Todas as notificações marcadas como lidas.', 'success');
    renderNotifications(container);
  });

  // Opening a notification marks it as read; its link (if any) does the navigation.
  container.querySelectorAll('.notif-item.notif-unread[data-notif-id]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.notifId;
      if (!id) return;
      markAsRead(id).catch(() => {});
      unreadCountCache.delete(userId);
    });
  });

}
