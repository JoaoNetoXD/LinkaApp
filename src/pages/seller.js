import { icons, showToast, getProductImage, formatCurrency } from '../main.js';
import { sellerAds, sellerCoupons, categories, currentUser, institution, sellerStats } from '../data/mock.js';
import { getSellerPayments, getPaymentStats } from '../services/payment-service.js';

let sellerView = 'dashboard'; // dashboard | create | ads | coupons | payments
let paymentsFilter = 'all';
let activeTab = 'active';

export function renderSeller(container, subpage) {
  if (subpage === 'create') sellerView = 'create';
  else if (subpage === 'coupons') sellerView = 'coupons';
  else if (subpage === 'payments') sellerView = 'payments';
  else sellerView = 'dashboard';
  renderSellerPage(container);
}

async function renderSellerPage(container) {
  // Check if Mercado Pago is "connected" (simulated)
  const isMPConnected = sessionStorage.getItem('mp_connected') === 'true';

  container.innerHTML = `
    <div class="page seller-page">
      <header class="app-header" style="justify-content:space-between; align-items:center; padding: 16px 24px;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <div class="user-avatar" style="width: 40px; height: 40px;">${currentUser.avatar}</div>
          <div>
            <div style="font-size:var(--font-size-md);font-weight:var(--font-weight-bold);color:#fff;">${currentUser.fullName}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">${institution.name}</div>
          </div>
        </div>
        ${isMPConnected ? `
          <div class="mp-status-icon" title="Mercado Pago Conectado">
            ${icons.checkCircle}
          </div>
        ` : `
          <button class="btn btn-mp btn-sm" id="connect-mp-btn" style="padding: 6px 12px; font-size: 12px;">${icons.wallet} Conectar</button>
        `}
      </header>

      <div class="app-body" id="seller-content">
        ${sellerView === 'create' ? renderCreateForm() : sellerView === 'coupons' ? renderSellerCoupons() : sellerView === 'payments' ? await renderSellerPayments() : renderDashboard()}
      </div>
      <nav class="bottom-nav">
        <div class="bottom-nav-item ${sellerView === 'dashboard' ? 'active' : ''}" data-nav="dashboard">
          ${icons.home}<span>Dashboard</span>
          <div class="nav-indicator"></div>
        </div>
        <div class="bottom-nav-item ${sellerView === 'ads' ? 'active' : ''}" data-nav="ads">
          ${icons.package}<span>Anúncios</span>
          <div class="nav-indicator"></div>
        </div>
        <div class="bottom-nav-item ${sellerView === 'payments' ? 'active' : ''}" data-nav="payments">
          ${icons.wallet}<span>Vendas</span>
          <div class="nav-indicator"></div>
        </div>
        <div class="bottom-nav-item ${sellerView === 'coupons' ? 'active' : ''}" data-nav="coupons">
          ${icons.ticket}<span>Cupons</span>
          <div class="nav-indicator"></div>
        </div>
      </nav>
    </div>
  `;
  bindSellerEvents(container);
}

function renderDashboard() {
  const statusCounts = {
    active: sellerAds.filter(a => a.status === 'active').length,
    pending: sellerAds.filter(a => a.status === 'pending').length,
    queue: sellerAds.filter(a => a.status === 'queue').length,
    expired: sellerAds.filter(a => a.status === 'expired').length,
    rejected: sellerAds.filter(a => a.status === 'rejected').length,
  };

  return `
    <div class="seller-stats-grid">
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.package}</div>
        <div class="stat-info">
          <div class="stat-value">${sellerStats.activeAds}</div>
          <div class="stat-label">Anúncios</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.ticket}</div>
        <div class="stat-info">
          <div class="stat-value">${sellerStats.couponsGenerated}</div>
          <div class="stat-label">Cupons</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.checkCircle}</div>
        <div class="stat-info">
          <div class="stat-value">${sellerStats.conversionRate}</div>
          <div class="stat-label">Conversão</div>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-icon">${icons.eye}</div>
        <div class="stat-info">
          <div class="stat-value">${sellerStats.totalClicks}</div>
          <div class="stat-label">Cliques</div>
        </div>
      </div>
    </div>

    <div class="seller-cta-inline">
      <button class="btn btn-primary create-ad-cta btn-block" style="display:flex; justify-content:center; align-items:center; gap:8px;">${icons.plus} Criar Novo Anúncio</button>
    </div>

    <!-- Ads by status -->
    <div class="seller-tabs-container">
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

function renderAdsByStatus() {
  const filtered = sellerAds.filter(a => a.status === activeTab);
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
  const statusLabels = { active: 'Ativo', pending: 'Em aprovação', queue: 'Na fila', expired: 'Expirado', rejected: 'Recusado' };
  const statusBadge = { active: 'badge-success', pending: 'badge-warning', queue: 'badge-primary', expired: 'badge-neutral', rejected: 'badge-danger' };
  return `
    <div class="seller-ad-card glass-card">
      <div class="seller-ad-card-inner">
        <div class="seller-ad-thumb">${getProductImage(ad.images[0], 120, 120, ad.category)}</div>
        <div class="seller-ad-info">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <h4 class="ad-title">${ad.title}</h4>
            ${isAct ? '<div class="pulse-light"></div>' : ''}
          </div>
          <div class="ad-category">${categories.find(c => c.id === ad.category)?.name || ad.category}</div>
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
        ${ad.status === 'expired' ? `<button class="btn btn-primary btn-sm">Renovar</button>` : ''}
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
          ${categories.filter(c => c.id !== 'all').map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
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
          <div class="photo-upload-slot">${icons.upload}<span>Foto 1</span></div>
          <div class="photo-upload-slot">${icons.upload}<span>Foto 2</span></div>
          <div class="photo-upload-slot">${icons.upload}<span>Foto 3</span></div>
        </div>
      </div>
      <div class="input-group">
        <label>WhatsApp para contato</label>
        <input type="tel" class="input-field" placeholder="(86) 99900-1122" id="ad-whatsapp" value="${currentUser.whatsapp}">
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
      ${sellerCoupons.map(c => `
        <div class="coupon-item">
          <div class="coupon-item-header">
            <span class="coupon-item-code">${c.code}</span>
            <span class="badge ${c.status === 'pending' ? 'badge-warning' : c.status === 'used' ? 'badge-success' : 'badge-neutral'}">
              ${c.status === 'pending' ? 'Pendente' : c.status === 'used' ? 'Usado' : 'Expirado'}
            </span>
          </div>
          <div class="coupon-item-product">${c.product}</div>
          <div class="coupon-item-meta">Comprador: ${c.buyer} · ${c.createdAt}</div>
          ${c.status === 'pending' ? `
            <button class="btn btn-success btn-sm btn-block mark-used-btn" data-code="${c.code}" style="margin-top:var(--space-3);">
              ${icons.check} Marcar como usado
            </button>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

async function renderSellerPayments() {
  const stats = await getPaymentStats(currentUser.id);
  const allPayments = await getSellerPayments(currentUser.id);
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
        <span class="commission-label">Comissão Linka: <strong>${(stats.commissionRate * 100).toFixed(0)}%</strong></span>
        <span class="commission-detail">Total bruto: ${formatCurrency(stats.totalGross)} · Taxa: ${formatCurrency(stats.totalFees)}</span>
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
              <div class="avatar-sm avatar">${(p.buyerName || 'U').split(' ').map(n => n[0]).join('').slice(0,2)}</div>
              <div>
                <div class="payment-list-buyer-name">${p.buyerName || 'Comprador'}</div>
                <div class="payment-list-buyer-date">${formatDate(p.createdAt)}</div>
              </div>
            </div>
            <span class="badge ${statusBadges[p.status] || 'badge-neutral'}">${statusLabels[p.status] || p.status}</span>
          </div>
          <div class="payment-list-item-body">
            <div>
              <div class="payment-list-product">${p.productTitle}</div>
              <div class="payment-list-coupon">Cupom: ${p.couponCode}</div>
              ${p.status === 'paid' ? `<div class="confirmed-indicator">${icons.checkCircle} Pagamento confirmado</div>` : ''}
            </div>
            <div>
              <div class="payment-list-amount ${p.status === 'paid' ? 'paid-amount' : ''}">${formatCurrency(p.sellerAmount || p.amount * 0.99)}</div>
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
  container.querySelector('#back-to-dashboard')?.addEventListener('click', () => { sellerView = 'dashboard'; renderSellerPage(container); });

  // Mercado Pago connect button
  container.querySelector('#connect-mp-btn')?.addEventListener('click', () => {
    const modalRoot = document.getElementById('modal-root');
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="mp-modal">
        <div class="modal-content" style="text-align:center;">
          <div class="modal-handle"></div>
          <div style="width:64px;height:64px;border-radius:var(--radius-full);background:linear-gradient(135deg,#009ee3,#00b1ea);display:flex;align-items:center;justify-content:center;margin:0 auto var(--space-4);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4M4 6v12c0 1.1.9 2 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4h-4z"/></svg>
          </div>
          <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Conectar Mercado Pago</h3>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-5);line-height:var(--line-height-relaxed);">Ao conectar sua conta, você receberá pagamentos Pix diretamente. A Linka cobra apenas <strong>1% de comissão</strong> por transação.</p>
          <button class="btn btn-mp btn-block btn-lg" id="do-connect-mp" style="margin-bottom:var(--space-3);">Conectar minha conta</button>
          <button class="btn btn-secondary btn-block" id="cancel-mp">Agora não</button>
        </div>
      </div>
    `;
    modalRoot.querySelector('#mp-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
    modalRoot.querySelector('#cancel-mp').addEventListener('click', () => modalRoot.innerHTML = '');
    modalRoot.querySelector('#do-connect-mp').addEventListener('click', () => {
      sessionStorage.setItem('mp_connected', 'true');
      modalRoot.innerHTML = '';
      showToast('Mercado Pago conectado com sucesso!', 'success');
      renderSellerPage(container);
    });
  });

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

  // Form submit
  container.querySelector('#create-ad-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Anúncio enviado para aprovação!', 'success');
    sellerView = 'dashboard';
    activeTab = 'pending';
    renderSellerPage(container);
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
            <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-5);">Confirmar que o cupom <strong>${code}</strong> foi utilizado?</p>
            <div style="display:flex;gap:var(--space-3);">
              <button class="btn btn-secondary" style="flex:1;" id="cancel-confirm">Cancelar</button>
              <button class="btn btn-success" style="flex:1;" id="do-confirm">Confirmar uso</button>
            </div>
          </div>
        </div>
      `;
      modalRoot.querySelector('#confirm-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) modalRoot.innerHTML = ''; });
      modalRoot.querySelector('#cancel-confirm').addEventListener('click', () => modalRoot.innerHTML = '');
      modalRoot.querySelector('#do-confirm').addEventListener('click', () => {
        modalRoot.innerHTML = '';
        showToast(`Cupom ${code} marcado como usado!`, 'success');
      });
    });
  });

  // Renew buttons
  container.querySelectorAll('.btn-primary.btn-sm').forEach(btn => {
    if (btn.textContent.includes('Renovar')) {
      btn.addEventListener('click', () => {
        showToast('Anúncio renovado e enviado para a fila!', 'success');
      });
    }
  });

  // Simple chart
  setTimeout(() => {
    const canvas = container.querySelector('#seller-chart');
    if (canvas) drawSimpleChart(canvas);
  }, 100);

  // Bottom nav
  container.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'dashboard') { sellerView = 'dashboard'; activeTab = 'active'; }
      else if (nav === 'ads') { sellerView = 'dashboard'; activeTab = 'active'; }
      else if (nav === 'coupons') { sellerView = 'coupons'; }
      else if (nav === 'payments') { sellerView = 'payments'; paymentsFilter = 'all'; }
      else if (nav === 'profile') { showToast('Perfil em breve!', 'info'); return; }
      renderSellerPage(container);
    });
  });
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
