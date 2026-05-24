import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile, refreshCurrentProfile, getCurrentTheme, toggleAppTheme } from '../main.js';
import { products as mockProducts, categories as mockCategories, coupons, currentUser, institution } from '../data/mock.js';
import { createPixPayment, checkPaymentStatus, createCheckoutPreference, checkProductPaymentReady } from '../services/payment-service.js';
import { getActiveProducts, getProductById, incrementProductClicks } from '../services/product-service.js';
import { getBuyerCoupons } from '../services/coupon-service.js';
import { getNotifications, getUnreadCount, markAllAsRead } from '../services/notification-service.js';
import { getInstitution } from '../services/institution-service.js';
import { getCategories } from '../services/category-service.js';
import { supabase } from '../lib/supabase.js';
import { becomeSeller, signOutUser } from '../services/auth-service.js';
import { resetAppScroll } from '../utils/scroll.js';

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
    const name = globalProfile.name || baseUser.name || 'Usuario';
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
    const name = metadata.full_name || metadata.name || globalSession.user.email?.split('@')[0] || baseUser.name || 'Usuario';
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
    showToast(result.error === 'AUTH_REQUIRED' ? 'Entre para vender.' : result.error || 'Não foi possível ativar o modo vendedor.', 'error');
    if (result.error === 'AUTH_REQUIRED') window.location.hash = '#/auth?role=seller';
    return;
  }

  await refreshCurrentProfile();
  showToast('Modo vendedor ativado. Vamos configurar sua loja.', 'success');
  window.location.hash = '#/seller';
}

let activeCategory = 'all';
let searchQuery = '';
let currentView = 'home'; // home | categories | detail | coupons | payment | notifications
let currentPayment = null;
let selectedProduct = null;
let selectedProductImageIndex = 0;
let paymentTimerInterval = null;
let paymentPollInterval = null;
let cachedProducts = null;
let activeInstitution = institution;
let loadedCategories = mockCategories;
let buyerNavFocus = 'home';
let focusCategoriesAfterRender = false;
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

// Intersection Observer for card entrance animation
let observer = null;
let lastSyncedCheckoutRef = null;
const PENDING_CHECKOUT_REF_KEY = 'linka_pending_checkout_ref';
const INST_BANNER_SESSION_KEY = 'linka_inst_banner_hidden';

function getMarketCategories(includeAll = true) {
  const rows = Array.isArray(loadedCategories) && loadedCategories.length ? loadedCategories : mockCategories;
  return includeAll ? rows : rows.filter((category) => category.id !== 'all');
}

function getPaymentRefFromParams(params) {
  return params.get('payment_id')
    || params.get('collection_id')
    || params.get('external_reference')
    || params.get('merchant_order_id')
    || params.get('preference_id');
}

function getCheckoutRefFromHash() {
  const rawHash = window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '';
  const [, queryString = ''] = rawHash.split('?');
  const hashParams = new URLSearchParams(queryString);
  const searchParams = new URLSearchParams(window.location.search || '');
  const urlRef = getPaymentRefFromParams(hashParams) || getPaymentRefFromParams(searchParams);
  if (urlRef) return urlRef;
  return isAuthenticated() ? sessionStorage.getItem(PENDING_CHECKOUT_REF_KEY) : null;
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

function cleanupCheckoutReturnParams({ clearPending = true } = {}) {
  const searchableParams = new URLSearchParams(window.location.search || '');
  ['payment_id', 'collection_id', 'external_reference', 'merchant_order_id', 'preference_id', 'status'].forEach((key) => {
    searchableParams.delete(key);
  });

  const rawHash = window.location.hash.startsWith('#/') ? window.location.hash.slice(2) : '';
  const [hashPath, hashQuery = ''] = rawHash.split('?');
  const hashParams = new URLSearchParams(hashQuery);
  ['payment_id', 'collection_id', 'external_reference', 'merchant_order_id', 'preference_id', 'status'].forEach((key) => {
    hashParams.delete(key);
  });

  const nextSearch = searchableParams.toString();
  const nextHashQuery = hashParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}#/${hashPath || ''}${nextHashQuery ? `?${nextHashQuery}` : ''}`;
  if (clearPending) sessionStorage.removeItem(PENDING_CHECKOUT_REF_KEY);
  window.history.replaceState(null, '', nextUrl);
}

async function syncCheckoutReturnIfNeeded() {
  const paymentRef = getCheckoutRefFromHash();
  if (!paymentRef || paymentRef === lastSyncedCheckoutRef) return null;

  lastSyncedCheckoutRef = paymentRef;
  try {
    const payment = await checkPaymentStatus(paymentRef);
    if (payment?.status === 'paid') {
      if (globalSession?.user?.id) buyerCouponsCache.delete(globalSession.user.id);
      showToast('Pagamento confirmado com sucesso!', 'success');
      currentPayment = null;
      currentView = 'coupons';
      cleanupCheckoutReturnParams();
    }
    return payment;
  } catch (err) {
    if (err?.message === 'AUTH_REQUIRED') {
      sessionStorage.setItem(PENDING_CHECKOUT_REF_KEY, paymentRef);
      lastSyncedCheckoutRef = null;
      cleanupCheckoutReturnParams({ clearPending: false });
      window.location.hash = '#/auth';
      return null;
    }
    console.warn('syncCheckoutReturnIfNeeded failed:', err.message);
    return null;
  }
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
  activeInstitution = USE_MOCKS ? institution : { name: 'Linka', fullName: 'Linka', domain: '', primaryColor: '#2563eb' };
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
  await syncCheckoutReturnIfNeeded();

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
    cachedProducts = cached.products;
    return cached.products;
  }

  if (!force && buyerProductsRequests.has(cacheKey)) {
    return buyerProductsRequests.get(cacheKey);
  }

  const request = getActiveProducts({ categoryId, search })
    .then((rows) => {
      const products = Array.isArray(rows) ? rows : [];
      cachedProducts = products;
      buyerProductsCache.set(cacheKey, { products, loadedAt: Date.now() });
      return products;
    })
    .catch(() => {
      const fallback = cached?.products || (USE_MOCKS ? (cachedProducts || mockProducts) : []);
      buyerProductsCache.set(cacheKey, { products: fallback, loadedAt: Date.now() });
      return fallback;
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
  if (!userId) return USE_MOCKS ? coupons : [];
  const cached = buyerCouponsCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < BUYER_COUPONS_TTL_MS) {
    return cached.coupons;
  }

  const rows = await getBuyerCoupons(userId);
  const normalizedRows = Array.isArray(rows) ? rows : [];
  buyerCouponsCache.set(userId, { coupons: normalizedRows, loadedAt: Date.now() });
  return normalizedRows;
}

function focusCategoriesSection(container) {
  const chips = container.querySelector('.category-scroll');
  if (!chips) return;
  chips.classList.add('category-scroll-highlight');
  chips.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => chips.classList.remove('category-scroll-highlight'), 1100);
}

function openBuyerCategories(container) {
  buyerNavFocus = 'cats';
  currentView = 'categories';
  renderBuyerPage(container);
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
  if (subpage === 'coupons') {
    currentView = 'coupons';
    buyerNavFocus = 'coupons';
  } else if (subpage === 'categories') {
    currentView = 'categories';
    buyerNavFocus = 'cats';
  } else if (subpage === 'profile') {
    currentView = 'profile';
    buyerNavFocus = 'profile';
  } else {
    currentView = 'home';
    buyerNavFocus = 'home';
  }
  renderBuyerPage(container);
}

function bindBottomNav(container) {
  const navItems = container.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'home') {
        buyerNavFocus = 'home';
        currentView = 'home';
        searchQuery = '';
        renderBuyerPage(container);
      } else if (nav === 'cats') {
        openBuyerCategories(container);
      } else if (nav === 'coupons') {
        buyerNavFocus = 'coupons';
        currentView = 'coupons';
        renderBuyerPage(container);
      } else if (nav === 'profile') {
        buyerNavFocus = 'profile';
        currentView = 'profile';
        renderBuyerPage(container);
      }
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
  if (currentView === 'home' && !container.querySelector('.buyer-wrapper')) {
    renderHome(container, { skipFetch: true, loading: true });
    bindBottomNav(container);
  }

  await loadBuyerShellData();

  if (currentView !== 'home' && container.querySelector('.buyer-home-loading')) {
    return renderBuyerPage(container);
  }

  if (currentView === 'home') {
    await renderHome(container);
    initObserver();
    if (focusCategoriesAfterRender) {
      focusCategoriesAfterRender = false;
      requestAnimationFrame(() => focusCategoriesSection(container));
    } else {
      resetAppScroll(container);
    }
  } else if (currentView === 'detail') {
    renderProductDetail(container);
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
  } else if (currentView === 'payment') {
    renderPayment(container);
    resetAppScroll(container);
  } else if (currentView === 'notifications') {
    await renderNotifications(container);
    resetAppScroll(container);
  }

  bindBottomNav(container);
}

function getTimerInfo(expiresIn) {
  const match = expiresIn.match(/(\d+)h/);
  let hours = 24;
  if (match) {
    hours = parseInt(match[1]);
  }
  let colorClass = 'timer-neutral';
  let isCritical = false;
  if (hours < 2) {
    colorClass = 'timer-critical';
    isCritical = true;
  } else if (hours <= 12) {
    colorClass = 'timer-amber';
  }
  return { text: `Expira em ${expiresIn}`, colorClass, isCritical };
}

function getSlotsInfo(used, total) {
  const percent = (used / total) * 100;
  const available = total - used;
  let colorClass = 'slots-green';
  if (available / total < 0.3) {
    colorClass = 'slots-red';
  } else if (available / total <= 0.6) {
    colorClass = 'slots-amber';
  }
  return { percent, colorClass, text: `${available} de ${total} vagas`, almostEmpty: available === 1 };
}

function renderEmptyProductsState() {
  const isSeller = canUseSellerMode();
  return `
    <div class="market-empty-state">
      <div class="market-empty-icon">${icons.package}</div>
      <h3>Nenhuma oferta disponível ainda</h3>
      <p>${isSeller
        ? 'Você está no modo compra. Abra seu painel de vendedor para cadastrar e acompanhar seus produtos.'
        : 'Se você quer vender, ative o modo vendedor e cadastre o primeiro produto da instituição.'}</p>
      <div class="market-empty-actions">
        <button class="btn-primary" id="btnEmptySellerFlow">${isSeller ? 'Abrir painel de vendas' : 'Quero vender no Linka'}</button>
        ${!isAuthenticated() ? `<button class="btn-details" id="btnEmptyLogin">Entrar para comprar</button>` : ''}
      </div>
    </div>
  `;
}

async function renderHome(container, { skipFetch = false, loading = false } = {}) {
  // Load products from Supabase (or mock fallback)
  let products;
  if (skipFetch) {
    products = cachedProducts || (USE_MOCKS ? mockProducts : []);
  } else {
    products = await loadBuyerProducts({ categoryId: activeCategory, search: searchQuery });
  }

  if (!products || products.length === 0) {
    products = USE_MOCKS ? (cachedProducts || mockProducts) : [];
  }

  const filteredProducts = products;
  const user = getUser();
  const showSellerAccess = isAuthenticated();
  const greetingName = isAuthenticated()
    ? (user.name || user.fullName || 'usuario').split(' ')[0]
    : 'visitante';

  container.innerHTML = `
    <div class="page buyer-page buyer-wrapper">
      <!-- HEADER -->
      <header class="buyer-header">
        <div class="buyer-header-top">
          <div class="buyer-greeting">
            <h1>Olá, ${escapeHTML(greetingName)}</h1>
            <div class="inst-badge">${escapeHTML(activeInstitution.name)}</div>
          </div>
          <div class="buyer-actions">
            ${showSellerAccess ? `
              <button class="buyer-mode-btn" id="btnSellerMode" title="${canUseSellerMode() ? 'Abrir painel de vendas' : 'Ativar modo vendedor'}">
                ${icons.package}
                <span>Vender</span>
              </button>
            ` : `
              <button class="buyer-mode-btn" id="btnLoginHeader" title="Entrar">
                ${icons.user}
                <span>Entrar</span>
              </button>
            `}
            <button class="icon-btn notification-btn" id="btnNotifications">
              ${icons.bell}
              ${isAuthenticated() ? '<span class="badge" id="notifBadge">0</span>' : ''}
            </button>
            ${isAuthenticated() ? `<div class="user-avatar">${escapeHTML(user.avatar || 'U')}</div>` : ''}
          </div>
        </div>
        <div class="search-bar">
          ${icons.search}
          <input type="text" placeholder="Buscar ofertas, categorias..." id="searchInput" value="${escapeHTML(searchQuery)}" />
        </div>
        
        <!-- CATEGORY CHIPS (Now in header for stickiness) -->
        <div class="category-scroll">
          <div class="category-chips">
            ${getMarketCategories().map(c => `
              <button class="chip ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
                ${icons[c.id] || icons.others}
                <span>${escapeHTML(c.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </header>

      ${shouldShowInstitutionBanner() ? `
        <div class="inst-banner" style="margin-top: 16px;">
          <div class="banner-icon">${icons.shield}</div>
          <div class="banner-text">
            <strong>Ofertas verificadas</strong>
            <span>Você compra com vendedores da sua instituição. O aviso sai sozinho em alguns segundos.</span>
          </div>
          <button class="inst-banner-close" id="btnHideInstBanner" type="button" aria-label="Ocultar aviso">${icons.x}</button>
        </div>
      ` : ''}

      <div class="list-header">
        <div class="section-divider"></div>
        <div class="offers-count">${filteredProducts.length} ofertas disponíveis</div>
      </div>

      <!-- PRODUCTS LIST -->
      <div class="products-list ${loading ? 'buyer-home-loading' : ''}">
        ${loading && filteredProducts.length === 0 ? renderProductSkeletons() : filteredProducts.length === 0 ? renderEmptyProductsState() : filteredProducts.map(p => {
          const catName = getMarketCategories().find(c => c.id === p.category)?.name || 'Outros';
          const catIcon = icons[p.category] || icons.others;
          const timer = getTimerInfo(p.expiresIn);
          const slots = getSlotsInfo(p.slots.used, p.slots.total);
          const isSoldOut = p.slots.used >= p.slots.total;
          
          return `
          <div class="product-card ${isSoldOut ? 'sold-out' : ''}" data-product-card="${p.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${escapeHTML(p.title)}" style="cursor:pointer;">
            <div class="card-image-area">
              ${getProductImage(p.images?.[0], 400, 160, p.category)}
              <div class="cat-badge">${catIcon} ${escapeHTML(catName)}</div>
              ${isSoldOut 
                ? `<div class="discount-badge soldout-badge">ESGOTADO</div>`
                : `<div class="discount-badge">-${p.discount}%</div>`
              }
            </div>
            
            <div class="card-body">
              <h3 class="card-title">${escapeHTML(p.title)}</h3>
              <p class="card-desc">${escapeHTML(p.description || 'Aproveite esta oferta imperdível e garanta o seu produto com desconto exclusivo.')}</p>

              <div class="card-price-row">
                <span class="price-discount">${formatCurrency(p.discountPrice)}</span>
                <span class="price-original">${formatCurrency(p.originalPrice)}</span>
              </div>
              
              <div class="card-timer ${timer.colorClass}">
                <div class="timer-icon ${timer.isCritical ? 'pulse' : ''}">${icons.clock}</div>
                <span>${escapeHTML(timer.text)}</span>
              </div>

              <div class="card-verified-pill">
                ${icons.shield}
                <span>Verificado pela instituição</span>
              </div>

              <div class="card-actions">
                <button class="btn-primary get-coupon-btn" ${isSoldOut ? 'disabled' : ''} data-id="${p.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  Pegar cupom
                </button>
                <button class="btn-details view-details-btn" data-id="${p.id}">
                  Ver detalhes
                </button>
              </div>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
    
    <!-- BOTTOM NAV -->
    <nav class="bottom-nav">
      <div class="bottom-nav-item ${currentView === 'home' && buyerNavFocus !== 'cats' ? 'active' : ''}" data-nav="home">
        ${icons.home}
        <span>Início</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item ${currentView === 'home' && buyerNavFocus === 'cats' ? 'active' : ''}" data-nav="cats">
        ${icons.grid}
        <span>Categorias</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item ${currentView === 'coupons' ? 'active' : ''}" data-nav="coupons">
        ${icons.ticket}
        <span>Cupons</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="profile">
        ${icons.user}
        <span>Perfil</span>
        <div class="nav-indicator"></div>
      </div>
    </nav>
  `;

  // Animate progress bars after render
  setTimeout(() => {
    container.querySelectorAll('.slots-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target;
    });
  }, 100);

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

  // Notification button
  container.querySelector('#btnNotifications')?.addEventListener('click', () => {
    if (!isAuthenticated()) {
      showToast('Entre para ver suas notificações.', 'info');
      window.location.hash = '#/auth';
      return;
    }
    currentView = 'notifications';
    renderBuyerPage(container);
  });

  container.querySelector('#btnSellerMode')?.addEventListener('click', openSellerFlow);
  container.querySelector('#btnEmptySellerFlow')?.addEventListener('click', openSellerFlow);
  container.querySelector('#btnLoginHeader')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });
  container.querySelector('#btnEmptyLogin')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
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
  if (!userId) {
    const badge = container.querySelector('#notifBadge');
    if (badge) badge.style.display = 'none';
  } else {
    loadUnreadCount(userId).then(count => {
      const badge = container.querySelector('#notifBadge');
      if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
    }).catch(() => {});
  }

  // Category clicks
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const list = container.querySelector('.products-list');
      buyerNavFocus = chip.dataset.cat === 'all' ? 'home' : 'cats';
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

  // Get coupon
  container.querySelectorAll('.get-coupon-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!btn.disabled) {
        const productId = btn.dataset.id;
        const product = filteredProducts.find(p => p.id == productId);
        if (product) showPaymentSelectionModal(product, container);
      }
    });
  });

  // View details - now opens product detail page
  container.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      openProductDetail(btn.dataset.id, container);
    });
  });

  container.querySelectorAll('[data-product-card]').forEach(card => {
    const open = () => openProductDetail(card.dataset.productCard, container);
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
  const categories = getMarketCategories(false);
  const totalOffers = allProducts.length;
  const stats = categories.map((category) => {
    const categoryProducts = allProducts.filter(product => product.category === category.id);
    const bestDeal = categoryProducts.reduce((best, product) => {
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
  const featured = [...stats].sort((a, b) => b.count - a.count).slice(0, 3);

  container.innerHTML = `
    <div class="page buyer-page buyer-wrapper buyer-categories-page">
      <header class="buyer-header buyer-categories-header">
        <div class="buyer-header-top">
          <div class="buyer-greeting">
            <span class="buyer-kicker">Explorar</span>
            <h1>Categorias</h1>
            <div class="inst-badge">${escapeHTML(activeInstitution.name)}</div>
          </div>
          <button class="buyer-mode-btn" id="btnBackBuyerHome" type="button">
            ${icons.home}
            <span>Início</span>
          </button>
        </div>
        <button class="category-search-shortcut" id="btnFocusSearchFromCategories" type="button">
          ${icons.search}
          <span>Buscar oferta específica</span>
        </button>
      </header>

      <section class="category-spotlight">
        <div>
          <span class="buyer-kicker">Vitrine ativa</span>
          <h2>${totalOffers} ofertas verificadas</h2>
          <p>Escolha uma área para ver apenas produtos e serviços daquela categoria.</p>
        </div>
        <button type="button" class="category-spotlight-action" data-open-category="all">Ver tudo</button>
      </section>

      <section class="category-section">
        <div class="category-section-heading">
          <h2>Mais movimentadas</h2>
          <span>Toque para filtrar</span>
        </div>
        <div class="category-featured-row">
          ${featured.map(category => `
            <button class="category-featured-card" type="button" data-open-category="${escapeHTML(category.id)}">
              <span class="category-featured-icon">${icons[category.id] || icons.others}</span>
              <strong>${escapeHTML(category.name)}</strong>
              <small>${category.count} ${category.count === 1 ? 'oferta' : 'ofertas'}</small>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="category-section">
        <div class="category-section-heading">
          <h2>Todas as categorias</h2>
          <span>Estilo iFood, direto ao ponto</span>
        </div>
        <div class="category-app-grid">
          ${stats.map(category => `
            <button class="category-app-card ${category.count === 0 ? 'empty' : ''}" type="button" data-open-category="${escapeHTML(category.id)}">
              <div class="category-app-image">
                ${category.sample
                  ? getProductImage(category.sample.images?.[0], 240, 130, category.id)
                  : `<div class="category-app-placeholder">${icons[category.id] || icons.others}</div>`}
                ${category.bestDeal ? `<span class="category-deal-pill">Até -${Number(category.bestDeal.discount || 0)}%</span>` : ''}
              </div>
              <div class="category-app-copy">
                <span class="category-app-icon">${icons[category.id] || icons.others}</span>
                <div>
                  <strong>${escapeHTML(category.name)}</strong>
                  <small>${category.count ? `${category.count} ofertas ativas` : 'Sem ofertas agora'}</small>
                </div>
              </div>
            </button>
          `).join('')}
        </div>
      </section>
    </div>

    <nav class="bottom-nav">
      <div class="bottom-nav-item" data-nav="home">
        ${icons.home}
        <span>Início</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item active" data-nav="cats">
        ${icons.grid}
        <span>Categorias</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="coupons">
        ${icons.ticket}
        <span>Cupons</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="profile">
        ${icons.user}
        <span>Perfil</span>
        <div class="nav-indicator"></div>
      </div>
    </nav>
  `;

  container.querySelector('#btnBackBuyerHome')?.addEventListener('click', () => {
    buyerNavFocus = 'home';
    currentView = 'home';
    renderBuyerPage(container);
  });

  container.querySelector('#btnFocusSearchFromCategories')?.addEventListener('click', () => {
    buyerNavFocus = 'home';
    currentView = 'home';
    renderBuyerPage(container).then(() => {
      const input = container.querySelector('#searchInput');
      input?.focus();
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  container.querySelectorAll('[data-open-category]').forEach(button => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.openCategory || 'all';
      searchQuery = '';
      buyerNavFocus = activeCategory === 'all' ? 'home' : 'cats';
      currentView = 'home';
      renderBuyerPage(container);
    });
  });
}

function openProductDetail(productId, container) {
  const product = (cachedProducts || (USE_MOCKS ? mockProducts : [])).find(p => String(p.id) === String(productId));
  if (!product) return;
  selectedProduct = product;
  selectedProductImageIndex = 0;
  currentView = 'detail';
  incrementProductClicks(productId);
  renderBuyerPage(container);
}

function renderProductSkeletons() {
  return Array.from({ length: 6 }, () => `
    <div class="product-card product-card-skeleton" aria-hidden="true">
      <div class="card-image-area skeleton-block"></div>
      <div class="card-body">
        <div class="skeleton-line skeleton-title-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-price"></div>
        <div class="skeleton-actions">
          <div></div>
          <div></div>
        </div>
      </div>
    </div>
  `).join('');
}

function getPaymentUnavailableMessage(message = '') {
  if (message.includes('seller-mp-migration') || message.includes('Banco de pagamentos')) {
    return 'Pagamento ainda não configurado no banco. O administrador precisa rodar a migration de pagamentos no Supabase.';
  }
  if (message.includes('Mercado Pago') || message.includes('vendedor')) {
    return 'Este vendedor ainda precisa conectar o Mercado Pago antes de receber pagamentos.';
  }
  return message || 'Pagamento indisponível para este produto agora.';
}

function showPaymentUnavailableModal(product, container, message) {
  container.querySelector('#paymentSelectionModal')?.remove();
  const modalHTML = `
    <div class="payment-modal-overlay" id="paymentSelectionModal">
      <div class="payment-modal-content">
        <div class="payment-modal-header">
          <h3>Pagamento indisponível</h3>
          <button class="icon-btn close-modal-btn">${icons.plus}</button>
        </div>
        <div class="payment-modal-body">
          <p class="payment-modal-desc">${escapeHTML(getPaymentUnavailableMessage(message))}</p>
          ${product?.seller?.whatsapp ? `
            <a class="btn-payment-option" href="https://wa.me/${encodeURIComponent(product.seller.whatsapp)}?text=Oi! Quero comprar ${encodeURIComponent(product.title)}, mas o pagamento ainda não está disponível." target="_blank" rel="noopener">
              ${icons.whatsapp}
              <span>Falar com vendedor</span>
              <small>Avise para conectar o Mercado Pago</small>
            </a>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', modalHTML);
  const modal = document.getElementById('paymentSelectionModal');
  setTimeout(() => modal.classList.add('visible'), 10);
  modal.querySelector('.close-modal-btn').addEventListener('click', () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  });
}

function showLoginRequiredModal(product, container) {
  container.querySelector('#paymentSelectionModal')?.remove();
  const modalHTML = `
    <div class="payment-modal-overlay" id="paymentSelectionModal">
      <div class="payment-modal-content login-required-modal">
        <div class="payment-modal-header">
          <h3>Entre para comprar</h3>
          <button class="icon-btn close-modal-btn">${icons.plus}</button>
        </div>
        <div class="payment-modal-body">
          <p class="payment-modal-desc">Para gerar Pix, pagar com cartão e receber seu cupom, acesse ou crie sua conta Linka.</p>
          <div class="login-required-product">
            <strong>${escapeHTML(product.title)}</strong>
            <span>${formatCurrency(product.discountPrice)}</span>
          </div>
          <button class="btn-payment-option primary-option" id="btnLoginToBuy">
            ${icons.user}
            <span>Entrar e continuar</span>
            <small>Leva menos de um minuto</small>
          </button>
          <button class="btn-payment-option" id="btnKeepViewingProduct">
            ${icons.eye}
            <span>Ver detalhes do produto</span>
            <small>Fotos, descricao e vendedor</small>
          </button>
        </div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', modalHTML);
  const modal = document.getElementById('paymentSelectionModal');
  setTimeout(() => modal.classList.add('visible'), 10);

  const close = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('.close-modal-btn').addEventListener('click', close);
  modal.querySelector('#btnLoginToBuy').addEventListener('click', () => {
    close();
    window.location.hash = '#/auth';
  });
  modal.querySelector('#btnKeepViewingProduct').addEventListener('click', () => {
    close();
    openProductDetail(product.id, container);
  });
}

async function showPaymentSelectionModal(product, container) {
  if (!isAuthenticated()) {
    showLoginRequiredModal(product, container);
    return;
  }

  const readiness = await checkProductPaymentReady(product.id);
  if (!readiness.ready) {
    showPaymentUnavailableModal(product, container, readiness.message);
    return;
  }

  container.querySelector('#paymentSelectionModal')?.remove();
  const modalHTML = `
    <div class="payment-modal-overlay" id="paymentSelectionModal">
      <div class="payment-modal-content">
        <div class="payment-modal-header">
          <h3>Forma de Pagamento</h3>
          <button class="icon-btn close-modal-btn">${icons.plus}</button> <!-- reused plus, will rotate in css -->
        </div>
        <div class="payment-modal-body">
          <p class="payment-modal-desc">Você está comprando <strong>${escapeHTML(product.title)}</strong> por ${formatCurrency(product.discountPrice)}</p>
          <button class="btn-payment-option pix-option" id="btnPayPix">
            ${icons.pix}
            <span>Pagar com Pix</span>
            <small>Aprovação imediata</small>
          </button>
          <button class="btn-payment-option card-option" id="btnPayCard">
            ${icons.wallet || icons.ticket}
            <span>Cartão de Crédito</span>
            <small>Redireciona para o Mercado Pago</small>
          </button>
        </div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('paymentSelectionModal');
  setTimeout(() => modal.classList.add('visible'), 10);

  modal.querySelector('.close-modal-btn').addEventListener('click', () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
  });

  document.getElementById('btnPayPix').addEventListener('click', async () => {
    if (!globalSession?.user?.id) {
      showToast('Faça login para comprar.', 'info');
      window.location.hash = '#/auth';
      return;
    }
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
    currentPayment = { product, method: 'pix' };
    currentView = 'payment';
    renderBuyerPage(container);
  });

  document.getElementById('btnPayCard').addEventListener('click', async () => {
    if (!globalSession?.user?.id) {
      showToast('Faça login para comprar.', 'info');
      window.location.hash = '#/auth';
      return;
    }
    const btn = document.getElementById('btnPayCard');
    btn.innerHTML = `${icons.refresh} <span>Aguarde...</span>`;
    btn.disabled = true;
    try {
      const url = await createCheckoutPreference(product, null, getUser());
      showToast('Redirecionando para o checkout seguro...', 'info');
      window.location.assign(url);
    } catch (err) {
      if (err?.message === 'AUTH_REQUIRED') {
        window.location.hash = '#/auth';
        return;
      }
      showToast(getPaymentUnavailableMessage(err.message), 'error');
      btn.innerHTML = `<span>Tentar novamente</span>`;
      btn.disabled = false;
    }
  });
}

async function renderCoupons(container) {
  // Load coupons from Supabase (or use local mock only in DEV)
  let userCoupons = [];
  const isLoggedIn = isAuthenticated();
  try {
    userCoupons = await loadBuyerCoupons(isLoggedIn ? globalSession.user.id : null);
    if (!userCoupons || userCoupons.length === 0) userCoupons = USE_MOCKS && !isLoggedIn ? coupons : [];
  } catch {
    userCoupons = USE_MOCKS && !isLoggedIn ? coupons : [];
  }

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header page-simple-header">
        <h1>Meus Cupons</h1>
      </header>
      
      <div class="coupons-list">
        ${userCoupons.length === 0 ? `
          <div class="empty-state coupons-empty-state">
            ${icons.ticket}
            <h2>${isLoggedIn ? 'Nenhum cupom ainda' : 'Entre para ver seus cupons'}</h2>
            <p>${isLoggedIn ? 'Ao concluir uma compra, o cupom aparece aqui automaticamente.' : 'Seus cupons reais ficam vinculados à sua conta.'}</p>
            ${!isLoggedIn ? `<button class="btn-primary" id="btnCouponsLogin">Entrar na conta</button>` : ''}
          </div>
        ` : userCoupons.map(c => `
          <div class="coupon-card ${c.status}">
            <div class="coupon-status-bar"></div>
            <div class="coupon-body">
              <div class="coupon-header">
                <h3>${escapeHTML(c.product)}</h3>
                <span class="status-badge ${c.status}">${c.status === 'active' ? 'Ativo' : c.status === 'used' ? 'Usado' : 'Expirado'}</span>
              </div>
              <div class="coupon-code-area">
                <div class="coupon-code">${escapeHTML(c.code)}</div>
                <button class="icon-btn copy-btn" data-code="${c.code}">${icons.copy}</button>
              </div>
              <div class="coupon-footer">
                <div class="seller-info">
                  ${icons.user} <span>${escapeHTML(c.seller)}</span>
                </div>
                ${c.status === 'active' && c.sellerWhatsapp ? `<a href="https://wa.me/${encodeURIComponent(c.sellerWhatsapp)}?text=Oi! Tenho o cupom ${encodeURIComponent(c.code)} para ${encodeURIComponent(c.product)}" target="_blank" class="btn-whatsapp">${icons.whatsapp} WhatsApp</a>` : c.status === 'active' ? `<button class="btn-whatsapp">${icons.whatsapp} WhatsApp</button>` : ''}
              </div>
              ${c.validUntil ? `<div style="font-size:11px;color:#4B5563;margin-top:8px;">Válido até: ${escapeHTML(c.validUntil)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- BOTTOM NAV -->
    <nav class="bottom-nav">
      <div class="bottom-nav-item" data-nav="home">
        ${icons.home}
        <span>Início</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="cats">
        ${icons.grid}
        <span>Categorias</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item active" data-nav="coupons">
        ${icons.ticket}
        <span>Cupons</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="profile">
        ${icons.user}
        <span>Perfil</span>
        <div class="nav-indicator"></div>
      </div>
    </nav>
  `;

  container.querySelector('#btnCouponsLogin')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });

  // Copy coupon code to clipboard
  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          showToast(`Código ${code} copiado!`, 'success');
        });
      }
    });
  });
}

function renderProfileLegacy(container) {
  const user = getUser();
  const isLoggedIn = isAuthenticated();
  const role = getAccountRole();
  const isSeller = ['seller', 'admin'].includes(role);

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header">
        <h1>Meu Perfil</h1>
      </header>
      
      <div class="profile-container" style="padding: 24px 16px;">
        <div style="text-align:center; margin-bottom: 24px;">
           <div class="user-avatar" style="width:80px;height:80px;font-size:32px;margin:0 auto 12px;">${escapeHTML(user.avatar || 'U')}</div>
           <h2 style="font-size:18px;margin:0 0 4px;">${escapeHTML(user.fullName || user.name)}</h2>
           <span style="color:#6B7280;font-size:13px;">${escapeHTML(user.email || '')}</span>
        </div>

        ${!isLoggedIn ? `
          <div style="text-align:center;padding:16px;background:rgba(0,229,160,0.06);border:1px solid rgba(0,229,160,0.2);border-radius:12px;margin-bottom:20px;">
            <p style="color:#9CA3AF;font-size:13px;margin-bottom:12px;">Faça login para salvar seu perfil</p>
            <button class="btn-primary" id="btnGoLogin" style="padding:10px 24px;">Fazer Login</button>
          </div>
        ` : `
          <div class="profile-mode-card">
            <div>
              <strong>${isSeller ? 'Painel de vendas ativo' : 'Modo comprador ativo'}</strong>
              <span>${isSeller ? 'Você pode comprar e também gerenciar produtos.' : 'Ative o modo vendedor para cadastrar produtos.'}</span>
            </div>
            <button class="btn-primary" id="btnProfileSellerFlow">${isSeller ? 'Abrir vendas' : 'Começar a vender'}</button>
          </div>
        `}

        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display:block;font-size:12px;color:#6B7280;margin-bottom:8px;">Nome Completo</label>
          <input type="text" value="${escapeHTML(user.fullName || user.name)}" id="profileName" class="profile-input" style="width:100%;background:#111118;border:1px solid #1E1E2A;border-radius:10px;color:#FFF;padding:12px;font-family:'Plus Jakarta Sans',sans-serif;" />
        </div>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display:block;font-size:12px;color:#6B7280;margin-bottom:8px;">WhatsApp (Para receber cupons)</label>
          <input type="text" value="${escapeHTML(user.whatsapp || '')}" id="profileWhatsapp" class="profile-input" style="width:100%;background:#111118;border:1px solid #1E1E2A;border-radius:10px;color:#FFF;padding:12px;font-family:'Plus Jakarta Sans',sans-serif;" />
        </div>

        <button class="btn-primary" style="width:100%;margin-top:16px;" id="btnSaveProfile">Salvar Dados</button>

        ${isLoggedIn ? `
          <button class="btn-outline" style="width:100%;margin-top:12px;border-color:#E24B4A;color:#E24B4A;padding:12px;border-radius:10px;cursor:pointer;background:transparent;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;" id="btnLogout">Sair da conta</button>
        ` : ''}
      </div>
    </div>
    
    <!-- BOTTOM NAV -->
    <nav class="bottom-nav">
      <div class="bottom-nav-item" data-nav="home">
        ${icons.home}
        <span>Início</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="cats">
        ${icons.grid}
        <span>Categorias</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="coupons">
        ${icons.ticket}
        <span>Cupons</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item active" data-nav="profile">
        ${icons.user}
        <span>Perfil</span>
        <div class="nav-indicator"></div>
      </div>
    </nav>
  `;

  // Save profile to Supabase
  document.getElementById('btnSaveProfile').addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const whatsapp = document.getElementById('profileWhatsapp').value.trim();
    if (!name) { showToast('Preencha seu nome.', 'error'); return; }

    const btn = document.getElementById('btnSaveProfile');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
      if (globalSession?.user?.id) {
        await saveCurrentProfileFields({ name, whatsapp });
      }
      showToast('Perfil atualizado com sucesso!', 'success');
    } catch (err) {
      showToast(err.message || 'Não foi possível atualizar o perfil.', 'error');
    }
    btn.textContent = 'Salvar Dados';
    btn.disabled = false;
  });

  // Login button
  document.getElementById('btnGoLogin')?.addEventListener('click', () => {
    window.location.hash = '#/auth';
  });

  document.getElementById('btnProfileSellerFlow')?.addEventListener('click', openSellerFlow);

  // Logout button
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await signOutUser();
      showToast('Logout realizado!', 'success');
      window.location.hash = '#/';
    } catch {
      window.location.hash = '#/';
    }
  });

}

function getProfileRoleMeta(role) {
  if (role === 'admin') {
    return {
      label: 'Administrador',
      status: 'Acesso total',
      description: 'Controle moderacao, categorias, relatorios e tambem venda produtos.',
    };
  }

  if (role === 'seller') {
    return {
      label: 'Vendedor',
      status: 'Conta de vendas ativa',
      description: 'Cadastre produtos, conecte o Mercado Pago e acompanhe pedidos.',
    };
  }

  return {
    label: 'Comprador',
    status: 'Conta de compras ativa',
    description: 'Explore ofertas, resgate cupons e ative vendas quando quiser vender.',
  };
}

function renderProfileActions(role) {
  const sellerAccess = ['seller', 'admin'].includes(role);

  return `
    <div class="profile-action-grid">
      <button type="button" class="profile-action-card" id="btnOpenBuyerHome">
        <span class="profile-action-icon">${icons.home}</span>
        <span>
          <strong>Vitrine</strong>
          <small>Comprar e pegar cupons</small>
        </span>
      </button>

      ${sellerAccess ? `
        <button type="button" class="profile-action-card" id="btnOpenSellerPanel">
          <span class="profile-action-icon">${icons.wallet}</span>
          <span>
            <strong>Vendas</strong>
            <small>Produtos e Mercado Pago</small>
          </span>
        </button>
      ` : `
        <button type="button" class="profile-action-card profile-action-card--accent" id="btnProfileSellerFlow">
          <span class="profile-action-icon">${icons.plus}</span>
          <span>
            <strong>Começar a vender</strong>
            <small>Ativar painel de vendedor</small>
          </span>
        </button>
      `}

      ${role === 'admin' ? `
        <button type="button" class="profile-action-card profile-action-card--admin" id="btnOpenAdminPanel">
          <span class="profile-action-icon">${icons.shield}</span>
          <span>
            <strong>Admin</strong>
            <small>Moderação e relatórios</small>
          </span>
        </button>
      ` : ''}
    </div>
  `;
}

function renderProfileThemePanel(currentTheme) {
  const isDark = currentTheme === 'dark';
  return `
    <section class="profile-panel profile-theme-panel">
      <div class="profile-panel-heading">
        <div class="profile-panel-icon">${icons.settings}</div>
        <div>
          <h2>Aparência</h2>
          <p>Escolha o tema que fica melhor para ler e usar no celular.</p>
        </div>
      </div>
      <button type="button" class="profile-theme-toggle" id="btnProfileThemeToggle" aria-label="Alternar tema do aplicativo">
        <span class="profile-theme-state">
          <strong>${isDark ? 'Tema escuro ativo' : 'Tema claro ativo'}</strong>
          <small>${isDark ? 'Toque para voltar ao claro' : 'Toque para usar o tema escuro'}</small>
        </span>
        <span class="profile-theme-pill">${isDark ? 'Escuro' : 'Claro'}</span>
      </button>
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
  const whatsappStatus = user.whatsapp ? 'Configurado' : 'Não informado';
  const currentTheme = getCurrentTheme();

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header profile-header page-simple-header">
        <div>
          <span class="profile-kicker">Conta Linka</span>
          <h1>Perfil</h1>
        </div>
        ${isLoggedIn ? `<span class="profile-role-pill">${escapeHTML(roleMeta.label)}</span>` : ''}
      </header>

      <div class="profile-container">
        ${!isLoggedIn ? `
          <section class="profile-panel profile-login-panel">
            <div class="profile-panel-icon">${icons.user}</div>
            <div>
              <h2>Entre para personalizar sua experiência</h2>
              <p>Com uma conta, você salva seus dados, resgata cupons, compra e ativa o modo vendedor.</p>
            </div>
            <button type="button" class="btn-primary" id="btnGoLogin">Entrar na conta</button>
          </section>

          ${renderProfileThemePanel(currentTheme)}
        ` : `
          <section class="profile-hero-panel">
            <div class="profile-avatar-large">${escapeHTML(initials)}</div>
            <div class="profile-identity">
              <div class="profile-status-row">
                <span class="profile-live-dot"></span>
                <span>${escapeHTML(roleMeta.status)}</span>
              </div>
              <h2>${escapeHTML(displayName)}</h2>
              <p>${escapeHTML(email)}</p>
            </div>
          </section>

          <section class="profile-panel profile-account-panel">
            <div class="profile-panel-heading">
              <div class="profile-panel-icon">${icons.shield}</div>
              <div>
                <h2>${escapeHTML(roleMeta.label)}</h2>
                <p>${escapeHTML(roleMeta.description)}</p>
              </div>
            </div>
            <div class="profile-metrics-grid">
              <div>
                <span>Instituição</span>
                <strong>${escapeHTML(activeInstitution.name || 'Instituição')}</strong>
              </div>
              <div>
                <span>WhatsApp</span>
                <strong>${escapeHTML(whatsappStatus)}</strong>
              </div>
              <div>
                <span>Conta</span>
                <strong>${user.verified ? 'Verificada' : 'Padrão'}</strong>
              </div>
            </div>
          </section>

          <section class="profile-panel">
            <div class="profile-panel-heading">
              <div class="profile-panel-icon">${icons.grid}</div>
              <div>
                <h2>Acessos rápidos</h2>
                <p>Entre direto no fluxo certo para sua conta.</p>
              </div>
            </div>
            ${renderProfileActions(role)}
          </section>

          ${renderProfileThemePanel(currentTheme)}

          <section class="profile-panel">
            <div class="profile-panel-heading">
              <div class="profile-panel-icon">${icons.settings}</div>
              <div>
                <h2>Dados do perfil</h2>
                <p>Essas informações aparecem em compras, cupons e contatos.</p>
              </div>
            </div>

            <div class="profile-form-grid">
              <label class="profile-field" for="profileName">
                <span>Nome completo</span>
                <input type="text" value="${escapeHTML(displayName)}" id="profileName" class="profile-input" autocomplete="name" />
              </label>

              <label class="profile-field" for="profileWhatsapp">
                <span>WhatsApp</span>
                <input type="tel" value="${escapeHTML(user.whatsapp || '')}" id="profileWhatsapp" class="profile-input" autocomplete="tel" inputmode="tel" placeholder="(00) 00000-0000" />
              </label>
            </div>

            <button type="button" class="btn-primary profile-save-btn" id="btnSaveProfile">${icons.check} Salvar dados</button>
          </section>

          <section class="profile-panel profile-session-panel">
            <div>
              <h2>Sessão</h2>
              <p>Saia desta conta neste navegador.</p>
            </div>
            <button type="button" class="profile-logout-btn" id="btnLogout">Sair da conta</button>
          </section>
        `}
      </div>
    </div>

    <nav class="bottom-nav">
      <div class="bottom-nav-item" data-nav="home">
        ${icons.home}
        <span>Início</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="cats">
        ${icons.grid}
        <span>Categorias</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="coupons">
        ${icons.ticket}
        <span>Cupons</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item active" data-nav="profile">
        ${icons.user}
        <span>Perfil</span>
        <div class="nav-indicator"></div>
      </div>
    </nav>
  `;

  document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const whatsapp = document.getElementById('profileWhatsapp').value.trim();
    if (!name) { showToast('Preencha seu nome.', 'error'); return; }

    const btn = document.getElementById('btnSaveProfile');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
      if (globalSession?.user?.id) {
        await saveCurrentProfileFields({ name, whatsapp });
      }
      showToast('Perfil atualizado com sucesso!', 'success');
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
    currentView = 'home';
    renderBuyerPage(container);
  });
  document.getElementById('btnProfileThemeToggle')?.addEventListener('click', () => {
    const theme = toggleAppTheme();
    showToast(theme === 'dark' ? 'Tema escuro ativado.' : 'Tema claro ativado.', 'success');
    renderProfile(container);
  });

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
      await signOutUser();
      showToast('Logout realizado!', 'success');
      window.location.hash = '#/';
    } catch {
      window.location.hash = '#/';
    }
  });

}

function renderPayment(container) {
  if (!currentPayment) {
    currentView = 'home';
    renderBuyerPage(container);
    return;
  }

  const { product, method } = currentPayment;

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header" style="display:flex;align-items:center;gap:12px;">
        <button class="icon-btn" id="btnBackHome" style="color:#FFF;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <h1>Pagamento</h1>
      </header>

      <div class="payment-container" style="padding: 24px 16px; text-align:center;">
        <h2 style="font-size:18px;margin-bottom:8px;">Finalizar via Pix</h2>
        <p class="payment-pix-summary">Valor: <strong>${formatCurrency(product.discountPrice)}</strong></p>
        
        <div id="pixContainer" class="payment-pix-card">
          <div class="payment-pix-loading">
            ${icons.loader}
            <span style="font-size:14px;font-weight:600;display:block;margin-top:8px;">Gerando código Pix...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnBackHome').addEventListener('click', () => {
    if (paymentPollInterval) clearInterval(paymentPollInterval);
    currentView = 'home';
    renderBuyerPage(container);
  });

  // Start Pix generation
  initPixFlow(product, container);
}

async function initPixFlow(product, container) {
  try {
    const pixData = await createPixPayment(product, null, getUser());
    
    // #pixContainer lives inside #modal-root, NOT inside `container`
    const pixContainer = document.getElementById('pixContainer');
    if (!pixContainer) return;

    pixContainer.innerHTML = `
      <div class="pix-qr-shell">
        ${pixData.qrCodeSVG}
      </div>
      <p class="pix-expiry-note">Código expira em 10 minutos</p>
      <button class="btn-outline pix-copy-action" id="btnCopyPix">
        Copiar código Pix
      </button>
      <div id="pixStatusMsg" class="pix-status-message">Aguardando pagamento...</div>
    `;

    document.getElementById('btnCopyPix')?.addEventListener('click', () => {
      navigator.clipboard.writeText(pixData.qrCodeString).catch(() => {});
      showToast('Código Pix copiado!', 'success');
    });

    // Start polling
    let attempts = 0;
    paymentPollInterval = setInterval(async () => {
      attempts++;
      const statusMsg = document.getElementById('pixStatusMsg');

      try {
        const statusData = await checkPaymentStatus(pixData.id);
        if (statusData && statusData.status === 'paid') {
          clearInterval(paymentPollInterval);
          await handlePaymentApproved(statusData, product, container);
          return;
        }
      } catch {
        // Keep polling
      }

      // Update UI every poll
      if (statusMsg && attempts % 2 === 0) {
        const dots = '.'.repeat((attempts / 2) % 4);
        statusMsg.textContent = `Aguardando pagamento${dots}`;
      }

      // Timeout after 60 attempts (2 min)
      if (attempts >= 60) {
        clearInterval(paymentPollInterval);
        showToast('Tempo esgotado. Verifique seus cupons.', 'error');
      }
    }, 2000);

  } catch (err) {
    if (err?.message === 'AUTH_REQUIRED') {
      window.location.hash = '#/auth';
      return;
    }
    const pixContainer = document.getElementById('pixContainer');
    if (pixContainer) {
      pixContainer.innerHTML = `
        <div class="pix-error-state">
          <p class="pix-error-title">Não foi possível gerar o Pix</p>
          <p class="pix-error-message">${escapeHTML(getPaymentUnavailableMessage(err.message))}</p>
          <button class="btn-primary" id="btnBackAfterPixError" style="padding:10px 18px;">Voltar para ofertas</button>
        </div>
      `;
      document.getElementById('btnBackAfterPixError')?.addEventListener('click', () => {
        currentView = 'home';
        renderBuyerPage(container);
      });
    }
  }
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
    if (!p) { currentView = 'home'; renderBuyerPage(container); return; }

    const catName = getMarketCategories().find(c => c.id === p.category)?.name || 'Outros';
    const timer = getTimerInfo(p.expiresIn || '24h 00min');
    const isSoldOut = (p.slots?.used || 0) >= (p.slots?.total || 5);
    const sellerInitials = p.seller?.avatar || p.seller?.name?.split(' ').map(n => n[0]).join('').slice(0,2) || '??';
    const images = Array.isArray(p.images) && p.images.length > 0 ? p.images : [];
    selectedProductImageIndex = Math.min(Math.max(selectedProductImageIndex, 0), Math.max(images.length - 1, 0));
    const institutionName = activeInstitution?.fullName || activeInstitution?.name || 'sua instituicao';
    const sellerSubtitle = [p.seller?.course, p.seller?.semester].filter(Boolean).join(' - ') || `Vendedor da ${activeInstitution?.name || 'instituicao'}`;
    const whatsappDigits = String(p.seller?.whatsapp || '').replace(/\D/g, '');
    const productPublishedAt = p.createdAt
      ? new Date(p.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      : '';

    container.innerHTML = `
      <div class="buyer-wrapper">
        <header class="buyer-header minimal-header detail-header">
          <button class="icon-btn" id="btnBackHome" aria-label="Voltar para ofertas">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <h1>Detalhes</h1>
        </header>

        <div class="detail-container product-detail-v2">
          <section class="detail-gallery-shell">
            <div class="detail-carousel" id="detailCarousel" aria-label="Fotos do produto" tabindex="0">
              ${(images.length ? images : ['']).map((image, index) => `
                <button type="button" class="detail-carousel-slide" data-photo-index="${index}" aria-label="Abrir foto ${index + 1}">
                  ${getProductImage(image, 840, 520, p.category)}
                </button>
              `).join('')}
            </div>
            <div class="cat-badge detail-category-badge">${icons[p.category] || icons.others} ${escapeHTML(catName)}</div>
            ${isSoldOut
              ? '<div class="discount-badge soldout-badge detail-discount-badge">ESGOTADO</div>'
              : `<div class="discount-badge detail-discount-badge">-${p.discount}%</div>`
            }
            ${images.length > 1 ? `
              <div class="detail-gallery-dots" id="detailGalleryDots" aria-hidden="true">
                ${images.map((_, index) => `<span class="${index === selectedProductImageIndex ? 'active' : ''}" data-gallery-dot="${index}"></span>`).join('')}
              </div>
              <div class="detail-gallery-hint">Arraste para ver mais fotos</div>
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

          <section class="detail-main-card">
            <div class="detail-title-row">
              <div>
                <h2>${escapeHTML(p.title)}</h2>
                <p>${escapeHTML(p.description || 'Aproveite esta oferta verificada pela sua instituicao.')}</p>
              </div>
            </div>

            <div class="detail-price-row">
              <span class="detail-price-current">${formatCurrency(p.discountPrice)}</span>
              <span class="detail-price-original">${formatCurrency(p.originalPrice)}</span>
              <span class="detail-price-discount">-${p.discount}%</span>
            </div>

            <div class="detail-trust-grid">
              <div class="detail-info-pill card-timer ${timer.colorClass}">
                <div class="timer-icon ${timer.isCritical ? 'pulse' : ''}">${icons.clock}</div>
                <span>${escapeHTML(timer.text)}</span>
              </div>
              <div class="detail-info-pill detail-verified-pill">
                ${icons.shield}
                <span>Verificado pela instituição</span>
              </div>
            </div>
          </section>

          <section class="seller-detail-card-v2">
            <div class="seller-detail-head">
              <div class="user-avatar seller-detail-avatar">${escapeHTML(sellerInitials)}</div>
              <div>
                <div class="seller-detail-name">${escapeHTML(p.seller?.name || 'Vendedor')}</div>
                <div class="seller-detail-subtitle">${escapeHTML(sellerSubtitle)}</div>
              </div>
            </div>

            <div class="seller-detail-facts">
              <div>
                ${icons.shield}
                <span>Anúncio aprovado pela ${escapeHTML(activeInstitution?.name || 'instituição')}</span>
              </div>
              <div>
                ${icons.whatsapp}
                <span>${whatsappDigits ? 'Contato direto pelo WhatsApp' : 'Contato liberado apos compra'}</span>
              </div>
              <div>
                ${icons.tag}
                <span>${escapeHTML(catName)}${productPublishedAt ? ` - publicado em ${escapeHTML(productPublishedAt)}` : ''}</span>
              </div>
            </div>

            <div class="institution-proof-card">
              <div class="institution-proof-icon">${icons.checkCircle}</div>
              <div>
                <strong>Selo institucional</strong>
                <span>Oferta revisada para compradores da ${escapeHTML(institutionName)}.</span>
              </div>
            </div>

            ${whatsappDigits ? `
              <a href="https://wa.me/${encodeURIComponent(whatsappDigits)}?text=Oi! Vi seu anuncio '${encodeURIComponent(p.title)}' no Linka." target="_blank" rel="noopener" class="btn-whatsapp seller-whatsapp-button">
                ${icons.whatsapp} Conversar no WhatsApp
              </a>
            ` : ''}
          </section>

          <button class="btn-primary detail-buy-button" id="btnBuyDetail" ${isSoldOut ? 'disabled' : ''}>
            ${isSoldOut ? 'Esgotado' : `${icons.ticket} Comprar por ${formatCurrency(p.discountPrice)}`}
          </button>
        </div>
      </div>
    `;

    container.querySelector('#btnBackHome').addEventListener('click', () => {
      currentView = 'home'; selectedProduct = null; renderBuyerPage(container);
    });

    container.querySelector('#btnBuyDetail')?.addEventListener('click', () => {
      if (!isSoldOut) showPaymentSelectionModal(p, container);
    });

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
    return;
  }
}

function showProductImageLightbox(container, product, images, startIndex = 0) {
  let index = startIndex;
  const modalRoot = document.getElementById('modal-root');
  const render = () => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop visible product-lightbox-backdrop" id="product-image-lightbox">
        <div class="product-lightbox-panel">
          <div class="product-lightbox-header">
            <strong>${escapeHTML(product.title)}</strong>
            <button class="icon-btn product-lightbox-close" id="closeLightbox" type="button" aria-label="Fechar">${icons.x}</button>
          </div>
          <div id="lightboxImageFrame" class="product-lightbox-frame">
            ${getProductImage(images[index], 900, 720, product.category)}
            ${images.length > 1 ? `
              <button class="icon-btn product-lightbox-arrow is-prev" id="lightboxPrev" type="button" aria-label="Foto anterior">‹</button>
              <button class="icon-btn product-lightbox-arrow is-next" id="lightboxNext" type="button" aria-label="Próxima foto">›</button>
              <div class="product-lightbox-count">${index + 1}/${images.length}</div>
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

// ─── HELPER: Shared bottom nav binding ──────────────────

function bindBuyerBottomNav(container) {
  bindBottomNav(container);
}

// ─── HELPER: Payment approved handler ───────────────────

async function handlePaymentApproved(pixData, product, container) {
  if (globalSession?.user?.id) buyerCouponsCache.delete(globalSession.user.id);
  showToast('Pagamento Aprovado! Cupom gerado.', 'success');
  setTimeout(() => {
    currentView = 'coupons';
    currentPayment = null;
    renderBuyerPage(container);
  }, 1200);
}

// ─── NOTIFICATIONS PAGE ─────────────────────────────────

async function renderNotifications(container) {
  const userId = globalSession?.user?.id;
  if (!userId) {
    container.innerHTML = `
      <div class="buyer-wrapper">
        <header class="buyer-header minimal-header page-simple-header" style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="icon-btn" id="btnBackFromNotif" style="color:inherit;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <h1>Notificações</h1>
          </div>
        </header>
        <div class="notifications-list">
          <div class="empty-state notifications-empty-state">
            ${icons.bell}
            <h2>Entre para ver suas notificações</h2>
            <p>Alertas de compra, cupons e vendas ficam salvos na sua conta.</p>
            <button class="btn-primary" id="btnNotifLogin">Entrar na conta</button>
          </div>
        </div>
      </div>
      <nav class="bottom-nav">
        <div class="bottom-nav-item" data-nav="home">${icons.home}<span>Início</span><div class="nav-indicator"></div></div>
        <div class="bottom-nav-item" data-nav="cats">${icons.grid}<span>Categorias</span><div class="nav-indicator"></div></div>
        <div class="bottom-nav-item" data-nav="coupons">${icons.ticket}<span>Cupons</span><div class="nav-indicator"></div></div>
        <div class="bottom-nav-item" data-nav="profile">${icons.user}<span>Perfil</span><div class="nav-indicator"></div></div>
      </nav>
    `;
    container.querySelector('#btnBackFromNotif')?.addEventListener('click', () => {
      currentView = 'home'; renderBuyerPage(container);
    });
    container.querySelector('#btnNotifLogin')?.addEventListener('click', () => {
      window.location.hash = '#/auth';
    });
    return;
  }

  const notifs = await getNotifications(userId);
  const typeIcons = { success: icons.checkCircle, warning: icons.alertTriangle, error: icons.x, info: icons.bell };
  const typeColors = { success: '#00E5A0', warning: '#F59E0B', error: '#E24B4A', info: '#6B7280' };

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header page-simple-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="icon-btn" id="btnBackFromNotif" style="color:#FFF;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <h1>Notificações</h1>
        </div>
        <button class="btn-ghost" id="btnMarkAllRead" style="font-size:12px;color:#00E5A0;">Marcar tudo lido</button>
      </header>
      <div class="notifications-list">
        ${notifs.length === 0 ? `
          <div style="text-align:center;padding:60px 20px;color:#6B7280;">
            ${icons.bell}<p style="margin-top:12px;">Nenhuma notificação.</p>
          </div>
        ` : notifs.map(n => `
            <div class="notif-item" style="display:flex;gap:12px;padding:14px;background:${n.read ? 'transparent' : 'rgba(0,229,160,0.04)'};border:1px solid ${n.read ? '#1E1E2A' : 'rgba(0,229,160,0.15)'};border-radius:12px;margin-bottom:8px;cursor:pointer;" data-url="${escapeHTML(n.action_url || '')}">
            <div style="color:${typeColors[n.type] || typeColors.info};flex-shrink:0;margin-top:2px;">${typeIcons[n.type] || typeIcons.info}</div>
            <div>
              <div style="font-weight:${n.read ? '400' : '600'};font-size:14px;margin-bottom:4px;">${escapeHTML(n.title)}</div>
              <div style="font-size:12px;color:#6B7280;">${escapeHTML(n.body || '')}</div>
              <div style="font-size:11px;color:#4B5563;margin-top:4px;">${new Date(n.created_at).toLocaleString('pt-BR')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelector('#btnBackFromNotif').addEventListener('click', () => {
    currentView = 'home'; renderBuyerPage(container);
  });

  container.querySelector('#btnMarkAllRead')?.addEventListener('click', async () => {
    await markAllAsRead(userId);
    unreadCountCache.set(userId, { count: 0, loadedAt: Date.now() });
    showToast('Todas as notificações marcadas como lidas.', 'success');
    renderNotifications(container);
  });

  // Click on notification item — navigate to action_url if set
  container.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url && url.startsWith('#/')) {
        window.location.hash = url;
      }
    });
  });

}
