import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile, renderBrandLogo } from '../main.js';
import { sellerAds, sellerCoupons, categories as mockCategories, currentUser } from '../data/mock.js';
import { getSellerProducts, createProduct, renewProduct, updateSellerProduct, deleteSellerProduct } from '../services/product-service.js';
import { getSellerCoupons as fetchSellerCoupons, markCouponUsed, validateCoupon } from '../services/coupon-service.js';
import { uploadMultipleImages, compressImage, createPreviewURL } from '../services/storage-service.js';
import { getCategories } from '../services/category-service.js';
import { getCouponCodeCandidates } from '../utils/coupon-code.js';
import { resetAppScroll } from '../utils/scroll.js';

const USE_MOCKS = import.meta.env.DEV;

const ICON_ARROW_LEFT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
const ICON_CHEVRON_RIGHT = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

// Students contact the company here; the buyer profile page owns the WhatsApp field.
const PROFILE_ROUTE = '#/buyer/profile';

// Coupon validity the company can pick, counted from the moment a student retrieves the code.
const COUPON_VALIDITY_OPTIONS = [
  [24, '24 horas'],
  [48, '48 horas'],
  [72, '3 dias'],
  [168, '7 dias'],
  [720, '30 dias'],
];

const OFFER_STATUS = {
  active: { label: 'Ativa', tone: 'success' },
  pending: { label: 'Em aprovação', tone: 'warning' },
  queue: { label: 'Na fila', tone: 'info' },
  expired: { label: 'Expirada', tone: 'neutral' },
  rejected: { label: 'Recusada', tone: 'danger' },
};

// `pending` only exists on codes issued before the coupon-only model; they are never valid.
const COUPON_STATUS = {
  active: { label: 'Ativo', tone: 'info', note: 'Confira na hora da compra. Depois de marcado como usado, o código fica bloqueado.' },
  pending: { label: 'Pendente', tone: 'warning', note: 'Este código não foi liberado e não vale para compra.' },
  used: { label: 'Usado', tone: 'success', note: 'Já usado numa compra e bloqueado contra reuso.' },
  expired: { label: 'Expirado', tone: 'neutral', note: 'Fora do prazo. Não aceite este código.' },
};

// Status label with a semantic tint: success | warning | danger | info | neutral
function renderStatusPill(label, tone = 'neutral') {
  return `<span class="seller-status is-${tone}">${escapeHTML(label)}</span>`;
}

function getOfferStatusMeta(ad) {
  if (ad?.status === 'rejected' && String(ad.rejectionReason || '').startsWith('Ajuste solicitado:')) {
    return { label: 'Ajuste solicitado', tone: 'warning' };
  }
  return OFFER_STATUS[ad?.status] || { label: 'Indefinida', tone: 'neutral' };
}

// Page header recipe: eyebrow + display title (+ optional lede and action).
// `title` may carry static markup (e.g. a .hl span); never pass user data unescaped.
function renderViewHead({ eyebrow, title, text = '', action = '' }) {
  return `
    <header class="seller-view-header canopy canopy--continued">
      <div class="seller-view-copy">
        <p class="t-eyebrow">${eyebrow}</p>
        <h1 class="seller-view-title">${title}</h1>
        ${text ? `<p class="seller-view-text">${text}</p>` : ''}
      </div>
      ${action ? `<div class="seller-view-action">${action}</div>` : ''}
    </header>
  `;
}

// Metric ledger: one card, hairline-divided cells.
function renderLedgerCell({ label, value, caption = '', attrs = '' }) {
  const tag = attrs ? 'button' : 'div';
  return `
    <${tag} class="seller-ledger-cell"${tag === 'button' ? ' type="button"' : ''} ${attrs}>
      <span class="seller-ledger-label">${label}</span>
      <strong class="seller-ledger-value">${value}</strong>
      ${caption ? `<small class="seller-ledger-caption">${caption}</small>` : ''}
    </${tag}>
  `;
}

function renderEmptyState({ icon, title, text, action = '' }) {
  return `
    <div class="seller-empty">
      <span class="seller-empty-icon" aria-hidden="true">${icon}</span>
      <h3>${title}</h3>
      <p>${text}</p>
      ${action ? `<div class="seller-empty-action">${action}</div>` : ''}
    </div>
  `;
}

const guestUser = {
  id: null,
  name: 'Visitante',
  fullName: 'Visitante',
  email: '',
  whatsapp: '',
  avatar: 'V',
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

// Helper to get the current user (real auth or mock)
function getUser() {
  const baseUser = USE_MOCKS ? currentUser : guestUser;

  if (globalProfile) {
    const name = globalProfile.name || globalProfile.full_name || baseUser.name || 'Usuário';
    return {
      ...baseUser,
      ...globalProfile,
      name,
      fullName: name,
      avatar: globalProfile.avatar || getInitials(name),
    };
  }

  if (globalSession?.user) {
    const name = globalSession.user.user_metadata?.full_name || globalSession.user.email?.split('@')[0] || 'Usuário';
    return {
      ...baseUser,
      id: globalSession.user.id,
      email: globalSession.user.email || '',
      name,
      fullName: name,
      whatsapp: globalSession.user.user_metadata?.whatsapp || baseUser.whatsapp || '',
      avatar: getInitials(name, 'U'),
    };
  }
  return baseUser;
}

let sellerView = 'dashboard'; // dashboard | ads | insights | create | edit | coupons
let couponStatusFilter = 'all';
let activeTab = 'active';
let loadedAds = null;
let loadedCoupons = null;
let selectedAdId = null;
let loadedCategories = mockCategories;
let sellerNavFocus = 'dashboard';

const SELLER_SHELL_TTL_MS = 30_000;
const SELLER_DATA_TTL_MS = 20_000;
let sellerShellLoadedAt = 0;
let sellerShellPromise = null;
let sellerShellUserKey = null;
let sellerDataLoadedAt = 0;
let sellerDataPromise = null;
let sellerDataUserKey = null;

function getSellerCategories(includeAll = true) {
  const rows = Array.isArray(loadedCategories) && loadedCategories.length ? loadedCategories : mockCategories;
  return includeAll ? rows : rows.filter((category) => category.id !== 'all');
}

function shouldUseSellerMocks() {
  return USE_MOCKS && !globalSession?.user?.id;
}

function getSellerUserKey(user = getUser()) {
  return globalSession?.user?.id || user.id || 'guest';
}

function invalidateSellerCache({ shell = false, data = true } = {}) {
  if (shell) {
    sellerShellLoadedAt = 0;
    sellerShellPromise = null;
  }
  if (data) {
    sellerDataLoadedAt = 0;
    sellerDataPromise = null;
  }
}

async function loadSellerShellData(user, { force = false } = {}) {
  const userKey = getSellerUserKey(user);
  const fresh = sellerShellUserKey === userKey && Date.now() - sellerShellLoadedAt < SELLER_SHELL_TTL_MS;
  if (!force && fresh) return;
  if (!force && sellerShellPromise) return sellerShellPromise;

  sellerShellUserKey = userKey;
  sellerShellPromise = (async () => {
    await syncSellerCategories();
    sellerShellLoadedAt = Date.now();
  })();

  try {
    await sellerShellPromise;
  } finally {
    sellerShellPromise = null;
  }
}

async function loadSellerMainData(user, { force = false } = {}) {
  const userKey = getSellerUserKey(user);
  const fresh = sellerDataUserKey === userKey && Date.now() - sellerDataLoadedAt < SELLER_DATA_TTL_MS;
  if (!force && fresh && Array.isArray(loadedAds) && Array.isArray(loadedCoupons)) return;
  if (!force && sellerDataPromise) return sellerDataPromise;

  sellerDataUserKey = userKey;
  sellerDataPromise = (async () => {
    const useMocks = shouldUseSellerMocks();
    const sellerId = user.id || currentUser.id;
    const [adsResult, couponsResult] = await Promise.allSettled([
      getSellerProducts(sellerId),
      fetchSellerCoupons(sellerId),
    ]);

    loadedAds = adsResult.status === 'fulfilled' && Array.isArray(adsResult.value)
      ? adsResult.value
      : [];
    loadedCoupons = couponsResult.status === 'fulfilled' && Array.isArray(couponsResult.value)
      ? couponsResult.value
      : [];

    if (loadedAds.length === 0 && useMocks) loadedAds = sellerAds;
    if (loadedCoupons.length === 0 && useMocks) loadedCoupons = sellerCoupons;

    enrichAdsWithCouponStats();
    sellerDataLoadedAt = Date.now();
  })();

  try {
    await sellerDataPromise;
  } finally {
    sellerDataPromise = null;
  }
}

async function syncSellerCategories() {
  try {
    loadedCategories = await getCategories();
  } catch {
    loadedCategories = USE_MOCKS ? mockCategories : [{ id: 'all', name: 'Todos' }];
  }
}

export function renderSeller(container, subpage) {
  if (subpage === 'create') {
    sellerView = 'create';
    sellerNavFocus = 'ads';
  } else if (subpage === 'coupons') {
    sellerView = 'coupons';
    sellerNavFocus = 'coupons';
  } else if (subpage === 'ads') {
    sellerView = 'ads';
    sellerNavFocus = 'ads';
  } else if (subpage === 'insights') {
    sellerView = 'insights';
    sellerNavFocus = 'dashboard';
  } else {
    sellerView = 'dashboard';
    sellerNavFocus = 'dashboard';
  }
  renderSellerPage(container);
}

// Guards async renders: a slow fetch must not paint the seller panel over
// a newer render or over another route the user already navigated to.
let sellerRenderId = 0;

function isSellerRoute() {
  const hash = window.location.hash || '';
  return hash === '#/seller' || hash.startsWith('#/seller/') || hash.startsWith('#/seller?');
}

function renderNavItem(id, icon, label) {
  const isActive = sellerNavFocus === id;
  return `
    <div class="bottom-nav-item ${isActive ? 'active' : ''}" data-nav="${id}" role="button" tabindex="0"${isActive ? ' aria-current="page"' : ''}>
      ${icon}<span>${label}</span>
      <div class="nav-indicator"></div>
    </div>
  `;
}

async function renderSellerPage(container, { force = false } = {}) {
  const renderId = ++sellerRenderId;
  const isStale = () => renderId !== sellerRenderId || !isSellerRoute();
  const user = getUser();
  await loadSellerShellData(user, { force });
  if (isStale()) return;
  const needsMainData = ['dashboard', 'ads', 'insights', 'edit', 'coupons'].includes(sellerView);
  if (needsMainData) {
    await loadSellerMainData(user, { force });
    if (isStale()) return;
  }

  const displayName = user.fullName || user.name || 'Usuário';

  container.innerHTML = `
    <div class="page seller-page">
      <header class="app-header seller-main-header">
        <span class="seller-brand">${renderBrandLogo('wordmark-on-dark', 'brand-logo seller-brand-logo')}</span>
        <div class="seller-header-actions">
          <button class="seller-header-btn is-collapsible" id="open-buyer-mode" type="button" aria-label="Ver vitrine de ofertas">${icons.home}<span>Ver vitrine</span></button>
          <button class="user-avatar seller-avatar" id="open-seller-profile" type="button" aria-label="Abrir perfil de ${escapeHTML(displayName)}">${escapeHTML(user.avatar || 'U')}</button>
        </div>
      </header>

      <div class="app-body seller-body" id="seller-content">
        ${sellerView === 'create'
          ? renderCreateForm()
          : sellerView === 'edit'
            ? renderEditProductForm()
            : sellerView === 'ads'
              ? renderSellerAdsManager()
              : sellerView === 'insights'
                ? renderSellerInsights()
                : sellerView === 'coupons'
                  ? renderSellerCoupons()
                  : renderDashboard()}
      </div>
      <nav class="bottom-nav seller-nav" aria-label="Navegação de Minha empresa">
        ${renderNavItem('dashboard', icons.chart, 'Painel')}
        ${renderNavItem('ads', icons.tag, 'Ofertas')}
        ${renderNavItem('coupons', icons.ticket, 'Cupons')}
      </nav>
    </div>
  `;
  bindSellerEvents(container);
  resetAppScroll(container);
}

function getSellerAdsData() {
  const source = loadedAds || (shouldUseSellerMocks() ? sellerAds : []);
  return source.filter((ad) => !ad.deletedAt);
}

function getSellerCouponData() {
  return loadedCoupons || (shouldUseSellerMocks() ? sellerCoupons : []);
}

function getSellerStatusCounts(ads = getSellerAdsData()) {
  return {
    all: ads.length,
    active: ads.filter(a => a.status === 'active').length,
    pending: ads.filter(a => a.status === 'pending').length,
    queue: ads.filter(a => a.status === 'queue').length,
    expired: ads.filter(a => a.status === 'expired').length,
    rejected: ads.filter(a => a.status === 'rejected').length,
  };
}

function getSellerComputedStats(ads = getSellerAdsData(), coupons = getSellerCouponData()) {
  const statusCounts = getSellerStatusCounts(ads);
  const couponsClaimed = ads.reduce((sum, ad) => sum + (ad.couponsGenerated || 0), 0) || coupons.length;
  const couponsUsed = ads.reduce((sum, ad) => sum + (ad.couponsUsed || 0), 0) || coupons.filter(c => c.status === 'used').length;
  return {
    totalAds: statusCounts.all,
    activeAds: statusCounts.active,
    couponsClaimed,
    couponsUsed,
    totalClicks: ads.reduce((sum, ad) => sum + (ad.clicks || 0), 0),
    // Taxa de uso: coupons used ÷ coupons retrieved. Null until a student retrieves one.
    useRate: couponsClaimed > 0 ? Math.round((couponsUsed / couponsClaimed) * 100) : null,
  };
}

function formatUseRate(rate) {
  return rate === null ? '—' : `${rate}%`;
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getSellerCategoryName(categoryId) {
  return getSellerCategories().find(c => c.id === categoryId)?.name || categoryId || 'Sem categoria';
}

function formatSellerDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function renderSellerStatCard({ icon, value, label, hint, attrs, detail = '', featured = false }) {
  const accessibleLabel = [`${label}: ${value}`, detail, hint].filter(Boolean).join('. ');
  return `
    <button class="stat-card card seller-stat-card${featured ? ' is-featured' : ''}" type="button" ${attrs} aria-label="${escapeHTML(accessibleLabel)}">
      <span class="stat-icon" aria-hidden="true">${icon}</span>
      <span class="stat-info">
        <span class="stat-value">${escapeHTML(String(value))}</span>
        <span class="stat-label">${escapeHTML(label)}</span>
        ${detail ? `<span class="seller-stat-detail">${escapeHTML(detail)}</span>` : ''}
      </span>
      ${hint ? `<span class="seller-stat-hint">${escapeHTML(hint)}${ICON_CHEVRON_RIGHT}</span>` : ''}
    </button>
  `;
}

function renderDashboard() {
  const user = getUser();
  const ads = getSellerAdsData();
  const stats = getSellerComputedStats(ads);
  const firstName = String(user.name || '').trim().split(/\s+/)[0];
  const couponDetail = stats.couponsClaimed > 0
    ? `${pluralize(stats.couponsUsed, 'usado', 'usados')} · ${formatUseRate(stats.useRate)} de uso`
    : 'Nenhum cupom retirado ainda';

  return `
    ${renderViewHead({
      eyebrow: 'Minha empresa',
      title: firstName ? `Olá, <span class="hl">${escapeHTML(firstName)}</span>` : 'Sua <span class="hl">empresa</span>',
      action: `<button class="btn-primary create-ad-cta seller-view-cta" type="button">${icons.plus} Criar oferta</button>`,
    })}

    ${renderSellerOnboarding(ads, user)}

    <section class="seller-section" aria-labelledby="seller-overview-title">
      <div class="seller-section-head">
        <h2 class="seller-section-title" id="seller-overview-title">Visão geral</h2>
      </div>
      <div class="seller-stats-grid">
        ${renderSellerStatCard({
          featured: true,
          icon: icons.ticket,
          value: stats.couponsClaimed,
          label: 'Cupons retirados',
          detail: couponDetail,
          hint: 'Ver cupons',
          attrs: 'data-seller-action="coupons"',
        })}
        ${renderSellerStatCard({ icon: icons.tag, value: stats.activeAds, label: 'Ofertas ativas', hint: 'Gerenciar', attrs: 'data-tab-shortcut="active"' })}
        ${renderSellerStatCard({ icon: icons.eye, value: stats.totalClicks, label: 'Cliques', hint: 'Analisar', attrs: 'data-seller-action="clicks"' })}
      </div>
    </section>

    <section class="seller-section" aria-labelledby="seller-shortcuts-title">
      <div class="seller-section-head">
        <h2 class="seller-section-title" id="seller-shortcuts-title">Atalhos</h2>
      </div>
      <div class="seller-list seller-shortcuts">
        <button class="seller-shortcut" type="button" data-seller-action="ads">
          <span class="seller-shortcut-icon" aria-hidden="true">${icons.tag}</span>
          <span class="seller-shortcut-copy">
            <strong>Gerenciar ofertas</strong>
            <small>Edite, renove ou tire ofertas da vitrine</small>
          </span>
          <span class="seller-shortcut-arrow" aria-hidden="true">${ICON_CHEVRON_RIGHT}</span>
        </button>
        <button class="seller-shortcut" type="button" data-seller-action="clicks">
          <span class="seller-shortcut-icon" aria-hidden="true">${icons.chart}</span>
          <span class="seller-shortcut-copy">
            <strong>Ver análise</strong>
            <small>Cliques, cupons e categorias com mais procura</small>
          </span>
          <span class="seller-shortcut-arrow" aria-hidden="true">${ICON_CHEVRON_RIGHT}</span>
        </button>
      </div>
    </section>
  `;
}

function enrichAdsWithCouponStats() {
  if (!Array.isArray(loadedAds) || !Array.isArray(loadedCoupons)) return;
  const stats = new Map();
  loadedCoupons.forEach((coupon) => {
    if (!coupon.productId) return;
    const current = stats.get(coupon.productId) || { total: 0, used: 0 };
    current.total += 1;
    if (coupon.status === 'used') current.used += 1;
    stats.set(coupon.productId, current);
  });
  loadedAds = loadedAds.map((ad) => {
    const adStats = stats.get(ad.id) || { total: 0, used: 0 };
    return { ...ad, couponsGenerated: adStats.total, couponsUsed: adStats.used };
  });
}

// Setup checklist: contact channel, first offer, approval. Hidden once all three are done.
function renderSellerOnboarding(ads, user = getUser()) {
  const hasWhatsapp = Boolean(String(user.whatsapp || '').trim());
  const hasAds = ads.length > 0;
  const hasActive = ads.some((ad) => ad.status === 'active');
  const pendingCount = ads.filter((ad) => ad.status === 'pending' || ad.status === 'queue').length;
  const hasPending = pendingCount > 0;
  if (hasWhatsapp && hasAds && hasActive) return '';

  const steps = [
    {
      done: hasWhatsapp,
      label: 'WhatsApp para contato',
      state: hasWhatsapp ? 'Os alunos chamam sua empresa por lá' : 'Adicione o número no seu perfil',
      attrs: 'data-seller-action="profile"',
    },
    {
      done: hasAds,
      label: 'Primeira oferta criada',
      state: hasAds ? pluralize(ads.length, 'oferta criada', 'ofertas criadas') : 'Crie sua primeira oferta',
      attrs: hasAds ? 'data-tab-shortcut="all"' : 'data-seller-action="create"',
    },
    {
      done: hasActive,
      label: 'Oferta aprovada na vitrine',
      state: hasActive
        ? 'Na vitrine para os alunos'
        : hasPending
          ? 'Em análise pela equipe Empreende iCEV'
          : hasAds
            ? 'Nenhuma oferta ativa agora'
            : 'Depois da aprovação, ela aparece para os alunos',
      attrs: hasActive
        ? 'data-tab-shortcut="active"'
        : hasPending
          ? 'data-tab-shortcut="pending"'
          : hasAds ? 'data-tab-shortcut="all"' : 'data-seller-action="create"',
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  let title = 'Deixe sua empresa pronta para os alunos';
  let text = 'Os alunos pegam o cupom no app e compram direto com sua empresa, geralmente pelo WhatsApp.';
  if (hasAds && !hasActive && hasPending) {
    title = pendingCount === 1 ? 'Sua oferta está em análise' : 'Suas ofertas estão em análise';
    text = pendingCount === 1
      ? 'Assim que a equipe Empreende iCEV aprovar, ela aparece na vitrine para os alunos.'
      : 'Assim que a equipe Empreende iCEV aprovar, elas aparecem na vitrine para os alunos.';
  } else if (hasAds && !hasActive) {
    title = 'Nenhuma oferta na vitrine agora';
    text = 'Crie uma nova oferta ou renove uma expirada para voltar a aparecer para os alunos.';
  } else if (hasAds && !hasWhatsapp) {
    title = 'Falta o WhatsApp para contato';
    text = 'É por lá que os alunos chamam sua empresa para comprar. Adicione o número no seu perfil.';
  }

  return `
    <section class="seller-setup-card" aria-labelledby="seller-setup-title">
      <div class="seller-setup-copy">
        <p class="t-eyebrow">Primeiros passos · ${doneCount} de 3</p>
        <h2 class="seller-setup-title" id="seller-setup-title">${title}</h2>
        <p class="seller-setup-text">${text}</p>
      </div>
      <div class="progress-bar seller-setup-progress" aria-hidden="true"><div class="progress-fill" style="width:${Math.round((doneCount / 3) * 100)}%"></div></div>
      <ol class="seller-setup-steps">
        ${steps.map((step, index) => `
          <li>
            <button type="button" class="seller-setup-step${step.done ? ' done' : ''}" ${step.attrs}>
              <span class="seller-setup-num" aria-hidden="true">${step.done ? icons.check : index + 1}</span>
              <span class="seller-setup-step-copy">
                <strong>${step.label}<span class="sr-only">${step.done ? ' (concluído)' : ' (pendente)'}</span></strong>
                <small>${step.state}</small>
              </span>
              <span class="seller-setup-step-arrow" aria-hidden="true">${ICON_CHEVRON_RIGHT}</span>
            </button>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
}

function renderAdsByStatus() {
  const ads = getSellerAdsData();
  const filtered = activeTab === 'all' ? ads : ads.filter(a => a.status === activeTab);
  if (ads.length === 0) {
    return renderEmptyState({
      icon: icons.tag,
      title: 'Crie sua primeira oferta',
      text: 'Ela passa por uma aprovação rápida e depois aparece na vitrine para os alunos do iCEV.',
      action: `<button class="btn-secondary new-ad-trigger" type="button">${icons.plus} Criar primeira oferta</button>`,
    });
  }
  if (filtered.length === 0) {
    const messages = {
      all: 'Nenhuma oferta cadastrada',
      active: 'Nenhuma oferta ativa agora',
      pending: 'Nada aguardando aprovação',
      queue: 'Nenhuma oferta na fila',
      expired: 'Nenhuma oferta expirada',
      rejected: 'Nenhuma oferta recusada'
    };
    return renderEmptyState({
      icon: icons.tag,
      title: messages[activeTab],
      text: 'Troque o filtro acima para ver ofertas em outros status.',
    });
  }
  return `<div class="seller-list seller-ad-list">${filtered.map(ad => renderSellerAdCard(ad)).join('')}</div>`;
}

function renderSellerAdsTabs(statusCounts) {
  const tab = (id, label, count) => `
    <button class="tab ${activeTab === id ? 'active' : ''}" type="button" aria-pressed="${activeTab === id}" data-tab="${id}">${label} <span class="tab-count">${count}</span></button>
  `;
  return `
    <div class="seller-tabs-container" id="seller-ads-section">
      <div class="tabs" role="group" aria-label="Filtrar ofertas por status">
        ${tab('all', 'Todas', statusCounts.all)}
        ${tab('active', 'Ativas', statusCounts.active)}
        ${tab('pending', 'Em aprovação', statusCounts.pending)}
        ${statusCounts.queue > 0 ? tab('queue', 'Na fila', statusCounts.queue) : ''}
        ${tab('expired', 'Expiradas', statusCounts.expired)}
        ${tab('rejected', 'Recusadas', statusCounts.rejected)}
      </div>
    </div>
  `;
}

function renderSellerAdsManager() {
  const ads = getSellerAdsData();
  const statusCounts = getSellerStatusCounts(ads);
  const stats = getSellerComputedStats(ads);
  if (!['all', 'active', 'pending', 'queue', 'expired', 'rejected'].includes(activeTab)) activeTab = 'all';

  return `
    ${renderViewHead({
      eyebrow: 'Gestão de ofertas',
      title: 'Ofertas da empresa',
      text: 'Suas ofertas separadas por status. Edite, renove ou tire da vitrine quando precisar.',
      action: `<button class="btn-primary new-ad-trigger seller-view-cta" type="button">${icons.plus} Nova oferta</button>`,
    })}

    <div class="seller-ledger">
      ${renderLedgerCell({ label: 'Total', value: statusCounts.all, caption: 'Cadastradas', attrs: 'data-tab-shortcut="all"' })}
      ${renderLedgerCell({ label: 'Ativas', value: statusCounts.active, caption: 'Na vitrine', attrs: 'data-tab-shortcut="active"' })}
      ${renderLedgerCell({ label: 'Em análise', value: statusCounts.pending + statusCounts.queue, caption: 'Aguardando a equipe', attrs: 'data-tab-shortcut="pending"' })}
      ${renderLedgerCell({ label: 'Expiradas', value: statusCounts.expired, caption: 'Fora da vitrine', attrs: 'data-tab-shortcut="expired"' })}
    </div>

    ${renderSellerAdsTabs(statusCounts)}

    <div class="seller-ads-list seller-manager-list">
      ${renderAdsByStatus()}
    </div>

    <footer class="seller-view-footer">
      <span class="seller-view-footer-icon" aria-hidden="true">${icons.eye}</span>
      <p><strong>${pluralize(stats.totalClicks, 'clique registrado', 'cliques registrados')}</strong><span>${pluralize(stats.couponsClaimed, 'cupom retirado', 'cupons retirados')} · ${stats.couponsUsed} ${stats.couponsUsed === 1 ? 'usado' : 'usados'} · ${formatUseRate(stats.useRate)} de uso</span></p>
    </footer>
  `;
}

function renderSellerInsights() {
  const ads = getSellerAdsData();
  const coupons = getSellerCouponData();
  const stats = getSellerComputedStats(ads, coupons);
  const topAds = [...ads]
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, 6);
  const categoryMap = new Map();
  ads.forEach((ad) => {
    const key = ad.category || 'others';
    const current = categoryMap.get(key) || { name: getSellerCategoryName(key), ads: 0, clicks: 0, coupons: 0 };
    current.ads += 1;
    current.clicks += Number(ad.clicks || 0);
    current.coupons += Number(ad.couponsGenerated || 0);
    categoryMap.set(key, current);
  });
  const categories = [...categoryMap.values()].sort((a, b) => b.clicks - a.clicks);

  const maxCategoryClicks = Math.max(1, ...categories.map((item) => item.clicks));

  return `
    ${renderViewHead({
      eyebrow: 'Análise da empresa',
      title: 'Cliques e cupons',
      text: 'Números calculados a partir das suas ofertas, dos cupons retirados e das visitas registradas.',
      action: `<button class="btn-secondary btn-sm" type="button" data-seller-action="ads">${icons.tag} Ver ofertas</button>`,
    })}

    <div class="seller-ledger">
      ${renderLedgerCell({ label: 'Cliques', value: stats.totalClicks, caption: 'Total registrado' })}
      ${renderLedgerCell({ label: 'Retirados', value: stats.couponsClaimed, caption: 'Cupons pegos pelos alunos' })}
      ${renderLedgerCell({ label: 'Usados', value: stats.couponsUsed, caption: 'Confirmados na compra' })}
      ${renderLedgerCell({ label: 'Taxa de uso', value: formatUseRate(stats.useRate), caption: 'Usados ÷ retirados' })}
    </div>

    <div class="seller-insights-grid">
      <section class="card seller-panel seller-insights-chart" aria-labelledby="seller-chart-title">
        <div class="seller-panel-head">
          <h2 class="seller-panel-title" id="seller-chart-title">Cupons retirados</h2>
          <span class="t-eyebrow">Últimos 7 dias</span>
        </div>
        <canvas id="seller-chart" class="seller-chart-canvas" height="200" role="img" aria-label="Gráfico de cupons retirados nos últimos 7 dias"></canvas>
      </section>

      <section class="card seller-panel" aria-labelledby="seller-top-ads-title">
        <div class="seller-panel-head">
          <h2 class="seller-panel-title" id="seller-top-ads-title">Ofertas com mais cliques</h2>
        </div>
        <div class="seller-insight-list">
          ${topAds.length ? topAds.map((ad, index) => `
            <button class="seller-insight-row" type="button" data-open-ad-id="${escapeHTML(ad.id)}" aria-label="Abrir ${escapeHTML(ad.title)}">
              <span class="seller-insight-rank" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
              <span class="seller-insight-thumb">${getProductImage(ad.images?.[0], 80, 80, ad.category)}</span>
              <span class="seller-insight-main">
                <strong>${escapeHTML(ad.title)}</strong>
                <small>${escapeHTML(getSellerCategoryName(ad.category))} · ${escapeHTML(formatSellerDate(ad.createdAt))}</small>
              </span>
              <span class="seller-insight-metric">${ad.clicks || 0}<small>cliques</small></span>
            </button>
          `).join('') : `
            <p class="seller-muted-text">Quando os alunos abrirem suas ofertas, o ranking aparece aqui.</p>
          `}
        </div>
      </section>

      <section class="card seller-panel" aria-labelledby="seller-categories-title">
        <div class="seller-panel-head">
          <h2 class="seller-panel-title" id="seller-categories-title">Categorias</h2>
        </div>
        <div class="seller-category-insights">
          ${categories.length ? categories.map((item) => `
            <div class="seller-category-insight">
              <div class="seller-category-insight-head">
                <strong>${escapeHTML(item.name)}</strong>
                <span class="t-mono">${item.clicks} cliques</span>
              </div>
              <div class="progress-bar" aria-hidden="true"><div class="progress-fill" style="width:${Math.round((item.clicks / maxCategoryClicks) * 100)}%"></div></div>
              <span class="seller-category-insight-meta">${pluralize(item.ads, 'oferta', 'ofertas')} · ${pluralize(item.coupons, 'cupom retirado', 'cupons retirados')}</span>
            </div>
          `).join('') : '<p class="seller-muted-text">Crie ofertas para medir o desempenho por categoria.</p>'}
        </div>
      </section>
    </div>
  `;
}

// Offer price: the discounted price is the brand accent, the original is struck through.
function renderOfferPrice(ad) {
  const original = Number(ad.originalPrice) || 0;
  const final = Number(ad.discountPrice) || original;
  const hasDiscount = original > 0 && final > 0 && final < original;
  return `
    <p class="seller-ad-price">
      <span class="seller-ad-price-final${hasDiscount ? ' is-discounted' : ''}">${formatCurrency(final)}</span>
      ${hasDiscount ? `<s class="seller-ad-price-original"><span class="sr-only">Preço original: </span>${formatCurrency(original)}</s>` : ''}
    </p>
  `;
}

function renderSellerAdCard(ad) {
  const status = getOfferStatusMeta(ad);
  const title = escapeHTML(ad.title);
  const adId = escapeHTML(ad.id);
  // Coupon quantity: each retrieved code uses one unit (slots_used of slots_total).
  const slotsTotal = Math.max(0, Number(ad.slots?.total) || 0);
  const slotsUsed = Math.min(Math.max(0, Number(ad.slots?.used) || 0), slotsTotal);
  return `
    <article class="seller-ad-card${ad.status === 'active' ? ' is-live' : ''}">
      <div class="seller-ad-card-inner" data-open-ad-id="${adId}" role="button" tabindex="0" aria-label="Gerenciar oferta ${title}">
        <div class="seller-ad-thumb">${getProductImage(ad.images?.[0], 120, 120, ad.category)}</div>
        <div class="seller-ad-info">
          <span class="seller-ad-category">${escapeHTML(getSellerCategoryName(ad.category))}</span>
          <h3 class="seller-ad-title">${title}</h3>
          ${renderOfferPrice(ad)}
          <div class="seller-ad-metrics">
            <span title="Cliques">${icons.eye}<span class="sr-only">Cliques:</span> ${ad.clicks || 0}</span>
            ${slotsTotal ? `<span title="Cupons retirados da quantidade">${icons.ticket}<span class="sr-only">Cupons retirados: ${slotsUsed} de ${slotsTotal}</span><span aria-hidden="true">${slotsUsed}/${slotsTotal}</span></span>` : ''}
            <span title="Cupons usados">${icons.checkCircle}<span class="sr-only">Cupons usados:</span> ${ad.couponsUsed || 0}</span>
          </div>
        </div>
      </div>
      <div class="seller-ad-status">
        ${renderStatusPill(status.label, status.tone)}
        <div class="seller-ad-actions">
          <button class="btn-secondary btn-sm edit-ad-btn" type="button" data-ad-id="${adId}" aria-label="Editar ${title}">${icons.fileText}<span>Editar</span></button>
          ${ad.status === 'expired' ? `<button class="btn-secondary btn-sm renew-btn" type="button" data-ad-id="${adId}">${icons.refresh}<span>Renovar</span></button>` : ''}
          <button class="btn-ghost btn-sm seller-ad-delete delete-ad-btn" type="button" data-ad-id="${adId}" aria-label="Excluir ${title}" title="Excluir">${icons.x}<span class="seller-ad-delete-label">Excluir</span></button>
        </div>
      </div>
      ${ad.status === 'rejected' && ad.rejectionReason ? `<div class="seller-ad-note">${icons.alertTriangle}<span>${escapeHTML(ad.rejectionReason)}</span></div>` : ''}
    </article>
  `;
}

function renderFormBackButton() {
  return `<button class="btn-ghost btn-sm seller-back-btn" id="back-to-dashboard" type="button">${ICON_ARROW_LEFT} Voltar</button>`;
}

function formatCouponValidity(hours) {
  const value = Number(hours || 24);
  if (value < 24) return `${value} hora${value === 1 ? '' : 's'}`;
  const days = Math.round(value / 24);
  return `${days} dia${days === 1 ? '' : 's'}`;
}

function renderCouponValidityOptions(selectedHours = 24) {
  const selected = Number.parseInt(selectedHours, 10) || 24;
  const options = COUPON_VALIDITY_OPTIONS.some(([hours]) => hours === selected)
    ? COUPON_VALIDITY_OPTIONS
    : [...COUPON_VALIDITY_OPTIONS, [selected, formatCouponValidity(selected)]].sort((a, b) => a[0] - b[0]);
  return options
    .map(([hours, label]) => `<option value="${hours}"${hours === selected ? ' selected' : ''}>${label}</option>`)
    .join('');
}

// The coupon quantity (slots_total) follows the category limit on create and on edit.
function getCategoryCouponQuantity(categoryId) {
  if (!categoryId) return null;
  const category = getSellerCategories(false).find((item) => item.id === categoryId);
  const slots = Number(category?.maxSlots);
  return Number.isFinite(slots) && slots > 0 ? slots : 5;
}

function formatCouponQuantity(total) {
  return total ? pluralize(total, 'cupom', 'cupons') : 'Escolha a categoria';
}

// Shared "Preço e cupom" fieldset for the create and edit forms.
function renderPriceSection(ad = null) {
  const hasPreview = Boolean(ad);
  return `
    <fieldset class="seller-form-section">
      <legend class="seller-form-legend">Preço e cupom</legend>
      <p class="seller-form-note">${icons.ticket}<span>Os alunos pegam o código no app e compram direto com sua empresa.</span></p>
      <div class="form-row">
        <div class="input-group">
          <label for="ad-price">Preço original (R$)</label>
          <input type="number" class="input-field" ${ad ? `value="${Number(ad.originalPrice || 0).toFixed(2)}"` : 'placeholder="0,00"'} id="ad-price" min="1" step="0.01" inputmode="decimal">
        </div>
        <div class="input-group">
          <label for="ad-discount">Desconto (%)</label>
          <input type="number" class="input-field" ${ad ? `value="${Number(ad.discount || 10)}"` : 'placeholder="10 a 50"'} id="ad-discount" min="10" max="50" inputmode="numeric">
        </div>
      </div>
      <div class="input-hint seller-form-hint">O desconto precisa ficar entre 10% e 50%.</div>
      <div class="discount-preview" id="discount-preview"${hasPreview ? '' : ' hidden'}>
        <span class="discount-preview-label">Preço final</span>
        <span class="final-price" id="final-price">${formatCurrency(ad?.discountPrice || 0)}</span>
      </div>
      <div class="seller-quantity">
        <span class="seller-quantity-label">Quantidade de cupons</span>
        <strong class="seller-quantity-value" id="coupon-quantity-value" aria-live="polite">${formatCouponQuantity(getCategoryCouponQuantity(ad?.category))}</strong>
      </div>
      <p class="input-hint seller-quantity-hint">Definida pela categoria. Cada aluno que pega o código usa 1 cupom.</p>
      <div class="input-group">
        <label for="ad-coupon-valid-hours">Validade do cupom</label>
        <select class="input-field" id="ad-coupon-valid-hours">
          ${renderCouponValidityOptions(ad?.couponValidHours || 24)}
        </select>
        <div class="input-hint">${ad
          ? 'A nova validade vale para os próximos cupons retirados desta oferta.'
          : 'Conta a partir do momento em que o aluno pega o código.'}</div>
      </div>
    </fieldset>
  `;
}

function renderContactSection() {
  return `
    <fieldset class="seller-form-section">
      <legend class="seller-form-legend">Contato</legend>
      <div class="input-group">
        <label for="ad-whatsapp">WhatsApp para contato</label>
        <input type="tel" class="input-field" placeholder="(86) 99900-1122" id="ad-whatsapp" autocomplete="tel" inputmode="tel" value="${escapeHTML(getUser().whatsapp || '')}">
        <div class="input-hint">É por aqui que os alunos chamam sua empresa para comprar.</div>
      </div>
    </fieldset>
  `;
}

function renderCreateForm() {
  return `
    ${renderFormBackButton()}
    ${renderViewHead({
      eyebrow: 'Nova oferta',
      title: 'Criar oferta',
      text: 'Preencha os dados do produto ou serviço. A oferta passa pela equipe Empreende iCEV antes de aparecer na vitrine.',
    })}
    <form class="create-ad-form seller-form" id="create-ad-form">
      <fieldset class="seller-form-section">
        <legend class="seller-form-legend">Produto</legend>
        <div class="input-group">
          <label for="ad-title">Título da oferta</label>
          <input type="text" class="input-field" placeholder="Ex.: Brownie artesanal" maxlength="60" id="ad-title">
          <div class="char-count"><span id="title-count">0</span>/60</div>
        </div>
        <div class="input-group">
          <label for="ad-desc">Descrição</label>
          <textarea class="input-field" placeholder="Conte o que vem no pedido, tamanho, sabor, horário de entrega…" maxlength="200" id="ad-desc"></textarea>
          <div class="char-count"><span id="desc-count">0</span>/200</div>
        </div>
        <div class="input-group">
          <label for="ad-category">Categoria</label>
          <select class="input-field" id="ad-category">
            <option value="">Selecione uma categoria</option>
            ${getSellerCategories(false).map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('')}
          </select>
        </div>
      </fieldset>

      ${renderPriceSection()}

      <fieldset class="seller-form-section">
        <legend class="seller-form-legend">Fotos <span class="seller-form-legend-note">até 3</span></legend>
        <div class="photo-upload">
          ${renderPhotoSlot(1)}
          ${renderPhotoSlot(2)}
          ${renderPhotoSlot(3)}
        </div>
        <p class="input-error image-required-error" id="image-required-error" hidden>Adicione uma foto do produto para continuar.</p>
        <p class="input-hint">A primeira foto vira a capa da oferta.</p>
      </fieldset>

      ${renderContactSection()}

      <aside class="seller-form-aside ad-preview-container" aria-label="Prévia da oferta">
        <p class="t-eyebrow ad-preview-label">Prévia na vitrine</p>
        <div id="ad-preview-card" class="product-card seller-preview-card" aria-hidden="true">
          <div class="card-image-area">
            <div class="product-image-placeholder">${icons.upload}<span class="product-image-placeholder__label">Foto do produto</span></div>
          </div>
          <div class="perforation"></div>
          <div class="card-body">
            <span class="card-category" id="preview-category">Categoria</span>
            <h3 class="card-title is-placeholder" id="preview-title">Título da oferta</h3>
            <div class="card-price-row">
              <span class="price-discount" id="preview-discount">R$ 0,00</span>
              <span class="price-original" id="preview-original">R$ 0,00</span>
            </div>
          </div>
        </div>
        <p class="seller-form-aside-note">É assim que os alunos veem sua oferta na vitrine.</p>
      </aside>

      <div class="seller-form-submit">
        <button type="submit" class="btn-primary btn-block btn-lg" id="create-submit-btn" disabled>Enviar para aprovação</button>
      </div>
    </form>
  `;
}

function getSelectedAd() {
  return (loadedAds || (shouldUseSellerMocks() ? sellerAds : [])).find(ad => String(ad.id) === String(selectedAdId)) || null;
}

function renderPhotoSlot(index, imageUrl = '') {
  const label = `Foto ${index}`;
  return `
    <label class="photo-upload-slot${imageUrl ? ' has-image' : ''}" id="photo-slot-${index}" data-label="${label}" data-existing-url="${escapeHTML(imageUrl || '')}">
      ${imageUrl ? `
        <img src="${escapeHTML(imageUrl)}" alt="${label}" />
        <button class="photo-remove-btn" type="button" data-slot-id="photo-slot-${index}" aria-label="Remover ${label}">${icons.x}</button>
      ` : renderPhotoSlotEmpty(label, index)}
      <input type="file" accept="image/*" class="photo-upload-input" aria-label="Escolher ${label}" />
    </label>
  `;
}

function renderPhotoSlotEmpty(label, index = 0) {
  return `${icons.upload}<span class="photo-upload-label">${escapeHTML(label)}</span>${index === 1 ? '<span class="photo-upload-tag">Capa</span>' : ''}`;
}

function renderEditProductForm() {
  const ad = getSelectedAd();
  if (!ad) {
    return `
      ${renderFormBackButton()}
      ${renderEmptyState({
        icon: icons.tag,
        title: 'Oferta não encontrada',
        text: 'Ela pode ter sido excluída. Volte para a lista e escolha outra oferta.',
      })}
    `;
  }

  const needsReview = ad.status === 'active';
  const status = getOfferStatusMeta(ad);
  return `
    ${renderFormBackButton()}
    <header class="seller-view-header canopy canopy--continued seller-edit-header">
      <div class="seller-view-copy">
        <p class="t-eyebrow">Gerenciar oferta</p>
        <h1 class="seller-view-title">${escapeHTML(ad.title || 'Oferta')}</h1>
        <p class="seller-view-text">Alterações voltam para aprovação antes de aparecer na vitrine.</p>
      </div>
      <div class="seller-view-action">${renderStatusPill(status.label, status.tone)}</div>
    </header>
    ${needsReview ? `<div class="alert alert-warning seller-edit-warning">${icons.alertTriangle}<span>Ao salvar, esta oferta sai da vitrine por um tempo e volta para aprovação.</span></div>` : ''}
    ${ad.status === 'rejected' && ad.rejectionReason ? `<div class="alert alert-danger seller-edit-warning">${icons.alertTriangle}<span>${escapeHTML(ad.rejectionReason)}</span></div>` : ''}
    <form class="create-ad-form seller-form" id="edit-ad-form" data-ad-id="${escapeHTML(ad.id)}">
      <fieldset class="seller-form-section">
        <legend class="seller-form-legend">Produto</legend>
        <div class="input-group">
          <label for="ad-title">Título da oferta</label>
          <input type="text" class="input-field" maxlength="60" id="ad-title" value="${escapeHTML(ad.title || '')}">
          <div class="char-count"><span id="title-count">${String(ad.title || '').length}</span>/60</div>
        </div>
        <div class="input-group">
          <label for="ad-desc">Descrição</label>
          <textarea class="input-field" maxlength="200" id="ad-desc">${escapeHTML(ad.description || '')}</textarea>
          <div class="char-count"><span id="desc-count">${String(ad.description || '').length}</span>/200</div>
        </div>
        <div class="input-group">
          <label for="ad-category">Categoria</label>
          <select class="input-field" id="ad-category">
            ${getSellerCategories(false).map(c => `<option value="${escapeHTML(c.id)}" ${c.id === ad.category ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
          </select>
        </div>
      </fieldset>

      ${renderPriceSection(ad)}

      <fieldset class="seller-form-section">
        <legend class="seller-form-legend">Fotos <span class="seller-form-legend-note">até 3</span></legend>
        <div class="photo-upload">
          ${renderPhotoSlot(1, ad.images?.[0] || '')}
          ${renderPhotoSlot(2, ad.images?.[1] || '')}
          ${renderPhotoSlot(3, ad.images?.[2] || '')}
        </div>
        <p class="input-hint">A primeira foto vira a capa da oferta.</p>
      </fieldset>

      ${renderContactSection()}

      <aside class="seller-form-aside" aria-label="Desempenho da oferta">
        <p class="t-eyebrow">Desempenho</p>
        <div class="seller-ledger seller-edit-metrics">
          ${renderLedgerCell({ label: 'Cliques', value: ad.clicks || 0 })}
          ${renderLedgerCell({ label: 'Retirados', value: ad.couponsGenerated || 0 })}
          ${renderLedgerCell({ label: 'Usados', value: ad.couponsUsed || 0 })}
        </div>
      </aside>

      <div class="seller-form-submit">
        <button type="submit" class="btn-primary btn-block btn-lg">Salvar e enviar para aprovação</button>
        ${ad.status !== 'expired' ? `<button type="button" class="btn-ghost btn-block seller-danger-link delete-ad-btn" data-ad-id="${escapeHTML(ad.id)}">${icons.x} Excluir oferta</button>` : ''}
      </div>
    </form>
  `;
}

function readProductFormValues(container) {
  return {
    title: container.querySelector('#ad-title')?.value.trim() || '',
    description: container.querySelector('#ad-desc')?.value.trim() || '',
    categoryId: container.querySelector('#ad-category')?.value || '',
    originalPrice: parseFloat(container.querySelector('#ad-price')?.value) || 0,
    discount: parseInt(container.querySelector('#ad-discount')?.value, 10) || 0,
    couponValidHours: parseInt(container.querySelector('#ad-coupon-valid-hours')?.value, 10) || 24,
    whatsapp: container.querySelector('#ad-whatsapp')?.value.trim() || '',
  };
}

function validateProductForm(values) {
  if (!values.title || values.title.length < 3) return 'Informe um título claro para a oferta.';
  if (!values.description || values.description.length < 10) return 'Descreva a oferta com pelo menos 10 caracteres.';
  if (!values.categoryId) return 'Selecione uma categoria.';
  if (values.originalPrice <= 0) return 'Informe o preço original.';
  if (values.discount < 10 || values.discount > 50) return 'O desconto precisa ficar entre 10% e 50%.';
  if (!Number.isInteger(values.couponValidHours) || values.couponValidHours < 1 || values.couponValidHours > 720) return 'Escolha uma validade de cupom entre 1 hora e 30 dias.';
  if (!values.whatsapp) return 'Informe o WhatsApp para contato.';
  return null;
}

async function collectProductImageUrls(container, selectedPhotoFiles) {
  const imageUrls = [];
  const slots = Array.from(container.querySelectorAll('.photo-upload-slot'));
  for (const slot of slots) {
    const file = selectedPhotoFiles.get(slot.id);
    if (file) {
      const compressed = await compressImage(file);
      const { urls, errors } = await uploadMultipleImages([compressed], getUser().id || currentUser.id);
      if (errors?.length) throw new Error(errors[0]);
      imageUrls.push(...urls);
      continue;
    }
    const existingUrl = slot.dataset.existingUrl?.trim();
    if (existingUrl) imageUrls.push(existingUrl);
  }
  return imageUrls.slice(0, 3);
}

function renderSellerCoupons() {
  const coupons = getSellerCouponData();
  const counts = {
    all: coupons.length,
    active: coupons.filter(c => c.status === 'active').length,
    used: coupons.filter(c => c.status === 'used').length,
    expired: coupons.filter(c => c.status === 'expired').length,
  };
  const filteredCoupons = couponStatusFilter === 'all' ? coupons : coupons.filter(c => c.status === couponStatusFilter);
  const filterItems = [
    ['all', 'Todos'],
    ['active', 'Ativos'],
    ['used', 'Usados'],
    ['expired', 'Expirados'],
  ];
  const hasTime = (value) => Boolean(value) && value !== '—';
  return `
    ${renderViewHead({
      eyebrow: 'Na hora da compra',
      title: 'Cupons retirados',
      text: 'Quando o aluno comprar, confira o código e marque como usado. Cada cupom vale uma única vez.',
    })}

    <div class="seller-coupon-hero">
      <form class="card seller-coupon-validator" id="coupon-validator-form">
        <div class="seller-coupon-validator-head">
          <span class="seller-coupon-validator-icon" aria-hidden="true">${icons.ticket}</span>
          <div>
            <label class="seller-coupon-validator-title" for="coupon-validator-code">Confira o código do aluno</label>
            <p class="seller-coupon-validator-text">Digite o código que o aluno mostrar na hora da compra.</p>
          </div>
        </div>
        <div class="perforation" aria-hidden="true"></div>
        <div class="seller-coupon-validator-row">
          <input class="input-field seller-coupon-input" id="coupon-validator-code" type="text" placeholder="Ex.: K7QM-2XPA" autocomplete="off" autocapitalize="characters" spellcheck="false" />
          <button class="btn-primary" type="submit">${icons.check} Conferir</button>
        </div>
      </form>
      <div class="seller-ledger seller-coupon-summary">
        ${renderLedgerCell({ label: 'Ativos', value: counts.active, caption: 'Prontos para usar' })}
        ${renderLedgerCell({ label: 'Usados', value: counts.used, caption: 'Já confirmados' })}
        ${renderLedgerCell({ label: 'Expirados', value: counts.expired, caption: 'Fora do prazo' })}
      </div>
    </div>

    <div class="seller-chip-row seller-coupon-filters" role="group" aria-label="Filtrar cupons por status">
      ${filterItems.map(([value, label]) => `
        <button type="button" class="chip ${couponStatusFilter === value ? 'active' : ''}" aria-pressed="${couponStatusFilter === value}" data-coupon-filter="${value}">
          ${label} <span class="seller-chip-count">${counts[value]}</span>
        </button>
      `).join('')}
    </div>

    <div class="seller-coupons-list">
      ${filteredCoupons.length ? `<div class="seller-list">${filteredCoupons.map(c => {
        const status = COUPON_STATUS[c.status] || COUPON_STATUS.expired;
        return `
        <article class="seller-coupon-card is-${escapeHTML(c.status)}">
          <span class="seller-coupon-code coupon-code">${escapeHTML(c.code)}</span>
          <div class="seller-coupon-status">${renderStatusPill(status.label, status.tone)}</div>
          <div class="seller-coupon-info">
            <strong class="seller-coupon-product">${escapeHTML(c.product)}</strong>
            <p class="seller-coupon-meta">${escapeHTML(c.buyer || 'Aluno')} · retirado em <span class="t-mono">${escapeHTML(c.createdAt)}</span></p>
            <p class="seller-coupon-meta">Validade: <span class="t-mono">${escapeHTML(c.validUntil || 'não informada')}</span>${c.status === 'used' && hasTime(c.usedAt) ? ` · usado em <span class="t-mono">${escapeHTML(c.usedAt)}</span>` : ''}</p>
            <p class="seller-coupon-note">${status.note}</p>
          </div>
          ${c.status === 'active' ? `
            <div class="seller-coupon-action">
              <button class="btn-secondary btn-sm mark-used-btn" type="button" data-id="${escapeHTML(c.id)}" data-code="${escapeHTML(c.code)}">
                ${icons.check} Marcar como usado
              </button>
            </div>
          ` : ''}
        </article>
      `;
      }).join('')}</div>` : renderEmptyState({
        icon: icons.ticket,
        title: coupons.length ? 'Nenhum cupom neste filtro' : 'Nenhum cupom retirado ainda',
        text: coupons.length
          ? 'Troque o filtro para consultar outros status.'
          : 'Quando um aluno pegar o cupom de uma oferta sua, ele aparece aqui para você conferir na hora da compra.',
        action: coupons.length ? '' : `<button class="btn-secondary new-ad-trigger" type="button">${icons.plus} Criar oferta</button>`,
      })}
    </div>
  `;
}

function bindSellerEvents(container) {
  const openCreateForm = () => {
    selectedAdId = null;
    sellerView = 'create';
    sellerNavFocus = 'ads';
    renderSellerPage(container);
  };
  container.querySelectorAll('#new-ad-btn, .create-ad-cta, .new-ad-trigger').forEach((btn) => {
    btn.addEventListener('click', openCreateForm);
  });
  container.querySelector('#back-to-dashboard')?.addEventListener('click', () => {
    selectedAdId = null;
    sellerView = sellerNavFocus === 'ads' ? 'ads' : 'dashboard';
    renderSellerPage(container);
  });
  container.querySelector('#open-buyer-mode')?.addEventListener('click', () => {
    window.location.hash = '#/buyer';
  });
  container.querySelector('#open-seller-profile')?.addEventListener('click', () => {
    window.location.hash = PROFILE_ROUTE;
  });
  container.querySelectorAll('[data-seller-action]').forEach((control) => {
    control.addEventListener('click', () => {
      const action = control.dataset.sellerAction;
      if (action === 'ads') {
        sellerView = 'ads';
        sellerNavFocus = 'ads';
        activeTab = 'all';
        renderSellerPage(container);
      } else if (action === 'coupons') {
        sellerView = 'coupons';
        sellerNavFocus = 'coupons';
        renderSellerPage(container);
      } else if (action === 'create') {
        openCreateForm();
      } else if (action === 'clicks') {
        sellerView = 'insights';
        sellerNavFocus = 'dashboard';
        renderSellerPage(container);
      } else if (action === 'profile') {
        window.location.hash = PROFILE_ROUTE;
      }
    });
  });

  container.querySelectorAll('[data-tab-shortcut]').forEach((shortcut) => {
    shortcut.addEventListener('click', () => {
      activeTab = shortcut.dataset.tabShortcut || 'all';
      sellerView = 'ads';
      sellerNavFocus = 'ads';
      renderSellerPage(container);
    });
  });

  const openProductManager = (adId) => {
    selectedAdId = adId;
    sellerView = 'edit';
    sellerNavFocus = 'ads';
    renderSellerPage(container);
  };

  container.querySelectorAll('[data-open-ad-id]').forEach(card => {
    card.addEventListener('click', () => {
      openProductManager(card.dataset.openAdId);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProductManager(card.dataset.openAdId);
      }
    });
  });

  container.querySelectorAll('.edit-ad-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      openProductManager(btn.dataset.adId);
    });
  });

  container.querySelectorAll('.delete-ad-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showDeleteProductModal(btn.dataset.adId, container);
    });
  });

  // Tabs
  container.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => { activeTab = tab.dataset.tab; sellerNavFocus = 'ads'; renderSellerPage(container); });
  });

  container.querySelectorAll('[data-coupon-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      couponStatusFilter = chip.dataset.couponFilter;
      renderSellerPage(container);
    });
  });

  container.querySelector('#coupon-validator-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = container.querySelector('#coupon-validator-code');
    const candidates = getCouponCodeCandidates(input?.value);
    if (!candidates.length) {
      showToast('Digite o código do cupom.', 'error');
      input?.focus();
      return;
    }
    const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
    const previousLabel = submitBtn?.innerHTML;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Conferindo…';
    }
    const result = await validateCoupon(input.value);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = previousLabel;
    }
    if (!result.valid) {
      showToast(result.error || 'Cupom inválido.', 'error');
      return;
    }
    const coupon = getSellerCouponData().find(item => candidates.includes(String(item.code || '').toUpperCase())) || result.coupon;
    const couponSellerId = String(coupon?.seller_id || coupon?.sellerId || coupon?.seller?.id || '');
    if (!coupon || (couponSellerId && couponSellerId !== String(getUser().id))) {
      showToast('Este cupom é de outra empresa.', 'error');
      return;
    }
    showCouponValidationModal(coupon, container);
  });

  // Form character counters
  const titleInput = container.querySelector('#ad-title');
  const descInput = container.querySelector('#ad-desc');
  const priceInput = container.querySelector('#ad-price');
  const discountInput = container.querySelector('#ad-discount');
  const categorySelect = container.querySelector('#ad-category');
  const selectedPhotoFiles = new Map();
  const createForm = container.querySelector('#create-ad-form');
  const createSubmitBtn = container.querySelector('#create-submit-btn');
  const imageRequiredError = container.querySelector('#image-required-error');

  const hasCreateImage = () => {
    if (!createForm) return true;
    const slots = Array.from(container.querySelectorAll('.photo-upload-slot'));
    return selectedPhotoFiles.size > 0 || slots.some((slot) => Boolean(slot.dataset.existingUrl));
  };

  const updateCreateSubmitState = ({ showError = false } = {}) => {
    if (!createForm || !createSubmitBtn) return;
    const hasImage = hasCreateImage();
    createSubmitBtn.disabled = !hasImage;
    if (imageRequiredError) imageRequiredError.hidden = !(showError && !hasImage);
  };

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      container.querySelector('#title-count').textContent = titleInput.value.length;
      const previewTitle = container.querySelector('#preview-title');
      if (previewTitle) {
        previewTitle.textContent = titleInput.value || 'Título da oferta';
        previewTitle.classList.toggle('is-placeholder', !titleInput.value);
      }
    });
  }
  if (descInput) {
    descInput.addEventListener('input', () => {
      container.querySelector('#desc-count').textContent = descInput.value.length;
    });
  }

  categorySelect?.addEventListener('change', () => {
    const quantityValue = container.querySelector('#coupon-quantity-value');
    if (quantityValue) quantityValue.textContent = formatCouponQuantity(getCategoryCouponQuantity(categorySelect.value));
    const previewCategory = container.querySelector('#preview-category');
    if (previewCategory) previewCategory.textContent = categorySelect.value ? getSellerCategoryName(categorySelect.value) : 'Categoria';
  });

  const updatePrice = () => {
    if (!priceInput || !discountInput) return;
    const price = parseFloat(priceInput.value) || 0;
    const disc = parseInt(discountInput.value, 10) || 0;
    const preview = container.querySelector('#discount-preview');
    const finalEl = container.querySelector('#final-price');
    const previewOriginal = container.querySelector('#preview-original');
    const previewDiscount = container.querySelector('#preview-discount');

    if (price > 0 && disc >= 10 && disc <= 50) {
      const final = price * (1 - disc / 100);
      if (preview) preview.hidden = false;
      if (finalEl) finalEl.textContent = formatCurrency(final);
      if (previewOriginal) previewOriginal.textContent = formatCurrency(price);
      if (previewDiscount) previewDiscount.textContent = formatCurrency(final);
    } else if (preview) {
      preview.hidden = true;
    }

    // Alert for discount out of range
    discountInput.classList.toggle('error', Boolean(discountInput.value) && (disc < 10 || disc > 50));
  };

  priceInput?.addEventListener('input', updatePrice);
  discountInput?.addEventListener('input', updatePrice);

  // Photo upload preview
  const bindPhotoInput = (slot) => {
    slot.querySelector('input[type="file"]')?.addEventListener('change', handlePhotoChange);
  };

  const resetPhotoSlot = (slot) => {
    const label = slot.dataset.label || 'Foto';
    selectedPhotoFiles.delete(slot.id);
    slot.dataset.existingUrl = '';
    slot.classList.remove('has-image', 'is-new');
    slot.innerHTML = `${renderPhotoSlotEmpty(label, slot.id === 'photo-slot-1' ? 1 : 0)}<input type="file" accept="image/*" class="photo-upload-input" aria-label="Escolher ${escapeHTML(label)}" />`;
    bindPhotoInput(slot);
    updateCreateSubmitState();
  };

  const handlePhotoChange = (event) => {
    const input = event.target;
    const slot = input.closest('.photo-upload-slot');
    if (!slot || !input.files?.length) return;

    const file = input.files[0];
    selectedPhotoFiles.set(slot.id, file);
    const url = createPreviewURL(file);
    slot.dataset.existingUrl = '';
    slot.innerHTML = `<img src="${url}" alt="${escapeHTML(slot.dataset.label || 'Foto')}" /><button class="photo-remove-btn" type="button" data-slot-id="${slot.id}" aria-label="Remover ${escapeHTML(slot.dataset.label || 'foto')}">${icons.x}</button><input type="file" accept="image/*" class="photo-upload-input" aria-label="Trocar ${escapeHTML(slot.dataset.label || 'foto')}" />`;
    slot.classList.add('has-image', 'is-new');
    bindPhotoInput(slot);
    updateCreateSubmitState();
    slot.querySelector('.photo-remove-btn')?.addEventListener('click', (removeEvent) => {
      removeEvent.preventDefault();
      removeEvent.stopPropagation();
      resetPhotoSlot(slot);
    });
  };

  container.querySelectorAll('.photo-upload-slot input[type="file"]').forEach(input => {
    input.addEventListener('change', handlePhotoChange);
  });

  container.querySelectorAll('.photo-remove-btn').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const slot = container.querySelector(`#${btn.dataset.slotId}`);
      if (slot) resetPhotoSlot(slot);
    });
  });
  updateCreateSubmitState();

  // Form submit — real Supabase creation
  container.querySelector('#create-ad-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!hasCreateImage()) {
      updateCreateSubmitState({ showError: true });
      showToast('Adicione uma foto do produto para continuar.', 'error');
      return;
    }
    const values = readProductFormValues(container);
    const validationError = validateProductForm(values);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.textContent;
    btn.textContent = 'Enviando…';
    btn.disabled = true;

    try {
      const imageUrls = await collectProductImageUrls(container, selectedPhotoFiles);

      if (selectedPhotoFiles.size > 0 && imageUrls.length === 0) {
        throw new Error('Não foi possível enviar as fotos.');
      }

      const user = getUser();
      const result = await createProduct({
        sellerId: globalSession?.user?.id || user.id,
        title: values.title,
        description: values.description,
        categoryId: values.categoryId,
        originalPrice: values.originalPrice,
        discount: values.discount,
        couponValidHours: values.couponValidHours,
        images: imageUrls,
        whatsapp: values.whatsapp,
      });

      if (result.success) {
        showToast('Oferta enviada para aprovação.', 'success');
        invalidateSellerCache({ data: true });
        sellerView = 'ads';
        sellerNavFocus = 'ads';
        activeTab = 'pending';
        renderSellerPage(container, { force: true });
      } else {
        showToast(result.error || 'Não foi possível criar a oferta. Tente de novo.', 'error');
        btn.textContent = origText;
        btn.disabled = false;
      }
    } catch (err) {
      console.error('Create offer error:', err);
      showToast(err.message || 'Não foi possível criar a oferta. Tente de novo.', 'error');
      btn.textContent = origText;
      btn.disabled = false;
    }
  });

  container.querySelector('#edit-ad-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const adId = e.currentTarget.dataset.adId;
    const values = readProductFormValues(container);
    const validationError = validateProductForm(values);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.textContent;
    btn.textContent = 'Salvando…';
    btn.disabled = true;

    try {
      const imageUrls = await collectProductImageUrls(container, selectedPhotoFiles);
      const result = await updateSellerProduct(adId, {
        ...values,
        images: imageUrls,
      });

      if (result.success) {
        showToast('Oferta atualizada e enviada para aprovação.', 'success');
        invalidateSellerCache({ data: true });
        selectedAdId = null;
        sellerView = 'ads';
        sellerNavFocus = 'ads';
        activeTab = 'pending';
        renderSellerPage(container, { force: true });
      } else {
        showToast(result.error || 'Não foi possível salvar a oferta.', 'error');
        btn.textContent = origText;
        btn.disabled = false;
      }
    } catch (err) {
      showToast(err.message || 'Não foi possível salvar a oferta.', 'error');
      btn.textContent = origText;
      btn.disabled = false;
    }
  });

  // Mark coupon as used
  container.querySelectorAll('.mark-used-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const couponId = btn.dataset.id;
      const code = btn.dataset.code;
      const coupon = getSellerCouponData().find(c => String(c.id) === String(couponId) || c.code === code);
      if (!coupon) {
        showToast('Cupom não encontrado.', 'error');
        return;
      }
      showCouponValidationModal(coupon, container);
    });
  });

  // Renew buttons (using data-ad-id)
  container.querySelectorAll('.renew-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const adId = btn.dataset.adId;
      if (adId) {
        btn.textContent = 'Renovando…';
        btn.disabled = true;
        const result = await renewProduct(adId);
        if (result?.success) {
          showToast('Oferta renovada e enviada para aprovação.', 'success');
          invalidateSellerCache({ data: true });
          sellerView = 'ads';
          sellerNavFocus = 'ads';
          activeTab = 'pending';
          renderSellerPage(container, { force: true });
        } else {
          showToast(result?.error || 'Não foi possível renovar a oferta.', 'error');
          btn.innerHTML = `${icons.refresh}<span>Renovar</span>`;
          btn.disabled = false;
        }
      }
    });
  });

  // Simple chart
  setTimeout(() => {
    const canvas = container.querySelector('#seller-chart');
    if (canvas) drawSimpleChart(canvas, loadedCoupons || []);
  }, 100);

  // Bottom nav — event delegation on <nav>; the items are role="button", so Enter/Space act too.
  const sellerNav = container.querySelector('.bottom-nav');
  if (sellerNav) {
    const goToSection = (nav) => {
      if (nav === 'dashboard') {
        sellerView = 'dashboard';
        sellerNavFocus = 'dashboard';
        activeTab = 'active';
      } else if (nav === 'ads') {
        sellerView = 'ads';
        sellerNavFocus = 'ads';
        activeTab = 'all';
      } else if (nav === 'coupons') {
        sellerView = 'coupons';
        sellerNavFocus = 'coupons';
      } else {
        return;
      }
      renderSellerPage(container);
    };
    sellerNav.addEventListener('click', (e) => {
      const item = e.target.closest('[data-nav]');
      if (item) goToSection(item.dataset.nav);
    });
    sellerNav.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-nav]');
      if (!item) return;
      e.preventDefault();
      goToSection(item.dataset.nav);
    });
  }
}

// Renders a modal into #modal-root; closes on backdrop click and Escape.
function openSellerModal(markup) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;
  modalRoot.innerHTML = markup;
  const backdrop = modalRoot.firstElementChild;
  const onKeydown = (event) => {
    if (!backdrop?.isConnected) {
      document.removeEventListener('keydown', onKeydown);
      return;
    }
    if (event.key === 'Escape') close();
  };
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    if (backdrop?.isConnected) modalRoot.innerHTML = '';
  };
  document.addEventListener('keydown', onKeydown);
  backdrop?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });
  modalRoot.querySelector('[data-autofocus]')?.focus();
  return { root: modalRoot, close };
}

function showCouponValidationModal(coupon, container) {
  const code = coupon.code;
  if (coupon.status === 'used') {
    showToast('Este cupom já foi usado.', 'error');
    return;
  }
  if (coupon.status === 'expired') {
    showToast('Este cupom está expirado.', 'error');
    return;
  }
  if (coupon.status === 'pending') {
    showToast('Este cupom não foi liberado e não vale para compra.', 'error');
    return;
  }
  const modal = openSellerModal(`
    <div class="modal-backdrop" id="confirm-modal">
      <div class="modal-content coupon-validation-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-validation-title">
        <div class="modal-handle"></div>
        <p class="t-eyebrow seller-modal-kicker">Na hora da compra</p>
        <h3 class="modal-title" id="coupon-validation-title">Marcar cupom como usado?</h3>
        <p class="coupon-validation-text">Confirme só quando o aluno comprar. Depois disso, o código fica bloqueado para novo uso.</p>
        <div class="coupon-validation-ticket">
          <div class="coupon-validation-stub">
            <span class="t-eyebrow">Código</span>
            <strong class="coupon-code coupon-validation-code">${escapeHTML(code)}</strong>
          </div>
          <div class="perforation" aria-hidden="true"></div>
          <dl class="seller-facts coupon-modal-details">
            <div class="seller-fact"><dt>Oferta</dt><dd>${escapeHTML(coupon.product || 'Oferta')}</dd></div>
            <div class="seller-fact"><dt>Aluno</dt><dd>${escapeHTML(coupon.buyer || 'Aluno')}</dd></div>
            <div class="seller-fact"><dt>Validade</dt><dd class="t-mono">${escapeHTML(coupon.validUntil || 'Não informada')}</dd></div>
          </dl>
        </div>
        <div class="seller-modal-actions is-stacked">
          <button class="btn-primary btn-block" id="do-confirm" type="button">${icons.check} Marcar como usado</button>
          <button class="btn-ghost btn-block" id="cancel-confirm" type="button" data-autofocus>Cancelar</button>
        </div>
      </div>
    </div>
  `);
  if (!modal) return;
  modal.root.querySelector('#cancel-confirm')?.addEventListener('click', modal.close);
  modal.root.querySelector('#do-confirm')?.addEventListener('click', async () => {
    if (!coupon?.id) {
      showToast('Cupom não encontrado.', 'error');
      return;
    }
    const confirmBtn = modal.root.querySelector('#do-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Marcando…';
    const result = await markCouponUsed(coupon.id);
    if (result?.success) {
      modal.close();
      showToast(`Cupom ${code} marcado como usado.`, 'success');
      invalidateSellerCache({ data: true });
      couponStatusFilter = 'used';
      renderSellerPage(container, { force: true });
    } else {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `${icons.check} Marcar como usado`;
      showToast(result?.error || 'Não foi possível atualizar o cupom.', 'error');
    }
  });
}

function showDeleteProductModal(adId, container) {
  const ad = (loadedAds || (shouldUseSellerMocks() ? sellerAds : [])).find(item => String(item.id) === String(adId));
  if (!ad) {
    showToast('Oferta não encontrada.', 'error');
    return;
  }

  const modal = openSellerModal(`
    <div class="modal-backdrop" id="delete-product-modal">
      <div class="modal-content seller-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-text">
        <div class="modal-handle"></div>
        <span class="seller-confirm-icon" aria-hidden="true">${icons.alertTriangle}</span>
        <h3 class="modal-title" id="delete-product-title">Excluir oferta?</h3>
        <p class="seller-confirm-text" id="delete-product-text">
          <strong>${escapeHTML(ad.title)}</strong> sai do painel e deixa de aparecer para os alunos. Os cupons já retirados continuam no histórico.
        </p>
        <div class="seller-modal-actions">
          <button class="btn-secondary" id="cancel-delete-product" type="button" data-autofocus>Cancelar</button>
          <button class="btn-danger" id="confirm-delete-product" type="button">Excluir</button>
        </div>
      </div>
    </div>
  `);
  if (!modal) return;

  modal.root.querySelector('#cancel-delete-product')?.addEventListener('click', modal.close);
  modal.root.querySelector('#confirm-delete-product')?.addEventListener('click', async () => {
    const confirmBtn = modal.root.querySelector('#confirm-delete-product');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Excluindo…';
    const result = await deleteSellerProduct(adId);
    if (result?.success) {
      modal.close();
      showToast('Oferta excluída.', 'success');
      invalidateSellerCache({ data: true });
      selectedAdId = null;
      sellerView = 'ads';
      sellerNavFocus = 'ads';
      activeTab = 'all';
      renderSellerPage(container, { force: true });
    } else {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Excluir';
      showToast(result?.error || 'Não foi possível excluir a oferta.', 'error');
    }
  });
}

// '#RRGGBB' token → rgba() with the given alpha (canvas gradients need explicit colors).
function withAlpha(color, alpha) {
  const hex = String(color || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 'transparent';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawSimpleChart(canvas, coupons = []) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const now = new Date();
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    return {
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      count: 0,
    };
  });
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  coupons.forEach((coupon) => {
    const rawDate = coupon.createdAtRaw || coupon.createdAt;
    if (!rawDate) return;
    const day = new Date(rawDate);
    if (Number.isNaN(day.getTime())) return;
    day.setHours(0, 0, 0, 0);
    const bucket = bucketMap.get(day.toISOString().slice(0, 10));
    if (bucket) bucket.count += 1;
  });
  const data = buckets.map((bucket) => bucket.count);
  const labels = buckets.map((bucket) => bucket.label);
  const w = rect.width;
  const h = rect.height;
  const padding = { top: 30, right: 20, bottom: 30, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  // Round the scale up to a multiple of 4 so the four gridline labels are distinct integers.
  const maxVal = Math.max(4, Math.ceil((Math.max(0, ...data) + 1) / 4) * 4);

  // Colors come from the brand tokens: pink marker for the series, navy-grey for the frame.
  const tokens = getComputedStyle(canvas);
  const token = (name, fallback) => tokens.getPropertyValue(name).trim() || fallback;
  const seriesColor = token('--marker', 'deeppink');
  const muteColor = token('--ink-mute', 'gray');
  const ruleColor = token('--rule', 'lightgray');
  const paperColor = token('--paper', 'white');
  const labelFont = token('--font-body', 'sans-serif');

  // Y-axis labels and grid lines
  ctx.strokeStyle = ruleColor;
  ctx.fillStyle = muteColor;
  ctx.font = `500 10px ${labelFont}`;
  ctx.textAlign = 'right';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    const val = Math.round(maxVal - (maxVal / 4) * i);
    ctx.fillText(val, padding.left - 10, y + 3);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  // Calculate points
  const points = data.map((val, i) => ({
    x: padding.left + (chartW / (data.length - 1)) * i,
    y: padding.top + chartH - (val / maxVal) * chartH
  }));

  // Spline Path
  const splinePath = new Path2D();
  splinePath.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    splinePath.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  splinePath.lineTo(points[points.length - 1].x, points[points.length - 1].y);

  // Gradient fill under the line
  const fillPath = new Path2D(splinePath);
  fillPath.lineTo(points[points.length - 1].x, h - padding.bottom);
  fillPath.lineTo(points[0].x, h - padding.bottom);
  fillPath.closePath();

  const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
  gradient.addColorStop(0, withAlpha(seriesColor, 0.16));
  gradient.addColorStop(1, withAlpha(seriesColor, 0));
  ctx.fillStyle = gradient;
  ctx.fill(fillPath);

  // Line
  ctx.strokeStyle = seriesColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(splinePath);

  // Dots
  points.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = paperColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = seriesColor;
    ctx.stroke();
  });

  // X-axis Labels
  ctx.fillStyle = muteColor;
  ctx.font = `500 11px ${labelFont}`;
  ctx.textAlign = 'center';
  labels.forEach((label, i) => {
    const x = padding.left + (chartW / (data.length - 1)) * i;
    ctx.fillText(label, x, h - 10);
  });
}
