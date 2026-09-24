import { icons, showToast, getProductImage, formatCurrency, escapeHTML, brandCaseHTML, globalSession, globalProfile, renderBrandLogo } from '../main.js';
import { pendingAds, adminStats, categoryHeat, rejectReasons, categories as mockCategories, institution } from '../data/mock.js';
import { getPendingProducts, approveProduct, rejectProduct, requestProductAdjustment, getCategoryStats, getAllProducts, deleteSellerProduct } from '../services/product-service.js';
import { getInstitutionStats, updateInstitution, getInstitution, getAllInstitutions } from '../services/institution-service.js';
import { signOutUser } from '../services/auth-service.js';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/category-service.js';
import { resetAppScroll } from '../utils/scroll.js';
import { formatPhoneBR } from '../utils/phone.js';
import { getPlatformUsers, updatePlatformUser, createPlatformInstitution } from '../services/superadmin-service.js';

const USE_MOCKS = import.meta.env.DEV;
const BRAND_NAME = 'Empreende iCEV';
// Sign-up compares '@' + lower(domain part) with these values, so store them that way.
// A strict subset of the API check (^@[a-z0-9.-]+\.[a-z]{2,}$): no empty or dash-edged labels.
const EMAIL_DOMAIN_PATTERN = /^@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

let adminView = 'dashboard';
let loadedPendingAds = null;
let loadedStats = null;
let loadedAllProducts = [];
let loadedCategoryStats = {};
let loadedCategories = mockCategories;
let activeInstitution = institution;
let selectedCategoryId = null;
let categoryStatusFilter = 'all';
const ADMIN_DATA_TTL_MS = 30000;
let adminDataLoadedAt = 0;
let adminDataPromise = null;
let platformUsers = [];
let platformUsersTotal = 0;
let platformUsersPage = 1;
let platformUsersSearch = '';
let platformUsersError = '';
let platformInstitutions = [];
let adminRenderId = 0;
const isSuperadmin = () => globalProfile?.role === 'superadmin';

const ADMIN_VIEWS = [
  { id: 'dashboard', label: 'Visão geral', icon: 'home' },
  { id: 'moderation', label: 'Aprovar ofertas', icon: 'shield' },
  { id: 'categories', label: 'Categorias', icon: 'grid' },
  { id: 'reports', label: 'Relatórios', icon: 'chart' },
  { id: 'settings', label: 'Configurações', icon: 'settings' },
];

const PLATFORM_VIEWS = [
  { id: 'users', label: 'Usuários', icon: 'user' },
  { id: 'institutions', label: 'Instituições', icon: 'all' },
];

function getPendingList() {
  return loadedPendingAds || (USE_MOCKS ? pendingAds : []);
}

function getInitials(name, fallback = 'U') {
  const initials = String(name || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || fallback;
}

// The brand always writes "iCEV" with a lowercase i, even inside uppercase labels.
function createFallbackInstitution() {
  return { name: BRAND_NAME, fullName: BRAND_NAME, domain: '', settings: {} };
}

// Accepts "@escola.edu.br", "escola.edu.br" or a pasted address ("nome@escola.edu.br").
function normalizeEmailDomain(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  return `@${text.slice(text.lastIndexOf('@') + 1)}`;
}

// Raw strings as stored in institutions.settings.extra_domains.
function getExtraDomains(inst = activeInstitution) {
  const list = inst?.settings?.extra_domains;
  return Array.isArray(list) ? list.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function getSignupDomains(inst = activeInstitution) {
  return [inst?.domain, ...getExtraDomains(inst)].map((item) => String(item || '').trim()).filter(Boolean);
}

function parseDomainList(raw, primaryDomain = '') {
  const primary = normalizeEmailDomain(primaryDomain);
  const domains = [];
  const invalid = [];
  String(raw || '').split(/[\s,;]+/).filter(Boolean).forEach((entry) => {
    const domain = normalizeEmailDomain(entry);
    if (!EMAIL_DOMAIN_PATTERN.test(domain)) invalid.push(entry);
    else if (domain !== primary && !domains.includes(domain)) domains.push(domain);
  });
  return { domains, invalid };
}

// Institution form values with the domain stored the way sign-up compares it; null if invalid.
function withNormalizedDomain(values) {
  const domain = normalizeEmailDomain(values.domain);
  return EMAIL_DOMAIN_PATTERN.test(domain) ? { ...values, domain } : null;
}

function renderDomainList(domains, emptyText) {
  if (!domains.length) return `<p>${escapeHTML(emptyText)}</p>`;
  return `<ul class="settings-domain-list">${domains.map((domain) => `<li class="settings-domain">${escapeHTML(domain)}</li>`).join('')}</ul>`;
}

function renderViewHeader({ eyebrow = '', title, subtitle = '', actions = '' }) {
  return `
    <header class="admin-view-header canopy canopy--continued">
      <div class="admin-view-heading">
        ${eyebrow ? `<span class="t-eyebrow">${eyebrow}</span>` : ''}
        <h1 class="admin-view-title">${title}</h1>
        ${subtitle ? `<p class="admin-view-subtitle">${subtitle}</p>` : ''}
      </div>
      ${actions ? `<div class="admin-view-actions">${actions}</div>` : ''}
    </header>
  `;
}

function renderAdminEmpty({ icon = '', title, text, action = '' }) {
  return `
    <div class="empty-state admin-empty">
      ${icon ? `<span class="admin-empty-icon">${icon}</span>` : ''}
      <h3>${title}</h3>
      <p>${text}</p>
      ${action}
    </div>
  `;
}

// Phone tabs scroll sideways; keep the current one in view after each render.
function revealActiveAdminTab(container) {
  const tabs = container.querySelector('.admin-tabs');
  const activeTab = tabs?.querySelector('.tab.active');
  if (!tabs || !activeTab || tabs.scrollWidth <= tabs.clientWidth) return;
  const offset = activeTab.getBoundingClientRect().left - tabs.getBoundingClientRect().left;
  tabs.scrollLeft += offset - (tabs.clientWidth - activeTab.offsetWidth) / 2;
}

function renderAdminSkeleton() {
  return `
    <div class="page admin-page is-loading" aria-busy="true">
      <aside class="admin-sidebar">
        <div class="admin-sidebar-brand">${renderBrandLogo('wordmark-on-dark', 'brand-logo admin-brand-logo')}</div>
      </aside>
      <div class="admin-main">
        <div class="admin-topbar admin-skeleton-topbar">
          <div class="app-header admin-main-header">
            <div class="admin-header-brand">${renderBrandLogo('wordmark-on-dark', 'brand-logo admin-brand-logo')}</div>
          </div>
        </div>
        <div class="admin-body">
          <div class="admin-view-header canopy canopy--continued">
            <div class="admin-view-heading">
              <span class="skeleton admin-skeleton-eyebrow"></span>
              <span class="skeleton admin-skeleton-title"></span>
            </div>
          </div>
          <div class="admin-stats-grid">
            ${'<div class="card admin-skeleton-card"><span class="skeleton admin-skeleton-icon"></span><span class="skeleton admin-skeleton-value"></span><span class="skeleton admin-skeleton-label"></span></div>'.repeat(6)}
          </div>
          <span class="sr-only" role="status">Carregando painel</span>
        </div>
      </div>
    </div>
  `;
}

function isAdminRoute() {
  const path = window.location.hash.startsWith('#/')
    ? window.location.hash.slice(1)
    : window.location.pathname;
  return path === '/admin' || path.startsWith('/admin/') || path.startsWith('/admin?');
}

function invalidateAdminData() {
  adminDataLoadedAt = 0;
  adminDataPromise = null;
}

function getAdminCategories(includeAll = true) {
  const rows = Array.isArray(loadedCategories) && loadedCategories.length ? loadedCategories : mockCategories;
  return includeAll ? rows : rows.filter((category) => category.id !== 'all');
}

function getCategoryRules(categoryId) {
  return activeInstitution?.settings?.categoryRules?.[categoryId] || '';
}

function getCategoryLabel(categoryId) {
  return getAdminCategories().find((category) => category.id === categoryId)?.name || 'Categoria';
}

function removePendingAd(adId) {
  if (!Array.isArray(loadedPendingAds)) return;
  loadedPendingAds = loadedPendingAds.filter((ad) => String(ad.id) !== String(adId));
}

function setModerationBusy(card, activeButton, label) {
  if (!card) return;
  card.classList.add('is-processing');
  card.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  if (activeButton) activeButton.innerHTML = `${icons.loader} ${label}`;
}

function resetModerationBusy(card, activeButton, originalHtml) {
  if (!card) return;
  card.classList.remove('is-processing');
  card.querySelectorAll('button').forEach((button) => {
    button.disabled = false;
  });
  if (activeButton) activeButton.innerHTML = originalHtml;
}

async function syncInstitutionForUser() {
  const institutionId = globalSession?.user?.id
    ? globalProfile?.institution_id || globalSession?.user?.user_metadata?.institution_id || null
    : null;
  if (institutionId) {
    const realInstitution = await getInstitution(institutionId);
    if (realInstitution) {
      activeInstitution = realInstitution;
      return;
    }
  }
  if (globalSession?.user?.id && ['admin', 'superadmin'].includes(globalProfile?.role)) {
    const institutions = await getAllInstitutions();
    if (institutions.length === 1) {
      activeInstitution = institutions[0];
      return;
    }
  }
  activeInstitution = USE_MOCKS ? institution : createFallbackInstitution();
}

function getSettledValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

async function loadAdminData({ force = false } = {}) {
  const isFresh = adminDataLoadedAt && Date.now() - adminDataLoadedAt < ADMIN_DATA_TTL_MS;
  if (!force && isFresh) return;
  if (!force && adminDataPromise) return adminDataPromise;

  adminDataPromise = (async () => {
    try {
      await syncInstitutionForUser();
    } catch {
      activeInstitution = USE_MOCKS ? institution : createFallbackInstitution();
    }
    const [
      pendingResult,
      statsResult,
      productsResult,
      categoryStatsResult,
      categoriesResult,
    ] = await Promise.allSettled([
      getPendingProducts(),
      getInstitutionStats(isSuperadmin() ? null : activeInstitution?.id || null),
      getAllProducts(),
      getCategoryStats(isSuperadmin() ? null : activeInstitution?.id || null),
      getCategories(),
    ]);

    const pendingValue = getSettledValue(pendingResult, null);
    const statsValue = getSettledValue(statsResult, null);
    const productsValue = getSettledValue(productsResult, null);
    const categoryStatsValue = getSettledValue(categoryStatsResult, null);
    const categoriesValue = getSettledValue(categoriesResult, null);

    loadedPendingAds = Array.isArray(pendingValue) ? pendingValue : (USE_MOCKS ? pendingAds : []);
    loadedStats = statsValue || (USE_MOCKS ? adminStats : null);
    loadedAllProducts = Array.isArray(productsValue) ? productsValue : (USE_MOCKS ? pendingAds : []);
    loadedCategoryStats = categoryStatsValue || (USE_MOCKS ? categoryHeat : {});
    loadedCategories = Array.isArray(categoriesValue) && categoriesValue.length
      ? categoriesValue
      : (USE_MOCKS ? mockCategories : [{ id: 'all', name: 'Todos' }]);
    adminDataLoadedAt = Date.now();
  })().finally(() => {
    adminDataPromise = null;
  });

  return adminDataPromise;
}

export function renderAdmin(container, subpage) {
  if (subpage) adminView = subpage;
  else adminView = 'dashboard';
  if (!container.querySelector('.admin-page')) container.innerHTML = renderAdminSkeleton();
  renderAdminPage(container).then((rendered) => {
    if (rendered) resetAppScroll(container);
  });
}

async function renderAdminPage(container, options = {}) {
  const renderId = ++adminRenderId;
  await loadAdminData({ force: Boolean(options.forceRefresh) });
  if (renderId !== adminRenderId || !isAdminRoute()) return false;
  if (isSuperadmin() && adminView === 'users') {
    try {
      const result = await getPlatformUsers(platformUsersPage, platformUsersSearch);
      platformUsers = result.users;
      platformUsersTotal = result.total;
      platformUsersError = '';
      platformInstitutions = await getAllInstitutions();
    } catch (error) {
      platformUsersError = error.message;
    }
  }
  if (isSuperadmin() && adminView === 'institutions') {
    platformInstitutions = await getAllInstitutions();
  }
  if (renderId !== adminRenderId || !isAdminRoute()) return false;
  if (!isSuperadmin() && ['users', 'institutions'].includes(adminView)) adminView = 'dashboard';
  const pendingCount = getPendingList().length;
  const tabViews = [...ADMIN_VIEWS, ...(isSuperadmin() ? PLATFORM_VIEWS : [])];
  const renderNavItem = (view) => `
    <button class="nav-item admin-nav-item ${adminView === view.id ? 'active' : ''}" type="button" data-nav="${view.id}" ${adminView === view.id ? 'aria-current="page"' : ''}>
      ${icons[view.icon]}
      <span class="admin-nav-label">${view.label}</span>
      ${view.id === 'moderation' && pendingCount ? `<span class="admin-nav-count">${pendingCount}</span>` : ''}
    </button>
  `;
  container.innerHTML = `
    <div class="page admin-page">
      <aside class="admin-sidebar">
        <div class="admin-sidebar-brand">
          ${renderBrandLogo('wordmark-on-dark', 'brand-logo admin-brand-logo')}
          <span class="admin-sidebar-tag">${isSuperadmin() ? 'Superadmin' : 'Admin'}</span>
        </div>
        <nav class="admin-nav" aria-label="Seções do painel">
          <span class="admin-nav-group">Operação</span>
          ${ADMIN_VIEWS.map(renderNavItem).join('')}
          ${isSuperadmin() ? `
            <span class="admin-nav-group">Plataforma</span>
            ${PLATFORM_VIEWS.map(renderNavItem).join('')}
          ` : ''}
        </nav>
      </aside>
      <div class="admin-main">
        <div class="admin-topbar">
          <header class="app-header admin-main-header">
            <div class="admin-header-brand">
              ${renderBrandLogo('wordmark-on-dark', 'brand-logo admin-brand-logo')}
              <div class="avatar admin-header-avatar" aria-hidden="true">${isSuperadmin() ? 'SA' : 'AD'}</div>
              <div class="admin-header-copy">
                <div class="admin-header-title">${isSuperadmin() ? 'Superadmin' : 'Painel admin'}</div>
                <div class="admin-header-subtitle">${brandCaseHTML(isSuperadmin() ? `${BRAND_NAME} · visão global` : activeInstitution.fullName || activeInstitution.name || BRAND_NAME)}</div>
              </div>
            </div>
            <div class="admin-header-actions">
              <button class="btn-ghost btn-sm admin-refresh-btn" id="btnAdminRefresh" type="button" aria-label="Atualizar dados">${icons.refresh}<span class="admin-refresh-label">Atualizar</span></button>
              <button class="icon-btn admin-notif-btn" id="btnAdminNotif" type="button" aria-label="${pendingCount ? `Abrir ofertas para aprovar, ${pendingCount} ${pendingCount === 1 ? 'pendente' : 'pendentes'}` : 'Abrir ofertas para aprovar'}">
                ${icons.bell}
                ${pendingCount ? '<span class="admin-notif-dot" aria-hidden="true"></span>' : ''}
              </button>
              <button class="btn-secondary btn-sm admin-logout-btn" id="btnAdminLogout" type="button">Sair</button>
            </div>
          </header>
          <nav class="admin-tabs-container" aria-label="Seções do painel">
            <div class="tabs admin-tabs">
              ${tabViews.map((view) => `
                <button class="tab ${adminView === view.id ? 'active' : ''}" type="button" data-admin-tab="${view.id}" ${adminView === view.id ? 'aria-current="page"' : ''}>
                  ${view.label}${view.id === 'moderation' && pendingCount ? ` <span class="tab-count">${pendingCount}</span>` : ''}
                </button>
              `).join('')}
            </div>
          </nav>
        </div>
        <main class="admin-body">
          <div id="admin-content">
            ${getAdminContent()}
          </div>
        </main>
      </div>
    </div>
  `;
  bindAdminEvents(container);
  revealActiveAdminTab(container);
  return true;
}

function getAdminContent() {
  switch (adminView) {
    case 'moderation': return renderModeration();
    case 'categories': return renderCategories();
    case 'reports': return renderReports();
    case 'settings': return renderSettings();
    case 'users': return isSuperadmin() ? renderPlatformUsers() : renderAdminDashboard();
    case 'institutions': return isSuperadmin() ? renderPlatformInstitutions() : renderAdminDashboard();
    default: return renderAdminDashboard();
  }
}

function renderPlatformUsers() {
  const institutions = platformInstitutions || [];
  const options = (selected) => `
    <option value="" ${!selected ? 'selected' : ''}>Sem instituição</option>
    ${institutions.map((item) => `<option value="${escapeHTML(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}`;
  const roleLabels = { buyer: 'Aluno', seller: 'Empresa', admin: 'Admin', superadmin: 'Superadmin' };
  const totalPages = Math.max(1, Math.ceil(platformUsersTotal / 25));
  return `
    ${renderViewHeader({
      eyebrow: 'Plataforma',
      title: 'Usuários',
      subtitle: `${platformUsersTotal} ${platformUsersTotal === 1 ? 'conta cadastrada' : 'contas cadastradas'}. Defina o papel e a instituição de cada conta.`,
    })}
    <form id="platform-user-search" class="platform-toolbar" role="search">
      <label class="platform-search">
        ${icons.search}
        <input class="platform-search-input" type="search" name="search" aria-label="Buscar usuários" placeholder="Nome ou e-mail" value="${escapeHTML(platformUsersSearch)}" />
      </label>
      <button class="btn-secondary platform-search-btn" type="submit">Buscar</button>
    </form>
    ${platformUsersError ? `<p class="alert alert-danger platform-error" role="alert">${icons.alertTriangle}<span>${escapeHTML(platformUsersError)}</span></p>` : ''}
    <section class="platform-list">
      ${platformUsers.length ? `
        <div class="platform-list-head platform-user-grid" aria-hidden="true">
          <span>Conta</span><span>Papel</span><span>Instituição</span><span></span>
        </div>
      ` : ''}
      <div class="platform-user-list">
        ${platformUsers.map((user) => `
          <form class="platform-user-row platform-user-grid" data-platform-user="${escapeHTML(user.id)}">
            <div class="platform-user-identity">
              <span class="avatar avatar-sm">${escapeHTML(getInitials(user.name))}</span>
              <span class="platform-user-copy">
                <strong>${escapeHTML(user.name || 'Usuário')}</strong>
                <span>${escapeHTML(user.email)}</span>
              </span>
            </div>
            <label class="platform-cell">
              <span class="platform-cell-label">Papel</span>
              <select class="input-field admin-input-sm" name="role" ${user.role === 'superadmin' ? 'disabled' : ''}>
                ${Object.entries(roleLabels).filter(([role]) => role !== 'superadmin' || user.role === 'superadmin').map(([role, label]) => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
            <label class="platform-cell">
              <span class="platform-cell-label">Instituição</span>
              <select class="input-field admin-input-sm" name="institutionId" ${user.role === 'superadmin' ? 'disabled' : ''}>${options(user.institution_id)}</select>
            </label>
            <div class="platform-row-action">
              ${user.role === 'superadmin' ? '<span class="status-pill platform-protected">Conta protegida</span>' : '<button class="btn-secondary btn-sm" type="submit">Salvar</button>'}
            </div>
          </form>
        `).join('') || renderAdminEmpty({ icon: icons.search, title: 'Nenhum usuário encontrado', text: 'Confira a grafia ou busque por outro nome ou e-mail.' })}
      </div>
    </section>
    <div class="platform-pagination">
      <button class="btn-secondary btn-sm" type="button" data-platform-page="prev" ${platformUsersPage <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="platform-page-info">Página ${platformUsersPage} de ${totalPages}</span>
      <button class="btn-secondary btn-sm" type="button" data-platform-page="next" ${platformUsersPage * 25 >= platformUsersTotal ? 'disabled' : ''}>Próxima</button>
    </div>
  `;
}

function renderPlatformInstitutions() {
  return `
    ${renderViewHeader({
      eyebrow: 'Plataforma',
      title: 'Instituições',
      subtitle: `${platformInstitutions.length} ${platformInstitutions.length === 1 ? 'instituição cadastrada' : 'instituições cadastradas'}. O domínio define quem entra com e-mail institucional.`,
    })}
    <section class="platform-list">
      ${platformInstitutions.length ? `
        <div class="platform-list-head platform-institution-grid" aria-hidden="true">
          <span>Nome curto</span><span>Nome completo</span><span>Domínio</span><span></span>
        </div>
      ` : ''}
      <div class="platform-institution-list">
        ${platformInstitutions.map((item) => `
          <form class="platform-institution-row platform-institution-grid" data-platform-institution="${escapeHTML(item.id)}">
            <label class="platform-cell"><span class="platform-cell-label">Nome curto</span><input class="input-field admin-input-sm" name="name" required value="${escapeHTML(item.name)}" /></label>
            <label class="platform-cell"><span class="platform-cell-label">Nome completo</span><input class="input-field admin-input-sm" name="fullName" required value="${escapeHTML(item.fullName)}" /></label>
            <label class="platform-cell"><span class="platform-cell-label">Domínio</span><input class="input-field admin-input-sm" name="domain" required value="${escapeHTML(item.domain)}" /></label>
            <div class="platform-row-action"><button class="btn-secondary btn-sm" type="submit">Salvar</button></div>
          </form>`).join('') || renderAdminEmpty({ icon: icons.all, title: 'Nenhuma instituição cadastrada', text: 'Cadastre a primeira no formulário abaixo.' })}
      </div>
    </section>
    <section class="admin-section">
      <div class="admin-section-header">
        <div>
          <h2 class="admin-section-title platform-create-title">Nova instituição</h2>
          <p class="admin-section-subtitle">Use o domínio do e-mail dos alunos, com @ na frente.</p>
        </div>
      </div>
      <form id="platform-institution-create" class="card platform-create-form">
        <label class="platform-field"><span class="platform-field-label">Nome curto</span><input class="input-field admin-input-sm" name="name" required maxlength="80" placeholder="Ex.: iCEV" /></label>
        <label class="platform-field platform-field-wide"><span class="platform-field-label">Nome completo</span><input class="input-field admin-input-sm" name="fullName" required maxlength="160" placeholder="Ex.: Instituto de Ensino Superior iCEV" /></label>
        <label class="platform-field"><span class="platform-field-label">Domínio</span><input class="input-field admin-input-sm" name="domain" required placeholder="@exemplo.edu.br" /></label>
        <div class="platform-create-actions">
          <button class="btn-primary btn-sm" type="submit">${icons.plus} Criar instituição</button>
        </div>
      </form>
    </section>
  `;
}

function renderAdminDashboard() {
  const s = loadedStats || (USE_MOCKS ? adminStats : {});
  const realAlerts = buildAdminAlerts();
  const topSellers = buildTopSellers();
  const stats = [
    { id: 'students', label: 'Alunos', value: s.students?.value ?? 0, change: s.students?.change || '', positive: true, icon: icons.user },
    { id: 'clicks', label: 'Cliques', value: s.clicks?.value ?? 0, change: s.clicks?.change || '', positive: true, icon: icons.eye },
    { id: 'couponsGenerated', label: 'Cupons retirados', value: s.couponsGenerated?.value ?? 0, change: s.couponsGenerated?.change || '', positive: true, icon: icons.ticket },
    { id: 'couponsUsed', label: 'Cupons usados', value: s.couponsUsed?.value ?? 0, change: s.couponsUsed?.change || '', positive: true, icon: icons.checkCircle },
    { id: 'conversion', label: 'Taxa de uso', value: s.conversionRate?.value ?? '0%', change: s.conversionRate?.change || '', positive: true, icon: icons.chart },
    { id: 'pending', label: 'Ofertas para aprovar', value: getPendingList().length, change: '', positive: true, icon: icons.clock },
  ];
  const pendingList = getPendingList();
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return `
    ${renderViewHeader({
      eyebrow: `${brandCaseHTML(isSuperadmin() ? `${BRAND_NAME} · visão global` : activeInstitution.name || activeInstitution.fullName || BRAND_NAME)} · ${escapeHTML(today)}`,
      title: 'Visão geral',
      subtitle: 'Cupons, ofertas para aprovar e alertas em um só lugar.',
    })}
    <div class="admin-stats-grid">
      ${stats.map(s => {
        const change = String(s.change || '').trim();
        const isAttention = s.id === 'pending' && Number(s.value) > 0;
        return `
        <button class="card stat-card admin-metric-card ${isAttention ? 'is-highlight' : ''}" type="button" data-admin-metric="${s.id}" aria-label="Abrir detalhes de ${escapeHTML(s.label)}">
          <span class="admin-metric-top">
            <span class="stat-icon admin-metric-icon">${s.icon || ''}</span>
            ${change ? `<span class="stat-change admin-metric-change ${s.positive ? 'positive' : 'negative'}">${escapeHTML(change)}</span>` : ''}
          </span>
          <span class="stat-info">
            <span class="stat-value admin-metric-value">${s.value}</span>
            <span class="stat-label admin-metric-label">${s.label}</span>
          </span>
        </button>
      `;
      }).join('')}
    </div>

    <div class="admin-dash-grid">
      <div class="admin-dash-col">
        <section class="admin-section">
          <div class="admin-section-header">
            <div>
              <h2 class="admin-section-title">Aguardando aprovação</h2>
              <p class="admin-section-subtitle">${pendingList.length > 2 ? 'As 2 primeiras da fila.' : pendingList.length ? 'Tudo o que está na fila agora.' : 'Nada novo por enquanto.'}</p>
            </div>
            <button class="btn-ghost btn-sm admin-link-btn" type="button" data-admin-tab="moderation">Ver fila ${icons.arrowRight}</button>
          </div>
          ${pendingList.length
            ? `<div class="moderation-list">${pendingList.slice(0, 2).map(ad => renderModerationCard(ad)).join('')}</div>`
            : renderAdminEmpty({ icon: icons.shield, title: 'Fila limpa', text: 'Nenhuma oferta aguardando aprovação agora.' })}
        </section>

        <section class="admin-section">
          <div class="admin-section-header">
            <div>
              <h2 class="admin-section-title">Novas ofertas</h2>
              <p class="admin-section-subtitle">Ofertas criadas nos últimos 7 dias.</p>
            </div>
          </div>
          <div class="card chart-container">
            <canvas id="admin-chart" height="200" role="img" aria-label="Gráfico de ofertas criadas nos últimos 7 dias"></canvas>
          </div>
        </section>
      </div>

      <div class="admin-dash-col">
        <section class="admin-section">
          <div class="admin-section-header">
            <h2 class="admin-section-title">Alertas</h2>
            <span class="admin-section-count">${realAlerts.length ? `${realAlerts.length} ${realAlerts.length === 1 ? 'ativo' : 'ativos'}` : 'Tudo certo'}</span>
          </div>
          ${realAlerts.length ? `
            <div class="alerts-list">
              ${realAlerts.map(a => `
                <div class="alert-card ${a.level === 'critical' ? 'critical' : ''}">
                  <span class="alert-card-icon">${icons.alertTriangle}</span>
                  <div class="alert-card-content">
                    <h4>${escapeHTML(a.title)}</h4>
                    <p>${escapeHTML(a.description)}</p>
                    <span class="alert-time">${escapeHTML(a.time)}</span>
                  </div>
                  <button class="btn btn-sm alert-card-action" type="button" data-alert-view="${escapeHTML(getAlertView(a))}">${escapeHTML(a.action)}</button>
                </div>
              `).join('')}
            </div>
          ` : renderAdminEmpty({ icon: icons.checkCircle, title: 'Nenhum alerta agora', text: 'Ofertas e aprovações estão sem pendências críticas.' })}
        </section>

        <section class="admin-section">
          <div class="admin-section-header">
            <h2 class="admin-section-title">Empresas mais ativas</h2>
          </div>
          ${topSellers.length ? `
            <ol class="sellers-list">
              ${topSellers.map((seller, i) => `
                <li class="seller-row">
                  <span class="seller-rank">${String(i + 1).padStart(2, '0')}</span>
                  <span class="avatar avatar-sm">${escapeHTML(seller.avatar)}</span>
                  <div class="seller-row-info">
                    <h4>${escapeHTML(seller.name)}</h4>
                    <p>${escapeHTML(seller.course || 'Sem curso informado')}</p>
                  </div>
                  <div class="seller-row-stats">
                    <span>${seller.ads} ${seller.ads === 1 ? 'oferta' : 'ofertas'}</span>
                    <span>${seller.active} ${seller.active === 1 ? 'ativa' : 'ativas'}</span>
                  </div>
                </li>
              `).join('')}
            </ol>
          ` : renderAdminEmpty({ icon: icons.user, title: 'Nenhuma empresa ativa ainda', text: 'Quando houver ofertas cadastradas, as empresas mais ativas aparecem aqui.' })}
        </section>
      </div>
    </div>
  `;
}

// Each alert names the view its action opens; approval is the default.
function getAlertView(alert) {
  return alert.view || 'moderation';
}

function buildAdminAlerts() {
  const alertsList = [];
  const pendingCount = (loadedPendingAds || []).length;
  const activeProducts = (loadedAllProducts || []).filter(product => product.status === 'active');
  if (pendingCount > 0) {
    alertsList.push({
      level: pendingCount >= 5 ? 'critical' : 'warning',
      title: `${pendingCount} ${pendingCount > 1 ? 'ofertas aguardando' : 'oferta aguardando'} aprovação`,
      description: 'Revise a fila para aprovar as ofertas ou pedir ajustes às empresas.',
      time: 'Agora',
      action: 'Revisar ofertas',
      view: 'moderation',
    });
  }
  if (activeProducts.length === 0) {
    alertsList.push({
      level: 'warning',
      title: 'Nenhuma oferta ativa na vitrine',
      description: 'A vitrine dos alunos fica vazia até uma oferta ser aprovada.',
      time: 'Agora',
      action: 'Ver fila de aprovação',
      view: 'moderation',
    });
  }
  return alertsList;
}

function buildTopSellers() {
  const sellers = new Map();
  (loadedAllProducts || []).forEach(product => {
    const seller = product.seller || {};
    const id = seller.id || product.sellerId || 'unknown';
    const current = sellers.get(id) || {
      name: seller.name || 'Empresa',
      course: seller.course || '',
      avatar: seller.avatar || getInitials(seller.name, 'EM'),
      ads: 0,
      active: 0,
    };
    current.ads += 1;
    if (product.status === 'active') current.active += 1;
    sellers.set(id, current);
  });
  return Array.from(sellers.values())
    .sort((a, b) => b.active - a.active || b.ads - a.ads)
    .slice(0, 5);
}

function renderModeration() {
  const ads = getPendingList();
  return `
    ${renderViewHeader({
      eyebrow: `Aprovar ofertas · ${ads.length} ${ads.length === 1 ? 'pendente' : 'pendentes'}`,
      title: 'Ofertas para aprovar',
      subtitle: 'Aprove, recuse ou peça ajuste antes de a oferta chegar aos alunos. Toque na oferta para ver fotos e detalhes.',
    })}
    ${ads.length > 0
      ? `<div class="moderation-list">${ads.map(ad => renderModerationCard(ad)).join('')}</div>`
      : renderAdminEmpty({
        icon: icons.shield,
        title: 'Nenhuma oferta para aprovar',
        text: 'Todas as ofertas foram revisadas. As novas aparecem aqui assim que chegarem.',
        action: '<button class="btn-secondary btn-sm" type="button" data-admin-tab="categories">Ver categorias</button>',
      })}
  `;
}

function renderModerationCard(ad) {
  const seller = ad.seller || {};
  const sellerStudy = [seller.course, seller.semester].filter(Boolean).join(' · ');
  return `
    <article class="moderation-card" data-ad-id="${ad.id}">
      <div class="moderation-card-inner" data-admin-product-detail="${escapeHTML(ad.id)}" role="button" tabindex="0" aria-label="Abrir detalhes de ${escapeHTML(ad.title)}">
        <div class="moderation-thumb">${getProductImage(ad.images?.[0], 80, 80, ad.category)}</div>
        <div class="moderation-info">
          <h3 class="moderation-title">${escapeHTML(ad.title)}</h3>
          <p class="moderation-meta">
            <span class="moderation-meta-item">${icons.user}<span>${escapeHTML(seller.name || 'Empresa sem perfil')}${sellerStudy ? ` · ${escapeHTML(sellerStudy)}` : ''}</span></span>
            <span class="moderation-meta-item">${icons.tag}<span>${escapeHTML(getCategoryLabel(ad.category))}</span></span>
          </p>
          <p class="moderation-foot">
            <span class="moderation-wait">${icons.clock} Aguardando há ${escapeHTML(ad.waitTime || 'pouco tempo')}</span>
            ${ad.sellerHistory ? `<span class="moderation-history">${escapeHTML(ad.sellerHistory.approved)} ${Number(ad.sellerHistory.approved) === 1 ? 'aprovada' : 'aprovadas'} · ${escapeHTML(ad.sellerHistory.rejected)} ${Number(ad.sellerHistory.rejected) === 1 ? 'recusada' : 'recusadas'}</span>` : ''}
          </p>
        </div>
        <div class="moderation-pricing">
          <span class="moderation-price">${formatCurrency(ad.discountPrice)}</span>
          <span class="moderation-price-meta">
            <s class="moderation-original">${formatCurrency(ad.originalPrice)}</s>
            <span class="moderation-discount">-${ad.discount}%</span>
          </span>
        </div>
      </div>
      <div class="moderation-actions">
        <button class="btn-success btn-sm approve-btn" type="button" data-ad-id="${ad.id}">${icons.check} Aprovar</button>
        <button class="btn-danger btn-sm reject-btn" type="button" data-ad-id="${ad.id}">${icons.x} Recusar</button>
        <button class="btn-secondary btn-sm adjust-btn" type="button" data-ad-id="${ad.id}">Pedir ajuste</button>
      </div>
    </article>
  `;
}

function getAdminCategoryRows() {
  const products = Array.isArray(loadedAllProducts) ? loadedAllProducts.filter(Boolean) : [];
  return getAdminCategories(false).map(category => {
    const items = products.filter(product => product.category === category.id);
    const fallbackStats = loadedCategoryStats?.[category.id] || {};
    const active = items.length
      ? items.filter(product => product.status === 'active').length
      : Number(fallbackStats.active || 0);
    const queue = items.length
      ? items.filter(product => product.status === 'pending' || product.status === 'queue').length
      : Number(fallbackStats.queue || fallbackStats.pending || 0);
    const rejected = items.filter(product => product.status === 'rejected' || product.status === 'needs_adjustment').length;
    const expired = items.filter(product => product.status === 'expired').length;
    const clicks = items.reduce((sum, product) => sum + Number(product.clicks || 0), 0);
    const slotsUsed = items.reduce((sum, product) => sum + Number(product.slots?.used || 0), 0);
    const slotsTotal = items.reduce((sum, product) => sum + Number(product.slots?.total || 0), 0);
    const total = items.length || active + queue;
    const pct = total ? Math.min(Math.round((active / total) * 100), 100) : 0;
    return {
      ...category,
      items,
      active,
      queue,
      rejected,
      expired,
      clicks,
      slotsUsed,
      slotsTotal,
      total,
      pct,
    };
  });
}

function getProductStatusMeta(status) {
  const map = {
    active: { label: 'Ativa', badge: 'badge-success' },
    pending: { label: 'Em análise', badge: 'badge-warning' },
    queue: { label: 'Na fila', badge: 'badge-warning' },
    needs_adjustment: { label: 'Ajuste solicitado', badge: 'badge-warning' },
    rejected: { label: 'Ajuste/recusa', badge: 'badge-danger' },
    expired: { label: 'Expirada', badge: 'badge-neutral' },
  };
  return map[status] || { label: 'Sem status', badge: 'badge-neutral' };
}

function getCategoryProducts(categoryId) {
  const products = Array.isArray(loadedAllProducts) ? loadedAllProducts.filter(Boolean) : [];
  return products.filter(product => product.category === categoryId);
}

function filterCategoryProducts(products) {
  if (categoryStatusFilter === 'active') return products.filter(product => product.status === 'active');
  if (categoryStatusFilter === 'pending') return products.filter(product => product.status === 'pending' || product.status === 'queue');
  if (categoryStatusFilter === 'rejected') return products.filter(product => product.status === 'rejected' || product.status === 'needs_adjustment');
  if (categoryStatusFilter === 'expired') return products.filter(product => product.status === 'expired');
  return products;
}

function formatAdminDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function renderCategoryProductRow(product) {
  const category = getAdminCategories().find(c => c.id === product.category);
  const status = getProductStatusMeta(product.status);
  const image = Array.isArray(product.images) ? product.images[0] : product.images;
  const isModeratable = product.status === 'pending' || product.status === 'queue';
  return `
    <article class="category-product-row" data-category-product-row="${escapeHTML(product.id)}">
      <button class="category-product-thumb" type="button" data-category-product-detail="${escapeHTML(product.id)}" aria-label="Abrir detalhes de ${escapeHTML(product.title)}">
        ${getProductImage(image, 96, 96, product.category)}
      </button>
      <div class="category-product-main">
        <div class="category-product-titleline">
          <button class="category-product-title" type="button" data-category-product-detail="${escapeHTML(product.id)}">${escapeHTML(product.title)}</button>
          <span class="status-pill admin-status ${status.badge}">${status.label}</span>
        </div>
        <div class="category-product-meta">
          <span class="category-product-meta-item">${icons.user} ${escapeHTML(product.seller?.name || 'Empresa sem perfil')}</span>
          <span class="category-product-meta-item">${icons.tag} ${escapeHTML(category?.name || product.category || 'Categoria')}</span>
          <span class="category-product-meta-item">${icons.clock} ${formatAdminDate(product.createdAt)}</span>
        </div>
        ${product.rejectionReason ? `<p class="category-product-reason">${escapeHTML(product.rejectionReason)}</p>` : ''}
      </div>
      <div class="category-product-kpis">
        <span class="category-product-price">${formatCurrency(product.discountPrice)}</span>
        <span class="category-product-kpi">${Number(product.clicks || 0)} cliques</span>
        <span class="category-product-kpi">${Number(product.slots?.used || 0)}/${Number(product.slots?.total || 5)} cupons</span>
      </div>
      <div class="category-product-actions">
        ${isModeratable ? `
          <button class="btn-success btn-sm" type="button" data-category-product-approve="${escapeHTML(product.id)}">${icons.check} Aprovar</button>
          <button class="btn-secondary btn-sm" type="button" data-category-product-adjust="${escapeHTML(product.id)}">Pedir ajuste</button>
        ` : ''}
        <button class="btn-ghost btn-sm" type="button" data-category-product-detail="${escapeHTML(product.id)}">${icons.eye} Ver detalhes</button>
        <button class="btn-danger btn-sm" type="button" data-category-product-delete="${escapeHTML(product.id)}">Excluir</button>
      </div>
    </article>
  `;
}

function renderCategories() {
  const rows = getAdminCategoryRows();
  if (!selectedCategoryId || !rows.some(row => row.id === selectedCategoryId)) {
    selectedCategoryId = rows.find(row => row.queue > 0)?.id || rows.find(row => row.total > 0)?.id || rows[0]?.id || null;
  }
  const selectedCategory = rows.find(row => row.id === selectedCategoryId) || rows[0];
  const selectedProducts = selectedCategory ? getCategoryProducts(selectedCategory.id) : [];
  const filteredProducts = filterCategoryProducts(selectedProducts);
  const totals = rows.reduce((acc, row) => ({
    products: acc.products + row.total,
    active: acc.active + row.active,
    queue: acc.queue + row.queue,
    rejected: acc.rejected + row.rejected,
  }), { products: 0, active: 0, queue: 0, rejected: 0 });
  const filters = [
    { id: 'all', label: 'Todas', count: selectedProducts.length },
    { id: 'pending', label: 'Em análise', count: selectedProducts.filter(product => product.status === 'pending' || product.status === 'queue').length },
    { id: 'active', label: 'Ativas', count: selectedProducts.filter(product => product.status === 'active').length },
    { id: 'rejected', label: 'Ajustes', count: selectedProducts.filter(product => product.status === 'rejected' || product.status === 'needs_adjustment').length },
    { id: 'expired', label: 'Expiradas', count: selectedProducts.filter(product => product.status === 'expired').length },
  ];

  return `
    ${renderViewHeader({
      eyebrow: `Categorias · ${totals.products} ${totals.products === 1 ? 'oferta' : 'ofertas'}`,
      title: 'Gestão de categorias',
      subtitle: 'Escolha uma categoria para acompanhar a fila, as ofertas ativas e os ajustes.',
      actions: `<button class="btn-primary btn-sm" type="button" data-category-create>${icons.plus} Criar categoria</button>`,
    })}
    <div class="category-summary-grid">
      <div class="card category-metric-card"><span class="admin-kpi-label">Total</span><strong class="admin-kpi-value">${totals.products}</strong><small class="admin-kpi-hint">Ofertas cadastradas</small></div>
      <div class="card category-metric-card"><span class="admin-kpi-label is-success">Ativas</span><strong class="admin-kpi-value">${totals.active}</strong><small class="admin-kpi-hint">Visíveis para os alunos</small></div>
      <div class="card category-metric-card"><span class="admin-kpi-label is-warning">Na fila</span><strong class="admin-kpi-value">${totals.queue}</strong><small class="admin-kpi-hint">Aguardando aprovação</small></div>
      <div class="card category-metric-card"><span class="admin-kpi-label is-danger">Ajustes</span><strong class="admin-kpi-value">${totals.rejected}</strong><small class="admin-kpi-hint">Com retorno à empresa</small></div>
    </div>

    <section class="admin-section">
      <div class="admin-section-header">
        <h2 class="admin-section-title">Categorias</h2>
        <span class="admin-section-count">${rows.length} ${rows.length === 1 ? 'categoria' : 'categorias'}</span>
      </div>
      <div class="category-heat-grid">
        ${rows.map(cat => {
          const pct = cat.pct;
          const barClass = pct >= 80 ? 'success' : cat.queue > 0 ? 'warning' : 'danger';
          const statusBadge = cat.active > 0 ? 'badge-success' : cat.queue > 0 ? 'badge-warning' : 'badge-neutral';
          const statusLabel = cat.active > 0 ? 'Com ofertas' : cat.queue > 0 ? 'Em análise' : 'Sem ofertas';
          return `
            <article class="card category-heat-card ${selectedCategory?.id === cat.id ? 'is-selected' : ''}" role="button" tabindex="0" data-category-select="${escapeHTML(cat.id)}" aria-pressed="${selectedCategory?.id === cat.id ? 'true' : 'false'}">
              <div class="category-heat-header">
                <span class="category-heat-icon">${icons[cat.id] || icons.package}</span>
                <span class="status-pill admin-status ${statusBadge}">${statusLabel}</span>
              </div>
              <h3 class="category-heat-name">${escapeHTML(cat.name)}</h3>
              <div class="category-heat-slots">
                <span><strong class="category-heat-num">${cat.active}</strong> ${cat.active === 1 ? 'ativa' : 'ativas'}</span>
                <span><strong class="category-heat-num">${cat.queue}</strong> em análise</span>
                <span><strong class="category-heat-num">${cat.rejected}</strong> ${cat.rejected === 1 ? 'ajuste' : 'ajustes'}</span>
              </div>
              <div class="category-heat-meter">
                <div class="progress-bar">
                  <div class="progress-fill admin-bar-${barClass}" style="width:${pct}%;"></div>
                </div>
                <div class="category-heat-footer">
                  <span>${pct}% ativas</span>
                  <span>${cat.clicks} ${cat.clicks === 1 ? 'clique' : 'cliques'}</span>
                </div>
              </div>
              <p class="category-rule-line">${Number(cat.maxSlots || 5)}&nbsp;cupons por oferta · ${Number(cat.durationHours || 24)}h de vitrine</p>
              ${getCategoryRules(cat.id) ? `<p class="category-rule-preview">${escapeHTML(getCategoryRules(cat.id))}</p>` : ''}
              <div class="category-heat-actions">
                <button class="btn-secondary btn-sm" type="button" data-category-open="${escapeHTML(cat.id)}">${icons.eye} Ver ofertas</button>
                <button class="btn-ghost btn-sm" type="button" data-category-edit="${escapeHTML(cat.id)}">Editar regras</button>
                ${cat.queue ? `<button class="btn-ghost btn-sm" type="button" data-category-moderate="${escapeHTML(cat.id)}">Revisar pendentes</button>` : ''}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>

    <section class="admin-section card category-management-panel" id="category-management-panel">
      <div class="category-management-header">
        <div class="category-management-title">
          <span class="category-management-icon">${icons[selectedCategory?.id] || icons.package}</span>
          <div class="category-management-copy">
            <span class="t-eyebrow">Categoria selecionada</span>
            <h2>${escapeHTML(selectedCategory?.name || 'Categoria')}</h2>
            <p>${selectedCategory?.total || 0} ${selectedCategory?.total === 1 ? 'oferta' : 'ofertas'} · ${selectedCategory?.active || 0} ${selectedCategory?.active === 1 ? 'ativa' : 'ativas'} · ${selectedCategory?.queue || 0} em análise · ${Number(selectedCategory?.maxSlots || 5)}&nbsp;cupons por oferta</p>
          </div>
        </div>
        <div class="category-management-actions">
          <button class="btn-secondary btn-sm" type="button" data-category-edit="${escapeHTML(selectedCategory?.id || '')}">Editar regras e cupons</button>
          <button class="btn-secondary btn-sm" type="button" data-admin-tab="moderation">${icons.shield} Ver fila de aprovação</button>
          <button class="btn-danger btn-sm" type="button" data-category-delete="${escapeHTML(selectedCategory?.id || '')}" ${selectedCategory?.total ? 'disabled aria-describedby="category-delete-hint"' : ''}>Excluir categoria</button>
        </div>
        ${selectedCategory?.total ? '<p class="category-delete-hint" id="category-delete-hint">Só dá para excluir uma categoria sem ofertas.</p>' : ''}
      </div>
      ${selectedCategory && getCategoryRules(selectedCategory.id) ? `
        <div class="category-rule-detail">
          <span class="t-eyebrow">Observação da equipe</span>
          <span>${escapeHTML(getCategoryRules(selectedCategory.id))}</span>
        </div>
      ` : ''}

      <div class="category-filter-row" role="tablist" aria-label="Filtrar ofertas da categoria">
        ${filters.map(filter => `
          <button class="chip category-filter-btn ${categoryStatusFilter === filter.id ? 'active' : ''}" type="button" data-category-filter="${filter.id}" role="tab" aria-selected="${categoryStatusFilter === filter.id ? 'true' : 'false'}">
            ${escapeHTML(filter.label)}
            <span class="category-filter-count">${filter.count}</span>
          </button>
        `).join('')}
      </div>

      <div class="category-products-list">
        ${filteredProducts.length
          ? filteredProducts.map(product => renderCategoryProductRow(product)).join('')
          : renderAdminEmpty({
            icon: icons.package,
            title: 'Nenhuma oferta neste filtro',
            text: categoryStatusFilter === 'all'
              ? 'Quando houver ofertas nesta categoria, elas aparecem aqui para análise e acompanhamento.'
              : 'Troque o filtro para ver as outras ofertas desta categoria.',
            action: categoryStatusFilter === 'all' ? '' : '<button class="btn-secondary btn-sm" type="button" data-category-filter="all">Mostrar todas</button>',
          })}
      </div>
    </section>
  `;
}

function renderReports() {
  const s = loadedStats || (USE_MOCKS ? adminStats : {});
  const products = loadedAllProducts || [];
  const rows = getAdminCategoryRows();
  const sellersCount = new Set(products.map(product => product.seller?.id || product.sellerId).filter(Boolean)).size;
  const activeProducts = products.filter(product => product.status === 'active').length;
  const pendingProducts = products.filter(product => product.status === 'pending' || product.status === 'queue').length;
  const expiredProducts = products.filter(product => product.status === 'expired').length;
  const totalClicks = products.reduce((sum, product) => sum + Number(product.clicks || 0), 0);
  const mostActiveCategory = rows.sort((a, b) => b.active - a.active || b.clicks - a.clicks)[0];
  const topProducts = [...products].sort((a, b) => Number(b.clicks || 0) - Number(a.clicks || 0)).slice(0, 5);
  // Stats may arrive localized ("1.234"); keep digits only for the hint.
  const toCount = (value) => Number(String(value ?? 0).replace(/\D/g, '')) || 0;
  const couponsRetrieved = toCount(s.couponsGenerated?.value);
  const couponsUsed = toCount(s.couponsUsed?.value);
  const usageHint = couponsRetrieved > 0
    ? `${couponsUsed} de ${couponsRetrieved} ${couponsRetrieved === 1 ? 'cupom usado' : 'cupons usados'}`
    : 'Cupons usados / retirados';
  return `
    ${renderViewHeader({
      eyebrow: `Relatórios · ${new Date().toLocaleDateString('pt-BR')}`,
      title: 'Relatórios operacionais',
      subtitle: 'Ofertas, empresas, cliques e cupons lidos direto da base.',
      actions: `
        <button class="btn-secondary btn-sm" type="button" data-admin-tab="categories">${icons.grid} Ver categorias</button>
        <button class="btn-primary btn-sm" type="button" id="btnExportPDF">${icons.fileText} Exportar relatório (.txt)</button>
      `,
    })}

    <div class="report-action-grid">
      <button class="card report-action-card" type="button" data-admin-metric="students"><span class="admin-kpi-label">Empresas</span><strong class="admin-kpi-value">${sellersCount}</strong><small class="admin-kpi-hint">Com ofertas cadastradas</small></button>
      <button class="card report-action-card" type="button" data-admin-tab="categories"><span class="admin-kpi-label is-success">Ofertas ativas</span><strong class="admin-kpi-value">${activeProducts}</strong><small class="admin-kpi-hint">Visíveis para os alunos</small></button>
      <button class="card report-action-card" type="button" data-admin-tab="moderation"><span class="admin-kpi-label is-warning">Pendentes</span><strong class="admin-kpi-value">${pendingProducts}</strong><small class="admin-kpi-hint">Aguardando aprovação</small></button>
      <button class="card report-action-card" type="button" data-admin-metric="clicks"><span class="admin-kpi-label">Cliques</span><strong class="admin-kpi-value">${totalClicks}</strong><small class="admin-kpi-hint">Interações com as ofertas</small></button>
      <button class="card report-action-card" type="button" data-admin-metric="couponsGenerated"><span class="admin-kpi-label">Retirados</span><strong class="admin-kpi-value">${escapeHTML(String(s.couponsGenerated?.value ?? 0))}</strong><small class="admin-kpi-hint">Códigos retirados pelos alunos</small></button>
      <button class="card report-action-card" type="button" data-admin-metric="conversion"><span class="admin-kpi-label">Taxa de uso</span><strong class="admin-kpi-value">${escapeHTML(String(s.conversionRate?.value ?? '0%'))}</strong><small class="admin-kpi-hint">${escapeHTML(usageHint)}</small></button>
    </div>

    <div class="reports-insight-grid">
      <section class="card report-panel">
        <h2 class="report-panel-title">Saúde da vitrine</h2>
        <dl class="report-list">
          <div class="report-list-row"><dt>Categoria mais ativa</dt><dd>${escapeHTML(mostActiveCategory?.name || 'Sem dados')}</dd></div>
          <div class="report-list-row"><dt>Ofertas expiradas</dt><dd>${expiredProducts}</dd></div>
          <div class="report-list-row"><dt>Ofertas cadastradas</dt><dd>${products.length}</dd></div>
        </dl>
      </section>
      <section class="card report-panel">
        <h2 class="report-panel-title">Ofertas com mais cliques</h2>
        ${topProducts.length ? `
          <ol class="report-product-list">
            ${topProducts.map((product, index) => `
              <li>
                <button class="report-product-row" type="button" data-category-product-detail="${escapeHTML(product.id)}">
                  <span class="report-product-rank">${String(index + 1).padStart(2, '0')}</span>
                  <span class="report-product-name">${escapeHTML(product.title)}</span>
                  <strong class="report-product-clicks">${Number(product.clicks || 0)} cliques</strong>
                </button>
              </li>
            `).join('')}
          </ol>
        ` : '<p class="muted-text">Nenhum clique registrado ainda.</p>'}
      </section>
    </div>

    <div class="reports-grid">
      <section class="card chart-container">
        <h2 class="chart-title">Ofertas ativas por categoria</h2>
        <canvas id="report-chart-1" height="200" role="img" aria-label="Gráfico de ofertas ativas por categoria"></canvas>
      </section>
      <section class="card chart-container">
        <h2 class="chart-title">Ofertas em análise por categoria</h2>
        <canvas id="report-chart-2" height="200" role="img" aria-label="Gráfico de ofertas em análise por categoria"></canvas>
      </section>
    </div>
  `;
}

function renderSettings() {
  const noInstitution = !activeInstitution?.id;
  const primaryDomain = String(activeInstitution.domain || '').trim();
  return `
    ${renderViewHeader({
      eyebrow: `Configurações · ${brandCaseHTML(activeInstitution.name || activeInstitution.fullName || BRAND_NAME)}`,
      title: 'Configurações da instituição',
      subtitle: 'Quem pode criar conta e como a instituição aparece no painel.',
    })}
    ${noInstitution ? `
      <div class="alert alert-warning admin-inline-alert" role="status">
        ${icons.alertTriangle}
        <span>Nenhuma instituição real está vinculada a este admin. Vincule o usuário a uma instituição no Supabase ou mantenha só uma instituição cadastrada para editar aqui.</span>
      </div>
    ` : ''}
    <div class="settings-section">
      <section class="settings-group">
        <div class="settings-group-head">
          <h2 class="settings-group-title">Acesso</h2>
          <p>Só e-mails destes domínios conseguem criar conta.</p>
        </div>
        <div class="card settings-card">
          <div class="setting-item">
            <div class="setting-item-info">
              <h4>Domínio principal</h4>
              ${renderDomainList(primaryDomain ? [primaryDomain] : [], 'Não configurado')}
            </div>
            <button class="btn btn-sm setting-edit-btn" type="button" data-setting="domain" ${noInstitution ? 'disabled' : ''}>Editar</button>
          </div>
          <div class="setting-item">
            <div class="setting-item-info">
              <h4>Domínios extras</h4>
              ${renderDomainList(getExtraDomains(), 'Nenhum domínio extra')}
            </div>
            <button class="btn btn-sm setting-edit-btn" type="button" data-setting-list="extra_domains" ${noInstitution ? 'disabled' : ''}>Editar</button>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <div class="settings-group-head">
          <h2 class="settings-group-title">Instituição</h2>
          <p>Nome completo mostrado no painel da equipe.</p>
        </div>
        <div class="card settings-card">
          <div class="setting-item">
            <div class="setting-item-info"><h4>Nome da instituição</h4><p>${escapeHTML(activeInstitution.fullName)}</p></div>
            <button class="btn btn-sm setting-edit-btn" type="button" data-setting="fullName" ${noInstitution ? 'disabled' : ''}>Editar</button>
          </div>
        </div>
      </section>

      <div class="settings-real-summary">
        <span class="settings-summary-chip">${getAdminCategories(false).length} categorias</span>
        <span class="settings-summary-chip">${(loadedAllProducts || []).length} ofertas cadastradas</span>
        <span class="settings-summary-chip">${(loadedPendingAds || []).length} pendentes</span>
      </div>
    </div>
  `;
}

function scrollCategoryManagementIntoView(container) {
  requestAnimationFrame(() => {
    container.querySelector('#category-management-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function showAdminProductDetails(productId, container) {
  const products = [...(loadedAllProducts || []), ...(loadedPendingAds || [])];
  const product = products.find(item => String(item.id) === String(productId));
  if (!product) {
    showToast('Oferta não encontrada nesta sessão.', 'error');
    return;
  }

  const modalRoot = document.getElementById('modal-root');
  const category = getAdminCategories().find(c => c.id === product.category);
  // Offers opened from the approval queue are pending even when the row carries no status.
  const isQueued = (loadedPendingAds || []).some(item => String(item.id) === String(productId));
  const productStatus = product.status || (isQueued ? 'pending' : '');
  const status = getProductStatusMeta(productStatus);
  const images = Array.isArray(product.images) && product.images.length ? product.images : [null];
  const isModeratable = productStatus === 'pending' || productStatus === 'queue';
  const couponHours = Number(product.couponValidHours);
  const slotsTotal = Number(product.slots?.total || 5);
  const slotsUsed = Number(product.slots?.used || 0);
  const couponTerms = [
    Number.isFinite(couponHours) && couponHours > 0 ? `Vale ${couponHours} h depois de retirado` : '',
    slotsUsed > 0 ? `${slotsUsed} de ${slotsTotal} cupons retirados` : `${slotsTotal} ${slotsTotal === 1 ? 'cupom' : 'cupons'}`,
  ].filter(Boolean).join(' · ');

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="admin-product-modal">
      <div class="modal-content admin-product-modal-content" role="dialog" aria-modal="true" aria-labelledby="admin-product-modal-title">
        <div class="modal-handle"></div>
        <div class="admin-product-modal-header">
          <div class="admin-product-modal-heading">
            <span class="admin-product-modal-meta">
              <span class="status-pill admin-status ${status.badge}">${status.label}</span>
              <span class="t-eyebrow">${escapeHTML(category?.name || product.category || 'Categoria')}</span>
            </span>
            <h3 class="admin-product-modal-title" id="admin-product-modal-title">${escapeHTML(product.title)}</h3>
          </div>
          <button class="icon-btn admin-modal-close" type="button" id="close-admin-product-modal" aria-label="Fechar">${icons.x}</button>
        </div>
        <div class="admin-product-detail-gallery">
          <button class="admin-product-detail-main" type="button" data-admin-photo-index="0" aria-label="Ampliar foto principal">
            ${getProductImage(images[0], 480, 280, product.category)}
          </button>
          ${images.length > 1 ? `
            <div class="admin-product-detail-thumbs">
              ${images.map((image, index) => `<button class="admin-product-detail-thumb" type="button" data-admin-photo-index="${index}" aria-label="Abrir foto ${index + 1}">${getProductImage(image, 96, 72, product.category)}</button>`).join('')}
            </div>
          ` : ''}
        </div>
        <dl class="admin-product-detail-grid">
          <div class="admin-product-detail-stat"><dt>Preço com cupom</dt><dd>${formatCurrency(product.discountPrice)}</dd></div>
          <div class="admin-product-detail-stat"><dt>Preço original</dt><dd>${formatCurrency(product.originalPrice)}</dd></div>
          <div class="admin-product-detail-stat"><dt>Desconto</dt><dd>${Number(product.discount || 0)}%</dd></div>
          <div class="admin-product-detail-stat"><dt>Cliques</dt><dd>${Number(product.clicks || 0)}</dd></div>
        </dl>
        <div class="admin-product-detail-block">
          <h4>Descrição</h4>
          <p>${escapeHTML(product.description || 'Sem descrição cadastrada.')}</p>
        </div>
        <div class="admin-product-detail-block">
          <h4>Cupom</h4>
          <p>${escapeHTML(couponTerms)}</p>
        </div>
        <div class="admin-product-detail-block">
          <h4>Empresa</h4>
          <p>${escapeHTML(product.seller?.name || 'Empresa sem perfil')}${product.seller?.whatsapp ? ` · WhatsApp ${escapeHTML(formatPhoneBR(product.seller.whatsapp))}` : ''}</p>
        </div>
        ${product.rejectionReason ? `
          <div class="admin-product-detail-block danger">
            <h4>Retorno registrado</h4>
            <p>${escapeHTML(product.rejectionReason)}</p>
          </div>
        ` : ''}
        <div class="admin-product-modal-actions">
          <button class="btn-ghost admin-product-delete" type="button" data-modal-delete="${escapeHTML(product.id)}">Excluir da vitrine</button>
          ${isModeratable ? `
            <button class="btn-danger" type="button" data-modal-reject="${escapeHTML(product.id)}">${icons.x} Recusar</button>
            <button class="btn-secondary" type="button" data-modal-adjust="${escapeHTML(product.id)}">Pedir ajuste</button>
            <button class="btn-success" type="button" data-modal-approve="${escapeHTML(product.id)}">${icons.check} Aprovar oferta</button>
          ` : `
            <button class="btn-secondary" type="button" id="close-admin-product-modal-secondary">Fechar</button>
          `}
        </div>
      </div>
    </div>
  `;

  const closeModal = () => { modalRoot.innerHTML = ''; };
  modalRoot.querySelector('#admin-product-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  modalRoot.querySelector('#close-admin-product-modal')?.addEventListener('click', closeModal);
  modalRoot.querySelector('#close-admin-product-modal-secondary')?.addEventListener('click', closeModal);
  modalRoot.querySelectorAll('[data-admin-photo-index]').forEach((button) => {
    button.addEventListener('click', () => showAdminPhotoViewer(images, Number(button.dataset.adminPhotoIndex || 0), product));
  });
  modalRoot.querySelector('[data-modal-delete]')?.addEventListener('click', (event) => {
    const id = event.currentTarget.dataset.modalDelete;
    closeModal();
    showDeleteProductModal(id, container);
  });
  modalRoot.querySelector('[data-modal-adjust]')?.addEventListener('click', (event) => {
    const id = event.currentTarget.dataset.modalAdjust;
    closeModal();
    showAdjustModal(id, container);
  });
  modalRoot.querySelector('[data-modal-reject]')?.addEventListener('click', (event) => {
    const id = event.currentTarget.dataset.modalReject;
    closeModal();
    showRejectModal(id, container);
  });
  modalRoot.querySelector('[data-modal-approve]')?.addEventListener('click', async (event) => {
    const approveBtn = event.currentTarget;
    approveBtn.disabled = true;
    approveBtn.innerHTML = `${icons.loader} Aprovando...`;
    const result = await approveProduct(approveBtn.dataset.modalApprove);
    if (result?.success) {
      closeModal();
      showToast('Oferta aprovada.', 'success');
      invalidateAdminData();
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
    } else {
      approveBtn.disabled = false;
      approveBtn.innerHTML = `${icons.check} Aprovar oferta`;
      showToast(result?.error || 'Não foi possível aprovar a oferta.', 'error');
    }
  });
}

function showAdminPhotoViewer(images, startIndex = 0, product = {}) {
  const safeImages = Array.isArray(images) && images.length ? images : [null];
  let currentIndex = Math.min(Math.max(startIndex, 0), safeImages.length - 1);
  const modalRoot = document.getElementById('modal-root');

  const render = () => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop admin-photo-backdrop" id="admin-photo-modal">
        <div class="admin-photo-viewer" role="dialog" aria-modal="true" aria-label="Fotos de ${escapeHTML(product.title || 'oferta')}">
          <button class="icon-btn admin-photo-close" type="button" id="close-admin-photo" aria-label="Fechar">${icons.x}</button>
          <div class="admin-photo-stage">
            ${getProductImage(safeImages[currentIndex], 900, 680, product.category)}
          </div>
          <div class="admin-photo-controls">
            <button class="btn-secondary btn-sm" type="button" id="admin-photo-prev" ${safeImages.length <= 1 ? 'disabled' : ''}>Anterior</button>
            <span class="admin-photo-count">${currentIndex + 1} / ${safeImages.length}</span>
            <button class="btn-secondary btn-sm" type="button" id="admin-photo-next" ${safeImages.length <= 1 ? 'disabled' : ''}>Próxima</button>
          </div>
        </div>
      </div>
    `;
    modalRoot.querySelector('#admin-photo-modal')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) modalRoot.innerHTML = '';
    });
    modalRoot.querySelector('#close-admin-photo')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });
    modalRoot.querySelector('#admin-photo-prev')?.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + safeImages.length) % safeImages.length;
      render();
    });
    modalRoot.querySelector('#admin-photo-next')?.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % safeImages.length;
      render();
    });
  };

  render();
}

function showDeleteProductModal(productId, container) {
  const product = (loadedAllProducts || []).find(item => String(item.id) === String(productId));
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="delete-product-modal">
      <div class="modal-content admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
        <div class="modal-handle"></div>
        <h3 class="modal-title" id="delete-product-title">Excluir oferta</h3>
        <p class="modal-description">A oferta sai da vitrine e os alunos deixam de retirar cupons dela. O histórico fica guardado para auditoria.</p>
        ${product ? `<div class="delete-product-summary"><strong>${escapeHTML(product.title)}</strong><span>${formatCurrency(product.discountPrice)}</span></div>` : ''}
        <div class="modal-actions">
          <button class="btn-secondary" type="button" id="cancel-delete-product">Cancelar</button>
          <button class="btn-danger btn-danger--solid" type="button" id="confirm-delete-product">Excluir da vitrine</button>
        </div>
      </div>
    </div>
  `;
  const close = () => { modalRoot.innerHTML = ''; };
  modalRoot.querySelector('#delete-product-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });
  modalRoot.querySelector('#cancel-delete-product')?.addEventListener('click', close);
  modalRoot.querySelector('#confirm-delete-product')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Excluindo...';
    const result = await deleteSellerProduct(productId);
    if (result?.success) {
      close();
      showToast('Oferta removida da vitrine.', 'success');
      invalidateAdminData();
      await renderAdminPage(container);
      if (adminView === 'categories') scrollCategoryManagementIntoView(container);
    } else {
      button.disabled = false;
      button.textContent = 'Excluir da vitrine';
      showToast(result?.error || 'Não foi possível excluir a oferta.', 'error');
    }
  });
}

function showCategoryModal(mode, category, container) {
  const isEdit = mode === 'edit';
  const modalRoot = document.getElementById('modal-root');
  const currentRules = isEdit ? getCategoryRules(category.id) : '';
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="category-modal">
      <div class="modal-content admin-modal category-editor-modal" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <div class="modal-handle"></div>
        <form id="category-form">
          <h3 class="modal-title" id="category-modal-title">${isEdit ? 'Editar categoria' : 'Nova categoria'}</h3>
          <p class="modal-description">Cupons por oferta e horas na vitrine valem para as novas ofertas desta categoria.</p>
          <div class="input-group">
            <label for="category-field-name">Nome da categoria</label>
            <input class="input-field" id="category-field-name" name="name" value="${escapeHTML(category?.name || '')}" placeholder="Ex.: Livros e apostilas" required maxlength="48" />
          </div>
          ${isEdit ? '' : `
            <div class="input-group">
              <label for="category-field-id">Identificador</label>
              <input class="input-field" id="category-field-id" name="id" placeholder="livros-apostilas" maxlength="48" />
              <span class="input-hint">Use letras minúsculas e hífens, sem acentos.</span>
            </div>
          `}
          <div class="category-editor-grid">
            <div class="input-group">
              <label for="category-field-slots">Cupons por oferta</label>
              <input class="input-field" id="category-field-slots" name="maxSlots" type="number" min="1" max="99" value="${Number(category?.maxSlots || 5)}" required />
            </div>
            <div class="input-group">
              <label for="category-field-hours">Horas na vitrine</label>
              <input class="input-field" id="category-field-hours" name="durationHours" type="number" min="1" max="720" value="${Number(category?.durationHours || 24)}" required />
            </div>
          </div>
          <div class="input-group">
            <label for="category-field-rules">Observação para a equipe (opcional)</label>
            <textarea class="input-field" id="category-field-rules" name="rules" rows="3" placeholder="Ex.: Somente produtos lacrados ou com foto real.">${escapeHTML(currentRules)}</textarea>
          </div>
          <div class="modal-inline-status" id="category-modal-status" role="status" aria-live="polite"></div>
          <div class="modal-actions">
            <button class="btn-secondary" type="button" id="cancel-category">Cancelar</button>
            <button class="btn-primary" type="submit" id="save-category">${isEdit ? 'Salvar' : 'Criar categoria'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  const close = () => { modalRoot.innerHTML = ''; };
  modalRoot.querySelector('#category-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });
  modalRoot.querySelector('#cancel-category')?.addEventListener('click', close);
  modalRoot.querySelector('#category-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saveButton = modalRoot.querySelector('#save-category');
    const statusEl = modalRoot.querySelector('#category-modal-status');
    const payload = {
      name: String(form.get('name') || '').trim(),
      id: String(form.get('id') || '').trim(),
      maxSlots: Number(form.get('maxSlots') || 5),
      durationHours: Number(form.get('durationHours') || 24),
    };
    const rules = String(form.get('rules') || '').trim();

    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
    if (statusEl) {
      statusEl.className = 'modal-inline-status info';
      statusEl.textContent = 'Salvando categoria...';
    }

    try {
      const savedCategory = isEdit
        ? await updateCategory(category.id, payload)
        : await createCategory(payload);

      if (activeInstitution?.id) {
        const settings = {
          ...(activeInstitution.settings || {}),
          categoryRules: {
            ...(activeInstitution.settings?.categoryRules || {}),
            [savedCategory.id]: rules,
          },
        };
        const result = await updateInstitution(activeInstitution.id, { settings });
        if (result?.success) activeInstitution = result.institution;
      }

      selectedCategoryId = savedCategory.id;
      close();
      showToast(isEdit ? 'Categoria atualizada.' : 'Categoria criada.', 'success');
      invalidateAdminData();
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = isEdit ? 'Salvar' : 'Criar categoria';
      const message = error.message || 'Não foi possível salvar a categoria.';
      if (statusEl) {
        statusEl.className = 'modal-inline-status error';
        statusEl.textContent = message;
      }
      showToast(message, 'error');
    }
  });
}

function showDeleteCategoryModal(categoryId, container) {
  const category = getAdminCategoryRows().find((row) => row.id === categoryId);
  if (!category) return;
  if (category.total > 0) {
    showToast('Antes de excluir, mova ou encerre as ofertas vinculadas a esta categoria.', 'error');
    return;
  }

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="delete-category-modal">
      <div class="modal-content admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-category-title">
        <div class="modal-handle"></div>
        <h3 class="modal-title" id="delete-category-title">Excluir categoria</h3>
        <p class="modal-description">A categoria "${escapeHTML(category.name)}" será removida do banco. Só dá para excluir categorias sem ofertas vinculadas.</p>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" id="cancel-delete-category">Cancelar</button>
          <button class="btn-danger btn-danger--solid" type="button" id="confirm-delete-category">Excluir categoria</button>
        </div>
      </div>
    </div>
  `;
  const close = () => { modalRoot.innerHTML = ''; };
  modalRoot.querySelector('#delete-category-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });
  modalRoot.querySelector('#cancel-delete-category')?.addEventListener('click', close);
  modalRoot.querySelector('#confirm-delete-category')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Excluindo...';
    try {
      await deleteCategory(categoryId);
      close();
      selectedCategoryId = null;
      showToast('Categoria excluída.', 'success');
      invalidateAdminData();
      await renderAdminPage(container);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Excluir categoria';
      showToast(error.message || 'Não foi possível excluir a categoria.', 'error');
    }
  });
}

function showAdminMetricModal(title, description, rows = []) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="metric-modal">
      <div class="modal-content admin-modal admin-metric-modal" role="dialog" aria-modal="true" aria-labelledby="metric-modal-title">
        <div class="modal-handle"></div>
        <h3 class="modal-title" id="metric-modal-title">${escapeHTML(title)}</h3>
        <p class="modal-description">${escapeHTML(description)}</p>
        ${rows.length ? `
          <dl class="metric-modal-list">
            ${rows.map((row) => `
              <div class="metric-modal-row">
                <dt>${escapeHTML(row.label)}</dt>
                <dd${row.isText ? ' class="is-text"' : ''}>${escapeHTML(String(row.value))}</dd>
              </div>
            `).join('')}
          </dl>
        ` : renderAdminEmpty({ title: 'Sem dados para detalhar', text: 'Assim que houver uso real, esta lista é preenchida automaticamente.' })}
        <div class="modal-actions">
          <button class="btn-secondary" type="button" id="close-metric-modal">Fechar</button>
        </div>
      </div>
    </div>
  `;
  const close = () => { modalRoot.innerHTML = ''; };
  modalRoot.querySelector('#metric-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });
  modalRoot.querySelector('#close-metric-modal')?.addEventListener('click', close);
}

async function handleAdminMetric(metric, container) {
  if (metric === 'pending') {
    adminView = 'moderation';
    await renderAdminPage(container);
    resetAppScroll(container);
    return;
  }
  if (metric === 'clicks') {
    const rows = getAdminCategoryRows().sort((a, b) => b.clicks - a.clicks);
    selectedCategoryId = rows[0]?.id || selectedCategoryId;
    adminView = 'categories';
    categoryStatusFilter = 'all';
    await renderAdminPage(container);
    scrollCategoryManagementIntoView(container);
    return;
  }
  if (metric === 'couponsGenerated' || metric === 'couponsUsed' || metric === 'conversion') {
    adminView = 'reports';
    await renderAdminPage(container);
    resetAppScroll(container);
    return;
  }

  const stats = loadedStats || {};
  const sellerCount = new Set((loadedAllProducts || []).map((product) => product.seller?.id || product.sellerId).filter(Boolean)).size;
  const signupDomains = getSignupDomains();
  showAdminMetricModal('Alunos da instituição', 'Resumo operacional com os dados disponíveis no banco.', [
    { label: 'Alunos cadastrados', value: stats.students?.value ?? 0 },
    { label: 'Empresas com ofertas', value: sellerCount },
    { label: signupDomains.length > 1 ? 'Domínios de cadastro' : 'Domínio de cadastro', value: signupDomains.join(', ') || 'Não configurado', isText: true },
  ]);
}

function bindAdminEvents(container) {
  const pageRoot = container.querySelector('.admin-page');
  container.querySelector('#platform-user-search')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    platformUsersSearch = String(new FormData(event.currentTarget).get('search') || '').trim();
    platformUsersPage = 1;
    await renderAdminPage(container);
  });

  container.querySelectorAll('[data-platform-page]').forEach((button) => {
    button.addEventListener('click', async () => {
      platformUsersPage += button.dataset.platformPage === 'next' ? 1 : -1;
      await renderAdminPage(container);
    });
  });

  container.querySelectorAll('[data-platform-user]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const values = new FormData(form);
      const role = String(values.get('role'));
      const institutionId = String(values.get('institutionId') || '') || null;
      if (role === 'admin' && !institutionId) {
        showToast('Selecione a instituição desse admin.', 'error');
        return;
      }
      button.disabled = true;
      try {
        await updatePlatformUser(form.dataset.platformUser, { role, institutionId });
        showToast('Usuário atualizado.', 'success');
        await renderAdminPage(container);
      } catch (error) {
        showToast(error.message, 'error');
        button.disabled = false;
      }
    });
  });

  container.querySelector('#platform-institution-create')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const values = withNormalizedDomain(Object.fromEntries(new FormData(form)));
    if (!values) {
      showToast('Use o formato @escola.edu.br no domínio.', 'error');
      return;
    }
    button.disabled = true;
    try {
      await createPlatformInstitution(values);
      showToast('Instituição criada.', 'success');
      await renderAdminPage(container);
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false;
    }
  });

  container.querySelectorAll('[data-platform-institution]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const values = withNormalizedDomain(Object.fromEntries(new FormData(form)));
      if (!values) {
        showToast('Use o formato @escola.edu.br no domínio.', 'error');
        return;
      }
      button.disabled = true;
      try {
        const result = await updateInstitution(form.dataset.platformInstitution, values);
        if (!result.success) throw new Error(result.error);
        showToast('Instituição atualizada.', 'success');
        await renderAdminPage(container);
      } catch (error) {
        showToast(error.message, 'error');
        button.disabled = false;
      }
    });
  });

  // Tabs
  container.querySelectorAll('[data-admin-tab]').forEach(tab => {
    tab.addEventListener('click', async () => {
      adminView = tab.dataset.adminTab;
      await renderAdminPage(container);
      resetAppScroll(container);
    });
  });

  // Bottom nav
  container.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      adminView = item.dataset.nav;
      await renderAdminPage(container);
      resetAppScroll(container);
    });
  });

  pageRoot.addEventListener('click', async (event) => {
    const metricBtn = event.target.closest?.('[data-admin-metric]');
    if (metricBtn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await handleAdminMetric(metricBtn.dataset.adminMetric, container);
      return;
    }

    const approveBtn = event.target.closest?.('.approve-btn');
    if (approveBtn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const card = approveBtn.closest('.moderation-card');
      const originalHtml = approveBtn.innerHTML;
      const adId = approveBtn.dataset.adId;
      setModerationBusy(card, approveBtn, 'Aprovando...');
      try {
        const result = await approveProduct(adId);
        if (!result?.success) throw new Error(result?.error || 'Não foi possível aprovar a oferta.');
        removePendingAd(adId);
        showToast('Oferta aprovada.', 'success');
        invalidateAdminData();
        await renderAdminPage(container);
      } catch (err) {
        showToast(err.message || 'Não foi possível aprovar a oferta.', 'error');
        resetModerationBusy(card, approveBtn, originalHtml);
      }
      return;
    }

    const rejectBtn = event.target.closest?.('.reject-btn');
    if (rejectBtn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showRejectModal(rejectBtn.dataset.adId, container);
      return;
    }

    const adjustBtn = event.target.closest?.('.adjust-btn');
    if (adjustBtn) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showAdjustModal(adjustBtn.dataset.adId, container);
      return;
    }

    const moderationDetail = event.target.closest?.('[data-admin-product-detail]');
    if (moderationDetail) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showAdminProductDetails(moderationDetail.dataset.adminProductDetail, container);
    }
  }, true);

  pageRoot.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const moderationDetail = event.target.closest?.('[data-admin-product-detail]');
    if (!moderationDetail) return;
    event.preventDefault();
    showAdminProductDetails(moderationDetail.dataset.adminProductDetail, container);
  });

  pageRoot.addEventListener('click', async (event) => {
    const createCategoryBtn = event.target.closest?.('[data-category-create]');
    if (createCategoryBtn) {
      event.preventDefault();
      event.stopPropagation();
      showCategoryModal('create', null, container);
      return;
    }

    const editCategoryBtn = event.target.closest?.('[data-category-edit]');
    if (editCategoryBtn) {
      event.preventDefault();
      event.stopPropagation();
      const category = getAdminCategoryRows().find((row) => row.id === editCategoryBtn.dataset.categoryEdit);
      if (category) showCategoryModal('edit', category, container);
      return;
    }

    const deleteCategoryBtn = event.target.closest?.('[data-category-delete]');
    if (deleteCategoryBtn) {
      event.preventDefault();
      event.stopPropagation();
      if (!deleteCategoryBtn.disabled) showDeleteCategoryModal(deleteCategoryBtn.dataset.categoryDelete, container);
      return;
    }

    const productDetailBtn = event.target.closest?.('[data-category-product-detail]');
    if (productDetailBtn) {
      event.preventDefault();
      event.stopPropagation();
      showAdminProductDetails(productDetailBtn.dataset.categoryProductDetail, container);
      return;
    }

    const deleteProductBtn = event.target.closest?.('[data-category-product-delete]');
    if (deleteProductBtn) {
      event.preventDefault();
      event.stopPropagation();
      showDeleteProductModal(deleteProductBtn.dataset.categoryProductDelete, container);
      return;
    }

    const approveProductBtn = event.target.closest?.('[data-category-product-approve]');
    if (approveProductBtn) {
      event.preventDefault();
      event.stopPropagation();
      const productId = approveProductBtn.dataset.categoryProductApprove;
      const originalHtml = approveProductBtn.innerHTML;
      approveProductBtn.disabled = true;
      approveProductBtn.innerHTML = `${icons.loader} Aprovando...`;
      try {
        const result = await approveProduct(productId);
        if (!result?.success) throw new Error(result?.error || 'Não foi possível aprovar a oferta.');
        removePendingAd(productId);
        showToast('Oferta aprovada.', 'success');
        invalidateAdminData();
        await renderAdminPage(container);
        scrollCategoryManagementIntoView(container);
      } catch (error) {
        approveProductBtn.disabled = false;
        approveProductBtn.innerHTML = originalHtml;
        showToast(error.message || 'Não foi possível aprovar a oferta.', 'error');
      }
      return;
    }

    const adjustProductBtn = event.target.closest?.('[data-category-product-adjust]');
    if (adjustProductBtn) {
      event.preventDefault();
      event.stopPropagation();
      showAdjustModal(adjustProductBtn.dataset.categoryProductAdjust, container);
      return;
    }

    const categoryFilter = event.target.closest?.('[data-category-filter]');
    if (categoryFilter) {
      event.preventDefault();
      event.stopPropagation();
      categoryStatusFilter = categoryFilter.dataset.categoryFilter || 'all';
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
      return;
    }

    const categoryModerate = event.target.closest?.('[data-category-moderate]');
    if (categoryModerate) {
      event.preventDefault();
      event.stopPropagation();
      selectedCategoryId = categoryModerate.dataset.categoryModerate;
      categoryStatusFilter = 'pending';
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
      return;
    }

    const categoryOpen = event.target.closest?.('[data-category-open]');
    if (categoryOpen) {
      event.preventDefault();
      event.stopPropagation();
      selectedCategoryId = categoryOpen.dataset.categoryOpen;
      categoryStatusFilter = 'all';
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
      return;
    }

    const categorySelect = event.target.closest?.('[data-category-select]');
    if (categorySelect && !event.target.closest('button')) {
      selectedCategoryId = categorySelect.dataset.categorySelect;
      categoryStatusFilter = 'all';
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
    }
  });

  container.querySelectorAll('[data-category-select]').forEach(card => {
    card.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectedCategoryId = card.dataset.categorySelect;
      categoryStatusFilter = 'all';
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
    });
  });

  container.querySelector('#btnAdminLogout')?.addEventListener('click', async () => {
    const logoutBtn = container.querySelector('#btnAdminLogout');
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Saindo...';
    try {
      await signOutUser();
      showToast('Você saiu da conta admin.', 'success');
      window.location.hash = '#/auth';
    } catch {
      window.location.hash = '#/auth';
    }
  });

  // Real editable institution fields
  container.querySelectorAll('.settings-section .btn[data-setting]').forEach(btn => {
    btn.addEventListener('click', () => {
      const settingItem = btn.closest('.setting-item');
      const title = settingItem?.querySelector('h4')?.textContent || '';
      const settingKey = btn.dataset.setting;
      const isDomain = settingKey === 'domain';
      const currentVal = String(activeInstitution?.[settingKey] ?? '').trim();
      const modalRoot = document.getElementById('modal-root');

      let inputHtml = `<input type="text" class="input-field" id="settingEditVal" value="${escapeHTML(currentVal)}" />`;
      if (isDomain) {
        inputHtml = `
          <input type="text" class="input-field admin-domain-input" id="settingEditVal" value="${escapeHTML(currentVal)}" placeholder="@somosicev.com" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false" aria-describedby="settingEditHint" />
          <span class="input-hint" id="settingEditHint">Use o formato @escola.edu.br.</span>
        `;
      }

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="settings-edit-modal">
          <div class="modal-content admin-modal" role="dialog" aria-modal="true" aria-labelledby="settings-edit-title">
            <div class="modal-handle"></div>
            <form id="settings-edit-form">
              <span class="t-eyebrow">Editar configuração</span>
              <h3 class="modal-title" id="settings-edit-title">${escapeHTML(title)}</h3>
              ${isDomain ? '<p class="modal-description">Só e-mails deste domínio e dos domínios extras conseguem criar conta.</p>' : ''}
              <div class="input-group admin-modal-field">
                <label class="sr-only" for="settingEditVal">${escapeHTML(title)}</label>
                ${inputHtml}
              </div>
              <div class="modal-inline-status" id="setting-modal-status" role="status" aria-live="polite"></div>
              <div class="modal-actions">
                <button type="button" class="btn-secondary" id="cancel-setting">Cancelar</button>
                <button type="submit" class="btn-primary" id="confirm-setting">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      `;
      modalRoot.querySelector('#settings-edit-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
      modalRoot.querySelector('#cancel-setting').addEventListener('click', () => modalRoot.innerHTML = '');
      modalRoot.querySelector('#settings-edit-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!activeInstitution?.id) {
          showToast('Instituição real não encontrada para salvar.', 'error');
          return;
        }
        const confirmBtn = modalRoot.querySelector('#confirm-setting');
        const statusEl = modalRoot.querySelector('#setting-modal-status');
        const showFieldError = (toastMessage, inlineMessage) => {
          showToast(toastMessage, 'error');
          if (statusEl) {
            statusEl.className = 'modal-inline-status error';
            statusEl.textContent = inlineMessage;
          }
        };
        let value = modalRoot.querySelector('#settingEditVal')?.value?.trim();
        if (!value) {
          showFieldError('Preencha o campo.', 'Preencha o campo antes de salvar.');
          return;
        }
        if (isDomain) {
          value = normalizeEmailDomain(value);
          if (!EMAIL_DOMAIN_PATTERN.test(value)) {
            showFieldError('Domínio inválido.', 'Use o formato @escola.edu.br, sem espaços.');
            return;
          }
        }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Salvando...';
        if (statusEl) {
          statusEl.className = 'modal-inline-status info';
          statusEl.textContent = 'Salvando...';
        }
        const result = await updateInstitution(activeInstitution.id, { [settingKey]: value });
        if (result?.success) {
          activeInstitution = result.institution;
          modalRoot.innerHTML = '';
          showToast(`"${title}" salvo.`, 'success');
          renderAdminPage(container);
        } else {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Salvar';
          const errorMessage = result?.error || 'Não foi possível salvar.';
          if (statusEl) {
            statusEl.className = 'modal-inline-status error';
            statusEl.textContent = errorMessage;
          }
          showToast(errorMessage, 'error');
        }
      });
    });
  });

  // Extra e-mail domains, stored inside institutions.settings
  container.querySelectorAll('[data-setting-list]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeInstitution?.id) {
        showToast('Instituição real não encontrada para salvar.', 'error');
        return;
      }
      const settingKey = btn.dataset.settingList;
      const settingItem = btn.closest('.setting-item');
      const title = settingItem?.querySelector('h4')?.textContent || 'Configuração';
      const primaryDomain = String(activeInstitution.domain || '').trim();
      const modalRoot = document.getElementById('modal-root');
      const fieldHtml = `
        <textarea class="input-field admin-domain-input" id="settingJsonVal" rows="4" placeholder="@outro-dominio.com.br" autocapitalize="off" autocomplete="off" spellcheck="false" aria-describedby="settingJsonHint">${escapeHTML(getExtraDomains().join('\n'))}</textarea>
        <span class="input-hint" id="settingJsonHint">Um domínio por linha, no formato @escola.edu.br.${primaryDomain ? ` O domínio principal (${escapeHTML(primaryDomain)}) já está liberado.` : ''}</span>
      `;
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="settings-json-modal">
          <div class="modal-content admin-modal" role="dialog" aria-modal="true" aria-labelledby="settings-json-title">
            <div class="modal-handle"></div>
            <form id="settings-json-form">
              <span class="t-eyebrow">Editar configuração</span>
              <h3 class="modal-title" id="settings-json-title">${escapeHTML(title)}</h3>
              <p class="modal-description">Só e-mails destes domínios conseguem criar conta. Deixe em branco para liberar apenas o domínio principal.</p>
              <div class="input-group admin-modal-field">
                <label class="sr-only" for="settingJsonVal">${escapeHTML(title)}</label>
                ${fieldHtml}
              </div>
              <div class="modal-inline-status" id="setting-json-status" role="status" aria-live="polite"></div>
              <div class="modal-actions">
                <button type="button" class="btn-secondary" id="cancel-json-setting">Cancelar</button>
                <button type="submit" class="btn-primary" id="confirm-json-setting">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      `;
      const close = () => { modalRoot.innerHTML = ''; };
      modalRoot.querySelector('#settings-json-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) close();
      });
      modalRoot.querySelector('#cancel-json-setting')?.addEventListener('click', close);
      modalRoot.querySelector('#settings-json-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveBtn = modalRoot.querySelector('#confirm-json-setting');
        const statusEl = modalRoot.querySelector('#setting-json-status');
        const rawValue = modalRoot.querySelector('#settingJsonVal')?.value?.trim() || '';
        const { domains, invalid } = parseDomainList(rawValue, primaryDomain);
        if (invalid.length) {
          showToast('Revise os domínios.', 'error');
          if (statusEl) {
            statusEl.className = 'modal-inline-status error';
            statusEl.textContent = `Formato inválido: ${invalid.join(', ')}. Use @escola.edu.br.`;
          }
          return;
        }
        const value = domains;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
        if (statusEl) {
          statusEl.className = 'modal-inline-status info';
          statusEl.textContent = 'Salvando domínios...';
        }
        const settings = { ...(activeInstitution.settings || {}), [settingKey]: value };
        const result = await updateInstitution(activeInstitution.id, { settings });
        if (result?.success) {
          activeInstitution = result.institution;
          close();
          showToast('Domínios salvos.', 'success');
          renderAdminPage(container);
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Salvar';
          const errorMessage = result?.error || 'Não foi possível salvar.';
          if (statusEl) {
            statusEl.className = 'modal-inline-status error';
            statusEl.textContent = errorMessage;
          }
          showToast(errorMessage, 'error');
        }
      });
    });
  });

  container.querySelector('#btnAdminRefresh')?.addEventListener('click', async () => {
    showToast('Atualizando dados...', 'info');
    await renderAdminPage(container, { forceRefresh: true });
  });

  // Admin bell notification
  container.querySelector('#btnAdminNotif')?.addEventListener('click', () => {
    adminView = 'moderation';
    renderAdminPage(container);
  });

  // Alert action buttons — route by action text
  container.querySelectorAll('[data-alert-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      adminView = btn.dataset.alertView === 'categories' ? 'categories' : 'moderation';
      renderAdminPage(container);
    });
  });

  // Export plain text report
  container.querySelector('#btnExportPDF')?.addEventListener('click', () => {
    const s = loadedStats || (USE_MOCKS ? adminStats : {});
    const report = [
      `Relatório ${BRAND_NAME} - ${activeInstitution.fullName || activeInstitution.name || ''}`,
      `Data: ${new Date().toLocaleDateString('pt-BR')}`,
      '',
      `Alunos: ${s.students?.value ?? 0}`,
      `Cliques nas ofertas: ${s.clicks?.value ?? 0}`,
      `Cupons retirados: ${s.couponsGenerated?.value ?? 0}`,
      `Cupons usados: ${s.couponsUsed?.value ?? 0}`,
      `Taxa de uso: ${s.conversionRate?.value ?? '0%'}`,
      `Ofertas para aprovar: ${(loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length}`,
      '',
    ].join('\n');
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio-empreende-icev-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Relatório exportado.', 'success');
  });

  // Charts
  setTimeout(() => {
    drawAdminChart(container.querySelector('#admin-chart'));
    drawBarChart(container.querySelector('#report-chart-1'), 'active');
    drawBarChart(container.querySelector('#report-chart-2'), 'queue');
  }, 100);
}

function showRejectModal(adId, container) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="reject-modal">
      <div class="modal-content admin-modal" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title">
        <div class="modal-handle"></div>
        <h3 class="modal-title" id="reject-modal-title">Recusar oferta</h3>
        <p class="modal-description">Escolha o motivo. A empresa recebe essa explicação junto com a recusa.</p>
        <div class="reject-reasons" id="reject-reasons">
          ${rejectReasons.map((r, i) => `
            <button class="reject-reason-option" type="button" data-reason="${i}">
              <span class="reject-reason-radio" aria-hidden="true"></span>
              <span>${r}</span>
            </button>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" id="cancel-reject">Cancelar</button>
          <button class="btn-danger btn-danger--solid" type="button" id="confirm-reject">Recusar oferta</button>
        </div>
      </div>
    </div>
  `;
  let selectedReason = -1;
  modalRoot.querySelectorAll('.reject-reason-option').forEach(opt => {
    opt.addEventListener('click', () => {
      modalRoot.querySelectorAll('.reject-reason-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedReason = parseInt(opt.dataset.reason);
    });
  });
  modalRoot.querySelector('#reject-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
  modalRoot.querySelector('#cancel-reject').addEventListener('click', () => modalRoot.innerHTML = '');
  const confirmRejectBtn = modalRoot.querySelector('#confirm-reject');
  const confirmRejectLabel = confirmRejectBtn.textContent;
  confirmRejectBtn.addEventListener('click', async () => {
    if (selectedReason === -1) { showToast('Selecione um motivo.', 'error'); return; }
    confirmRejectBtn.disabled = true;
    confirmRejectBtn.textContent = 'Recusando...';
    const result = await rejectProduct(adId, rejectReasons[selectedReason]);
    if (result?.success) {
      modalRoot.innerHTML = '';
      removePendingAd(adId);
      showToast('Oferta recusada.', 'success');
      invalidateAdminData();
      if (container) renderAdminPage(container);
    } else {
      confirmRejectBtn.disabled = false;
      confirmRejectBtn.textContent = confirmRejectLabel;
      showToast(result?.error || 'Não foi possível recusar a oferta.', 'error');
    }
  });
}

function showAdjustModal(adId, container) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="adjust-modal">
      <div class="modal-content admin-modal" role="dialog" aria-modal="true" aria-labelledby="adjust-modal-title">
        <div class="modal-handle"></div>
        <h3 class="modal-title" id="adjust-modal-title">Pedir ajuste</h3>
        <p class="modal-description">Escolha o motivo e, se quiser, explique o que a empresa precisa corrigir.</p>
        <div class="reject-reasons">
          ${rejectReasons.map((r, i) => `
            <button class="reject-reason-option" type="button" data-reason="${i}">
              <span class="reject-reason-radio" aria-hidden="true"></span>
              <span>${r}</span>
            </button>
          `).join('')}
        </div>
        <div class="input-group admin-modal-field">
          <label for="adjust-note">Orientação para a empresa (opcional)</label>
          <textarea class="input-field" placeholder="Ex.: envie uma foto real do produto, sem filtros." rows="3" id="adjust-note"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" type="button" id="cancel-adjust">Cancelar</button>
          <button class="btn-primary" type="button" id="confirm-adjust">Enviar pedido</button>
        </div>
      </div>
    </div>
  `;
  let selectedAdjustReason = -1;
  modalRoot.querySelectorAll('.reject-reason-option').forEach(opt => {
    opt.addEventListener('click', () => {
      modalRoot.querySelectorAll('.reject-reason-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedAdjustReason = parseInt(opt.dataset.reason);
    });
  });
  modalRoot.querySelector('#adjust-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
  modalRoot.querySelector('#cancel-adjust').addEventListener('click', () => modalRoot.innerHTML = '');
  const confirmAdjustBtn = modalRoot.querySelector('#confirm-adjust');
  confirmAdjustBtn.addEventListener('click', async () => {
    if (selectedAdjustReason === -1) { showToast('Selecione um motivo.', 'error'); return; }
    const note = modalRoot.querySelector('#adjust-note')?.value?.trim() || '';
    confirmAdjustBtn.disabled = true;
    confirmAdjustBtn.textContent = 'Enviando...';
    const result = await requestProductAdjustment(adId, rejectReasons[selectedAdjustReason], note);
    if (result?.success) {
      modalRoot.innerHTML = '';
      removePendingAd(adId);
      showToast('Ajuste solicitado à empresa.', 'success');
      invalidateAdminData();
      if (container) renderAdminPage(container);
    } else {
      confirmAdjustBtn.disabled = false;
      confirmAdjustBtn.textContent = 'Enviar pedido';
      showToast(result?.error || 'Não foi possível solicitar ajuste.', 'error');
    }
  });
}

function getChartTheme() {
  const styles = getComputedStyle(document.documentElement);
  const token = (name) => styles.getPropertyValue(name).trim();
  return {
    ink: token('--ink'),
    inkSoft: token('--ink-soft'),
    inkMute: token('--ink-mute'),
    rule: token('--rule'),
    paper: token('--paper'),
    marker: token('--marker'),
    warning: token('--warning'),
    mono: token('--font-mono') || 'monospace',
  };
}

function drawAdminChart(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

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
  (loadedAllProducts || []).forEach((product) => {
    if (!product.createdAt) return;
    const day = new Date(product.createdAt);
    if (Number.isNaN(day.getTime())) return;
    day.setHours(0, 0, 0, 0);
    const bucket = bucketMap.get(day.toISOString().slice(0, 10));
    if (bucket) bucket.count += 1;
  });
  const data = buckets.map((bucket) => bucket.count);
  const labels = buckets.map((bucket) => bucket.label);
  const w = rect.width, h = rect.height;
  if (!w || !h) return;
  const theme = getChartTheme();
  const pad = { top: 18, right: 18, bottom: 30, left: 18 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
  const max = Math.max(1, ...data) * 1.2;
  const pointX = (i) => pad.left + (cw / (data.length - 1)) * i;
  const pointY = (v) => pad.top + ch - (v / max) * ch;

  ctx.strokeStyle = theme.rule;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  for (let i = 0; i <= 3; i++) {
    const y = Math.round(pad.top + (ch / 3) * i) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.beginPath();
  data.forEach((v, i) => {
    i === 0 ? ctx.moveTo(pointX(i), pointY(v)) : ctx.lineTo(pointX(i), pointY(v));
  });
  ctx.lineTo(pointX(data.length - 1), pad.top + ch);
  ctx.lineTo(pointX(0), pad.top + ch);
  ctx.closePath();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = theme.ink;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  data.forEach((v, i) => {
    i === 0 ? ctx.moveTo(pointX(i), pointY(v)) : ctx.lineTo(pointX(i), pointY(v));
  });
  ctx.stroke();

  data.forEach((v, i) => {
    const isLast = i === data.length - 1;
    ctx.beginPath();
    ctx.arc(pointX(i), pointY(v), isLast ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isLast ? theme.marker : theme.paper;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.ink;
    ctx.stroke();
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  labels.forEach((l, i) => {
    const isLast = i === labels.length - 1;
    ctx.fillStyle = isLast ? theme.ink : theme.inkMute;
    ctx.font = `${isLast ? 600 : 500} 11px ${theme.mono}`;
    ctx.fillText(l, pointX(i), h - 8);
  });
}

function drawBarChart(canvas, metric = 'active') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const rows = getAdminCategories(false).map((category) => ({
    label: category.name.split(' ')[0],
    value: Number(loadedCategoryStats?.[category.id]?.[metric] || 0),
  }));
  const data = rows.map((row) => row.value);
  const labels = rows.map((row) => row.label);
  const theme = getChartTheme();
  const barColor = metric === 'active' ? theme.ink : theme.warning;
  const w = rect.width, h = rect.height;
  if (!w || !h || !data.length) return;
  const pad = { top: 22, right: 8, bottom: 30, left: 8 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
  const max = Math.max(1, ...data) * 1.15;
  const slot = cw / data.length;
  const barW = Math.min(slot * 0.56, 56);
  const baseline = pad.top + ch;

  ctx.strokeStyle = theme.rule;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, baseline + 0.5); ctx.lineTo(w - pad.right, baseline + 0.5); ctx.stroke();

  ctx.textAlign = 'center';
  data.forEach((v, i) => {
    const x = pad.left + slot * i + (slot - barW) / 2;
    const barH = (v / max) * ch;
    const y = baseline - barH;

    if (barH > 0) {
      const r = Math.min(6, barH, barW / 2);
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.moveTo(x, baseline);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, baseline);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = theme.inkMute;
    ctx.font = `500 10.5px ${theme.mono}`;
    ctx.fillText(labels[i], x + barW / 2, h - 8);
    ctx.fillStyle = theme.inkSoft;
    ctx.font = `600 11px ${theme.mono}`;
    ctx.fillText(v.toString(), x + barW / 2, y - 7);
  });
}
