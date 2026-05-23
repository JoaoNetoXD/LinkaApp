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

const USE_MOCKS = import.meta.env.DEV;
const guestUser = {
  id: null,
  name: 'Visitante',
  fullName: 'Visitante',
  email: '',
  role: 'buyer',
  avatar: 'LK',
  whatsapp: '',
  verified: false,
};

function getInitials(name, fallback = 'LK') {
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
    showToast(result.error === 'AUTH_REQUIRED' ? 'Entre para vender.' : result.error || 'Nao foi possivel ativar o modo vendedor.', 'error');
    if (result.error === 'AUTH_REQUIRED') window.location.hash = '#/auth?role=seller';
    return;
  }

  await refreshCurrentProfile();
  showToast('Modo vendedor ativado. Vamos configurar sua loja.', 'success');
  window.location.hash = '#/seller';
}

let activeCategory = 'all';
let searchQuery = '';
let currentView = 'home'; // home | detail | coupons | payment | notifications
let currentPayment = null;
let selectedProduct = null;
let selectedProductImageIndex = 0;
let paymentTimerInterval = null;
let paymentPollInterval = null;
let cachedProducts = null;
let activeInstitution = institution;
let loadedCategories = mockCategories;

// Intersection Observer for card entrance animation
let observer = null;
let lastSyncedCheckoutRef = null;
const PENDING_CHECKOUT_REF_KEY = 'linka_pending_checkout_ref';

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
    throw new Error('Perfil nao encontrado ou sem permissao para salvar. Entre novamente e tente de novo.');
  }
  await refreshCurrentProfile();
}

export function renderBuyer(container, subpage) {
  if (subpage === 'coupons') {
    currentView = 'coupons';
  } else if (subpage === 'profile') {
    currentView = 'profile';
  } else {
    currentView = 'home';
  }
  renderBuyerPage(container);
}

function bindBottomNav(container) {
  const navItems = container.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'home') {
        currentView = 'home';
        searchQuery = '';
        renderBuyerPage(container);
      } else if (nav === 'cats') {
        if (currentView !== 'home') {
          currentView = 'home';
          renderBuyerPage(container);
        }
        setTimeout(() => {
          const chips = container.querySelector('.category-scroll');
          if (chips) chips.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else if (nav === 'coupons') {
        currentView = 'coupons';
        renderBuyerPage(container);
      } else if (nav === 'profile') {
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

  await Promise.allSettled([
    syncCheckoutReturnIfNeeded(),
    syncInstitutionForUser(),
    syncCategories(),
  ]);

  if (currentView !== 'home' && container.querySelector('.buyer-home-loading')) {
    return renderBuyerPage(container);
  }

  if (currentView === 'home') {
    await renderHome(container);
    initObserver();
  } else if (currentView === 'detail') {
    renderProductDetail(container);
  } else if (currentView === 'coupons') {
    await renderCoupons(container);
  } else if (currentView === 'profile') {
    renderProfile(container);
  } else if (currentView === 'payment') {
    renderPayment(container);
  } else if (currentView === 'notifications') {
    await renderNotifications(container);
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
      <h3>Nenhuma oferta disponivel ainda</h3>
      <p>${isSeller
        ? 'Voce esta no modo compra. Abra seu painel de vendedor para cadastrar e acompanhar seus produtos.'
        : 'Se voce quer vender, ative o modo vendedor e cadastre o primeiro produto da instituicao.'}</p>
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
    try {
      products = await getActiveProducts({ categoryId: activeCategory, search: searchQuery });
      cachedProducts = products;
    } catch {
      products = USE_MOCKS ? (cachedProducts || mockProducts) : [];
    }
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
  const avatarLabel = isAuthenticated() ? (user.avatar || 'U') : 'LK';

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
              <span class="badge" id="notifBadge">0</span>
            </button>
            <div class="user-avatar">${escapeHTML(avatarLabel)}</div>
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

      <!-- INSTITUTION BANNER -->
      <div class="inst-banner" style="margin-top: 16px;">
        <div class="banner-icon">${icons.shield}</div>
        <div class="banner-text">
          <strong>Ofertas verificadas pela sua instituição</strong>
          <span>Pegue o cupom e fale direto pelo WhatsApp</span>
        </div>
      </div>

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
      <div class="bottom-nav-item ${currentView === 'home' ? 'active' : ''}" data-nav="home">
        ${icons.home}
        <span>Início</span>
        <div class="nav-indicator"></div>
      </div>
      <div class="bottom-nav-item" data-nav="cats">
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
      showToast('Entre para ver suas notificacoes.', 'info');
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

  // Load notification badge count
  const userId = globalSession?.user?.id;
  if (!userId) {
    const badge = container.querySelector('#notifBadge');
    if (badge) badge.style.display = 'none';
  } else {
    getUnreadCount(userId).then(count => {
      const badge = container.querySelector('#notifBadge');
      if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
    }).catch(() => {});
  }

  // Category clicks
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const list = container.querySelector('.products-list');
      list.style.opacity = '0';
      list.style.transform = 'scale(0.98)';
      list.style.transition = 'all 0.15s ease-out';
      
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
    return 'Pagamento ainda nao configurado no banco. O administrador precisa rodar a migration de pagamentos no Supabase.';
  }
  if (message.includes('Mercado Pago') || message.includes('vendedor')) {
    return 'Este vendedor ainda precisa conectar o Mercado Pago antes de receber pagamentos.';
  }
  return message || 'Pagamento indisponivel para este produto agora.';
}

function showPaymentUnavailableModal(product, container, message) {
  container.querySelector('#paymentSelectionModal')?.remove();
  const modalHTML = `
    <div class="payment-modal-overlay" id="paymentSelectionModal">
      <div class="payment-modal-content">
        <div class="payment-modal-header">
          <h3>Pagamento indisponivel</h3>
          <button class="icon-btn close-modal-btn">${icons.plus}</button>
        </div>
        <div class="payment-modal-body">
          <p class="payment-modal-desc">${escapeHTML(getPaymentUnavailableMessage(message))}</p>
          ${product?.seller?.whatsapp ? `
            <a class="btn-payment-option" href="https://wa.me/${encodeURIComponent(product.seller.whatsapp)}?text=Oi! Quero comprar ${encodeURIComponent(product.title)}, mas o pagamento ainda nao esta disponivel." target="_blank" rel="noopener">
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
          <p class="payment-modal-desc">Para gerar Pix, pagar com cartao e receber seu cupom, acesse ou crie sua conta Linka.</p>
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
    if (isLoggedIn) {
      userCoupons = await getBuyerCoupons(globalSession.user.id);
    }
    if (!userCoupons || userCoupons.length === 0) userCoupons = USE_MOCKS && !isLoggedIn ? coupons : [];
  } catch {
    userCoupons = USE_MOCKS && !isLoggedIn ? coupons : [];
  }

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header">
        <h1>Meus Cupons</h1>
      </header>
      
      <div class="coupons-list">
        ${userCoupons.length === 0 ? `
          <div class="empty-state coupons-empty-state" style="text-align:center;padding:60px 20px;">
            ${icons.ticket}<p style="margin-top:12px;">${isLoggedIn ? 'Voce ainda nao tem cupons.' : 'Entre para ver seus cupons.'}</p>
            <p style="font-size:12px;">${isLoggedIn ? 'Compre um produto para gerar um cupom.' : 'Seus cupons reais ficam vinculados a sua conta.'}</p>
            ${!isLoggedIn ? `<button class="btn-primary" id="btnCouponsLogin" style="margin-top:16px;">Entrar agora</button>` : ''}
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

  // Bind Bottom Nav (reuse same handler)
  bindBuyerBottomNav(container);

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
              <span>${isSeller ? 'Voce pode comprar e tambem gerenciar produtos.' : 'Ative o modo vendedor para cadastrar produtos.'}</span>
            </div>
            <button class="btn-primary" id="btnProfileSellerFlow">${isSeller ? 'Abrir vendas' : 'Comecar a vender'}</button>
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
          <button class="btn-outline" style="width:100%;margin-top:12px;border-color:#E24B4A;color:#E24B4A;padding:12px;border-radius:10px;cursor:pointer;background:transparent;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:600;" id="btnLogout">Sair da Conta</button>
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

  bindBuyerBottomNav(container);
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
    description: 'Explore ofertas, salve cupons e ative vendas quando quiser vender.',
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
            <strong>Comecar a vender</strong>
            <small>Ativar painel de vendedor</small>
          </span>
        </button>
      `}

      ${role === 'admin' ? `
        <button type="button" class="profile-action-card profile-action-card--admin" id="btnOpenAdminPanel">
          <span class="profile-action-icon">${icons.shield}</span>
          <span>
            <strong>Admin</strong>
            <small>Moderacao e relatorios</small>
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
          <h2>Aparencia</h2>
          <p>Escolha o tema que fica melhor para ler e usar no celular.</p>
        </div>
      </div>
      <button type="button" class="profile-theme-toggle" id="btnProfileThemeToggle" aria-label="Alternar tema do aplicativo">
        <span class="profile-theme-state">
          <strong>${isDark ? 'Tema black ativo' : 'Tema claro ativo'}</strong>
          <small>${isDark ? 'Toque para voltar ao claro' : 'Toque para usar o black'}</small>
        </span>
        <span class="profile-theme-pill">${isDark ? 'Black' : 'Claro'}</span>
      </button>
    </section>
  `;
}

function renderProfile(container) {
  const user = getUser();
  const isLoggedIn = isAuthenticated();
  const role = getAccountRole();
  const roleMeta = getProfileRoleMeta(role);
  const displayName = user.fullName || user.name || 'Usuario';
  const email = user.email || '';
  const initials = user.avatar || displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || 'U';
  const whatsappStatus = user.whatsapp ? 'Configurado' : 'Nao informado';
  const currentTheme = getCurrentTheme();

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header profile-header">
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
              <h2>Entre para personalizar sua experiencia</h2>
              <p>Com uma conta voce salva dados, pega cupons, compra e ativa o modo vendedor.</p>
            </div>
            <button type="button" class="btn-primary" id="btnGoLogin">Fazer login</button>
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
                <span>Instituicao</span>
                <strong>${escapeHTML(activeInstitution.name || 'Instituicao')}</strong>
              </div>
              <div>
                <span>WhatsApp</span>
                <strong>${escapeHTML(whatsappStatus)}</strong>
              </div>
              <div>
                <span>Conta</span>
                <strong>${user.verified ? 'Verificada' : 'Padrao'}</strong>
              </div>
            </div>
          </section>

          <section class="profile-panel">
            <div class="profile-panel-heading">
              <div class="profile-panel-icon">${icons.grid}</div>
              <div>
                <h2>Acessos rapidos</h2>
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
                <p>Essas informacoes aparecem em compras, cupons e contatos.</p>
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
              <h2>Sessao</h2>
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
        <span>Inicio</span>
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
      showToast(err.message || 'Nao foi possivel atualizar o perfil.', 'error');
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
    showToast(theme === 'dark' ? 'Tema black ativado.' : 'Tema claro ativado.', 'success');
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

  bindBuyerBottomNav(container);
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
          <p class="pix-error-title">Nao foi possivel gerar o Pix</p>
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
  const p = selectedProduct;
  if (!p) { currentView = 'home'; renderBuyerPage(container); return; }

  const catName = getMarketCategories().find(c => c.id === p.category)?.name || 'Outros';
  const timer = getTimerInfo(p.expiresIn || '24h 00min');
  const slots = getSlotsInfo(p.slots?.used || 0, p.slots?.total || 5);
  const isSoldOut = (p.slots?.used || 0) >= (p.slots?.total || 5);
  const sellerInitials = p.seller?.avatar || p.seller?.name?.split(' ').map(n => n[0]).join('').slice(0,2) || '??';
  const images = Array.isArray(p.images) && p.images.length > 0 ? p.images : [];
  selectedProductImageIndex = Math.min(Math.max(selectedProductImageIndex, 0), Math.max(images.length - 1, 0));
  const currentImage = images[selectedProductImageIndex];

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header" style="display:flex;align-items:center;gap:12px;">
        <button class="icon-btn" id="btnBackHome" style="color:#FFF;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <h1>Detalhes</h1>
      </header>

      <div class="detail-container" style="padding:0 16px 120px;">
        <!-- Product Gallery -->
        <div class="detail-image" id="detailImageViewer" style="border-radius:16px;overflow:hidden;height:240px;margin-bottom:10px;position:relative;cursor:${images.length ? 'zoom-in' : 'default'};">
          ${getProductImage(currentImage, 480, 260, p.category)}
          <div class="cat-badge">${icons[p.category] || icons.others} ${escapeHTML(catName)}</div>
          ${isSoldOut
            ? '<div class="discount-badge soldout-badge">ESGOTADO</div>'
            : `<div class="discount-badge">-${p.discount}%</div>`
          }
          ${images.length > 1 ? `
            <button class="icon-btn detail-gallery-arrow" id="btnPrevPhoto" type="button" aria-label="Foto anterior" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.58);color:#fff;">‹</button>
            <button class="icon-btn detail-gallery-arrow" id="btnNextPhoto" type="button" aria-label="Proxima foto" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.58);color:#fff;">›</button>
            <div style="position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:rgba(0,0,0,.62);color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;">${selectedProductImageIndex + 1}/${images.length}</div>
          ` : ''}
        </div>
        ${images.length > 1 ? `
          <div class="detail-thumbnails" style="display:flex;gap:8px;overflow-x:auto;padding:2px 0 18px;margin-bottom:2px;">
            ${images.map((image, index) => `
              <button type="button" class="detail-thumb ${index === selectedProductImageIndex ? 'active' : ''}" data-photo-index="${index}" aria-label="Ver foto ${index + 1}" style="width:64px;height:52px;flex:0 0 auto;border-radius:10px;overflow:hidden;border:2px solid ${index === selectedProductImageIndex ? '#00E5A0' : '#1E1E2A'};background:#111118;padding:0;">
                ${getProductImage(image, 96, 72, p.category)}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <!-- Title & Description -->
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;">${escapeHTML(p.title)}</h2>
        <p style="font-size:14px;color:#9CA3AF;line-height:1.6;margin-bottom:20px;">${escapeHTML(p.description || 'Aproveite esta oferta imperdível.')}</p>

        <!-- Price -->
        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:20px;">
          <span style="font-size:28px;font-weight:800;color:#00E5A0;">${formatCurrency(p.discountPrice)}</span>
          <span style="font-size:16px;color:#6B7280;text-decoration:line-through;">${formatCurrency(p.originalPrice)}</span>
          <span style="background:rgba(0,229,160,0.15);color:#00E5A0;padding:4px 8px;border-radius:6px;font-size:12px;font-weight:700;">-${p.discount}%</span>
        </div>

        <!-- Timer & Slots -->
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <div class="card-timer ${timer.colorClass}" style="flex:1;padding:12px;border-radius:12px;background:#111118;border:1px solid #1E1E2A;">
            <div class="timer-icon ${timer.isCritical ? 'pulse' : ''}">${icons.clock}</div>
            <span>${timer.text}</span>
          </div>
          <div style="flex:1;padding:12px;border-radius:12px;background:#111118;border:1px solid #1E1E2A;display:flex;align-items:center;gap:8px;font-size:13px;color:#9CA3AF;">
            ${icons.ticket} ${slots.text}
          </div>
        </div>

        <!-- Seller Card -->
        <div style="background:#111118;border:1px solid #1E1E2A;border-radius:16px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div class="user-avatar" style="width:44px;height:44px;font-size:16px;">${escapeHTML(sellerInitials)}</div>
            <div>
              <div style="font-weight:600;font-size:15px;">${escapeHTML(p.seller?.name || 'Vendedor')} ${p.seller?.verified ? '<span style="color:#00E5A0;">✓</span>' : ''}</div>
              <div style="font-size:12px;color:#6B7280;">${escapeHTML(p.seller?.course || '')} ${p.seller?.semester ? '· ' + escapeHTML(p.seller.semester) : ''}</div>
            </div>
          </div>
          ${p.seller?.whatsapp ? `
            <a href="https://wa.me/${encodeURIComponent(p.seller.whatsapp)}?text=Oi! Vi seu anúncio '${encodeURIComponent(p.title)}' no Linka!" target="_blank" class="btn-whatsapp" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px;border-radius:10px;background:#25D366;color:#FFF;font-weight:600;font-size:14px;text-decoration:none;border:none;cursor:pointer;">
              ${icons.whatsapp} Conversar no WhatsApp
            </a>
          ` : ''}
        </div>

        <!-- Stats -->
        <div style="display:flex;gap:12px;margin-bottom:24px;">
          <div style="flex:1;text-align:center;background:#111118;border:1px solid #1E1E2A;border-radius:12px;padding:12px;">
            <div style="font-size:20px;font-weight:700;">${p.clicks || 0}</div>
            <div style="font-size:11px;color:#6B7280;">Cliques</div>
          </div>
          <div style="flex:1;text-align:center;background:#111118;border:1px solid #1E1E2A;border-radius:12px;padding:12px;">
            <div style="font-size:20px;font-weight:700;">${p.couponsGenerated || 0}</div>
            <div style="font-size:11px;color:#6B7280;">Cupons</div>
          </div>
          <div style="flex:1;text-align:center;background:#111118;border:1px solid #1E1E2A;border-radius:12px;padding:12px;">
            <div style="font-size:20px;font-weight:700;">${p.couponsUsed || 0}</div>
            <div style="font-size:11px;color:#6B7280;">Usados</div>
          </div>
        </div>

        <!-- Buy Button -->
        <button class="btn-primary" style="width:100%;padding:16px;font-size:16px;font-weight:700;border-radius:14px;" id="btnBuyDetail" ${isSoldOut ? 'disabled' : ''}>
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

  const setPhoto = (nextIndex) => {
    if (!images.length) return;
    selectedProductImageIndex = (nextIndex + images.length) % images.length;
    renderProductDetail(container);
  };

  container.querySelector('#btnPrevPhoto')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setPhoto(selectedProductImageIndex - 1);
  });
  container.querySelector('#btnNextPhoto')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setPhoto(selectedProductImageIndex + 1);
  });
  container.querySelectorAll('[data-photo-index]').forEach(btn => {
    btn.addEventListener('click', () => setPhoto(Number(btn.dataset.photoIndex)));
  });
  const imageViewer = container.querySelector('#detailImageViewer');
  bindSwipeNavigation(imageViewer, () => setPhoto(selectedProductImageIndex + 1), () => setPhoto(selectedProductImageIndex - 1));
  imageViewer?.addEventListener('click', () => {
    if (!images.length) return;
    showProductImageLightbox(container, p, images, selectedProductImageIndex);
  });
}

function showProductImageLightbox(container, product, images, startIndex = 0) {
  let index = startIndex;
  const modalRoot = document.getElementById('modal-root');
  const render = () => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop visible" id="product-image-lightbox" style="background:rgba(0,0,0,.88);">
        <div style="width:min(94vw,720px);max-height:92vh;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;color:#fff;">
            <strong>${escapeHTML(product.title)}</strong>
            <button class="icon-btn" id="closeLightbox" type="button" style="color:#fff;">${icons.plus}</button>
          </div>
          <div id="lightboxImageFrame" style="position:relative;border-radius:16px;overflow:hidden;background:#050508;min-height:280px;max-height:78vh;">
            ${getProductImage(images[index], 900, 720, product.category)}
            ${images.length > 1 ? `
              <button class="icon-btn" id="lightboxPrev" type="button" aria-label="Foto anterior" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.58);color:#fff;">‹</button>
              <button class="icon-btn" id="lightboxNext" type="button" aria-label="Proxima foto" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.58);color:#fff;">›</button>
              <div style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:rgba(0,0,0,.62);color:#fff;padding:5px 12px;border-radius:999px;font-size:12px;">${index + 1}/${images.length}</div>
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
  container.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'home') {
        currentView = 'home'; searchQuery = '';
        renderBuyerPage(container);
      } else if (nav === 'cats') {
        if (currentView !== 'home') { currentView = 'home'; renderBuyerPage(container); }
        setTimeout(() => {
          const chips = container.querySelector('.category-scroll');
          if (chips) chips.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else if (nav === 'coupons') {
        currentView = 'coupons'; renderBuyerPage(container);
      } else if (nav === 'profile') {
        currentView = 'profile'; renderBuyerPage(container);
      }
    });
  });
}

// ─── HELPER: Payment approved handler ───────────────────

async function handlePaymentApproved(pixData, product, container) {
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
        <header class="buyer-header minimal-header" style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="icon-btn" id="btnBackFromNotif" style="color:inherit;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <h1>Notificacoes</h1>
          </div>
        </header>
        <div style="padding:8px 16px 100px;">
          <div class="empty-state" style="text-align:center;padding:60px 20px;">
            ${icons.bell}<p style="margin-top:12px;">Entre para ver suas notificacoes.</p>
            <p style="font-size:12px;">Alertas de compra, cupons e vendas ficam salvos na sua conta.</p>
            <button class="btn-primary" id="btnNotifLogin" style="margin-top:16px;">Entrar agora</button>
          </div>
        </div>
      </div>
      <nav class="bottom-nav">
        <div class="bottom-nav-item" data-nav="home">${icons.home}<span>Inicio</span><div class="nav-indicator"></div></div>
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
    bindBuyerBottomNav(container);
    return;
  }

  const notifs = await getNotifications(userId);
  const typeIcons = { success: icons.checkCircle, warning: icons.alertTriangle, error: icons.x, info: icons.bell };
  const typeColors = { success: '#00E5A0', warning: '#F59E0B', error: '#E24B4A', info: '#6B7280' };

  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="icon-btn" id="btnBackFromNotif" style="color:#FFF;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <h1>Notificações</h1>
        </div>
        <button class="btn-ghost" id="btnMarkAllRead" style="font-size:12px;color:#00E5A0;">Marcar tudo lido</button>
      </header>
      <div style="padding:8px 16px 100px;">
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

  // Bind bottom nav
  bindBuyerBottomNav(container);
}
