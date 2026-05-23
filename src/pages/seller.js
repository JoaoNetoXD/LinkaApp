import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile } from '../main.js';
import { sellerAds, sellerCoupons, categories as mockCategories, currentUser, institution, sellerStats } from '../data/mock.js';
import { getSellerPayments, getPaymentStats, getMercadoPagoStatus, startMercadoPagoOAuth } from '../services/payment-service.js';
import { getSellerProducts, createProduct, renewProduct, updateSellerProduct, deleteSellerProduct } from '../services/product-service.js';
import { getSellerCoupons as fetchSellerCoupons, markCouponUsed } from '../services/coupon-service.js';
import { uploadMultipleImages, compressImage, createPreviewURL } from '../services/storage-service.js';
import { getInstitution } from '../services/institution-service.js';
import { getCategories } from '../services/category-service.js';

const USE_MOCKS = import.meta.env.DEV;
const guestUser = {
  id: null,
  name: 'Visitante',
  fullName: 'Visitante',
  email: '',
  whatsapp: '',
  avatar: 'LK',
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

// Helper to get the current user (real auth or mock)
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
    const name = globalSession.user.user_metadata?.full_name || globalSession.user.email?.split('@')[0] || 'Usuario';
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

let sellerView = 'dashboard'; // dashboard | create | edit | ads | coupons | payments
let paymentsFilter = 'all';
let activeTab = 'active';
let loadedAds = null;
let loadedCoupons = null;
let activeInstitution = institution;
let mpConnection = { connected: false, oauthConfigured: false };
let lastMpNotice = '';
let selectedAdId = null;
let loadedCategories = mockCategories;

function getSellerCategories(includeAll = true) {
  const rows = Array.isArray(loadedCategories) && loadedCategories.length ? loadedCategories : mockCategories;
  return includeAll ? rows : rows.filter((category) => category.id !== 'all');
}

function shouldUseSellerMocks() {
  return USE_MOCKS && !globalSession?.user?.id;
}

function getMercadoPagoNotice(mpResult, reason, isConnected = false) {
  if (mpResult === 'connected') {
    if (!isConnected) {
      return {
        message: 'A autorizacao voltou, mas a conta Mercado Pago ainda nao foi gravada. Tente conectar novamente e confira se a Redirect URI termina em /api/mercadopago/oauth/callback.',
        type: 'error',
      };
    }
    return { message: 'Mercado Pago conectado com sucesso.', type: 'success' };
  }

  const normalizedReason = String(reason || '').trim();
  const knownReasons = {
    missing_params: 'O Mercado Pago voltou sem os dados de autorizacao. Tente conectar novamente.',
    invalid_state: 'A tentativa de conexao expirou ou foi aberta em outra sessao. Tente novamente.',
    oauth_failed: 'Nao foi possivel concluir a conexao com o Mercado Pago.',
    invalid_grant: 'O codigo do Mercado Pago expirou. Inicie a conexao novamente.',
    invalid_redirect_uri: 'A Redirect URL do Mercado Pago nao bate com a URL configurada no Netlify.',
    missing_code_verifier: 'A tabela OAuth ainda nao tem a coluna de seguranca PKCE. Rode scripts/mercadopago-pkce-migration.sql no Supabase.',
  };

  if (knownReasons[normalizedReason]) {
    return { message: knownReasons[normalizedReason], type: 'error' };
  }

  if (normalizedReason) {
    return { message: `Mercado Pago nao conectou: ${normalizedReason}`, type: 'error' };
  }

  return { message: 'Nao foi possivel conectar o Mercado Pago.', type: 'error' };
}

function renderMercadoPagoRedirectState(url, redirectUri) {
  return `
    <div class="modal-backdrop" id="mp-modal">
      <div class="modal-content mp-connect-modal">
        <div class="modal-handle"></div>
        <div class="mp-connect-logo" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12c0 1.1.9 2 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4h-4z"/></svg>
        </div>
        <h3>Redirecionando para o Mercado Pago</h3>
        <p>Vamos abrir a autorizacao em uma pagina segura do Mercado Pago. Depois de aprovar, voce volta automaticamente para a Linka.</p>
        <a class="btn btn-mp btn-block btn-lg" id="manual-open-mp" href="${escapeHTML(url)}">Continuar no Mercado Pago</a>
        <p class="mp-connect-helper">Se a pagina nao abrir, use o botao acima. Redirect URL configurada: <code>${escapeHTML(redirectUri || '')}</code></p>
      </div>
    </div>
  `;
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
  activeInstitution = USE_MOCKS ? institution : { name: 'Linka', fullName: 'Linka', domain: '', primaryColor: '#2563eb' };
}

async function syncSellerCategories() {
  try {
    loadedCategories = await getCategories();
  } catch {
    loadedCategories = USE_MOCKS ? mockCategories : [{ id: 'all', name: 'Todos' }];
  }
}

export function renderSeller(container, subpage) {
  if (subpage === 'create') sellerView = 'create';
  else if (subpage === 'coupons') sellerView = 'coupons';
  else if (subpage === 'payments') sellerView = 'payments';
  else sellerView = 'dashboard';
  renderSellerPage(container);
}

async function renderSellerPage(container) {
  const user = getUser();
  await Promise.allSettled([
    syncInstitutionForUser(),
    syncSellerCategories(),
  ]);
  try {
    mpConnection = await getMercadoPagoStatus();
  } catch (err) {
    mpConnection = {
      connected: sessionStorage.getItem('mp_connected') === 'true',
      oauthConfigured: false,
      setupError: err.message || 'Nao foi possivel consultar Mercado Pago.',
    };
  }
  const isMPConnected = Boolean(mpConnection.connected);
  const mpParams = new URLSearchParams((window.location.hash.split('?')[1] || ''));
  const mpResult = mpParams.get('mp');
  const mpReason = mpParams.get('reason');
  const mpNoticeKey = `${mpResult || ''}:${mpReason || ''}`;
  if (mpResult && mpNoticeKey !== lastMpNotice) {
    lastMpNotice = mpNoticeKey;
    const notice = getMercadoPagoNotice(mpResult, mpReason, isMPConnected);
    showToast(notice.message, notice.type);
  }

  const useMocks = shouldUseSellerMocks();

  // Load ads from Supabase. Mock data is only allowed without a real session.
  try {
    loadedAds = await getSellerProducts(user.id);
    if (!loadedAds || loadedAds.length === 0) loadedAds = useMocks ? sellerAds : [];
  } catch { loadedAds = useMocks ? sellerAds : []; }

  // Load coupons
  try {
    loadedCoupons = await fetchSellerCoupons(user.id);
    if (!loadedCoupons || loadedCoupons.length === 0) loadedCoupons = useMocks ? sellerCoupons : [];
  } catch { loadedCoupons = useMocks ? sellerCoupons : []; }

  enrichAdsWithCouponStats();

  container.innerHTML = `
    <div class="page seller-page">
      <header class="app-header" style="justify-content:space-between; align-items:center; padding: 16px 24px;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <div class="user-avatar" style="width: 40px; height: 40px;">${escapeHTML(user.avatar || 'U')}</div>
          <div>
            <div style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);color:#fff;">${escapeHTML(user.fullName || user.name)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">${escapeHTML(activeInstitution.name)}</div>
          </div>
        </div>
        <div class="seller-header-actions">
          <button class="btn btn-secondary btn-sm" id="open-buyer-mode" style="padding: 6px 12px; font-size: 12px;">${icons.home} Comprar</button>
          ${isMPConnected ? `
            <div class="mp-status-icon" title="Mercado Pago Conectado">
              ${icons.checkCircle}
            </div>
          ` : `
            <button class="btn btn-mp btn-sm connect-mp-trigger" style="padding: 6px 12px; font-size: 12px;">${icons.wallet} Conectar</button>
          `}
        </div>
      </header>

      <div class="app-body" id="seller-content">
        ${sellerView === 'create' ? renderCreateForm() : sellerView === 'edit' ? renderEditProductForm() : sellerView === 'coupons' ? renderSellerCoupons() : sellerView === 'payments' ? await renderSellerPayments() : renderDashboard()}
      </div>
      <nav class="bottom-nav">
        <div class="bottom-nav-item ${sellerView === 'dashboard' ? 'active' : ''}" data-nav="dashboard" role="button" tabindex="0" style="cursor:pointer;">
          ${icons.home}<span>Dashboard</span>
          <div class="nav-indicator"></div>
        </div>
        <div class="bottom-nav-item ${sellerView === 'ads' ? 'active' : ''}" data-nav="ads" role="button" tabindex="0" style="cursor:pointer;">
          ${icons.package}<span>Anúncios</span>
          <div class="nav-indicator"></div>
        </div>
        <div class="bottom-nav-item ${sellerView === 'payments' ? 'active' : ''}" data-nav="payments" role="button" tabindex="0" style="cursor:pointer;">
          ${icons.wallet}<span>Vendas</span>
          <div class="nav-indicator"></div>
        </div>
        <div class="bottom-nav-item ${sellerView === 'coupons' ? 'active' : ''}" data-nav="coupons" role="button" tabindex="0" style="cursor:pointer;">
          ${icons.ticket}<span>Cupons</span>
          <div class="nav-indicator"></div>
        </div>
      </nav>
    </div>
  `;
  bindSellerEvents(container);
}

function renderDashboard() {
  const ads = loadedAds || (shouldUseSellerMocks() ? sellerAds : []);
  const coupons = loadedCoupons || (shouldUseSellerMocks() ? sellerCoupons : []);
  const statusCounts = {
    active: ads.filter(a => a.status === 'active').length,
    pending: ads.filter(a => a.status === 'pending').length,
    queue: ads.filter(a => a.status === 'queue').length,
    expired: ads.filter(a => a.status === 'expired').length,
    rejected: ads.filter(a => a.status === 'rejected').length,
  };
  if (activeTab === 'queue' && statusCounts.queue === 0) activeTab = statusCounts.pending > 0 ? 'pending' : 'active';

  // Compute real stats from loaded data
  const computedStats = {
    activeAds: statusCounts.active,
    couponsGenerated: ads.reduce((s, a) => s + (a.couponsGenerated || 0), 0) || coupons.length,
    couponsUsed: ads.reduce((s, a) => s + (a.couponsUsed || 0), 0) || coupons.filter(c => c.status === 'used').length,
    totalClicks: ads.reduce((s, a) => s + (a.clicks || 0), 0),
  };
  const convRate = computedStats.couponsGenerated > 0
    ? Math.round((computedStats.couponsUsed / computedStats.couponsGenerated) * 100) + '%'
    : '0%';
  const setupBlock = renderSellerOnboarding(ads, Boolean(mpConnection.connected));

  return `
    <div class="seller-stats-grid">
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.package}</div>
        <div class="stat-info">
          <div class="stat-value">${computedStats.activeAds}</div>
          <div class="stat-label">Anúncios</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.ticket}</div>
        <div class="stat-info">
          <div class="stat-value">${computedStats.couponsGenerated}</div>
          <div class="stat-label">Cupons</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.checkCircle}</div>
        <div class="stat-info">
          <div class="stat-value">${convRate}</div>
          <div class="stat-label">Conversão</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.eye}</div>
        <div class="stat-info">
          <div class="stat-value">${computedStats.totalClicks}</div>
          <div class="stat-label">Cliques</div>
        </div>
      </div>
    </div>

    ${setupBlock}

    <div class="seller-cta-inline">
      <button class="btn btn-primary create-ad-cta btn-block" style="display:flex; justify-content:center; align-items:center; gap:8px;">${icons.plus} Criar Novo Anúncio</button>
    </div>

    <!-- Ads by status -->
    <div class="seller-tabs-container" id="seller-ads-section">
      <div class="tabs">
        <button class="tab ${activeTab === 'active' ? 'active' : ''}" data-tab="active">Ativos <span class="tab-count">${statusCounts.active}</span></button>
        <button class="tab ${activeTab === 'pending' ? 'active' : ''}" data-tab="pending">Em aprovação <span class="tab-count">${statusCounts.pending}</span></button>
        ${statusCounts.queue > 0 ? `<button class="tab ${activeTab === 'queue' ? 'active' : ''}" data-tab="queue">Na fila <span class="tab-count">${statusCounts.queue}</span></button>` : ''}
        <button class="tab ${activeTab === 'expired' ? 'active' : ''}" data-tab="expired">Expirados <span class="tab-count">${statusCounts.expired}</span></button>
        <button class="tab ${activeTab === 'rejected' ? 'active' : ''}" data-tab="rejected">Recusados <span class="tab-count">${statusCounts.rejected}</span></button>
      </div>
    </div>

    <div class="seller-ads-list">
      ${renderAdsByStatus()}
    </div>

    <div class="performance-section">
      <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4);">Desempenho</h3>
      <div class="chart-container">
        <h4>Cupons gerados nos ultimos 7 dias</h4>
        <canvas id="seller-chart" height="200"></canvas>
      </div>
    </div>

    <div class="motivational-msg">
      "Cada cupom gerado mostra interesse real no seu produto."
    </div>
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

function renderSellerOnboarding(ads, isMPConnected) {
  const hasAds = ads.length > 0;
  const hasCurrentAds = ads.some((ad) => ad.status !== 'expired');
  const hasActive = ads.some((ad) => ad.status === 'active');
  const hasPending = ads.some((ad) => ad.status === 'pending' || ad.status === 'queue');

  if (isMPConnected && hasCurrentAds) {
    if (hasActive) return '';
    return `
      <section class="seller-setup-card">
        <div>
          <span class="seller-setup-kicker">Quase pronto</span>
          <h3>Seu produto ja foi criado</h3>
          <p>Agora falta a aprovacao para ele aparecer na vitrine dos compradores. Quando estiver ativo, o pagamento cai direto no seu Mercado Pago.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="seller-setup-card">
      <div>
        <span class="seller-setup-kicker">${hasCurrentAds ? 'Configuracao de venda' : 'Primeiro acesso de vendedor'}</span>
        <h3>${hasCurrentAds ? 'Conecte o Mercado Pago para receber' : 'Configure sua loja em dois passos'}</h3>
        <p>${hasPending
          ? 'Voce ja tem anuncio em analise. Conecte sua conta Mercado Pago para estar pronto quando ele for aprovado.'
          : hasAds
            ? 'Voce nao tem produto em venda agora. Cadastre uma nova oferta ou renove um produto expirado quando fizer sentido.'
            : 'Conecte o Mercado Pago, cadastre um produto e acompanhe a aprovacao por aqui.'}</p>
      </div>
      <div class="seller-setup-steps">
        <div class="${isMPConnected ? 'done' : ''}"><span>1</span> Mercado Pago ${isMPConnected ? 'conectado' : 'pendente'}</div>
        <div class="${hasCurrentAds ? 'done' : ''}"><span>2</span> Produto ${hasCurrentAds ? 'cadastrado' : 'nao cadastrado'}</div>
        <div class="${hasActive ? 'done' : ''}"><span>3</span> Vitrine ${hasActive ? 'ativa' : 'aguardando aprovacao'}</div>
      </div>
      <div class="seller-setup-actions">
        ${!isMPConnected ? `<button class="btn btn-mp connect-mp-trigger">${icons.wallet} Conectar Mercado Pago</button>` : ''}
        <button class="btn btn-primary new-ad-trigger">${icons.plus} ${hasCurrentAds ? 'Criar outro produto' : 'Cadastrar produto'}</button>
      </div>
    </section>
  `;
}

function renderAdsByStatus() {
  const ads = loadedAds || (shouldUseSellerMocks() ? sellerAds : []);
  const filtered = ads.filter(a => a.status === activeTab);
  if (ads.length === 0) {
    return `
      <div class="empty-state seller-first-empty">
        ${icons.package}
        <h3>Nenhum produto cadastrado</h3>
        <p>Cadastre uma oferta para ela entrar em aprovacao e aparecer na vitrine depois de liberada.</p>
        <button class="btn btn-primary new-ad-trigger">${icons.plus} Criar primeiro anuncio</button>
      </div>
    `;
  }
  if (filtered.length === 0) {
    const messages = {
      active: 'Nenhum anúncio ativo no momento.',
      pending: 'Nenhum anúncio aguardando aprovação.',
      queue: 'Nenhum anúncio na fila.',
      expired: 'Nenhum anúncio expirado.',
      rejected: 'Nenhum anúncio recusado.'
    };
    return `<div class="empty-state">${icons.package}<h3>${messages[activeTab]}</h3><p>Seu primeiro anúncio pode aparecer na vitrine da instituição.</p></div>`;
  }
  return filtered.map(ad => renderSellerAdCard(ad)).join('');
}

function renderSellerAdCard(ad) {
  const isAct = ad.status === 'active';
  const needsAdjustment = ad.status === 'rejected' && ad.rejectionReason?.startsWith('Ajuste solicitado:');
  const statusLabels = { active: 'Ativo', pending: 'Em aprovação', queue: 'Na fila', expired: 'Expirado', rejected: needsAdjustment ? 'Ajuste solicitado' : 'Recusado' };
  const statusBadge = { active: 'badge-success', pending: 'badge-warning', queue: 'badge-primary', expired: 'badge-neutral', rejected: needsAdjustment ? 'badge-warning' : 'badge-danger' };
  return `
    <div class="seller-ad-card glass-card">
      <div class="seller-ad-card-inner" data-open-ad-id="${ad.id}" role="button" tabindex="0" aria-label="Gerenciar anuncio ${escapeHTML(ad.title)}">
        <div class="seller-ad-thumb">${getProductImage(ad.images?.[0], 120, 120, ad.category)}</div>
        <div class="seller-ad-info">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <h4 class="ad-title">${escapeHTML(ad.title)}</h4>
            ${isAct ? '<div class="pulse-light"></div>' : ''}
          </div>
          <div class="ad-category">${escapeHTML(getSellerCategories().find(c => c.id === ad.category)?.name || ad.category)}</div>
          <div class="seller-ad-metrics">
            <span title="Cliques">${icons.eye} ${ad.clicks}</span>
            <span title="Gerados">${icons.ticket} ${ad.couponsGenerated}</span>
            <span title="Usados" class="highlight">${icons.checkCircle} ${ad.couponsUsed}</span>
          </div>
        </div>
      </div>
      <div class="seller-ad-status">
        <span class="badge ${statusBadge[ad.status]}">${statusLabels[ad.status]}</span>
        <div class="seller-ad-actions">
          <button class="btn btn-secondary btn-sm edit-ad-btn" type="button" data-ad-id="${ad.id}">${icons.fileText}<span>Editar</span></button>
          ${ad.status === 'expired' ? `<button class="btn btn-primary btn-sm renew-btn" type="button" data-ad-id="${ad.id}">${icons.refresh}<span>Renovar</span></button>` : ''}
          ${ad.status !== 'expired' ? `<button class="btn btn-danger btn-sm delete-ad-btn" type="button" data-ad-id="${ad.id}">${icons.x}<span>Excluir</span></button>` : ''}
        </div>
      </div>
      ${ad.status === 'rejected' && ad.rejectionReason ? `<div class="seller-ad-note">${escapeHTML(ad.rejectionReason)}</div>` : ''}
    </div>
  `;
}

function renderCreateForm() {
  return `
    <div style="padding:var(--space-4) var(--space-5) 0;">
      <button class="btn btn-ghost btn-sm" id="back-to-dashboard" style="margin-bottom:var(--space-3);">← Voltar</button>
      <h2 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Criar novo anúncio</h2>
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Preencha os dados do seu produto ou serviço.</p>
    </div>
    <form class="create-ad-form" id="create-ad-form">
      <div class="input-group">
        <label>Título do anúncio</label>
        <input type="text" class="input-field" placeholder="Ex: Brownie Artesanal" maxlength="60" id="ad-title">
        <div class="char-count"><span id="title-count">0</span>/60</div>
      </div>
      <div class="input-group">
        <label>Descrição</label>
        <textarea class="input-field" placeholder="Descreva seu produto..." maxlength="200" id="ad-desc"></textarea>
        <div class="char-count"><span id="desc-count">0</span>/200</div>
      </div>
      <div class="input-group">
        <label>Categoria</label>
        <select class="input-field" id="ad-category" style="padding-right:var(--space-8);">
          <option value="">Selecione...</option>
          ${getSellerCategories(false).map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="input-group">
          <label>Preço original (R$)</label>
          <input type="number" class="input-field" placeholder="0,00" id="ad-price" min="1" step="0.01">
        </div>
        <div class="input-group">
          <label>Desconto (%)</label>
          <input type="number" class="input-field" placeholder="10-50" id="ad-discount" min="10" max="50">
          <div class="input-hint">Mínimo 10%, máximo 50%</div>
        </div>
      </div>
      <div class="discount-preview" id="discount-preview" style="display:none;">
        <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">Preço final:</span>
        <span class="final-price" id="final-price">R$ 0,00</span>
      </div>
      <div class="input-group">
        <label>Fotos do produto (até 3)</label>
        <div class="photo-upload">
          ${renderPhotoSlot(1)}
          ${renderPhotoSlot(2)}
          ${renderPhotoSlot(3)}
        </div>
      </div>
      <div class="input-group">
        <label>WhatsApp para contato</label>
        <input type="tel" class="input-field" placeholder="(86) 99900-1122" id="ad-whatsapp" value="${escapeHTML(getUser().whatsapp || '')}">
      </div>

      <!-- Live Preview -->
      <div class="ad-preview-container">
        <div class="ad-preview-label">Preview do anúncio</div>
        <div id="ad-preview-card" class="product-card" style="pointer-events:none;">
          <div class="product-image" style="height:120px;">
            <div style="width:100%;height:100%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:var(--font-size-sm);">Imagem do produto</div>
          </div>
          <div class="product-body">
            <h3 class="product-title" id="preview-title" style="color:var(--text-tertiary);">Título do anúncio</h3>
            <div class="product-pricing">
              <span class="price-original" id="preview-original">R$ 0,00</span>
              <span class="price-discount" id="preview-discount">R$ 0,00</span>
            </div>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn-primary btn-block btn-lg">Enviar para aprovação</button>
    </form>
  `;
}

function getSelectedAd() {
  return (loadedAds || (shouldUseSellerMocks() ? sellerAds : [])).find(ad => String(ad.id) === String(selectedAdId)) || null;
}

function renderPhotoSlot(index, imageUrl = '') {
  const label = `Foto ${index}`;
  return `
    <label class="photo-upload-slot" id="photo-slot-${index}" data-label="${label}" data-existing-url="${escapeHTML(imageUrl || '')}">
      ${imageUrl ? `
        <img src="${escapeHTML(imageUrl)}" alt="${label}" />
        <button class="photo-remove-btn" type="button" data-slot-id="photo-slot-${index}" aria-label="Remover ${label}">×</button>
      ` : `${icons.upload}<span>${label}</span>`}
      <input type="file" accept="image/*" style="display:none" />
    </label>
  `;
}

function renderEditProductForm() {
  const ad = getSelectedAd();
  if (!ad) {
    return `
      <div class="empty-state" style="padding:var(--space-6);">
        ${icons.package}
        <h3>Anuncio nao encontrado</h3>
        <p>Volte para a lista e tente novamente.</p>
        <button class="btn btn-primary" id="back-to-dashboard">Voltar</button>
      </div>
    `;
  }

  const needsReview = ad.status === 'active';
  const needsAdjustment = ad.status === 'rejected' && ad.rejectionReason?.startsWith('Ajuste solicitado:');
  const statusLabels = { active: 'Ativo', pending: 'Em aprovação', queue: 'Na fila', expired: 'Expirado', rejected: needsAdjustment ? 'Ajuste solicitado' : 'Recusado' };
  const statusBadges = { active: 'badge-success', pending: 'badge-warning', queue: 'badge-primary', expired: 'badge-neutral', rejected: needsAdjustment ? 'badge-warning' : 'badge-danger' };
  return `
    <div style="padding:var(--space-4) var(--space-5) 0;">
      <button class="btn btn-ghost btn-sm" id="back-to-dashboard" style="margin-bottom:var(--space-3);">← Voltar</button>
      <div class="seller-edit-header">
        <div>
          <h2>Gerenciar anúncio</h2>
          <p>Edite dados reais do produto. Alterações voltam para aprovação antes de aparecerem na vitrine.</p>
        </div>
        <span class="badge ${statusBadges[ad.status] || 'badge-neutral'}">${escapeHTML(statusLabels[ad.status] || 'Indefinido')}</span>
      </div>
      ${needsReview ? `<div class="seller-edit-warning">${icons.alertTriangle} Ao salvar, este produto sai temporariamente da vitrine e volta para moderação.</div>` : ''}
    </div>
    <form class="create-ad-form" id="edit-ad-form" data-ad-id="${ad.id}">
      <div class="input-group">
        <label>Título do anúncio</label>
        <input type="text" class="input-field" maxlength="60" id="ad-title" value="${escapeHTML(ad.title || '')}">
        <div class="char-count"><span id="title-count">${String(ad.title || '').length}</span>/60</div>
      </div>
      <div class="input-group">
        <label>Descrição</label>
        <textarea class="input-field" maxlength="200" id="ad-desc">${escapeHTML(ad.description || '')}</textarea>
        <div class="char-count"><span id="desc-count">${String(ad.description || '').length}</span>/200</div>
      </div>
      <div class="input-group">
        <label>Categoria</label>
        <select class="input-field" id="ad-category" style="padding-right:var(--space-8);">
          ${getSellerCategories(false).map(c => `<option value="${c.id}" ${c.id === ad.category ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="input-group">
          <label>Preço original (R$)</label>
          <input type="number" class="input-field" id="ad-price" min="1" step="0.01" value="${Number(ad.originalPrice || 0).toFixed(2)}">
        </div>
        <div class="input-group">
          <label>Desconto (%)</label>
          <input type="number" class="input-field" id="ad-discount" min="10" max="50" value="${Number(ad.discount || 10)}">
          <div class="input-hint">Mínimo 10%, máximo 50%</div>
        </div>
      </div>
      <div class="discount-preview" id="discount-preview">
        <span style="font-size:var(--font-size-sm);color:var(--text-secondary);">Preço final:</span>
        <span class="final-price" id="final-price">${formatCurrency(ad.discountPrice || 0)}</span>
      </div>
      <div class="input-group">
        <label>Fotos do produto (até 3)</label>
        <div class="photo-upload">
          ${renderPhotoSlot(1, ad.images?.[0] || '')}
          ${renderPhotoSlot(2, ad.images?.[1] || '')}
          ${renderPhotoSlot(3, ad.images?.[2] || '')}
        </div>
      </div>
      <div class="input-group">
        <label>WhatsApp para contato</label>
        <input type="tel" class="input-field" id="ad-whatsapp" value="${escapeHTML(getUser().whatsapp || '')}">
      </div>

      <div class="seller-edit-metrics">
        <div><strong>${ad.clicks || 0}</strong><span>Cliques</span></div>
        <div><strong>${ad.couponsGenerated || 0}</strong><span>Cupons</span></div>
        <div><strong>${ad.couponsUsed || 0}</strong><span>Usados</span></div>
      </div>

      <button type="submit" class="btn btn-primary btn-block btn-lg">Salvar e enviar para aprovação</button>
      ${ad.status !== 'expired' ? `<button type="button" class="btn btn-danger btn-block delete-ad-btn" data-ad-id="${ad.id}">${icons.x} Excluir da vitrine</button>` : ''}
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
    whatsapp: container.querySelector('#ad-whatsapp')?.value.trim() || '',
  };
}

function validateProductForm(values) {
  if (!values.title || values.title.length < 3) return 'Informe um titulo claro para o produto.';
  if (!values.description || values.description.length < 10) return 'Descreva o produto com pelo menos 10 caracteres.';
  if (!values.categoryId) return 'Selecione uma categoria.';
  if (values.originalPrice <= 0) return 'Informe o preco original.';
  if (values.discount < 10 || values.discount > 50) return 'O desconto precisa ficar entre 10% e 50%.';
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
  return `
    <div style="padding:var(--space-4) var(--space-5);">
      <h2 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4);">Cupons Recebidos</h2>
    </div>
    <div class="seller-coupons-list" style="padding:0 var(--space-5);">
      ${(loadedCoupons || (shouldUseSellerMocks() ? sellerCoupons : [])).map(c => `
        <div class="coupon-item">
          <div class="coupon-item-header">
            <span class="coupon-item-code">${escapeHTML(c.code)}</span>
            <span class="badge ${c.status === 'active' || c.status === 'pending' ? 'badge-warning' : c.status === 'used' ? 'badge-success' : 'badge-neutral'}">
              ${c.status === 'active' ? 'Ativo' : c.status === 'pending' ? 'Pendente' : c.status === 'used' ? 'Usado' : 'Expirado'}
            </span>
          </div>
          <div class="coupon-item-product">${escapeHTML(c.product)}</div>
          <div class="coupon-item-meta">Comprador: ${escapeHTML(c.buyer)} · ${escapeHTML(c.createdAt)}</div>
          ${c.status === 'active' || c.status === 'pending' ? `
            <button class="btn btn-success btn-sm btn-block mark-used-btn" data-code="${escapeHTML(c.code)}" style="margin-top:var(--space-3);">
              ${icons.check} Marcar como usado
            </button>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

async function renderSellerPayments() {
  const user = getUser();
  let stats = {
    totalReceived: 0,
    totalGross: 0,
    totalFees: 0,
    totalPayments: 0,
    paidCount: 0,
    pendingCount: 0,
    commissionRate: 0,
    conversionRate: 0,
  };
  let allPayments = [];
  try {
    stats = await getPaymentStats(user.id || currentUser.id);
    allPayments = await getSellerPayments(user.id || currentUser.id);
  } catch (err) {
    console.warn('renderSellerPayments failed:', err.message);
    if (shouldUseSellerMocks()) {
      stats = {
        totalReceived: sellerStats.activeAds,
        totalGross: sellerStats.couponsGenerated,
        totalFees: 0,
        totalPayments: sellerStats.couponsGenerated,
        paidCount: sellerStats.couponsUsed,
        pendingCount: 0,
        commissionRate: 0,
        conversionRate: 66,
      };
    }
    allPayments = [];
  }
  const filtered = paymentsFilter === 'all' ? allPayments : allPayments.filter(p => p.status === paymentsFilter);
  const statusLabels = { paid: 'Pago', pending: 'Pendente', expired: 'Expirado' };
  const statusBadges = { paid: 'badge-success', pending: 'badge-warning', expired: 'badge-neutral' };
  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  };
  return `
    <div style="padding:var(--space-4) var(--space-5) var(--space-2);">
      <h2 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-1);">Minhas Vendas</h2>
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Acompanhe pagamentos Pix e cartao recebidos pelo Mercado Pago.</p>
    </div>
    <div class="payments-stats-grid">
      <div class="payment-stat-card revenue">
        <div class="payment-stat-label">Recebido (líquido)</div>
        <div class="payment-stat-value revenue-value">${formatCurrency(stats.totalReceived)}</div>
      </div>
      <div class="payment-stat-card confirmed">
        <div class="payment-stat-label">Confirmados</div>
        <div class="payment-stat-value success-value">${stats.paidCount}</div>
      </div>
      <div class="payment-stat-card pending-stat">
        <div class="payment-stat-label">Pendentes</div>
        <div class="payment-stat-value">${stats.pendingCount}</div>
      </div>
      <div class="payment-stat-card conversion">
        <div class="payment-stat-label">Conversão</div>
        <div class="payment-stat-value">${stats.conversionRate}%</div>
      </div>
    </div>

    <!-- Commission info -->
    <div class="commission-info-bar">
      <div class="commission-info-inner">
        <span class="commission-label">Comissão Linka: <strong>0%</strong></span>
        <span class="commission-detail">O vendedor recebe 100% do valor no Mercado Pago · Total bruto: ${formatCurrency(stats.totalGross)}</span>
      </div>
    </div>

    <div class="payments-filter">
      <button class="chip ${paymentsFilter === 'all' ? 'active' : ''}" data-pfilter="all">Todos</button>
      <button class="chip ${paymentsFilter === 'paid' ? 'active' : ''}" data-pfilter="paid">Pagos</button>
      <button class="chip ${paymentsFilter === 'pending' ? 'active' : ''}" data-pfilter="pending">Pendentes</button>
      <button class="chip ${paymentsFilter === 'expired' ? 'active' : ''}" data-pfilter="expired">Expirados</button>
    </div>
    <div class="payment-list-container">
      ${filtered.length > 0 ? filtered.map(p => `
        <div class="payment-list-item">
          <div class="payment-list-item-header">
            <div class="payment-list-buyer">
              <div class="avatar-sm avatar">${escapeHTML((p.buyerName || 'U').split(' ').map(n => n[0]).join('').slice(0,2))}</div>
              <div>
                <div class="payment-list-buyer-name">${escapeHTML(p.buyerName || 'Comprador')}</div>
                <div class="payment-list-buyer-date">${formatDate(p.createdAt)}</div>
              </div>
            </div>
            <span class="badge ${statusBadges[p.status] || 'badge-neutral'}">${statusLabels[p.status] || p.status}</span>
          </div>
          <div class="payment-list-item-body">
            <div>
              <div class="payment-list-product">${escapeHTML(p.productTitle)}</div>
              <div class="payment-list-coupon">Cupom: ${escapeHTML(p.couponCode || '')}</div>
              ${p.status === 'paid' ? `<div class="confirmed-indicator">${icons.checkCircle} Pagamento confirmado</div>` : ''}
            </div>
            <div>
              <div class="payment-list-amount ${p.status === 'paid' ? 'paid-amount' : ''}">${formatCurrency(p.sellerAmount || p.amount)}</div>
              ${p.platformFee ? `<div style="font-size:var(--font-size-xs);color:var(--text-tertiary);text-align:right;">-${formatCurrency(p.platformFee)} taxa</div>` : ''}
            </div>
          </div>
        </div>
      `).join('') : `
        <div class="empty-payments">
          <div class="empty-payments-icon">${icons.wallet}</div>
          <h3>Nenhum pagamento encontrado</h3>
          <p>Seus pagamentos via Pix e cartão aparecerão aqui.</p>
        </div>
      `}
    </div>
  `;
}

function bindSellerEvents(container) {
  // New ad button
  container.querySelector('#new-ad-btn')?.addEventListener('click', () => { selectedAdId = null; sellerView = 'create'; renderSellerPage(container); });
  container.querySelector('.create-ad-cta')?.addEventListener('click', () => { selectedAdId = null; sellerView = 'create'; renderSellerPage(container); });
  container.querySelectorAll('.new-ad-trigger').forEach((btn) => {
    btn.addEventListener('click', () => { selectedAdId = null; sellerView = 'create'; renderSellerPage(container); });
  });
  container.querySelector('#back-to-dashboard')?.addEventListener('click', () => { selectedAdId = null; sellerView = 'dashboard'; renderSellerPage(container); });
  container.querySelector('#open-buyer-mode')?.addEventListener('click', () => {
    window.location.hash = '#/buyer';
  });

  const openProductManager = (adId) => {
    selectedAdId = adId;
    sellerView = 'edit';
    renderSellerPage(container);
  };

  container.querySelectorAll('[data-open-ad-id]').forEach(card => {
    card.addEventListener('click', (event) => {
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

  // Mercado Pago connect button
  container.querySelectorAll('.connect-mp-trigger').forEach((trigger) => trigger.addEventListener('click', () => {
    const modalRoot = document.getElementById('modal-root');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="mp-modal">
        <div class="modal-content mp-connect-modal">
          <div class="modal-handle"></div>
          <div class="mp-connect-logo" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12c0 1.1.9 2 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4h-4z"/></svg>
          </div>
          <h3>Conectar Mercado Pago</h3>
          <p>Ao conectar sua conta, voce recebe pagamentos diretamente no seu Mercado Pago. A Linka cobra <strong>0% de comissao</strong>; 100% do valor do pedido vai para o vendedor.</p>
          ${mpConnection.setupError || mpConnection.oauthConfigured === false ? `
            <div class="mp-connect-warning">${icons.alertTriangle} ${escapeHTML(mpConnection.setupError || 'A integracao OAuth ainda nao foi carregada neste ambiente. Verifique as variaveis do Netlify se o botao falhar.')}</div>
          ` : ''}
          <button class="btn btn-mp btn-block btn-lg" id="do-connect-mp" style="margin-bottom:var(--space-3);">Conectar minha conta</button>
          <button class="btn btn-secondary btn-block" id="cancel-mp">Agora não</button>
        </div>
      </div>
    `;
    modalRoot.querySelector('#mp-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
    modalRoot.querySelector('#cancel-mp').addEventListener('click', () => modalRoot.innerHTML = '');
    modalRoot.querySelector('#do-connect-mp').addEventListener('click', async () => {
      const btn = modalRoot.querySelector('#do-connect-mp');
      btn.disabled = true;
      btn.textContent = 'Abrindo Mercado Pago...';
      try {
        const url = await startMercadoPagoOAuth();
        sessionStorage.setItem('mp_oauth_started_at', String(Date.now()));
        modalRoot.innerHTML = renderMercadoPagoRedirectState(url, mpConnection.redirectUri);
        modalRoot.querySelector('#manual-open-mp')?.addEventListener('click', () => {
          sessionStorage.setItem('mp_oauth_manual_open', 'true');
        });
        setTimeout(() => {
          window.location.assign(url);
        }, 700);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Conectar minha conta';
        showToast(err.message || 'Nao foi possivel iniciar a conexao.', 'error');
      }
    });
  }));

  // Tabs
  container.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => { activeTab = tab.dataset.tab; renderSellerPage(container); });
  });

  // Payment filter chips
  container.querySelectorAll('[data-pfilter]').forEach(chip => {
    chip.addEventListener('click', () => { paymentsFilter = chip.dataset.pfilter; renderSellerPage(container); });
  });

  // Form character counters
  const titleInput = container.querySelector('#ad-title');
  const descInput = container.querySelector('#ad-desc');
  const priceInput = container.querySelector('#ad-price');
  const discountInput = container.querySelector('#ad-discount');
  const selectedPhotoFiles = new Map();

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      container.querySelector('#title-count').textContent = titleInput.value.length;
      const previewTitle = container.querySelector('#preview-title');
      if (previewTitle) {
        previewTitle.textContent = titleInput.value || 'Título do anúncio';
        previewTitle.style.color = titleInput.value ? 'var(--text-primary)' : 'var(--text-tertiary)';
      }
    });
  }
  if (descInput) {
    descInput.addEventListener('input', () => {
      container.querySelector('#desc-count').textContent = descInput.value.length;
    });
  }

  const updatePrice = () => {
    if (!priceInput || !discountInput) return;
    const price = parseFloat(priceInput.value) || 0;
    const disc = parseInt(discountInput.value) || 0;
    const preview = container.querySelector('#discount-preview');
    const finalEl = container.querySelector('#final-price');
    const previewOriginal = container.querySelector('#preview-original');
    const previewDiscount = container.querySelector('#preview-discount');

    if (price > 0 && disc >= 10 && disc <= 50) {
      const final = price * (1 - disc / 100);
      if (preview) preview.style.display = 'flex';
      if (finalEl) finalEl.textContent = formatCurrency(final);
      if (previewOriginal) previewOriginal.textContent = formatCurrency(price);
      if (previewDiscount) previewDiscount.textContent = formatCurrency(final);
    } else {
      if (preview) preview.style.display = 'none';
    }

    // Alert for discount out of range
    if (discountInput.value && (disc < 10 || disc > 50)) {
      discountInput.classList.add('error');
    } else {
      discountInput.classList.remove('error');
    }
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
    slot.style.border = '';
    slot.innerHTML = `${icons.upload}<span>${escapeHTML(label)}</span><input type="file" accept="image/*" style="display:none" />`;
    bindPhotoInput(slot);
  };

  const handlePhotoChange = (event) => {
    const input = event.target;
    const slot = input.closest('.photo-upload-slot');
    if (!slot || !input.files?.length) return;

    const file = input.files[0];
    selectedPhotoFiles.set(slot.id, file);
    const url = createPreviewURL(file);
    slot.dataset.existingUrl = '';
    slot.innerHTML = `<img src="${url}" alt="${escapeHTML(slot.dataset.label || 'Foto')}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" /><button class="photo-remove-btn" type="button" data-slot-id="${slot.id}" aria-label="Remover foto">×</button><input type="file" accept="image/*" style="display:none" />`;
    slot.style.border = '2px solid var(--primary-500)';
    bindPhotoInput(slot);
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

  // Form submit — real Supabase creation
  container.querySelector('#create-ad-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readProductFormValues(container);
    const validationError = validateProductForm(values);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.textContent;
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    try {
      const imageUrls = await collectProductImageUrls(container, selectedPhotoFiles);

      if (selectedPhotoFiles.size > 0 && imageUrls.length === 0) {
        throw new Error('Falha ao enviar as imagens.');
      }

      const user = getUser();
      const result = await createProduct({
        sellerId: globalSession?.user?.id || user.id,
        title: values.title,
        description: values.description,
        categoryId: values.categoryId,
        originalPrice: values.originalPrice,
        discount: values.discount,
        images: imageUrls,
        whatsapp: values.whatsapp,
      });

      if (result.success) {
        showToast('Anúncio enviado para aprovação!', 'success');
        sellerView = 'dashboard';
        activeTab = 'pending';
        renderSellerPage(container);
      } else {
        showToast(result.error || 'Erro ao criar anúncio. Tente novamente.', 'error');
        btn.textContent = origText;
        btn.disabled = false;
      }
    } catch (err) {
      console.error('Create ad error:', err);
      showToast(err.message || 'Erro ao criar anúncio. Tente novamente.', 'error');
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
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
      const imageUrls = await collectProductImageUrls(container, selectedPhotoFiles);
      const result = await updateSellerProduct(adId, {
        ...values,
        images: imageUrls,
      });

      if (result.success) {
        showToast('Anuncio atualizado e enviado para aprovacao.', 'success');
        selectedAdId = null;
        sellerView = 'dashboard';
        activeTab = 'pending';
        renderSellerPage(container);
      } else {
        showToast(result.error || 'Nao foi possivel salvar o produto.', 'error');
        btn.textContent = origText;
        btn.disabled = false;
      }
    } catch (err) {
      showToast(err.message || 'Nao foi possivel salvar o produto.', 'error');
      btn.textContent = origText;
      btn.disabled = false;
    }
  });

  // Mark coupon as used
  container.querySelectorAll('.mark-used-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const modalRoot = document.getElementById('modal-root');
      modalRoot.innerHTML = `
        <div class="modal-backdrop" id="confirm-modal">
          <div class="modal-content" style="text-align:center;">
            <div class="modal-handle"></div>
            <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-3);">Confirmar uso do cupom?</h3>
            <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-5);">Confirmar que o cupom <strong>${escapeHTML(code)}</strong> foi utilizado?</p>
            <div style="display:flex;gap:var(--space-3);">
              <button class="btn btn-secondary" style="flex:1;" id="cancel-confirm">Cancelar</button>
              <button class="btn btn-success" style="flex:1;" id="do-confirm">Confirmar uso</button>
            </div>
          </div>
        </div>
      `;
      modalRoot.querySelector('#confirm-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
      modalRoot.querySelector('#cancel-confirm').addEventListener('click', () => modalRoot.innerHTML = '');
      modalRoot.querySelector('#do-confirm').addEventListener('click', async () => {
        const coupon = (loadedCoupons || (shouldUseSellerMocks() ? sellerCoupons : [])).find(c => c.code === code);
        if (!coupon?.id) {
          showToast('Cupom não encontrado.', 'error');
          return;
        }
        const result = await markCouponUsed(coupon.id);
        if (result?.success) {
          modalRoot.innerHTML = '';
          showToast(`Cupom ${code} marcado como usado!`, 'success');
          renderSellerPage(container);
        } else {
          showToast(result?.error || 'Não foi possível atualizar o cupom.', 'error');
        }
      });
    });
  });

  // Renew buttons (using data-ad-id)
  container.querySelectorAll('.renew-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const adId = btn.dataset.adId;
      if (adId) {
        btn.textContent = 'Renovando...';
        btn.disabled = true;
        const result = await renewProduct(adId);
        if (result?.success) {
          showToast('Anúncio renovado e enviado para aprovação!', 'success');
          renderSellerPage(container);
        } else {
          showToast(result?.error || 'Não foi possível renovar o anúncio.', 'error');
          btn.textContent = 'Renovar';
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

  // Bottom nav — event delegation on <nav> for reliable click detection
  const sellerNav = container.querySelector('.bottom-nav');
  if (sellerNav) {
    sellerNav.addEventListener('click', (e) => {
      const item = e.target.closest('[data-nav]');
      if (!item) return;
      const nav = item.dataset.nav;
      if (nav === 'dashboard') {
        sellerView = 'dashboard'; activeTab = 'active'; renderSellerPage(container);
      } else if (nav === 'ads') {
        if (sellerView === 'dashboard') {
          const adsSection = container.querySelector('#seller-ads-section');
          if (adsSection) adsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          sellerView = 'dashboard'; activeTab = 'active';
          renderSellerPage(container);
          setTimeout(() => {
            const adsSection = container.querySelector('#seller-ads-section');
            if (adsSection) adsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 200);
        }
      } else if (nav === 'coupons') {
        sellerView = 'coupons'; renderSellerPage(container);
      } else if (nav === 'payments') {
        sellerView = 'payments'; paymentsFilter = 'all'; renderSellerPage(container);
      }
    });
  }
}

function showDeleteProductModal(adId, container) {
  const ad = (loadedAds || (shouldUseSellerMocks() ? sellerAds : [])).find(item => String(item.id) === String(adId));
  if (!ad) {
    showToast('Produto nao encontrado.', 'error');
    return;
  }

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="delete-product-modal">
      <div class="modal-content">
        <div class="modal-handle"></div>
        <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Excluir da vitrine?</h3>
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:var(--space-4);">
          O produto <strong>${escapeHTML(ad.title)}</strong> deixara de aparecer para compradores. Pagamentos, cupons e historico financeiro serao preservados.
        </p>
        <div style="display:flex;gap:var(--space-3);">
          <button class="btn btn-secondary" style="flex:1;" id="cancel-delete-product">Cancelar</button>
          <button class="btn btn-danger" style="flex:1;" id="confirm-delete-product">Excluir</button>
        </div>
      </div>
    </div>
  `;

  modalRoot.querySelector('#delete-product-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) modalRoot.innerHTML = '';
  });
  modalRoot.querySelector('#cancel-delete-product')?.addEventListener('click', () => {
    modalRoot.innerHTML = '';
  });
  modalRoot.querySelector('#confirm-delete-product')?.addEventListener('click', async () => {
    const confirmBtn = modalRoot.querySelector('#confirm-delete-product');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Excluindo...';
    const result = await deleteSellerProduct(adId);
    if (result?.success) {
      modalRoot.innerHTML = '';
      showToast('Produto removido da vitrine.', 'success');
      selectedAdId = null;
      sellerView = 'dashboard';
      activeTab = 'expired';
      renderSellerPage(container);
    } else {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Excluir';
      showToast(result?.error || 'Nao foi possivel remover o produto.', 'error');
    }
  });
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
  const maxVal = Math.max(1, ...data) + 1;

  // Y-axis labels and grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px Plus Jakarta Sans, sans-serif';
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

  // Line
  ctx.strokeStyle = '#00F0A0';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(splinePath);

  // Gradient fill
  const fillPath = new Path2D(splinePath);
  fillPath.lineTo(points[points.length - 1].x, h - padding.bottom);
  fillPath.lineTo(points[0].x, h - padding.bottom);
  fillPath.closePath();
  
  const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
  gradient.addColorStop(0, 'rgba(0, 240, 160, 0.25)');
  gradient.addColorStop(1, 'rgba(0, 240, 160, 0)');
  ctx.fillStyle = gradient;
  ctx.fill(fillPath);

  // Dots
  points.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00F0A0';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0B0B0B';
    ctx.fill();
  });

  // X-axis Labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((label, i) => {
    const x = padding.left + (chartW / (data.length - 1)) * i;
    ctx.fillText(label, x, h - 10);
  });
}

