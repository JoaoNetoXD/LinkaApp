import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile } from '../main.js';
import { pendingAds, adminStats, categoryHeat, rejectReasons, categories, institution } from '../data/mock.js';
import { getPendingProducts, approveProduct, rejectProduct, requestProductAdjustment, getCategoryStats, getAllProducts } from '../services/product-service.js';
import { getInstitutionStats, updateInstitution, getInstitution, getAllInstitutions } from '../services/institution-service.js';
import { signOutUser } from '../services/auth-service.js';

const USE_MOCKS = import.meta.env.DEV;

let adminView = 'dashboard';
let loadedPendingAds = null;
let loadedStats = null;
let loadedAllProducts = [];
let loadedCategoryStats = {};
let activeInstitution = institution;

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
    loadedStats = await getInstitutionStats(null);
  } catch { loadedStats = USE_MOCKS ? adminStats : null; }

  try {
    loadedAllProducts = await getAllProducts();
  } catch { loadedAllProducts = USE_MOCKS ? pendingAds : []; }

  try {
    loadedCategoryStats = await getCategoryStats();
  } catch { loadedCategoryStats = USE_MOCKS ? categoryHeat : {}; }
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
    { label: 'Alunos', value: s.students?.value ?? 0, change: s.students?.change || '', positive: true, icon: icons.user },
    { label: 'Cliques', value: s.clicks?.value ?? 0, change: s.clicks?.change || '', positive: true, icon: icons.eye },
    { label: 'Cupons gerados', value: s.couponsGenerated?.value ?? 0, change: s.couponsGenerated?.change || '', positive: true, icon: icons.ticket },
    { label: 'Cupons usados', value: s.couponsUsed?.value ?? 0, change: s.couponsUsed?.change || '', positive: true, icon: icons.checkCircle },
    { label: 'Conversão', value: s.conversionRate?.value ?? '0%', change: s.conversionRate?.change || '', positive: true, icon: icons.checkCircle },
    { label: 'Pendentes', value: (loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length, change: '', positive: true, icon: icons.clock },
  ];
  return `
    <div class="admin-stats-grid">
      ${stats.map(s => `
        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <div class="stat-icon">${s.icon || ''}</div>
            <span class="stat-change ${s.positive ? 'positive' : 'negative'}">${s.change}</span>
          </div>
          <div class="stat-info">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
          </div>
        </div>
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
            <span>${icons.tag} ${escapeHTML(categories.find(c => c.id === ad.category)?.name || '')}</span>
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

function renderCategories() {
  const rows = categories.filter(c => c.id !== 'all').map(category => {
    const stats = loadedCategoryStats?.[category.id] || {};
    const active = Number(stats.active || 0);
    const queue = Number(stats.queue || stats.pending || 0);
    const total = Math.max(active + queue, 1);
    const pct = Math.min(Math.round((active / total) * 100), 100);
    return { ...category, active, queue, total, pct };
  });
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">Categorias reais</h3>
      </div>
      <div class="category-heat-grid">
        ${rows.map(cat => {
          const pct = cat.pct;
          const barClass = pct >= 100 ? 'danger' : pct >= 70 ? 'warning' : 'success';
          const statusBadge = cat.active > 0 ? 'badge-success' : cat.queue > 0 ? 'badge-warning' : 'badge-neutral';
          const statusLabel = cat.active > 0 ? 'Com ofertas' : cat.queue > 0 ? 'Em analise' : 'Sem ofertas';
          return `
            <div class="category-heat-card">
              <div class="category-heat-header">
                <span class="category-heat-name">${cat.icon || ''} ${escapeHTML(cat.name)}</span>
                <span class="badge ${statusBadge}">${statusLabel}</span>
              </div>
              <div class="category-heat-slots">${cat.active} ativos · ${cat.queue} em analise</div>
              <div class="progress-bar">
                <div class="progress-fill ${barClass}" style="width:${pct}%;"></div>
              </div>
              <div class="category-heat-footer">
                <span>${pct}% dos anuncios da categoria estao ativos</span>
                <span>Dados do Supabase</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderReports() {
  const s = loadedStats || (USE_MOCKS ? adminStats : {});
  const sellersCount = new Set((loadedAllProducts || []).map(product => product.seller?.id || product.sellerId).filter(Boolean)).size;
  const activeProducts = (loadedAllProducts || []).filter(product => product.status === 'active').length;
  const mostActiveCategory = categories.filter(c => c.id !== 'all')
    .map(category => ({ category, count: loadedCategoryStats?.[category.id]?.active || 0 }))
    .sort((a, b) => b.count - a.count)[0]?.category;
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">Impacto institucional</h3>
        <button class="btn btn-primary btn-sm" id="btnExportPDF">${icons.fileText} Exportar TXT</button>
      </div>
      <div class="admin-stats" style="margin-bottom:var(--space-5);padding:0;">
        <div class="stat-card"><div class="stat-label">Vendedores com produtos</div><div class="stat-value">${sellersCount}</div></div>
        <div class="stat-card"><div class="stat-label">Produtos ativos</div><div class="stat-value">${activeProducts}</div></div>
        <div class="stat-card"><div class="stat-label">Cupons gerados</div><div class="stat-value">${s.couponsGenerated?.value ?? 0}</div></div>
        <div class="stat-card"><div class="stat-label">Cupons usados</div><div class="stat-value">${s.couponsUsed?.value ?? 0}</div></div>
        <div class="stat-card"><div class="stat-label">Conversao</div><div class="stat-value">${s.conversionRate?.value ?? '0%'}</div></div>
        <div class="stat-card"><div class="stat-label">Cat. mais ativa</div><div class="stat-value">${mostActiveCategory?.icon || '-'}</div></div>
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
  return `
    <div class="admin-section">
      <h3 class="admin-section-title" style="margin-bottom:var(--space-5);">Configuracoes institucionais</h3>
      ${!activeInstitution?.id ? `
        <div class="admin-inline-alert">
          ${icons.alertTriangle}
          <span>Nao encontrei uma instituicao real vinculada a este admin. Vincule o usuario admin a uma instituicao no Supabase ou mantenha apenas uma instituicao cadastrada para edicao automatica.</span>
        </div>
      ` : ''}
      <div class="settings-section">
        <div class="setting-item">
          <div class="setting-item-info"><h4>Nome da instituição</h4><p>${escapeHTML(activeInstitution.fullName)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="fullName" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Domínio de e-mail</h4><p>${escapeHTML(activeInstitution.domain)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="domain" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Cor principal</h4><p style="display:flex;align-items:center;gap:8px;"><span style="width:16px;height:16px;border-radius:4px;background:${activeInstitution.primaryColor};display:inline-block;"></span> ${escapeHTML(activeInstitution.primaryColor)}</p></div>
          <button class="btn btn-ghost btn-sm" data-setting="primaryColor" ${!activeInstitution?.id ? 'disabled' : ''}>Editar</button>
        </div>
        <div class="divider"></div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Autoaprovação para bons vendedores</h4><p>Vendedores com 5+ anúncios aprovados sem recusa</p></div>
          <div class="toggle ${activeInstitution.settings?.autoApproveTrustedSellers ? 'active' : ''}" data-setting-toggle="autoApproveTrustedSellers"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Consentimento de responsável (menores)</h4><p>Exigir consentimento para alunos menores de 18 anos</p></div>
          <div class="toggle ${activeInstitution.settings?.requireMinorConsent !== false ? 'active' : ''}" data-setting-toggle="requireMinorConsent"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Regras de uso</h4><p>Termos e politicas devem ficar no contrato ou em uma pagina dedicada antes de serem publicados no app.</p></div>
          <span class="badge badge-neutral">Sem acao no app</span>
        </div>
      </div>
    </div>
  `;
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

  const rows = categories.filter(c => c.id !== 'all').map((category) => ({
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
