import { icons, showToast, getProductImage, formatCurrency } from '../main.js';
import { products, categories, coupons, currentUser, institution } from '../data/mock.js';
import { createPixPayment, checkPaymentStatus, createCheckoutPreference } from '../services/payment-service.js';

let activeCategory = 'all';
let currentView = 'home'; // home | detail | coupons | payment
let currentPayment = null;
let paymentTimerInterval = null;
let paymentPollInterval = null;

export function renderBuyer(container, subpage) {
  if (subpage === 'coupons') {
    currentView = 'coupons';
  } else {
    currentView = 'home';
  }
  renderBuyerPage(container);
}

function renderBuyerPage(container) {
  const filtered = activeCategory === 'all' ? products : products.filter(p => p.category === activeCategory);

  container.innerHTML = `
    <div class="page buyer-page">
      <!-- App Header -->
      <header class="app-header">
        <div>
          <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);">Olá, ${currentUser.name}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">${institution.name}</div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <button class="btn-icon" style="position:relative;">
            ${icons.bell}
            <span style="position:absolute;top:6px;right:6px;width:8px;height:8px;background:var(--danger-500);border-radius:50%;border:2px solid white;"></span>
          </button>
          <div class="avatar">${currentUser.avatar}</div>
        </div>
      </header>

      <div class="app-body" id="buyer-content">
        ${currentView === 'coupons' ? renderCouponsView() : renderHomeView(filtered)}
      </div>

      <!-- Bottom Navigation -->
      <nav class="bottom-nav">
        <div class="nav-item ${currentView === 'home' ? 'active' : ''}" data-nav="home">
          ${icons.home}
          <span>Início</span>
        </div>
        <div class="nav-item" data-nav="categories">
          ${icons.grid}
          <span>Categorias</span>
        </div>
        <div class="nav-item ${currentView === 'coupons' ? 'active' : ''}" data-nav="coupons">
          ${icons.ticket}
          <span>Meus Cupons</span>
        </div>
        <div class="nav-item" data-nav="profile">
          ${icons.user}
          <span>Perfil</span>
        </div>
      </nav>
    </div>
  `;

  bindBuyerEvents(container);
}

function renderHomeView(filtered) {
  return `
    <!-- Search -->
    <div class="buyer-search">
      <div class="search-bar">
        <span class="search-icon">${icons.search}</span>
        <input type="text" class="input-field" placeholder="Buscar lanches, serviços, moda..." style="padding-left:48px;" id="search-input">
      </div>
    </div>

    <!-- Categories -->
    <div class="buyer-categories" id="category-chips">
      ${categories.map(c => `
        <button class="chip ${c.id === activeCategory ? 'active' : ''}" data-category="${c.id}">
          ${c.icon} ${c.name}
        </button>
      `).join('')}
    </div>

    <!-- Banner -->
    <div class="buyer-banner">
      <h3>🎓 Ofertas ativas dentro da sua instituição</h3>
      <p>Pegue um cupom e fale direto com o vendedor pelo WhatsApp.</p>
    </div>

    <!-- Products -->
    <div class="products-grid" id="products-grid">
      ${filtered.length > 0 ? filtered.map(p => renderProductCard(p)).join('') : `
        <div class="empty-state" style="grid-column:1/-1;">
          ${icons.package}
          <h3>Ainda não há ofertas nesta categoria</h3>
          <p>Novas ofertas aparecem quando vendedores publicam anúncios.</p>
        </div>
      `}
    </div>
  `;
}

function renderProductCard(product) {
  const isFull = product.slots.used >= product.slots.total;
  return `
    <div class="product-card" data-product-id="${product.id}">
      <div class="product-image">
        ${getProductImage(product.images[0])}
        <div class="product-category">${categories.find(c => c.id === product.category)?.icon || ''} ${categories.find(c => c.id === product.category)?.name || ''}</div>
        <div class="discount-badge">-${product.discount}%</div>
      </div>
      <div class="product-body">
        <h3 class="product-title">${product.title}</h3>
        <div class="product-pricing">
          <span class="price-original">${formatCurrency(product.originalPrice)}</span>
          <span class="price-discount">${formatCurrency(product.discountPrice)}</span>
        </div>
        <div class="product-meta">
          <span class="timer">${icons.clock} expira em ${product.expiresIn}</span>
          <span class="product-slots">${product.slots.used} de ${product.slots.total} vagas</span>
        </div>
        <div class="product-actions">
          <button class="btn btn-primary btn-sm coupon-btn" data-product-id="${product.id}" ${isFull ? 'disabled style="opacity:0.5;pointer-events:none;"' : ''}>
            ${isFull ? 'Esgotado' : '🎟️ Pegar cupom'}
          </button>
          <button class="btn btn-ghost btn-sm detail-btn" data-product-id="${product.id}">Detalhes</button>
        </div>
      </div>
    </div>
  `;
}

function renderCouponsView() {
  return `
    <div class="buyer-section-title">Meus Cupons</div>
    <div class="coupons-list">
      ${coupons.length > 0 ? coupons.map(c => `
        <div class="coupon-item">
          <div class="coupon-item-header">
            <span class="coupon-item-code">${c.code}</span>
            <span class="badge ${c.status === 'active' ? 'badge-success' : c.status === 'used' ? 'badge-neutral' : 'badge-warning'}">${c.status === 'active' ? 'Ativo' : c.status === 'used' ? 'Usado' : 'Expirado'}</span>
          </div>
          <div class="coupon-item-product">${c.product}</div>
          <div class="coupon-item-meta">
            Vendedor: ${c.seller} · Gerado em ${c.createdAt}
          </div>
          ${c.status === 'active' ? `
            <button class="btn btn-success btn-sm btn-block" style="margin-top:var(--space-3);" onclick="window.open('https://wa.me/5586999112233?text=Olá! Tenho o cupom ${c.code} para ${c.product}','_blank')">
              ${icons.whatsapp} Abrir WhatsApp
            </button>
          ` : ''}
        </div>
      `).join('') : `
        <div class="empty-state">
          ${icons.ticket}
          <h3>Você ainda não gerou nenhum cupom</h3>
          <p>Navegue pela vitrine e pegue cupons para falar com vendedores.</p>
        </div>
      `}
    </div>
  `;
}

function renderProductDetail(container, product) {
  clearPaymentIntervals();
  const detailHTML = `
    <div class="page buyer-page">
      <header class="app-header">
        <button class="btn-icon" id="back-to-list">${icons.arrowRight.replace('points="12 5 19 12 12 19"', 'points="12 19 5 12 12 5"').replace('x1="5" y1="12" x2="19"', 'x1="19" y1="12" x2="5"')}</button>
        <span class="app-header-title">Detalhes</span>
        <div style="width:44px;"></div>
      </header>
      <div class="app-body product-detail">
        <div class="detail-gallery">
          <div class="detail-gallery-item">${getProductImage(product.images[0], 400, 260)}</div>
          <div class="detail-gallery-item">${getProductImage(product.images[0], 400, 260)}</div>
        </div>
        <div class="detail-info">
          <span class="badge badge-primary product-category-badge">${categories.find(c => c.id === product.category)?.name || ''}</span>
          <h1>${product.title}</h1>
          <p style="color:var(--text-secondary);margin-bottom:var(--space-4);line-height:var(--line-height-relaxed);">${product.description}</p>
          <div class="product-pricing" style="margin-bottom:var(--space-3);">
            <span class="price-original" style="font-size:var(--font-size-base);">${formatCurrency(product.originalPrice)}</span>
            <span class="price-discount" style="font-size:var(--font-size-2xl);">${formatCurrency(product.discountPrice)}</span>
            <span class="badge badge-danger">-${product.discount}%</span>
          </div>
          <div class="product-meta" style="margin-bottom:var(--space-4);">
            <span class="timer">${icons.clock} expira em ${product.expiresIn}</span>
            <span class="product-slots">${product.slots.used}/${product.slots.total} vagas</span>
          </div>
          <div class="detail-seller">
            <div class="avatar">${product.seller.avatar}</div>
            <div class="detail-seller-info">
              <h4>${product.seller.name}</h4>
              <p>${product.seller.course} · ${product.seller.semester}</p>
              ${product.seller.verified ? `<span class="verified-badge">${icons.check} Aluno verificado pela instituição</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="detail-fixed-bottom" style="display:flex;flex-direction:column;gap:var(--space-2);">
        <div style="display:flex;gap:var(--space-2);">
          <button class="btn btn-primary btn-lg detail-coupon-btn" data-product-id="${product.id}" style="flex:1;">🎟️ Pegar cupom</button>
          <button class="btn btn-pix btn-lg detail-pix-btn" data-product-id="${product.id}" style="flex:1;">💳 Pagar com Pix</button>
        </div>
        <button class="btn btn-secondary btn-lg detail-card-btn" data-product-id="${product.id}" style="width:100%;">💳 Pagar com Cartão</button>
      </div>
      <nav class="bottom-nav">
        <div class="nav-item active" data-nav="home">${icons.home}<span>Início</span></div>
        <div class="nav-item" data-nav="categories">${icons.grid}<span>Categorias</span></div>
        <div class="nav-item" data-nav="coupons">${icons.ticket}<span>Meus Cupons</span></div>
        <div class="nav-item" data-nav="profile">${icons.user}<span>Perfil</span></div>
      </nav>
    </div>
  `;
  container.innerHTML = detailHTML;

  container.querySelector('#back-to-list')?.addEventListener('click', () => {
    currentView = 'home';
    renderBuyerPage(container);
  });
  container.querySelector('.detail-coupon-btn')?.addEventListener('click', () => showCouponModal(product));
  container.querySelector('.detail-pix-btn')?.addEventListener('click', () => {
    startPixPayment(container, product);
  });
  container.querySelector('.detail-card-btn')?.addEventListener('click', () => {
    startCardPayment(container, product);
  });
  bindBottomNav(container);
}

function generateCouponCode() {
  return String.fromCharCode(65+Math.floor(Math.random()*26)) + Math.floor(Math.random()*10) + String.fromCharCode(65+Math.floor(Math.random()*26)) + Math.floor(Math.random()*10);
}

async function startPixPayment(container, product) {
  const btn = container.querySelector('.detail-pix-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = `${icons.loader} Gerando Pix...`; }
  try {
    const couponCode = generateCouponCode();
    const payment = await createPixPayment(product, couponCode, currentUser);
    currentPayment = payment;
    renderPaymentScreen(container, payment, product);
  } catch (err) {
    showToast('Erro ao gerar Pix. Verifique o servidor local.', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '💳 Pagar com Pix'; }
  }
}

async function startCardPayment(container, product) {
  const btn = container.querySelector('.detail-card-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = `${icons.loader} Redirecionando...`; }
  try {
    const couponCode = generateCouponCode();
    const initPoint = await createCheckoutPreference(product, couponCode, currentUser);
    window.location.href = initPoint;
  } catch (err) {
    showToast('Erro ao gerar checkout de cartão. Verifique suas credenciais.', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '💳 Pagar com Cartão'; }
  }
}

function renderPaymentScreen(container, payment, product) {
  clearPaymentIntervals();
  const isPaid = payment.status === 'paid';
  const isExpired = payment.status === 'expired';

  container.innerHTML = `
    <div class="page buyer-page" style="background-color: var(--gray-50);">
      <header class="app-header payment-header">
        <button class="btn-icon" id="back-from-payment" style="color: white;">${icons.arrowRight.replace('points="12 5 19 12 12 19"', 'points="12 19 5 12 12 5"').replace('x1="5" y1="12" x2="19"', 'x1="19" y1="12" x2="5"')}</button>
        <span class="app-header-title" style="color: white;">Pagamento Pix</span>
        <span class="pix-brand" style="color: white; opacity: 0.9;">${icons.pix}</span>
      </header>
      <div class="payment-header-bg"></div>
      <div class="app-body payment-screen" id="payment-screen">
        <div class="payment-premium-card">
          <!-- Status -->
        <div class="payment-status-container ${payment.status}" id="payment-status">
          <div class="payment-status-icon">${isPaid ? '✅' : isExpired ? '⏰' : '⏳'}</div>
          <div class="payment-status-text">${isPaid ? 'Pagamento confirmado!' : isExpired ? 'Pagamento expirado' : 'Aguardando pagamento'}</div>
          <div class="payment-status-sub">${isPaid ? 'Seu pagamento foi recebido com sucesso.' : isExpired ? 'O tempo para pagamento expirou.' : 'Escaneie o QR Code ou copie o código Pix.'}</div>
          ${!isPaid && !isExpired ? `<div class="payment-timer" id="payment-timer">${icons.clock} Expira em <span class="payment-timer-value" id="timer-value">10:00</span></div>` : ''}
        </div>

        ${!isPaid && !isExpired ? `
        <!-- QR Code -->
        <div class="qr-code-container">
          <div class="qr-code-wrapper">
            ${payment.qrCodeSVG}
          </div>
          <div class="qr-code-label">${icons.pix} Escaneie com seu banco</div>
        </div>

        <!-- Pix Code -->
        <div class="pix-code-section">
          <div class="pix-code-section-title">Código Copia e Cola</div>
          <div class="pix-code-field">
            <div class="pix-code-text" id="pix-code-text">${payment.pixCode}</div>
            <button class="pix-code-copy-btn" id="copy-pix-btn">
              ${icons.copy} Copiar
            </button>
          </div>
        </div>
        ` : ''}
        
        <!-- Instruction -->
        <div class="payment-instruction">
          <div class="payment-instruction-icon">📱</div>
          <div class="payment-instruction-text"><strong>Abra seu banco</strong> e pague via Pix usando o QR Code ou o código copiado.</div>
        </div>
        </div> <!-- End of premium card -->

        ${isPaid ? `
        <div style="text-align:center;margin:var(--space-5) 0;">
          <button class="btn btn-success btn-lg btn-block" onclick="window.open('https://wa.me/${product.seller.whatsapp}?text=Olá, ${product.seller.name}! Paguei via Pix o produto *${product.title}* (cupom ${payment.couponCode}) no Linka.','_blank')">
            ${icons.whatsapp} Falar com vendedor
          </button>
        </div>
        ` : ''}

        <!-- Summary -->
        <div class="payment-summary">
          <div class="payment-summary-title">Resumo do pagamento</div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">Produto</span>
            <span class="payment-summary-value">${product.title}</span>
          </div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">Vendedor</span>
            <span class="payment-summary-value">${product.seller.name}</span>
          </div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">Cupom</span>
            <span class="payment-summary-value" style="font-family:'Courier New',monospace;color:var(--primary-700);">${payment.couponCode}</span>
          </div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">De</span>
            <span class="payment-summary-value" style="text-decoration:line-through;color:var(--text-tertiary);">${formatCurrency(payment.originalAmount)}</span>
          </div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">Subtotal</span>
            <span class="payment-summary-value">${formatCurrency(payment.amount)} <span class="badge badge-danger">-${payment.discount}%</span></span>
          </div>
          <div class="payment-summary-row" style="opacity:0.7;">
            <span class="payment-summary-label">Taxa da plataforma (1%)</span>
            <span class="payment-summary-value" style="font-size:var(--font-size-xs);">${formatCurrency(payment.platformFee || 0)}</span>
          </div>
          <div class="payment-summary-row" style="opacity:0.7;">
            <span class="payment-summary-label">Repasse ao vendedor</span>
            <span class="payment-summary-value" style="font-size:var(--font-size-xs);color:var(--success-600);">${formatCurrency(payment.sellerAmount || payment.amount)}</span>
          </div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">Total a pagar</span>
            <span class="payment-summary-value amount">${formatCurrency(payment.amount)}</span>
          </div>
          <div class="payment-summary-row">
            <span class="payment-summary-label">ID</span>
            <span class="payment-summary-value" style="font-size:var(--font-size-xs);color:var(--text-tertiary);">${payment.id}</span>
          </div>
        </div>
      </div>
      <nav class="bottom-nav">
        <div class="nav-item active" data-nav="home">${icons.home}<span>Início</span></div>
        <div class="nav-item" data-nav="categories">${icons.grid}<span>Categorias</span></div>
        <div class="nav-item" data-nav="coupons">${icons.ticket}<span>Meus Cupons</span></div>
        <div class="nav-item" data-nav="profile">${icons.user}<span>Perfil</span></div>
      </nav>
    </div>
  `;

  // Back button
  container.querySelector('#back-from-payment')?.addEventListener('click', () => {
    clearPaymentIntervals();
    currentView = 'home';
    renderBuyerPage(container);
  });

  // Copy Pix code
  container.querySelector('#copy-pix-btn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(payment.pixCode);
    const btn = container.querySelector('#copy-pix-btn');
    btn.innerHTML = `${icons.check} Copiado!`;
    btn.classList.add('copied');
    showToast('Código Pix copiado!', 'success');
    setTimeout(() => {
      if (btn) { btn.innerHTML = `${icons.copy} Copiar`; btn.classList.remove('copied'); }
    }, 3000);
  });

  // Timer countdown
  if (!isPaid && !isExpired) {
    const expiresAt = new Date(payment.expiresAt).getTime();
    paymentTimerInterval = setInterval(() => {
      const now = Date.now();
      const diff = expiresAt - now;
      const timerEl = container.querySelector('#timer-value');
      if (diff <= 0 || !timerEl) {
        clearPaymentIntervals();
        payment.status = 'expired';
        renderPaymentScreen(container, payment, product);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);

    // Poll for payment status
    paymentPollInterval = setInterval(async () => {
      const updated = await checkPaymentStatus(payment.id);
      if (updated && updated.status === 'paid') {
        clearPaymentIntervals();
        showPaymentSuccess(container, updated, product);
      }
    }, 2000);

    // Listen for payment-confirmed event
    const onConfirmed = (e) => {
      if (e.detail?.id === payment.id) {
        clearPaymentIntervals();
        window.removeEventListener('payment-confirmed', onConfirmed);
        showPaymentSuccess(container, e.detail, product);
      }
    };
    window.addEventListener('payment-confirmed', onConfirmed);
  }

  bindBottomNav(container);
}

function showPaymentSuccess(container, payment, product) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="payment-success-overlay" id="payment-success">
      <div class="payment-success-content">
        <div class="payment-success-check">${icons.checkCircle}</div>
        <div class="payment-success-title">Pagamento confirmado!</div>
        <div class="payment-success-subtitle">O valor de <strong>${formatCurrency(payment.amount)}</strong> foi enviado para <strong>${product.seller.name}</strong>.</div>
        <button class="btn btn-success btn-block btn-lg" id="success-whatsapp" style="margin-bottom:var(--space-3);">
          ${icons.whatsapp} Falar com vendedor
        </button>
        <button class="btn btn-secondary btn-block" id="success-close">Voltar à vitrine</button>
      </div>
    </div>
  `;

  modalRoot.querySelector('#success-whatsapp')?.addEventListener('click', () => {
    window.open(`https://wa.me/${product.seller.whatsapp}?text=Olá, ${product.seller.name}! Paguei via Pix o produto *${product.title}* (cupom ${payment.couponCode}) no Linka.`, '_blank');
  });

  modalRoot.querySelector('#success-close')?.addEventListener('click', () => {
    modalRoot.innerHTML = '';
    currentView = 'home';
    renderBuyerPage(container);
  });

  // Also update the payment screen behind
  setTimeout(() => {
    renderPaymentScreen(container, payment, product);
  }, 300);
}

function clearPaymentIntervals() {
  if (paymentTimerInterval) { clearInterval(paymentTimerInterval); paymentTimerInterval = null; }
  if (paymentPollInterval) { clearInterval(paymentPollInterval); paymentPollInterval = null; }
}

function showCouponModal(product) {
  const code = generateCouponCode();
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="coupon-modal-backdrop">
      <div class="modal-content">
        <div class="modal-handle"></div>
        <div class="coupon-modal-content">
          <div class="coupon-icon">🎟️</div>
          <h2 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-2);">Cupom gerado!</h2>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Apresente este código ao vendedor.</p>
          <span class="coupon-code">${code}</span>
          <div class="coupon-modal-details">
            <div class="detail-row"><span class="detail-label">Produto</span><span class="detail-value">${product.title}</span></div>
            <div class="detail-row"><span class="detail-label">Vendedor</span><span class="detail-value">${product.seller.name}</span></div>
            <div class="detail-row"><span class="detail-label">Preço</span><span class="detail-value">${formatCurrency(product.discountPrice)}</span></div>
            <div class="detail-row"><span class="detail-label">Validade</span><span class="detail-value">24 horas</span></div>
          </div>
          <div class="coupon-warning">${icons.alertTriangle} Este cupom é único e vinculado ao seu perfil.</div>
          <button class="btn btn-success btn-block btn-lg" onclick="window.open('https://wa.me/${product.seller.whatsapp}?text=Olá, ${product.seller.name}! Tenho o cupom *${code}* para *${product.title}* no Linka.','_blank')" style="margin-bottom:var(--space-2);">
            ${icons.whatsapp} Chamar no WhatsApp
          </button>
          <button class="btn btn-secondary btn-block" id="copy-coupon-btn">
            ${icons.copy} Copiar código
          </button>
        </div>
      </div>
    </div>
  `;
  modalRoot.querySelector('#coupon-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modalRoot.innerHTML = '';
  });
  modalRoot.querySelector('#copy-coupon-btn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(code);
    showToast('Código copiado!', 'success');
  });
}

function bindBuyerEvents(container) {
  // Category chips
  container.querySelectorAll('[data-category]').forEach(chip => {
    chip.addEventListener('click', () => {
      activeCategory = chip.dataset.category;
      renderBuyerPage(container);
    });
  });

  // Coupon buttons
  container.querySelectorAll('.coupon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const product = products.find(p => p.id == btn.dataset.productId);
      if (product) showCouponModal(product);
    });
  });

  // Detail buttons
  container.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const product = products.find(p => p.id == btn.dataset.productId);
      if (product) renderProductDetail(container, product);
    });
  });

  // Product card click
  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const product = products.find(p => p.id == card.dataset.productId);
      if (product) renderProductDetail(container, product);
    });
  });

  // Search
  const searchInput = container.querySelector('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const grid = container.querySelector('#products-grid');
      if (!grid) return;
      const filtered = products.filter(p =>
        (activeCategory === 'all' || p.category === activeCategory) &&
        (p.title.toLowerCase().includes(query) || p.description.toLowerCase().includes(query))
      );
      grid.innerHTML = filtered.length > 0
        ? filtered.map(p => renderProductCard(p)).join('')
        : `<div class="empty-state" style="grid-column:1/-1;">${icons.package}<h3>Nenhum resultado encontrado</h3><p>Tente buscar por outro termo.</p></div>`;

      // Re-bind events for new cards
      grid.querySelectorAll('.coupon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const product = products.find(p => p.id == btn.dataset.productId);
          if (product) showCouponModal(product);
        });
      });
      grid.querySelectorAll('.detail-btn, .product-card').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.productId;
          const product = products.find(p => p.id == id);
          if (product) renderProductDetail(container, product);
        });
      });
    });
  }

  bindBottomNav(container);
}

function bindBottomNav(container) {
  container.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      clearPaymentIntervals();
      if (nav === 'home') { activeCategory = 'all'; currentView = 'home'; renderBuyerPage(container); }
      else if (nav === 'coupons') { currentView = 'coupons'; renderBuyerPage(container); }
      else if (nav === 'categories') { activeCategory = 'all'; currentView = 'home'; renderBuyerPage(container); }
      else if (nav === 'profile') { showToast('Perfil em breve!', 'info'); }
    });
  });
}
