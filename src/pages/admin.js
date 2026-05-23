import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile } from '../main.js';
import { pendingAds, adminStats, categoryHeat, rejectReasons, categories as mockCategories, institution } from '../data/mock.js';
import { getPendingProducts, approveProduct, rejectProduct, requestProductAdjustment, getCategoryStats, getAllProducts, deleteSellerProduct } from '../services/product-service.js';
import { getInstitutionStats, updateInstitution, getInstitution, getAllInstitutions } from '../services/institution-service.js';
import { signOutUser } from '../services/auth-service.js';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/category-service.js';

const USE_MOCKS = import.meta.env.DEV;

let adminView = 'dashboard';
let loadedPendingAds = null;
let loadedStats = null;
let loadedAllProducts = [];
let loadedCategoryStats = {};
let loadedCategories = mockCategories;
let activeInstitution = institution;
let selectedCategoryId = null;
let categoryStatusFilter = 'all';

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
  if (globalSession?.user?.id && (globalProfile?.role || globalSession?.user?.user_metadata?.role) === 'admin') {
    const institutions = await getAllInstitutions();
    if (institutions.length === 1) {
      activeInstitution = institutions[0];
      return;
    }
  }
  activeInstitution = USE_MOCKS ? institution : { name: 'Linka', fullName: 'Linka', domain: '', primaryColor: '#2563eb' };
}

export function renderAdmin(container, subpage) {
  if (subpage) adminView = subpage;
  else adminView = 'dashboard';
  renderAdminPage(container);
}

async function renderAdminPage(container) {
  await syncInstitutionForUser();
  // Load pending ads from Supabase
  try {
    loadedPendingAds = await getPendingProducts();
    if (!loadedPendingAds || loadedPendingAds.length === 0) loadedPendingAds = USE_MOCKS ? pendingAds : [];
  } catch { loadedPendingAds = USE_MOCKS ? pendingAds : []; }

  // Load real stats
  try {
    loadedStats = await getInstitutionStats(activeInstitution?.id || null);
  } catch { loadedStats = USE_MOCKS ? adminStats : null; }

  try {
    loadedAllProducts = await getAllProducts();
  } catch { loadedAllProducts = USE_MOCKS ? pendingAds : []; }

  try {
    loadedCategoryStats = await getCategoryStats();
  } catch { loadedCategoryStats = USE_MOCKS ? categoryHeat : {}; }

  try {
    loadedCategories = await getCategories();
  } catch { loadedCategories = USE_MOCKS ? mockCategories : [{ id: 'all', name: 'Todos' }]; }
  container.innerHTML = `
    <div class="page admin-page">
      <header class="app-header" style="justify-content:space-between; align-items:center; padding: 16px 24px;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <div class="avatar" style="width: 40px; height: 40px; background:var(--gray-800); flex-shrink: 0;">AD</div>
          <div style="min-width: 0;">
            <div style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Painel Administrativo</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(activeInstitution.fullName)}</div>
          </div>
        </div>
      <div style="display:flex;align-items:center;gap:12px; flex-shrink: 0;">
          <button class="period-filter" id="btnAdminRefresh" style="padding: 6px 10px;">${icons.refresh} <span class="hide-mobile">Atualizar</span></button>
          <button class="btn-icon" id="btnAdminNotif" style="position:relative;">
            ${icons.bell}
            <span style="position:absolute;top:6px;right:6px;width:8px;height:8px;background:var(--danger-500);border-radius:50%;border:2px solid var(--background, #0A0A0F);"></span>
          </button>
          <button class="btn btn-secondary btn-sm admin-logout-btn" id="btnAdminLogout" type="button">Sair</button>
        </div>
      </header>
      <div class="app-body">
        <!-- Admin tabs -->
        <div class="admin-tabs-container">
          <div class="tabs">
            <button class="tab ${adminView === 'dashboard' ? 'active' : ''}" data-admin-tab="dashboard">Dashboard</button>
            <button class="tab ${adminView === 'moderation' ? 'active' : ''}" data-admin-tab="moderation">Moderação <span class="tab-count">${(loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length}</span></button>
            <button class="tab ${adminView === 'categories' ? 'active' : ''}" data-admin-tab="categories">Categorias</button>
            <button class="tab ${adminView === 'reports' ? 'active' : ''}" data-admin-tab="reports">Relatórios</button>
            <button class="tab ${adminView === 'settings' ? 'active' : ''}" data-admin-tab="settings">Config</button>
          </div>
        </div>
        <div id="admin-content">
          ${getAdminContent()}
        </div>
      </div>
      <nav class="bottom-nav">
        <div class="nav-item ${adminView === 'dashboard' ? 'active' : ''}" data-nav="dashboard">${icons.home}<span>Dashboard</span></div>
        <div class="nav-item ${adminView === 'moderation' ? 'active' : ''}" data-nav="moderation">${icons.shield}<span>Moderação</span></div>
        <div class="nav-item ${adminView === 'categories' ? 'active' : ''}" data-nav="categories">${icons.grid}<span>Categorias</span></div>
        <div class="nav-item ${adminView === 'reports' ? 'active' : ''}" data-nav="reports">${icons.chart}<span>Relatórios</span></div>
        <div class="nav-item ${adminView === 'settings' ? 'active' : ''}" data-nav="settings">${icons.settings}<span>Config</span></div>
      </nav>
    </div>
  `;
  bindAdminEvents(container);
}

function getAdminContent() {
  switch (adminView) {
    case 'moderation': return renderModeration();
    case 'categories': return renderCategories();
    case 'reports': return renderReports();
    case 'settings': return renderSettings();
    default: return renderAdminDashboard();
  }
}

function renderAdminDashboard() {
  const s = loadedStats || (USE_MOCKS ? adminStats : {});
  const realAlerts = buildAdminAlerts();
  const topSellers = buildTopSellers();
  const stats = [
    { id: 'students', label: 'Alunos', value: s.students?.value ?? 0, change: s.students?.change || '', positive: true, icon: icons.user },
    { id: 'clicks', label: 'Cliques', value: s.clicks?.value ?? 0, change: s.clicks?.change || '', positive: true, icon: icons.eye },
    { id: 'couponsGenerated', label: 'Cupons gerados', value: s.couponsGenerated?.value ?? 0, change: s.couponsGenerated?.change || '', positive: true, icon: icons.ticket },
    { id: 'couponsUsed', label: 'Cupons usados', value: s.couponsUsed?.value ?? 0, change: s.couponsUsed?.change || '', positive: true, icon: icons.checkCircle },
    { id: 'conversion', label: 'Conversao', value: s.conversionRate?.value ?? '0%', change: s.conversionRate?.change || '', positive: true, icon: icons.checkCircle },
    { id: 'pending', label: 'Pendentes', value: (loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length, change: '', positive: true, icon: icons.clock },
  ];
  return `
    <div class="admin-stats-grid">
      ${stats.map(s => `
        <button class="stat-card glass-card admin-metric-card" type="button" data-admin-metric="${s.id}" aria-label="Abrir detalhes de ${escapeHTML(s.label)}">
          <div class="stat-icon-wrapper">
            <div class="stat-icon">${s.icon || ''}</div>
            <span class="stat-change ${s.positive ? 'positive' : 'negative'}">${s.change}</span>
          </div>
          <div class="stat-info">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
          </div>
        </button>
      `).join('')}
    </div>

    <!-- Alerts -->
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">Alertas operacionais</h3>
        <span class="admin-section-count">${realAlerts.length}</span>
      </div>
      <div class="alerts-list">
        ${realAlerts.length ? realAlerts.map(a => `
          <div class="alert-card ${a.level === 'critical' ? 'critical' : ''}">
            <div class="alert-card-icon">${icons.alertTriangle}</div>
            <div class="alert-card-content">
              <h4>${escapeHTML(a.title)}</h4>
              <p>${escapeHTML(a.description)}</p>
              <span class="alert-time">${escapeHTML(a.time)}</span>
            </div>
            <button class="btn btn-ghost btn-sm">${escapeHTML(a.action)}</button>
          </div>
        `).join('') : `<div class="empty-state">${icons.checkCircle}<h3>Nenhum alerta agora</h3><p>Produtos, pagamentos e moderacao estao sem pendencias criticas.</p></div>`}
      </div>
    </div>

    <!-- Quick moderation -->
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">Pendentes</h3>
        <button class="btn btn-ghost btn-sm" data-admin-tab="moderation">Ver todos</button>
      </div>
      ${(loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length
        ? (loadedPendingAds || (USE_MOCKS ? pendingAds : [])).slice(0, 2).map(ad => renderModerationCard(ad)).join('')
        : `<div class="empty-state">${icons.shield}<h3>Fila limpa</h3><p>Nenhum produto aguardando revisao agora.</p></div>`}
    </div>

    <!-- Charts -->
    <div class="admin-section">
      <h3 class="admin-section-title" style="margin-bottom:var(--space-4);">Metricas</h3>
      <div class="chart-container">
        <h4>Produtos criados nos ultimos 7 dias</h4>
        <canvas id="admin-chart" height="200"></canvas>
      </div>
    </div>

    <!-- Top sellers -->
    <div class="admin-section">
      <h3 class="admin-section-title" style="margin-bottom:var(--space-4);">Vendedores mais ativos</h3>
      <div class="sellers-list">
        ${topSellers.length ? topSellers.map((seller, i) => `
          <div class="seller-row">
            <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--primary-500);width:24px;">${i + 1}</div>
            <div class="avatar avatar-sm">${escapeHTML(seller.avatar)}</div>
            <div class="seller-row-info">
              <h4>${escapeHTML(seller.name)}</h4>
              <p>${escapeHTML(seller.course || 'Sem curso informado')}</p>
            </div>
            <div class="seller-row-stats">
              <span>${seller.ads} anuncios</span>
              <span>${seller.active} ativos</span>
            </div>
          </div>
        `).join('') : `<div class="empty-state">${icons.user}<h3>Nenhum vendedor ativo ainda</h3><p>Quando houver produtos reais, eles aparecerao aqui.</p></div>`}
      </div>
    </div>
  `;
}

function buildAdminAlerts() {
  const alertsList = [];
  const pendingCount = (loadedPendingAds || []).length;
  const activeProducts = (loadedAllProducts || []).filter(product => product.status === 'active');
  if (pendingCount > 0) {
    alertsList.push({
      level: pendingCount >= 5 ? 'critical' : 'warning',
      title: `${pendingCount} anuncio${pendingCount > 1 ? 's' : ''} aguardando moderacao`,
      description: 'Revise a fila para liberar ou solicitar ajustes aos vendedores.',
      time: 'Agora',
      action: 'Moderar agora',
    });
  }
  if (activeProducts.length === 0) {
    alertsList.push({
      level: 'warning',
      title: 'Nenhum produto ativo na vitrine',
      description: 'A vitrine de compradores fica vazia ate que um produto seja aprovado.',
      time: 'Agora',
      action: 'Ver moderacao',
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
      name: seller.name || 'Vendedor',
      course: seller.course || '',
      avatar: seller.avatar || seller.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'VD',
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
  const ads = loadedPendingAds || (USE_MOCKS ? pendingAds : []);
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">Fila de Moderação</h3>
        <span class="admin-section-count">${ads.length} pendentes</span>
      </div>
      ${ads.length > 0 ? ads.map(ad => renderModerationCard(ad)).join('') : `
        <div class="empty-state">${icons.shield}<h3>Nenhum anúncio aguardando moderação</h3><p>Todos os anúncios foram revisados.</p></div>
      `}
    </div>
  `;
}

function renderModerationCard(ad) {
  return `
    <div class="moderation-card" data-ad-id="${ad.id}">
      <div class="moderation-card-inner">
        <div class="moderation-thumb">${getProductImage(ad.images?.[0], 80, 80)}</div>
        <div class="moderation-info">
          <h4>${escapeHTML(ad.title)}</h4>
          <div class="moderation-meta">
            <span>${icons.user} ${escapeHTML(ad.seller.name)}</span>
            <span>📚 ${escapeHTML(ad.seller.course)} · ${escapeHTML(ad.seller.semester)}</span>
          </div>
          <div class="moderation-meta">
            <span>${icons.tag} ${escapeHTML(getCategoryLabel(ad.category))}</span>
          </div>
          <div class="moderation-pricing">
            <span style="text-decoration:line-through;color:var(--text-tertiary);font-size:var(--font-size-sm);">${formatCurrency(ad.originalPrice)}</span>
            <span style="font-weight:var(--font-weight-bold);color:var(--primary-700);margin-left:var(--space-2);">${formatCurrency(ad.discountPrice)}</span>
            <span class="badge badge-danger" style="margin-left:var(--space-2);">-${ad.discount}%</span>
          </div>
          <div class="moderation-wait">${icons.clock} Aguardando há ${escapeHTML(ad.waitTime)}</div>
          ${ad.sellerHistory ? `<div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:2px;">Histórico: ${escapeHTML(ad.sellerHistory.approved)} aprovados, ${escapeHTML(ad.sellerHistory.rejected)} recusados</div>` : ''}
        </div>
      </div>
      <div class="moderation-actions">
        <button class="btn btn-success btn-sm approve-btn" data-ad-id="${ad.id}">${icons.check} Aprovar</button>
        <button class="btn btn-danger btn-sm reject-btn" data-ad-id="${ad.id}">✕ Recusar</button>
        <button class="btn btn-secondary btn-sm adjust-btn" data-ad-id="${ad.id}">Ajuste</button>
      </div>
    </div>
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
    active: { label: 'Ativo', badge: 'badge-success' },
    pending: { label: 'Em analise', badge: 'badge-warning' },
    queue: { label: 'Na fila', badge: 'badge-warning' },
    needs_adjustment: { label: 'Ajuste solicitado', badge: 'badge-warning' },
    rejected: { label: 'Ajuste/recusa', badge: 'badge-danger' },
    expired: { label: 'Expirado', badge: 'badge-neutral' },
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
          <span class="badge ${status.badge}">${status.label}</span>
        </div>
        <div class="category-product-meta">
          <span>${icons.user} ${escapeHTML(product.seller?.name || 'Vendedor sem perfil')}</span>
          <span>${icons.tag} ${escapeHTML(category?.name || product.category || 'Categoria')}</span>
          <span>${icons.clock} ${formatAdminDate(product.createdAt)}</span>
        </div>
        ${product.rejectionReason ? `<p class="category-product-reason">${escapeHTML(product.rejectionReason)}</p>` : ''}
        <div class="category-product-kpis">
          <span>${formatCurrency(product.discountPrice)}</span>
          <span>${Number(product.clicks || 0)} cliques</span>
          <span>${Number(product.slots?.used || 0)}/${Number(product.slots?.total || 5)} vagas</span>
        </div>
      </div>
      <div class="category-product-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-category-product-detail="${escapeHTML(product.id)}">${icons.eye} Detalhes</button>
        <button class="btn btn-danger btn-sm" type="button" data-category-product-delete="${escapeHTML(product.id)}">Excluir</button>
        ${isModeratable ? `
          <button class="btn btn-success btn-sm" type="button" data-category-product-approve="${escapeHTML(product.id)}">${icons.check} Aprovar</button>
          <button class="btn btn-ghost btn-sm" type="button" data-category-product-adjust="${escapeHTML(product.id)}">Ajuste</button>
        ` : ''}
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
    { id: 'all', label: 'Todos', count: selectedProducts.length },
    { id: 'pending', label: 'Em analise', count: selectedProducts.filter(product => product.status === 'pending' || product.status === 'queue').length },
    { id: 'active', label: 'Ativos', count: selectedProducts.filter(product => product.status === 'active').length },
    { id: 'rejected', label: 'Ajustes', count: selectedProducts.filter(product => product.status === 'rejected' || product.status === 'needs_adjustment').length },
    { id: 'expired', label: 'Expirados', count: selectedProducts.filter(product => product.status === 'expired').length },
  ];

  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <div>
          <h3 class="admin-section-title">Gestao de categorias</h3>
          <p class="admin-section-subtitle">Dados reais dos anuncios. Clique em uma categoria para operar a fila, os ativos e os ajustes.</p>
        </div>
        <div class="admin-section-actions">
          <span class="admin-section-count">${totals.products} produtos</span>
          <button class="btn btn-primary btn-sm" type="button" data-category-create>${icons.plus} Nova categoria</button>
        </div>
      </div>
      <div class="category-summary-grid">
        <div class="category-metric-card"><span>Total</span><strong>${totals.products}</strong><small>Anuncios cadastrados</small></div>
        <div class="category-metric-card success"><span>Ativos</span><strong>${totals.active}</strong><small>Visiveis para compradores</small></div>
        <div class="category-metric-card warning"><span>Fila</span><strong>${totals.queue}</strong><small>Aguardando moderacao</small></div>
        <div class="category-metric-card danger"><span>Ajustes</span><strong>${totals.rejected}</strong><small>Com retorno ao vendedor</small></div>
      </div>
      <div class="category-heat-grid">
        ${rows.map(cat => {
          const pct = cat.pct;
          const barClass = pct >= 80 ? 'success' : cat.queue > 0 ? 'warning' : 'danger';
          const statusBadge = cat.active > 0 ? 'badge-success' : cat.queue > 0 ? 'badge-warning' : 'badge-neutral';
          const statusLabel = cat.active > 0 ? 'Com ofertas' : cat.queue > 0 ? 'Em analise' : 'Sem ofertas';
          return `
            <article class="category-heat-card ${selectedCategory?.id === cat.id ? 'is-selected' : ''}" role="button" tabindex="0" data-category-select="${escapeHTML(cat.id)}" aria-pressed="${selectedCategory?.id === cat.id ? 'true' : 'false'}">
              <div class="category-heat-header">
                <span class="category-heat-icon">${icons[cat.id] || icons.package}</span>
                <span class="category-heat-name">${escapeHTML(cat.name)}</span>
                <span class="badge ${statusBadge}">${statusLabel}</span>
              </div>
              <div class="category-heat-slots">${cat.active} ativos - ${cat.queue} em analise - ${cat.rejected} ajustes</div>
              <div class="category-rule-line">${Number(cat.maxSlots || 5)} vagas por anuncio - ${Number(cat.durationHours || 24)}h de vitrine</div>
              <div class="progress-bar">
                <div class="progress-fill ${barClass}" style="width:${pct}%;"></div>
              </div>
              <div class="category-heat-footer">
                <span>${pct}% ativos</span>
                <span>${cat.clicks} cliques</span>
              </div>
              ${getCategoryRules(cat.id) ? `<p class="category-rule-preview">${escapeHTML(getCategoryRules(cat.id))}</p>` : ''}
              <div class="category-heat-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-category-open="${escapeHTML(cat.id)}">${icons.eye} Ver produtos</button>
                <button class="btn btn-ghost btn-sm" type="button" data-category-edit="${escapeHTML(cat.id)}">Regras</button>
                <button class="btn btn-ghost btn-sm" type="button" data-category-moderate="${escapeHTML(cat.id)}" ${cat.queue ? '' : 'disabled'}>Moderar</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </div>

    <section class="admin-section category-management-panel" id="category-management-panel">
      <div class="category-management-header">
        <div class="category-management-title">
          <span class="category-management-icon">${icons[selectedCategory?.id] || icons.package}</span>
          <div>
            <h3>${escapeHTML(selectedCategory?.name || 'Categoria')}</h3>
            <p>${selectedCategory?.total || 0} anuncios - ${selectedCategory?.active || 0} ativos - ${selectedCategory?.queue || 0} em analise - ${Number(selectedCategory?.maxSlots || 5)} vagas</p>
          </div>
        </div>
        <div class="category-management-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-category-edit="${escapeHTML(selectedCategory?.id || '')}">Editar regras/vagas</button>
          <button class="btn btn-danger btn-sm" type="button" data-category-delete="${escapeHTML(selectedCategory?.id || '')}" ${selectedCategory?.total ? 'disabled' : ''}>Excluir categoria</button>
          <button class="btn btn-secondary btn-sm" type="button" data-admin-tab="moderation">${icons.shield} Abrir moderacao</button>
        </div>
      </div>
      ${selectedCategory ? `
        <div class="category-rule-detail">
          <strong>Regra atual:</strong>
          <span>${escapeHTML(getCategoryRules(selectedCategory.id) || 'Sem regra especifica. A categoria usa apenas as regras gerais da instituicao.')}</span>
        </div>
      ` : ''}

      <div class="category-filter-row" role="tablist" aria-label="Filtrar produtos da categoria">
        ${filters.map(filter => `
          <button class="category-filter-btn ${categoryStatusFilter === filter.id ? 'active' : ''}" type="button" data-category-filter="${filter.id}" role="tab" aria-selected="${categoryStatusFilter === filter.id ? 'true' : 'false'}">
            ${escapeHTML(filter.label)}
            <span>${filter.count}</span>
          </button>
        `).join('')}
      </div>

      <div class="category-products-list">
        ${filteredProducts.length
          ? filteredProducts.map(product => renderCategoryProductRow(product)).join('')
          : `<div class="empty-state compact">${icons.package}<h3>Nenhum produto neste filtro</h3><p>Quando houver anuncios reais nessa categoria, eles aparecem aqui para analise e acompanhamento.</p></div>`}
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
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <div>
          <h3 class="admin-section-title">Relatorios operacionais</h3>
          <p class="admin-section-subtitle">Leitura real da base: produtos, vendedores, cliques e fila de moderacao.</p>
        </div>
        <div class="admin-section-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-admin-tab="categories">${icons.grid} Categorias</button>
          <button class="btn btn-primary btn-sm" id="btnExportPDF">${icons.fileText} Exportar TXT</button>
        </div>
      </div>

      <div class="report-action-grid">
        <button class="report-action-card" type="button" data-admin-metric="students"><span>Vendedores</span><strong>${sellersCount}</strong><small>Com produtos cadastrados</small></button>
        <button class="report-action-card success" type="button" data-admin-tab="categories"><span>Produtos ativos</span><strong>${activeProducts}</strong><small>Visiveis para compradores</small></button>
        <button class="report-action-card warning" type="button" data-admin-tab="moderation"><span>Pendentes</span><strong>${pendingProducts}</strong><small>Aguardando decisao</small></button>
        <button class="report-action-card" type="button" data-admin-metric="clicks"><span>Cliques</span><strong>${totalClicks}</strong><small>Interacoes registradas</small></button>
        <button class="report-action-card" type="button" data-admin-metric="couponsGenerated"><span>Cupons gerados</span><strong>${s.couponsGenerated?.value ?? 0}</strong><small>Emitidos para alunos</small></button>
        <button class="report-action-card danger" type="button" data-admin-metric="conversion"><span>Conversao</span><strong>${s.conversionRate?.value ?? '0%'}</strong><small>Uso de cupom / geracao</small></button>
      </div>

      <div class="reports-insight-grid">
        <div class="report-panel">
          <h4>Saude da vitrine</h4>
          <div class="report-list">
            <div><span>Categoria mais ativa</span><strong>${escapeHTML(mostActiveCategory?.name || 'Sem dados')}</strong></div>
            <div><span>Produtos expirados</span><strong>${expiredProducts}</strong></div>
            <div><span>Produtos totais</span><strong>${products.length}</strong></div>
          </div>
        </div>
        <div class="report-panel">
          <h4>Produtos com mais cliques</h4>
          <div class="report-product-list">
            ${topProducts.length ? topProducts.map(product => `
              <button type="button" data-category-product-detail="${escapeHTML(product.id)}">
                <span>${escapeHTML(product.title)}</span>
                <strong>${Number(product.clicks || 0)} cliques</strong>
              </button>
            `).join('') : '<p class="muted-text">Nenhum clique registrado ainda.</p>'}
          </div>
        </div>
      </div>

      <div class="reports-grid">
        <div class="chart-container">
          <h4>Produtos ativos por categoria</h4>
          <canvas id="report-chart-1" height="200"></canvas>
        </div>
        <div class="chart-container">
          <h4>Produtos em analise por categoria</h4>
          <canvas id="report-chart-2" height="200"></canvas>
        </div>
      </div>
    </div>
  `;
}

function renderSettings() {
  const settings = {
    autoApproveTrustedSellers: false,
    requireMinorConsent: true,
    requireSellerWhatsapp: true,
    requireProductPhoto: true,
    allowGuestBrowsing: true,
    minDiscountPercent: 10,
    maxDiscountPercent: 50,
    reviewSlaHours: 24,
    defaultAnnouncementHours: 24,
    supportWhatsapp: '',
    termsUrl: '',
    paymentPolicy: 'O Linka nao cobra taxa. O vendedor recebe diretamente pelo Mercado Pago conectado.',
    ...(activeInstitution.settings || {}),
  };
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <div>
          <h3 class="admin-section-title">Configuracoes institucionais</h3>
          <p class="admin-section-subtitle">Politicas, identidade e regras operacionais usadas pelo app em producao.</p>
        </div>
      </div>
      ${!activeInstitution?.id ? `
        <div class="admin-inline-alert">
          ${icons.alertTriangle}
          <span>Nao encontrei uma instituicao real vinculada a este admin. Vincule o usuario admin a uma instituicao no Supabase ou mantenha apenas uma instituicao cadastrada para edicao automatica.</span>
        </div>
      ` : ''}
      <div class="settings-section">
        <h4 class="settings-group-title">Identidade</h4>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Nome da instituicao</h4><p>${escapeHTML(activeInstitution.fullName)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="fullName" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Dominio de e-mail</h4><p>${escapeHTML(activeInstitution.domain)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="domain" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Cor principal</h4><p style="display:flex;align-items:center;gap:8px;"><span style="width:16px;height:16px;border-radius:4px;background:${activeInstitution.primaryColor};display:inline-block;"></span> ${escapeHTML(activeInstitution.primaryColor)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="primaryColor" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>URL do logo</h4><p>${escapeHTML(activeInstitution.logoUrl || 'Nao configurado')}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="logoUrl" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="divider"></div>

        <h4 class="settings-group-title">Moderacao e seguranca</h4>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Autoaprovacao para bons vendedores</h4><p>Vendedores com 5+ anuncios aprovados sem recusa</p></div>
          <div class="toggle ${settings.autoApproveTrustedSellers ? 'active' : ''}" data-setting-toggle="autoApproveTrustedSellers"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Consentimento de responsavel (menores)</h4><p>Exigir consentimento para alunos menores de 18 anos</p></div>
          <div class="toggle ${settings.requireMinorConsent !== false ? 'active' : ''}" data-setting-toggle="requireMinorConsent"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>WhatsApp obrigatorio para vendedor</h4><p>Melhora contato, retirada e suporte ao comprador</p></div>
          <div class="toggle ${settings.requireSellerWhatsapp !== false ? 'active' : ''}" data-setting-toggle="requireSellerWhatsapp"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Foto real obrigatoria</h4><p>Ajuda a moderacao e evita anuncios genericos</p></div>
          <div class="toggle ${settings.requireProductPhoto !== false ? 'active' : ''}" data-setting-toggle="requireProductPhoto"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Navegacao de visitantes</h4><p>Permite ver ofertas antes de criar conta</p></div>
          <div class="toggle ${settings.allowGuestBrowsing !== false ? 'active' : ''}" data-setting-toggle="allowGuestBrowsing"></div>
        </div>
        <div class="divider"></div>

        <h4 class="settings-group-title">Regras comerciais</h4>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Desconto minimo</h4><p>${Number(settings.minDiscountPercent || 10)}% por anuncio</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-number="minDiscountPercent">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Desconto maximo</h4><p>${Number(settings.maxDiscountPercent || 50)}% por anuncio</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-number="maxDiscountPercent">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Prazo de revisao</h4><p>${Number(settings.reviewSlaHours || 24)} horas para SLA interno</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-number="reviewSlaHours">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Duracao padrao da vitrine</h4><p>${Number(settings.defaultAnnouncementHours || 24)} horas quando a categoria nao definir</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-number="defaultAnnouncementHours">Editar</button>
        </div>
        <div class="divider"></div>

        <h4 class="settings-group-title">Governanca e suporte</h4>
        <div class="setting-item">
          <div class="setting-item-info"><h4>WhatsApp de suporte da instituicao</h4><p>${escapeHTML(settings.supportWhatsapp || 'Nao configurado')}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-text="supportWhatsapp">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>URL de termos de uso</h4><p>${escapeHTML(settings.termsUrl || 'Nao configurado')}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-text="termsUrl">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Politica de pagamentos</h4><p>${escapeHTML(settings.paymentPolicy)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting-text="paymentPolicy">Editar</button>
        </div>
        <div class="settings-real-summary">
          <span>${getAdminCategories(false).length} categorias reais</span>
          <span>${(loadedAllProducts || []).length} anuncios no banco</span>
          <span>${(loadedPendingAds || []).length} pendentes</span>
        </div>
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
  const product = (loadedAllProducts || []).find(item => String(item.id) === String(productId));
  if (!product) {
    showToast('Produto nao encontrado nesta sessao.', 'error');
    return;
  }

  const modalRoot = document.getElementById('modal-root');
  const category = getAdminCategories().find(c => c.id === product.category);
  const status = getProductStatusMeta(product.status);
  const images = Array.isArray(product.images) && product.images.length ? product.images : [null];
  const isModeratable = product.status === 'pending' || product.status === 'queue';

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="admin-product-modal">
      <div class="modal-content admin-product-modal-content">
        <div class="modal-handle"></div>
        <div class="admin-product-modal-header">
          <div>
            <span class="badge ${status.badge}">${status.label}</span>
            <h3>${escapeHTML(product.title)}</h3>
            <p>${escapeHTML(category?.name || product.category || 'Categoria')}</p>
          </div>
          <button class="btn btn-ghost btn-icon" type="button" id="close-admin-product-modal" aria-label="Fechar">${icons.x}</button>
        </div>
        <div class="admin-product-detail-gallery">
          <button class="admin-product-detail-main" type="button" data-admin-photo-index="0" aria-label="Ampliar foto principal">
            ${getProductImage(images[0], 480, 280, product.category)}
          </button>
          ${images.length > 1 ? `
            <div class="admin-product-detail-thumbs">
              ${images.map((image, index) => `<button type="button" data-admin-photo-index="${index}" aria-label="Abrir foto ${index + 1}">${getProductImage(image, 96, 72, product.category)}</button>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="admin-product-detail-grid">
          <div><span>Preco final</span><strong>${formatCurrency(product.discountPrice)}</strong></div>
          <div><span>Preco original</span><strong>${formatCurrency(product.originalPrice)}</strong></div>
          <div><span>Desconto</span><strong>${Number(product.discount || 0)}%</strong></div>
          <div><span>Cliques</span><strong>${Number(product.clicks || 0)}</strong></div>
        </div>
        <div class="admin-product-detail-block">
          <h4>Descricao</h4>
          <p>${escapeHTML(product.description || 'Sem descricao cadastrada.')}</p>
        </div>
        <div class="admin-product-detail-block">
          <h4>Vendedor</h4>
          <p>${escapeHTML(product.seller?.name || 'Vendedor sem perfil')} ${product.seller?.email ? `- ${escapeHTML(product.seller.email)}` : ''}</p>
        </div>
        ${product.rejectionReason ? `
          <div class="admin-product-detail-block danger">
            <h4>Retorno registrado</h4>
            <p>${escapeHTML(product.rejectionReason)}</p>
          </div>
        ` : ''}
        <div class="admin-product-modal-actions">
          <button class="btn btn-danger" type="button" data-modal-delete="${escapeHTML(product.id)}">Excluir da vitrine</button>
          ${isModeratable ? `
            <button class="btn btn-success" type="button" data-modal-approve="${escapeHTML(product.id)}">${icons.check} Aprovar</button>
            <button class="btn btn-secondary" type="button" data-modal-adjust="${escapeHTML(product.id)}">Solicitar ajuste</button>
            <button class="btn btn-danger" type="button" data-modal-reject="${escapeHTML(product.id)}">Recusar</button>
          ` : `
            <button class="btn btn-secondary" type="button" id="close-admin-product-modal-secondary">Fechar</button>
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
      showToast('Produto aprovado com sucesso.', 'success');
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
    } else {
      approveBtn.disabled = false;
      approveBtn.innerHTML = `${icons.check} Aprovar`;
      showToast(result?.error || 'Nao foi possivel aprovar o produto.', 'error');
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
        <div class="admin-photo-viewer">
          <button class="btn btn-ghost btn-icon admin-photo-close" type="button" id="close-admin-photo" aria-label="Fechar">${icons.x}</button>
          <div class="admin-photo-stage">
            ${getProductImage(safeImages[currentIndex], 900, 680, product.category)}
          </div>
          <div class="admin-photo-controls">
            <button class="btn btn-secondary btn-sm" type="button" id="admin-photo-prev" ${safeImages.length <= 1 ? 'disabled' : ''}>Anterior</button>
            <span>${currentIndex + 1} / ${safeImages.length}</span>
            <button class="btn btn-secondary btn-sm" type="button" id="admin-photo-next" ${safeImages.length <= 1 ? 'disabled' : ''}>Proxima</button>
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
      <div class="modal-content">
        <div class="modal-handle"></div>
        <h3 class="modal-title">Excluir anuncio</h3>
        <p class="modal-description">Isso remove o produto da vitrine e encerra a oferta para compradores. O historico continua preservado para auditoria.</p>
        ${product ? `<div class="delete-product-summary"><strong>${escapeHTML(product.title)}</strong><span>${formatCurrency(product.discountPrice)}</span></div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" id="cancel-delete-product">Cancelar</button>
          <button class="btn btn-danger" type="button" id="confirm-delete-product">Excluir da vitrine</button>
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
      showToast('Anuncio removido da vitrine.', 'success');
      await renderAdminPage(container);
      if (adminView === 'categories') scrollCategoryManagementIntoView(container);
    } else {
      button.disabled = false;
      button.textContent = 'Excluir da vitrine';
      showToast(result?.error || 'Nao foi possivel excluir o anuncio.', 'error');
    }
  });
}

function showCategoryModal(mode, category, container) {
  const isEdit = mode === 'edit';
  const modalRoot = document.getElementById('modal-root');
  const currentRules = isEdit ? getCategoryRules(category.id) : '';
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="category-modal">
      <div class="modal-content category-editor-modal">
        <div class="modal-handle"></div>
        <form id="category-form">
          <h3 class="modal-title">${isEdit ? 'Editar categoria' : 'Nova categoria'}</h3>
          <p class="modal-description">Estas regras ficam salvas no banco e passam a orientar a moderacao e os novos anuncios.</p>
          <div class="input-group">
            <label>Nome da categoria</label>
            <input class="input-field" name="name" value="${escapeHTML(category?.name || '')}" placeholder="Ex.: Livros e apostilas" required maxlength="48" />
          </div>
          ${isEdit ? '' : `
            <div class="input-group">
              <label>Identificador</label>
              <input class="input-field" name="id" placeholder="livros-apostilas" maxlength="48" />
            </div>
          `}
          <div class="category-editor-grid">
            <div class="input-group">
              <label>Vagas por anuncio</label>
              <input class="input-field" name="maxSlots" type="number" min="1" max="99" value="${Number(category?.maxSlots || 5)}" required />
            </div>
            <div class="input-group">
              <label>Horas na vitrine</label>
              <input class="input-field" name="durationHours" type="number" min="1" max="720" value="${Number(category?.durationHours || 24)}" required />
            </div>
          </div>
          <div class="input-group">
            <label>Regra da categoria</label>
            <textarea class="input-field" name="rules" rows="3" placeholder="Ex.: Somente produtos lacrados ou com foto real.">${escapeHTML(currentRules)}</textarea>
          </div>
          <div class="modal-inline-status" id="category-modal-status" role="status" aria-live="polite"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="cancel-category">Cancelar</button>
            <button class="btn btn-primary" type="submit" id="save-category">${isEdit ? 'Salvar' : 'Criar categoria'}</button>
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
      statusEl.textContent = 'Salvando categoria no Supabase...';
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
      await renderAdminPage(container);
      scrollCategoryManagementIntoView(container);
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = isEdit ? 'Salvar' : 'Criar categoria';
      const message = error.message || 'Nao foi possivel salvar a categoria.';
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
    showToast('Antes de excluir, mova ou encerre os anuncios vinculados a esta categoria.', 'error');
    return;
  }

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="delete-category-modal">
      <div class="modal-content">
        <div class="modal-handle"></div>
        <h3 class="modal-title">Excluir categoria</h3>
        <p class="modal-description">A categoria "${escapeHTML(category.name)}" sera removida do banco. Essa acao so e permitida quando nao ha anuncios vinculados.</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" id="cancel-delete-category">Cancelar</button>
          <button class="btn btn-danger" type="button" id="confirm-delete-category">Excluir categoria</button>
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
      showToast('Categoria excluida.', 'success');
      await renderAdminPage(container);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Excluir categoria';
      showToast(error.message || 'Nao foi possivel excluir a categoria.', 'error');
    }
  });
}

function showAdminMetricModal(title, description, rows = []) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="metric-modal">
      <div class="modal-content admin-metric-modal">
        <div class="modal-handle"></div>
        <h3 class="modal-title">${escapeHTML(title)}</h3>
        <p class="modal-description">${escapeHTML(description)}</p>
        <div class="metric-modal-list">
          ${rows.length ? rows.map((row) => `
            <div class="metric-modal-row">
              <span>${escapeHTML(row.label)}</span>
              <strong>${escapeHTML(String(row.value))}</strong>
            </div>
          `).join('') : '<div class="empty-state compact"><h3>Sem dados para detalhar</h3><p>Assim que houver uso real, esta lista sera preenchida automaticamente.</p></div>'}
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" id="close-metric-modal">Ok</button>
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
    return;
  }

  const stats = loadedStats || {};
  const sellerCount = new Set((loadedAllProducts || []).map((product) => product.seller?.id || product.sellerId).filter(Boolean)).size;
  showAdminMetricModal('Alunos da instituicao', 'Resumo operacional com os dados disponiveis no banco.', [
    { label: 'Alunos cadastrados', value: stats.students?.value ?? 0 },
    { label: 'Vendedores com produtos', value: sellerCount },
    { label: 'Dominio institucional', value: activeInstitution?.domain || 'Nao configurado' },
  ]);
}

function bindAdminEvents(container) {
  // Tabs
  container.querySelectorAll('[data-admin-tab]').forEach(tab => {
    tab.addEventListener('click', () => { adminView = tab.dataset.adminTab; renderAdminPage(container); });
  });

  // Bottom nav
  container.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { adminView = item.dataset.nav; renderAdminPage(container); });
  });

  container.addEventListener('click', async (event) => {
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
        if (!result?.success) throw new Error(result?.error || 'Nao foi possivel aprovar o anuncio.');
        removePendingAd(adId);
        showToast('Anuncio aprovado com sucesso!', 'success');
        await renderAdminPage(container);
      } catch (err) {
        showToast(err.message || 'Nao foi possivel aprovar o anuncio.', 'error');
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
    }
  }, true);

  container.addEventListener('click', async (event) => {
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
        if (!result?.success) throw new Error(result?.error || 'Nao foi possivel aprovar o produto.');
        removePendingAd(productId);
        showToast('Produto aprovado com sucesso.', 'success');
        await renderAdminPage(container);
        scrollCategoryManagementIntoView(container);
      } catch (error) {
        approveProductBtn.disabled = false;
        approveProductBtn.innerHTML = originalHtml;
        showToast(error.message || 'Nao foi possivel aprovar o produto.', 'error');
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
      showToast('Voce saiu da conta admin.', 'success');
      window.location.hash = '#/auth';
    } catch {
      window.location.hash = '#/auth';
    }
  });

  // Toggles
  container.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', async () => {
      if (toggle.classList.contains('is-saving')) return;
      if (!activeInstitution?.id) {
        showToast('Instituicao real nao encontrada para salvar.', 'error');
        return;
      }
      const key = toggle.dataset.settingToggle;
      const nextValue = !toggle.classList.contains('active');
      toggle.classList.add('is-saving');
      toggle.classList.toggle('active', nextValue);
      const settings = { ...(activeInstitution.settings || {}), [key]: nextValue };
      const result = await updateInstitution(activeInstitution.id, { settings });
      if (result?.success) {
        activeInstitution = result.institution;
        showToast('Configuracao salva.', 'success');
      } else {
        toggle.classList.toggle('active', !nextValue);
        showToast(result?.error || 'Nao foi possivel salvar.', 'error');
      }
      toggle.classList.remove('is-saving');
    });
  });

  // Real editable institution fields
  container.querySelectorAll('.settings-section .btn[data-setting]').forEach(btn => {
    btn.addEventListener('click', () => {
      const settingItem = btn.closest('.setting-item');
      const title = settingItem?.querySelector('h4')?.textContent || '';
      const currentVal = settingItem?.querySelector('p')?.textContent?.trim() || '';
      const settingKey = btn.dataset.setting;
      const modalRoot = document.getElementById('modal-root');

      let inputHtml = `<input type="text" class="input-field" id="settingEditVal" value="${currentVal}" style="margin-top:var(--space-3);" />`;
      if (settingKey === 'primaryColor') {
        inputHtml = `<input type="color" id="settingEditVal" value="${escapeHTML(activeInstitution.primaryColor || '#2563eb')}" style="width:100%;height:48px;border-radius:8px;border:1px solid var(--gray-700);margin-top:var(--space-3);cursor:pointer;" />`;
      }

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="settings-edit-modal">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <form id="settings-edit-form">
              <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Editar: ${escapeHTML(title)}</h3>
              <div class="input-group">${inputHtml}</div>
              <div class="modal-inline-status" id="setting-modal-status" role="status" aria-live="polite"></div>
              <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
                <button type="button" class="btn btn-secondary" style="flex:1;" id="cancel-setting">Cancelar</button>
                <button type="submit" class="btn btn-primary" style="flex:1;" id="confirm-setting">Salvar</button>
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
          showToast('Instituicao real nao encontrada para salvar.', 'error');
          return;
        }
        const confirmBtn = modalRoot.querySelector('#confirm-setting');
        const statusEl = modalRoot.querySelector('#setting-modal-status');
        const value = modalRoot.querySelector('#settingEditVal')?.value?.trim();
        if (!value) {
          showToast('Preencha o campo.', 'error');
          if (statusEl) {
            statusEl.className = 'modal-inline-status error';
            statusEl.textContent = 'Preencha o campo antes de salvar.';
          }
          return;
        }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Salvando...';
        if (statusEl) {
          statusEl.className = 'modal-inline-status info';
          statusEl.textContent = 'Salvando no banco de dados...';
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
          const errorMessage = result?.error || 'Nao foi possivel salvar.';
          if (statusEl) {
            statusEl.className = 'modal-inline-status error';
            statusEl.textContent = errorMessage;
          }
          showToast(errorMessage, 'error');
        }
      });
    });
  });

  container.querySelectorAll('[data-setting-text], [data-setting-number]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeInstitution?.id) {
        showToast('Instituicao real nao encontrada para salvar.', 'error');
        return;
      }
      const isNumber = Boolean(btn.dataset.settingNumber);
      const settingKey = btn.dataset.settingNumber || btn.dataset.settingText;
      const settingItem = btn.closest('.setting-item');
      const title = settingItem?.querySelector('h4')?.textContent || 'Configuracao';
      const currentValue = activeInstitution.settings?.[settingKey] ?? '';
      const modalRoot = document.getElementById('modal-root');
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="settings-json-modal">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <form id="settings-json-form">
              <h3 class="modal-title">Editar: ${escapeHTML(title)}</h3>
              <div class="input-group">
                ${isNumber
                  ? `<input class="input-field" id="settingJsonVal" type="number" min="0" value="${escapeHTML(String(currentValue || ''))}" />`
                  : `<textarea class="input-field" id="settingJsonVal" rows="3">${escapeHTML(String(currentValue || ''))}</textarea>`}
              </div>
              <div class="modal-inline-status" id="setting-json-status" role="status" aria-live="polite"></div>
              <div class="modal-actions">
                <button type="button" class="btn btn-secondary" id="cancel-json-setting">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="confirm-json-setting">Salvar</button>
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
        const value = isNumber ? Number(rawValue) : rawValue;
        if (isNumber && (!Number.isFinite(value) || value < 0)) {
          showToast('Informe um numero valido.', 'error');
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
        if (statusEl) {
          statusEl.className = 'modal-inline-status info';
          statusEl.textContent = 'Salvando configuracao...';
        }
        const settings = { ...(activeInstitution.settings || {}), [settingKey]: value };
        const result = await updateInstitution(activeInstitution.id, { settings });
        if (result?.success) {
          activeInstitution = result.institution;
          close();
          showToast('Configuracao salva.', 'success');
          renderAdminPage(container);
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Salvar';
          const errorMessage = result?.error || 'Nao foi possivel salvar.';
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
    await renderAdminPage(container);
  });

  // Admin bell notification
  container.querySelector('#btnAdminNotif')?.addEventListener('click', () => {
    adminView = 'moderation';
    renderAdminPage(container);
  });

  // Alert action buttons — route by action text
  container.querySelectorAll('.alert-card .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.textContent.trim();
      if (action === 'Editar vagas') {
        adminView = 'categories';
        renderAdminPage(container);
      } else if (action === 'Moderar agora' || action === 'Ver moderacao') {
        adminView = 'moderation';
        renderAdminPage(container);
      } else if (action === 'Visualizar') {
        adminView = 'categories';
        renderAdminPage(container);
      } else if (action === 'Ver detalhes') {
        adminView = 'moderation';
        renderAdminPage(container);
      } else {
        adminView = 'moderation';
        renderAdminPage(container);
      }
    });
  });
  
  // Export plain text report
  container.querySelector('#btnExportPDF')?.addEventListener('click', () => {
    const s = loadedStats || (USE_MOCKS ? adminStats : {});
    const report = `RELATÓRIO LINKA - ${escapeHTML(activeInstitution.fullName)}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nAlunos: ${s.students?.value ?? 0}\nCliques: ${s.clicks?.value ?? 0}\nCupons Gerados: ${s.couponsGenerated?.value ?? 0}\nCupons Usados: ${s.couponsUsed?.value ?? 0}\nConversão: ${s.conversionRate?.value ?? '0%'}\nPendentes: ${(loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length}\n`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio-linka-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Relatorio exportado!', 'success');
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
      <div class="modal-content">
        <div class="modal-handle"></div>
        <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Recusar anúncio</h3>
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Selecione o motivo da recusa:</p>
        <div class="reject-reasons" id="reject-reasons">
          ${rejectReasons.map((r, i) => `
            <div class="reject-reason-option" data-reason="${i}">
              <div class="reject-reason-radio"></div>
              <span>${r}</span>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
          <button class="btn btn-secondary" style="flex:1;" id="cancel-reject">Cancelar</button>
          <button class="btn btn-danger" style="flex:1;" id="confirm-reject">Confirmar recusa</button>
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
  confirmRejectBtn.addEventListener('click', async () => {
    if (selectedReason === -1) { showToast('Selecione um motivo.', 'error'); return; }
    confirmRejectBtn.disabled = true;
    confirmRejectBtn.textContent = 'Recusando...';
    const result = await rejectProduct(adId, rejectReasons[selectedReason]);
    if (result?.success) {
      modalRoot.innerHTML = '';
      removePendingAd(adId);
      showToast('Anúncio recusado.', 'error');
      if (container) renderAdminPage(container);
    } else {
      showToast(result?.error || 'Não foi possível recusar o anúncio.', 'error');
    }
  });
}

function showAdjustModal(adId, container) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="adjust-modal">
      <div class="modal-content">
        <div class="modal-handle"></div>
        <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Solicitar ajuste</h3>
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Selecione o motivo e adicione uma orientação (opcional):</p>
        <div class="reject-reasons">
          ${rejectReasons.map((r, i) => `
            <div class="reject-reason-option" data-reason="${i}">
              <div class="reject-reason-radio"></div>
              <span>${r}</span>
            </div>
          `).join('')}
        </div>
        <div class="input-group" style="margin-top:var(--space-4);">
          <label>Orientação adicional (opcional)</label>
          <textarea class="input-field" placeholder="Descreva o ajuste necessário..." rows="3" id="adjust-note"></textarea>
        </div>
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
          <button class="btn btn-secondary" style="flex:1;" id="cancel-adjust">Cancelar</button>
          <button class="btn btn-primary" style="flex:1;" id="confirm-adjust">Enviar</button>
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
      showToast('Ajuste solicitado com sucesso!', 'success');
      if (container) renderAdminPage(container);
    } else {
      confirmAdjustBtn.disabled = false;
      confirmAdjustBtn.textContent = 'Enviar';
      showToast(result?.error || 'Nao foi possivel solicitar ajuste.', 'error');
    }
  });
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
  const pad = { top: 20, right: 20, bottom: 30, left: 30 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
  const max = Math.max(1, ...data) * 1.2;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }

  ctx.beginPath();
  ctx.strokeStyle = '#00E5A0';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  data.forEach((v, i) => {
    const x = pad.left + (cw / (data.length - 1)) * i;
    const y = pad.top + ch - (v / max) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
  grad.addColorStop(0, 'rgba(0,229,160,0.12)');
  grad.addColorStop(1, 'rgba(0,229,160,0)');
  ctx.lineTo(pad.left + cw, h - pad.bottom);
  ctx.lineTo(pad.left, h - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = '#55556a';
  ctx.font = '11px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    ctx.fillText(l, pad.left + (cw / (data.length - 1)) * i, h - 8);
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
  const colors = metric === 'active'
    ? ['#00E5A0', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7']
    : ['#F5A623', '#f97316', '#eab308', '#fb7185', '#c084fc'];
  const w = rect.width, h = rect.height;
  const pad = { top: 10, right: 10, bottom: 30, left: 10 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
  const max = Math.max(1, ...data) * 1.2;
  const barW = (cw / data.length) * 0.6;
  const gap = (cw / data.length) * 0.4;

  data.forEach((v, i) => {
    const x = pad.left + (cw / data.length) * i + gap / 2;
    const barH = (v / max) * ch;
    const y = pad.top + ch - barH;

    ctx.fillStyle = colors[i];
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barW - r, y);
    ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
    ctx.lineTo(x + barW, pad.top + ch);
    ctx.lineTo(x, pad.top + ch);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();

    ctx.fillStyle = '#55556a';
    ctx.font = '10px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW / 2, h - 8);
    ctx.fillStyle = '#8b8b9e';
    ctx.font = 'bold 11px Plus Jakarta Sans, sans-serif';
    ctx.fillText(v.toString(), x + barW / 2, y - 6);
  });
}
