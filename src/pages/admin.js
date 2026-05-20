import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile } from '../main.js';
import { pendingAds, adminStats, categoryHeat, alerts, rejectReasons, categories, institution } from '../data/mock.js';
import { getPendingProducts, approveProduct, rejectProduct, requestProductAdjustment, getCategoryStats, getAllProducts } from '../services/product-service.js';
import { getInstitutionStats, updateInstitution, getInstitution } from '../services/institution-service.js';
import { signOutUser } from '../services/auth-service.js';

const USE_MOCKS = import.meta.env.DEV;

let adminView = 'dashboard';
let loadedPendingAds = null;
let loadedStats = null;
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
  const institutionId = globalProfile?.institution_id || globalSession?.user?.user_metadata?.institution_id || null;
  if (institutionId) {
    const realInstitution = await getInstitution(institutionId);
    if (realInstitution) {
      activeInstitution = realInstitution;
      return;
    }
  }
  activeInstitution = USE_MOCKS ? institution : { name: 'Instituição', fullName: 'Instituição', domain: '', primaryColor: '#2563eb' };
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
          <button class="period-filter" id="btnPeriodFilter" style="padding: 6px 10px;">${icons.clock} <span class="hide-mobile" id="periodLabel">7d</span></button>
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
        <h3 class="admin-section-title">⚠️ Alertas</h3>
        <span class="admin-section-count">${alerts.length}</span>
      </div>
      <div class="alerts-list">
        ${alerts.map(a => `
          <div class="alert-card ${a.level === 'critical' ? 'critical' : ''}">
            <div class="alert-card-icon">${icons.alertTriangle}</div>
            <div class="alert-card-content">
              <h4>${escapeHTML(a.title)}</h4>
              <p>${escapeHTML(a.description)}</p>
              <span class="alert-time">${escapeHTML(a.time)}</span>
            </div>
            <button class="btn btn-ghost btn-sm">${escapeHTML(a.action)}</button>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Quick moderation -->
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">📋 Pendentes</h3>
        <button class="btn btn-ghost btn-sm" data-admin-tab="moderation">Ver todos →</button>
      </div>
      ${(loadedPendingAds || (USE_MOCKS ? pendingAds : [])).slice(0, 2).map(ad => renderModerationCard(ad)).join('')}
    </div>

    <!-- Charts -->
    <div class="admin-section">
      <h3 class="admin-section-title" style="margin-bottom:var(--space-4);">📊 Métricas</h3>
      <div class="chart-container">
        <h4>Ocupação de vagas (7 dias)</h4>
        <canvas id="admin-chart" height="200"></canvas>
      </div>
    </div>

    <!-- Top sellers -->
    <div class="admin-section">
      <h3 class="admin-section-title" style="margin-bottom:var(--space-4);">🏆 Vendedores mais ativos</h3>
      <div class="sellers-list">
        ${[
          { name: 'Maria Clara', course: 'Gastronomia', ads: 5, conversion: '72%', avatar: 'MC' },
          { name: 'Ana Beatriz', course: 'Engenharia', ads: 3, conversion: '78%', avatar: 'AB' },
          { name: 'Pedro Henrique', course: 'Design', ads: 4, conversion: '50%', avatar: 'PH' }
        ].map((s, i) => `
          <div class="seller-row">
            <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);color:var(--primary-500);width:24px;">${i + 1}</div>
            <div class="avatar avatar-sm">${s.avatar}</div>
            <div class="seller-row-info">
              <h4>${s.name}</h4>
              <p>${s.course}</p>
            </div>
            <div class="seller-row-stats">
              <span>${s.ads} anúncios</span>
              <span>${s.conversion} conv.</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
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
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">Mapa de Calor — Categorias</h3>
      </div>
      <div class="category-heat-grid">
        ${(USE_MOCKS ? categoryHeat : []).map(cat => {
          const pct = (cat.slotsUsed / cat.slotsTotal) * 100;
          const barClass = pct >= 100 ? 'danger' : pct >= 70 ? 'warning' : 'success';
          const statusBadge = cat.status === 'full' ? 'badge-danger' : cat.status === 'warning' ? 'badge-warning' : 'badge-success';
          const statusLabel = cat.status === 'full' ? 'Lotado' : cat.status === 'warning' ? 'Acima de 70%' : 'Disponível';
          return `
            <div class="category-heat-card">
              <div class="category-heat-header">
                <span class="category-heat-name">${categories.find(c => c.id === cat.id)?.icon || ''} ${escapeHTML(cat.name)}</span>
                <span class="badge ${statusBadge}">${statusLabel}</span>
              </div>
              <div class="category-heat-slots">${cat.slotsUsed} de ${cat.slotsTotal} vagas ocupadas</div>
              <div class="progress-bar">
                <div class="progress-fill ${barClass}" style="width:${pct}%;"></div>
              </div>
              <div class="category-heat-footer">
                <span>Fila: ${escapeHTML(cat.queue)} aguardando</span>
                <span>Duração: ${escapeHTML(cat.duration)}</span>
              </div>
              <div class="category-heat-actions">
                <button class="btn btn-ghost btn-sm">Editar vagas</button>
                <button class="btn btn-ghost btn-sm">Editar duração</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderReports() {
  return `
    <div class="admin-section">
      <div class="admin-section-header">
        <h3 class="admin-section-title">📊 Impacto Institucional</h3>
        <button class="btn btn-primary btn-sm" id="btnExportPDF">${icons.fileText} Exportar PDF</button>
      </div>
      <div class="admin-stats" style="margin-bottom:var(--space-5);padding:0;">
        <div class="stat-card"><div class="stat-label">Vendedores ativos</div><div class="stat-value">28</div></div>
        <div class="stat-card"><div class="stat-label">Compradores ativos</div><div class="stat-value">187</div></div>
        <div class="stat-card"><div class="stat-label">Cupons gerados</div><div class="stat-value">486</div></div>
        <div class="stat-card"><div class="stat-label">Cupons usados</div><div class="stat-value">312</div></div>
        <div class="stat-card"><div class="stat-label">Conversão</div><div class="stat-value">64%</div></div>
        <div class="stat-card"><div class="stat-label">Cat. mais ativa</div><div class="stat-value">🍔</div></div>
      </div>
      <div class="reports-grid">
        <div class="chart-container">
          <h4>Cupons gerados por categoria</h4>
          <canvas id="report-chart-1" height="200"></canvas>
        </div>
        <div class="chart-container">
          <h4>Conversão por categoria</h4>
          <canvas id="report-chart-2" height="200"></canvas>
        </div>
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="admin-section">
      <h3 class="admin-section-title" style="margin-bottom:var(--space-5);">⚙️ Configurações Institucionais</h3>
      <div class="settings-section">
        <div class="setting-item">
          <div class="setting-item-info"><h4>Nome da instituição</h4><p>${escapeHTML(activeInstitution.fullName)}</p></div>
          <button class="btn btn-ghost btn-sm">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Domínio de e-mail</h4><p>${escapeHTML(activeInstitution.domain)}</p></div>
          <button class="btn btn-ghost btn-sm">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Logo da instituição</h4><p>Logo atual configurado</p></div>
          <button class="btn btn-ghost btn-sm">Alterar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Cor principal</h4><p style="display:flex;align-items:center;gap:8px;"><span style="width:16px;height:16px;border-radius:4px;background:${activeInstitution.primaryColor};display:inline-block;"></span> ${escapeHTML(activeInstitution.primaryColor)}</p></div>
          <button class="btn btn-ghost btn-sm">Editar</button>
        </div>
        <div class="divider"></div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Autoaprovação para bons vendedores</h4><p>Vendedores com 5+ anúncios aprovados sem recusa</p></div>
          <div class="toggle active" id="toggle-auto"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Consentimento de responsável (menores)</h4><p>Exigir consentimento para alunos menores de 18 anos</p></div>
          <div class="toggle active" id="toggle-consent"></div>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Políticas de uso</h4><p>Termos e condições do marketplace</p></div>
          <button class="btn btn-ghost btn-sm">Editar</button>
        </div>
        <div class="setting-item">
          <div class="setting-item-info"><h4>Multi-tenant</h4><p>Configuração de múltiplos campus</p></div>
          <button class="btn btn-ghost btn-sm">Configurar</button>
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

  // Approve
  container.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = `${icons.loader} Aprovando...`;
      const result = await approveProduct(btn.dataset.adId);
      if (result?.success) {
        showToast('Anúncio aprovado com sucesso!', 'success');
        btn.closest('.moderation-card').style.opacity = '0.3';
        btn.closest('.moderation-card').style.pointerEvents = 'none';
      } else {
        showToast(result?.error || 'Não foi possível aprovar o anúncio.', 'error');
        btn.disabled = false;
        btn.innerHTML = `${icons.check} Aprovar`;
      }
    });
  });

  // Reject
  container.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => showRejectModal(btn.dataset.adId, container));
  });

  // Adjust
  container.querySelectorAll('.adjust-btn').forEach(btn => {
    btn.addEventListener('click', () => showAdjustModal(btn.dataset.adId));
  });

  // Toggles
  container.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => { toggle.classList.toggle('active'); });
  });

  // Settings buttons — open modal with edit form
  container.querySelectorAll('.settings-section .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const settingItem = btn.closest('.setting-item');
      const title = settingItem?.querySelector('h4')?.textContent || '';
      const currentVal = settingItem?.querySelector('p')?.textContent?.trim() || '';
      const modalRoot = document.getElementById('modal-root');

      let inputHtml = `<input type="text" class="input-field" id="settingEditVal" value="${currentVal}" style="margin-top:var(--space-3);" />`;
      if (title.includes('Cor')) {
        inputHtml = `<input type="color" id="settingEditVal" value="#2563eb" style="width:100%;height:48px;border-radius:8px;border:1px solid var(--gray-700);margin-top:var(--space-3);cursor:pointer;" />`;
      } else if (title.includes('Logo')) {
        inputHtml = `<input type="file" accept="image/*" id="settingEditVal" class="input-field" style="margin-top:var(--space-3);" />`;
      } else if (title.includes('Políticas') || title.includes('Multi')) {
        inputHtml = `<textarea class="input-field" id="settingEditVal" rows="4" style="margin-top:var(--space-3);">${currentVal}</textarea>`;
      }

      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="settings-edit-modal">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Editar: ${title}</h3>
            <div class="input-group">${inputHtml}</div>
            <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
              <button class="btn btn-secondary" style="flex:1;" id="cancel-setting">Cancelar</button>
              <button class="btn btn-primary" style="flex:1;" id="confirm-setting">Salvar</button>
            </div>
          </div>
        </div>
      `;
      modalRoot.querySelector('#settings-edit-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
      modalRoot.querySelector('#cancel-setting').addEventListener('click', () => modalRoot.innerHTML = '');
      modalRoot.querySelector('#confirm-setting').addEventListener('click', () => {
        modalRoot.innerHTML = '';
        showToast(`"${title}" atualizado com sucesso!`, 'success');
      });
    });
  });

  // Period filter
  container.querySelector('#btnPeriodFilter')?.addEventListener('click', () => {
    const label = container.querySelector('#periodLabel');
    const options = ['7d', '30d', '90d'];
    const curr = label?.textContent.trim() || '7d';
    const next = options[(options.indexOf(curr) + 1) % options.length];
    if (label) label.textContent = next;
    showToast(`Período alterado para ${next}`, 'info');
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
      } else if (action === 'Moderar agora') {
        adminView = 'moderation';
        renderAdminPage(container);
      } else if (action === 'Visualizar') {
        adminView = 'categories';
        renderAdminPage(container);
      } else if (action === 'Ver detalhes') {
        adminView = 'moderation';
        renderAdminPage(container);
      } else {
        showToast('Detalhes visualizados.', 'info');
      }
    });
  });
  
  // Heatmap actions
  container.querySelectorAll('.category-heat-actions .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const isSlots = btn.textContent.includes('vagas');
      const card = btn.closest('.category-heat-card');
      const catName = card?.querySelector('.category-heat-name')?.textContent?.trim() || 'Categoria';
      const modalRoot = document.getElementById('modal-root');
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="edit-cat-modal">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Editar ${isSlots ? 'Vagas' : 'Duração'}</h3>
            <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">${catName}</p>
            <div class="input-group">
              <label>${isSlots ? 'Número máximo de vagas' : 'Duração do anúncio'}</label>
              <input type="${isSlots ? 'number' : 'text'}" class="input-field" id="catEditVal"
                placeholder="${isSlots ? 'Ex: 8' : 'Ex: 24h'}" min="1" max="20" />
            </div>
            <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
              <button class="btn btn-secondary" style="flex:1;" id="cancel-cat-edit">Cancelar</button>
              <button class="btn btn-primary" style="flex:1;" id="confirm-cat-edit">Salvar</button>
            </div>
          </div>
        </div>
      `;
      modalRoot.querySelector('#edit-cat-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
      modalRoot.querySelector('#cancel-cat-edit').addEventListener('click', () => modalRoot.innerHTML = '');
      modalRoot.querySelector('#confirm-cat-edit').addEventListener('click', () => {
        const val = document.getElementById('catEditVal')?.value;
        if (!val) { showToast('Preencha o campo.', 'error'); return; }
        modalRoot.innerHTML = '';
        showToast(`${isSlots ? 'Vagas' : 'Duração'} de ${catName} atualizada para ${val}${isSlots ? ' vagas' : ''}!`, 'success');
      });
    });
  });

  // Export PDF
  container.querySelector('#btnExportPDF')?.addEventListener('click', () => {
    const s = loadedStats || (USE_MOCKS ? adminStats : {});
    const report = `RELATÓRIO LINKA - ${escapeHTML(activeInstitution.fullName)}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nAlunos: ${s.students?.value ?? 0}\nCliques: ${s.clicks?.value ?? 0}\nCupons Gerados: ${s.couponsGenerated?.value ?? 0}\nCupons Usados: ${s.couponsUsed?.value ?? 0}\nConversão: ${s.conversionRate?.value ?? '0%'}\nPendentes: ${(loadedPendingAds || (USE_MOCKS ? pendingAds : [])).length}\n`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `relatorio-linka-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Relatório exportado!', 'success');
  });

  // Charts
  setTimeout(() => {
    drawAdminChart(container.querySelector('#admin-chart'));
    drawBarChart(container.querySelector('#report-chart-1'));
    drawBarChart(container.querySelector('#report-chart-2'));
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

  const data = [18, 22, 20, 25, 23, 19, 24];
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const w = rect.width, h = rect.height;
  const pad = { top: 20, right: 20, bottom: 30, left: 30 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
  const max = Math.max(...data) * 1.2;

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

function drawBarChart(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const data = [45, 28, 35, 18, 12];
  const labels = ['Lanches', 'Moda', 'Serviços', 'Digital', 'Outros'];
  const colors = ['#00E5A0', '#00cc8e', '#00b37d', '#009a6c', '#00805a'];
  const w = rect.width, h = rect.height;
  const pad = { top: 10, right: 10, bottom: 30, left: 10 };
  const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
  const max = Math.max(...data) * 1.2;
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
