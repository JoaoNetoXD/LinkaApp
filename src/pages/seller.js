import { icons, showToast, getProductImage, formatCurrency, escapeHTML, globalSession, globalProfile } from '../main.js';
import { sellerAds, sellerCoupons, categories, currentUser, institution, sellerStats } from '../data/mock.js';
import { getSellerPayments, getPaymentStats, getMercadoPagoStatus, startMercadoPagoOAuth } from '../services/payment-service.js';
import { getSellerProducts, createProduct, renewProduct } from '../services/product-service.js';
import { getSellerCoupons as fetchSellerCoupons, markCouponUsed } from '../services/coupon-service.js';
import { uploadMultipleImages, compressImage, createPreviewURL } from '../services/storage-service.js';
import { getInstitution } from '../services/institution-service.js';

const USE_MOCKS = import.meta.env.DEV;

// Helper to get the current user (real auth or mock)
function getUser() {
  if (globalProfile) return { ...currentUser, ...globalProfile, fullName: globalProfile.name, avatar: globalProfile.name?.split(' ').map(n=>n[0]).join('').slice(0,2) || 'U' };
  return currentUser;
}

let sellerView = 'dashboard'; // dashboard | create | ads | coupons | payments
let paymentsFilter = 'all';
let activeTab = 'active';
let loadedAds = null;
let loadedCoupons = null;
let activeInstitution = institution;
let mpConnection = { connected: false, oauthConfigured: false };
let lastMpNotice = '';

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

export function renderSeller(container, subpage) {
  if (subpage === 'create') sellerView = 'create';
  else if (subpage === 'coupons') sellerView = 'coupons';
  else if (subpage === 'payments') sellerView = 'payments';
  else sellerView = 'dashboard';
  renderSellerPage(container);
}

async function renderSellerPage(container) {
  const user = getUser();
  await syncInstitutionForUser();
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

  // Load ads from Supabase (or fallback to mock)
  try {
    loadedAds = await getSellerProducts(user.id);
    if (!loadedAds || loadedAds.length === 0) loadedAds = USE_MOCKS ? sellerAds : [];
  } catch { loadedAds = USE_MOCKS ? sellerAds : []; }

  // Load coupons
  try {
    loadedCoupons = await fetchSellerCoupons(user.id);
    if (!loadedCoupons || loadedCoupons.length === 0) loadedCoupons = USE_MOCKS ? sellerCoupons : [];
  } catch { loadedCoupons = USE_MOCKS ? sellerCoupons : []; }

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
        ${sellerView === 'create' ? renderCreateForm() : sellerView === 'coupons' ? renderSellerCoupons() : sellerView === 'payments' ? await renderSellerPayments() : renderDashboard()}
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
  const ads = loadedAds || (USE_MOCKS ? sellerAds : []);
  const coupons = loadedCoupons || (USE_MOCKS ? sellerCoupons : []);
  const statusCounts = {
    active: ads.filter(a => a.status === 'active').length,
    pending: ads.filter(a => a.status === 'pending').length,
    queue: ads.filter(a => a.status === 'queue').length,
    expired: ads.filter(a => a.status === 'expired').length,
    rejected: ads.filter(a => a.status === 'rejected').length,
  };

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
        <button class="tab ${activeTab === 'queue' ? 'active' : ''}" data-tab="queue">Na fila <span class="tab-count">${statusCounts.queue}</span></button>
        <button class="tab ${activeTab === 'expired' ? 'active' : ''}" data-tab="expired">Expirados <span class="tab-count">${statusCounts.expired}</span></button>
        <button class="tab ${activeTab === 'rejected' ? 'active' : ''}" data-tab="rejected">Recusados <span class="tab-count">${statusCounts.rejected}</span></button>
      </div>
    </div>

    <div class="seller-ads-list">
      ${renderAdsByStatus()}
    </div>

    <!-- Performance charts placeholder -->
    <div class="performance-section">
      <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4);">📊 Desempenho</h3>
      <div class="chart-container">
        <h4>Cupons por dia (últimos 7 dias)</h4>
        <canvas id="seller-chart" height="200"></canvas>
      </div>
    </div>

    <div class="motivational-msg">
      💡 "Cada cupom gerado mostra interesse real no seu produto."
    </div>
  `;
}

function renderSellerOnboarding(ads, isMPConnected) {
  const hasAds = ads.length > 0;
  const hasActive = ads.some((ad) => ad.status === 'active');
  const hasPending = ads.some((ad) => ad.status === 'pending' || ad.status === 'queue');

  if (isMPConnected && hasAds) {
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
        <span class="seller-setup-kicker">${hasAds ? 'Configuracao de venda' : 'Primeiro acesso de vendedor'}</span>
        <h3>${hasAds ? 'Conecte o Mercado Pago para receber' : 'Configure sua loja em dois passos'}</h3>
        <p>${hasPending
          ? 'Voce ja tem anuncio em analise. Conecte sua conta Mercado Pago para estar pronto quando ele for aprovado.'
          : 'Conecte o Mercado Pago, cadastre um produto e acompanhe a aprovacao por aqui.'}</p>
      </div>
      <div class="seller-setup-steps">
        <div class="${isMPConnected ? 'done' : ''}"><span>1</span> Mercado Pago ${isMPConnected ? 'conectado' : 'pendente'}</div>
        <div class="${hasAds ? 'done' : ''}"><span>2</span> Produto ${hasAds ? 'cadastrado' : 'nao cadastrado'}</div>
        <div class="${hasActive ? 'done' : ''}"><span>3</span> Vitrine ${hasActive ? 'ativa' : 'aguardando aprovacao'}</div>
      </div>
      <div class="seller-setup-actions">
        ${!isMPConnected ? `<button class="btn btn-mp connect-mp-trigger">${icons.wallet} Conectar Mercado Pago</button>` : ''}
        <button class="btn btn-primary new-ad-trigger">${icons.plus} ${hasAds ? 'Criar outro produto' : 'Cadastrar primeiro produto'}</button>
      </div>
    </section>
  `;
}

function renderAdsByStatus() {
  const ads = loadedAds || (USE_MOCKS ? sellerAds : []);
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
      <div class="seller-ad-card-inner">
        <div class="seller-ad-thumb">${getProductImage(ad.images?.[0], 120, 120, ad.category)}</div>
        <div class="seller-ad-info">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <h4 class="ad-title">${escapeHTML(ad.title)}</h4>
            ${isAct ? '<div class="pulse-light"></div>' : ''}
          </div>
          <div class="ad-category">${escapeHTML(categories.find(c => c.id === ad.category)?.name || ad.category)}</div>
          <div class="seller-ad-metrics">
            <span title="Cliques">${icons.eye} ${ad.clicks}</span>
            <span title="Gerados">${icons.ticket} ${ad.couponsGenerated}</span>
            <span title="Usados" class="highlight">${icons.checkCircle} ${ad.couponsUsed}</span>
          </div>
        </div>
      </div>
      ${!isAct || ad.status === 'expired' ? `
      <div class="seller-ad-status">
        <span class="badge ${statusBadge[ad.status]}">${statusLabels[ad.status]}</span>
        ${ad.status === 'expired' ? `<button class="btn btn-primary btn-sm renew-btn" data-ad-id="${ad.id}">Renovar</button>` : ''}
        ${ad.status === 'rejected' && ad.rejectionReason ? `<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);">${escapeHTML(ad.rejectionReason)}</span>` : ''}
      </div>` : ''}
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
          ${categories.filter(c => c.id !== 'all').map(c => `<option value="${c.id}">${c.icon} ${escapeHTML(c.name)}</option>`).join('')}
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
          <label class="photo-upload-slot" id="photo-slot-1">${icons.upload}<span>Foto 1</span><input type="file" accept="image/*" style="display:none" /></label>
          <label class="photo-upload-slot" id="photo-slot-2">${icons.upload}<span>Foto 2</span><input type="file" accept="image/*" style="display:none" /></label>
          <label class="photo-upload-slot" id="photo-slot-3">${icons.upload}<span>Foto 3</span><input type="file" accept="image/*" style="display:none" /></label>
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

function renderSellerCoupons() {
  return `
    <div style="padding:var(--space-4) var(--space-5);">
      <h2 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4);">Cupons Recebidos</h2>
    </div>
    <div class="seller-coupons-list" style="padding:0 var(--space-5);">
      ${(loadedCoupons || (USE_MOCKS ? sellerCoupons : [])).map(c => `
        <div class="coupon-item">
          <div class="coupon-item-header">
            <span class="coupon-item-code">${escapeHTML(c.code)}</span>
            <span class="badge ${c.status === 'pending' ? 'badge-warning' : c.status === 'used' ? 'badge-success' : 'badge-neutral'}">
              ${c.status === 'pending' ? 'Pendente' : c.status === 'used' ? 'Usado' : 'Expirado'}
            </span>
          </div>
          <div class="coupon-item-product">${escapeHTML(c.product)}</div>
          <div class="coupon-item-meta">Comprador: ${escapeHTML(c.buyer)} · ${escapeHTML(c.createdAt)}</div>
          ${c.status === 'pending' ? `
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
    if (import.meta.env.DEV) {
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
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Acompanhe os pagamentos Pix recebidos.</p>
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
      <button class="chip ${paymentsFilter === 'paid' ? 'active' : ''}" data-pfilter="paid">✅ Pagos</button>
      <button class="chip ${paymentsFilter === 'pending' ? 'active' : ''}" data-pfilter="pending">⏳ Pendentes</button>
      <button class="chip ${paymentsFilter === 'expired' ? 'active' : ''}" data-pfilter="expired">⏰ Expirados</button>
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
          <div class="empty-payments-icon">💰</div>
          <h3>Nenhum pagamento encontrado</h3>
          <p>Seus pagamentos via Pix aparecerão aqui.</p>
        </div>
      `}
    </div>
  `;
}

function bindSellerEvents(container) {
  // New ad button
  container.querySelector('#new-ad-btn')?.addEventListener('click', () => { sellerView = 'create'; renderSellerPage(container); });
  container.querySelector('.create-ad-cta')?.addEventListener('click', () => { sellerView = 'create'; renderSellerPage(container); });
  container.querySelectorAll('.new-ad-trigger').forEach((btn) => {
    btn.addEventListener('click', () => { sellerView = 'create'; renderSellerPage(container); });
  });
  container.querySelector('#back-to-dashboard')?.addEventListener('click', () => { sellerView = 'dashboard'; renderSellerPage(container); });
  container.querySelector('#open-buyer-mode')?.addEventListener('click', () => {
    window.location.hash = '#/buyer';
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
  const handlePhotoChange = (event) => {
    const input = event.target;
    const slot = input.closest('.photo-upload-slot');
    if (!slot || !input.files?.length) return;

    const file = input.files[0];
    selectedPhotoFiles.set(slot.id, file);
    const url = createPreviewURL(file);
    slot.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" /><input type="file" accept="image/*" style="display:none" />`;
    slot.style.border = '2px solid var(--primary-500)';
    slot.querySelector('input')?.addEventListener('change', handlePhotoChange);
  };

  container.querySelectorAll('.photo-upload-slot input[type="file"]').forEach(input => {
    input.addEventListener('change', handlePhotoChange);
  });

  // Form submit — real Supabase creation
  container.querySelector('#create-ad-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = container.querySelector('#ad-title')?.value.trim() || '';
    const description = container.querySelector('#ad-desc')?.value.trim() || '';
    const categoryId = container.querySelector('#ad-category')?.value || '';
    const originalPrice = parseFloat(container.querySelector('#ad-price')?.value) || 0;
    const discount = parseInt(container.querySelector('#ad-discount')?.value) || 0;
    const whatsapp = container.querySelector('#ad-whatsapp')?.value.trim() || '';

    if (!title || title.length < 3) {
      showToast('Informe um titulo claro para o produto.', 'error');
      return;
    }
    if (!description || description.length < 10) {
      showToast('Descreva o produto com pelo menos 10 caracteres.', 'error');
      return;
    }
    if (!categoryId) {
      showToast('Selecione uma categoria.', 'error');
      return;
    }
    if (originalPrice <= 0) {
      showToast('Informe o preco original.', 'error');
      return;
    }
    if (discount < 10 || discount > 50) {
      showToast('O desconto precisa ficar entre 10% e 50%.', 'error');
      return;
    }
    if (!whatsapp) {
      showToast('Informe o WhatsApp para contato.', 'error');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const origText = btn.textContent;
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    try {
      // Collect uploaded image URLs
      const imageUrls = [];
      for (const file of selectedPhotoFiles.values()) {
        const compressed = await compressImage(file);
        const { urls } = await uploadMultipleImages([compressed], getUser().id || currentUser.id);
        imageUrls.push(...urls);
      }

      if (selectedPhotoFiles.size > 0 && imageUrls.length === 0) {
        throw new Error('Falha ao enviar as imagens.');
      }

      const user = getUser();
      const result = await createProduct({
        sellerId: globalSession?.user?.id || user.id,
        title,
        description,
        categoryId,
        originalPrice,
        discount,
        images: imageUrls,
        whatsapp,
      });

      if (result.success) {
        showToast('Anúncio enviado para aprovação!', 'success');
        sellerView = 'dashboard';
        activeTab = 'pending';
        renderSellerPage(container);
      } else {
        showToast('Erro ao criar anúncio. Tente novamente.', 'error');
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
        const coupon = (loadedCoupons || (USE_MOCKS ? sellerCoupons : [])).find(c => c.code === code);
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
    if (canvas) drawSimpleChart(canvas);
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

function drawSimpleChart(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const data = [3, 5, 2, 7, 4, 6, 8];
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const w = rect.width;
  const h = rect.height;
  const padding = { top: 30, right: 20, bottom: 30, left: 40 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const maxVal = Math.max(...data) + 2; // Extra headroom

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

