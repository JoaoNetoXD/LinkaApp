import { icons, showToast, getProductImage, formatCurrency } from '../main.js';
import { products, categories, coupons, currentUser, institution } from '../data/mock.js';
import { createPixPayment, checkPaymentStatus, createCheckoutPreference } from '../services/payment-service.js';

let activeCategory = 'all';
let currentView = 'home'; // home | detail | coupons | payment
let currentPayment = null;
let paymentTimerInterval = null;
let paymentPollInterval = null;

// Intersection Observer for card entrance animation
let observer = null;

export function renderBuyer(container, subpage) {
  if (subpage === 'coupons') {
    currentView = 'coupons';
  } else {
    currentView = 'home';
  }
  renderBuyerPage(container);
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

function renderBuyerPage(container) {
  if (currentView === 'home') {
    renderHome(container);
    initObserver();
  } else if (currentView === 'detail') {
    // We'll keep the detail simple or implement it if needed. 
    // For now, let's just render a placeholder or re-render home.
    renderHome(container);
    initObserver();
  } else if (currentView === 'profile') {
    renderProfile(container);
  } else if (currentView === 'payment') {
    renderPayment(container);
  }

  // Bind Bottom Nav
  const navItems = container.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'home') {
        currentView = 'home';
        window.history.pushState({}, '', '/buyer');
        renderBuyerPage(container);
      } else if (nav === 'coupons') {
        currentView = 'coupons';
        window.history.pushState({}, '', '/buyer/coupons');
        renderBuyerPage(container);
      } else if (nav === 'profile') {
        currentView = 'profile';
        window.history.pushState({}, '', '/buyer/profile');
        renderBuyerPage(container);
      }
    });
  });
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

function renderHome(container) {
  const filteredProducts = activeCategory === 'all' 
    ? products 
    : products.filter(p => p.category === activeCategory);

  container.innerHTML = `
    <div class="buyer-wrapper">
      <!-- HEADER -->
      <header class="buyer-header">
        <div class="buyer-header-top">
          <div class="buyer-greeting">
            <h1>Olá, ${currentUser.name.split(' ')[0]}</h1>
            <div class="inst-badge">${institution.name}</div>
          </div>
          <div class="buyer-actions">
            <button class="icon-btn notification-btn">
              ${icons.bell}
              <span class="badge">2</span>
            </button>
            <div class="user-avatar">${currentUser.avatar}</div>
          </div>
        </div>
        <div class="search-bar">
          ${icons.search}
          <input type="text" placeholder="Buscar ofertas, categorias..." />
        </div>
      </header>

      <!-- CATEGORY CHIPS -->
      <div class="category-scroll">
        <div class="category-chips">
          ${categories.map(c => `
            <button class="chip ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
              ${icons[c.id] || icons.others}
              <span>${c.name}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- INSTITUTION BANNER -->
      <div class="inst-banner">
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
      <div class="products-list">
        ${filteredProducts.map(p => {
          const catName = categories.find(c => c.id === p.category)?.name || 'Outros';
          const catIcon = icons[p.category] || icons.others;
          const timer = getTimerInfo(p.expiresIn);
          const slots = getSlotsInfo(p.slots.used, p.slots.total);
          const isSoldOut = p.slots.used >= p.slots.total;
          
          return `
          <div class="product-card ${isSoldOut ? 'sold-out' : ''}">
            <div class="card-image-area">
              ${getProductImage(p.images[0], 400, 160, p.category)}
              <div class="cat-badge">${catIcon} ${catName}</div>
              ${isSoldOut 
                ? `<div class="discount-badge soldout-badge">ESGOTADO</div>`
                : `<div class="discount-badge">-${p.discount}%</div>`
              }
            </div>
            
            <div class="card-body">
              <h3 class="card-title">${p.title}</h3>
              
              <div class="card-price-row">
                <span class="price-discount">${formatCurrency(p.discountPrice)}</span>
                <span class="price-original">${formatCurrency(p.originalPrice)}</span>
              </div>
              
              <div class="card-timer ${timer.colorClass}">
                <div class="timer-icon ${timer.isCritical ? 'pulse' : ''}">${icons.clock}</div>
                <span>${timer.text}</span>
              </div>
              
              <div class="card-slots">
                <div class="slots-label">
                  <span>${slots.text}</span>
                  ${slots.almostEmpty && !isSoldOut ? '<span class="slots-warning pulse">Última vaga!</span>' : ''}
                </div>
                <div class="slots-bar-bg">
                  <div class="slots-bar-fill ${slots.colorClass}" style="width: 0%" data-target="${slots.percent}%"></div>
                </div>
              </div>
              
              <div class="card-actions">
                <button class="btn-primary get-coupon-btn" ${isSoldOut ? 'disabled' : ''} data-id="${p.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                  Pegar cupom
                </button>
                <button class="btn-outline view-details-btn" data-id="${p.id}">
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

  // Category clicks
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      // Exit animation
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
    btn.addEventListener('click', () => {
      if (!btn.disabled) {
        const productId = btn.dataset.id;
        const product = products.find(p => p.id == productId);
        showPaymentSelectionModal(product, container);
      }
    });
  });
}

function showPaymentSelectionModal(product, container) {
  const modalHTML = `
    <div class="payment-modal-overlay" id="paymentSelectionModal">
      <div class="payment-modal-content">
        <div class="payment-modal-header">
          <h3>Forma de Pagamento</h3>
          <button class="icon-btn close-modal-btn">${icons.plus}</button> <!-- reused plus, will rotate in css -->
        </div>
        <div class="payment-modal-body">
          <p class="payment-modal-desc">Você está comprando <strong>${product.title}</strong> por ${formatCurrency(product.discountPrice)}</p>
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
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
    currentPayment = { product, method: 'pix' };
    currentView = 'payment';
    renderBuyerPage(container);
  });

  document.getElementById('btnPayCard').addEventListener('click', async () => {
    const btn = document.getElementById('btnPayCard');
    btn.innerHTML = `${icons.refresh} <span>Aguarde...</span>`; // Mock spinner
    try {
      const url = await createCheckoutPreference(product, 'MOCK123', currentUser);
      window.location.href = url; // Redirects to mercado pago
    } catch (err) {
      showToast('Erro ao redirecionar', 'error');
      btn.innerHTML = `<span>Tentar novamente</span>`;
    }
  });
}

function renderCoupons(container) {
  // Simple coupons view matching dark aesthetic
  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header">
        <h1>Meus Cupons</h1>
      </header>
      
      <div class="coupons-list">
        ${coupons.map(c => `
          <div class="coupon-card ${c.status}">
            <div class="coupon-status-bar"></div>
            <div class="coupon-body">
              <div class="coupon-header">
                <h3>${c.product}</h3>
                <span class="status-badge ${c.status}">${c.status === 'active' ? 'Ativo' : c.status === 'used' ? 'Usado' : 'Expirado'}</span>
              </div>
              <div class="coupon-code-area">
                <div class="coupon-code">${c.code}</div>
                <button class="icon-btn copy-btn">${icons.copy}</button>
              </div>
              <div class="coupon-footer">
                <div class="seller-info">
                  ${icons.user} <span>${c.seller}</span>
                </div>
                ${c.status === 'active' ? `<button class="btn-whatsapp">${icons.whatsapp} WhatsApp</button>` : ''}
              </div>
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

  // Bind Bottom Nav
  const navItems = container.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'home') {
        currentView = 'home';
        window.history.pushState({}, '', '/buyer');
        renderBuyerPage(container);
      } else if (nav === 'profile') {
        currentView = 'profile';
        window.history.pushState({}, '', '/buyer/profile');
        renderBuyerPage(container);
      }
    });
  });
}

function renderProfile(container) {
  container.innerHTML = `
    <div class="buyer-wrapper">
      <header class="buyer-header minimal-header">
        <h1>Meu Perfil</h1>
      </header>
      
      <div class="profile-container" style="padding: 24px 16px;">
        <div style="text-align:center; margin-bottom: 24px;">
          <div class="user-avatar" style="width:80px;height:80px;font-size:32px;margin:0 auto 12px;">${currentUser.avatar}</div>
          <h2 style="font-size:18px;margin:0 0 4px;">${currentUser.name}</h2>
          <span style="color:#6B7280;font-size:13px;">${currentUser.email}</span>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display:block;font-size:12px;color:#6B7280;margin-bottom:8px;">Nome Completo</label>
          <input type="text" value="${currentUser.name}" class="profile-input" style="width:100%;background:#111118;border:1px solid #1E1E2A;border-radius:10px;color:#FFF;padding:12px;font-family:'Plus Jakarta Sans',sans-serif;" />
        </div>
        
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="display:block;font-size:12px;color:#6B7280;margin-bottom:8px;">WhatsApp (Para receber cupons)</label>
          <input type="text" value="${currentUser.whatsapp}" class="profile-input" style="width:100%;background:#111118;border:1px solid #1E1E2A;border-radius:10px;color:#FFF;padding:12px;font-family:'Plus Jakarta Sans',sans-serif;" />
        </div>

        <button class="btn-primary" style="width:100%;margin-top:16px;" id="btnSaveProfile">Salvar Dados</button>
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

  document.getElementById('btnSaveProfile').addEventListener('click', () => {
    showToast('Perfil atualizado com sucesso!', 'success');
  });

  const navItems = container.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      if (nav === 'home') {
        currentView = 'home';
        window.history.pushState({}, '', '/buyer');
        renderBuyerPage(container);
      } else if (nav === 'coupons') {
        currentView = 'coupons';
        window.history.pushState({}, '', '/buyer/coupons');
        renderBuyerPage(container);
      }
    });
  });
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
        <p style="font-size:14px;color:#6B7280;margin-bottom:24px;">Valor: <strong style="color:#FFF;">${formatCurrency(product.discountPrice)}</strong></p>
        
        <div id="pixContainer" style="background:#111118; border:1px solid #1E1E2A; border-radius:16px; padding:24px; margin-bottom:24px;">
          <div style="margin-bottom:16px;color:#00E5A0;">
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
    const pixData = await createPixPayment(product, 'LNK' + Math.floor(Math.random() * 9999), currentUser);
    
    const pixContainer = container.querySelector('#pixContainer');
    if (!pixContainer) return; // user navigated away

    pixContainer.innerHTML = `
      <div style="background:#FFF; padding:12px; border-radius:12px; display:inline-block; margin-bottom:16px;">
        ${pixData.qrCodeSVG}
      </div>
      <p style="font-size:12px; color:#6B7280; margin-bottom:16px;">Código expira em 10 minutos</p>
      <button class="btn-outline" style="width:100%; border-color:#00E5A0; color:#00E5A0;" id="btnCopyPix">
        Copiar código Pix
      </button>
    `;

    document.getElementById('btnCopyPix').addEventListener('click', () => {
      navigator.clipboard.writeText(pixData.qrCodeString).catch(() => {});
      showToast('Código Pix copiado!', 'success');
    });

    // Start polling
    let attempts = 0;
    paymentPollInterval = setInterval(async () => {
      attempts++;
      const statusData = await checkPaymentStatus(pixData.id);
      
      // Since it's a mock simulation, checkPaymentStatus will return {status: 'paid'}
      if (statusData && statusData.status === 'paid' && attempts > 1) { // wait a bit to simulate real polling
        clearInterval(paymentPollInterval);
        
        showToast('Pagamento Aprovado! Cupom gerado.', 'success');
        
        // Add to local mock coupons to show in UI
        coupons.unshift({
          code: pixData.couponCode,
          productId: product.id,
          product: product.title,
          seller: product.seller.name,
          status: 'active',
          createdAt: new Date().toLocaleString(),
          validUntil: 'Hoje'
        });

        setTimeout(() => {
          currentView = 'coupons';
          window.history.pushState({}, '', '/buyer/coupons');
          renderBuyerPage(container);
        }, 1500);
      }
    }, 2000);

  } catch (err) {
    const pixContainer = container.querySelector('#pixContainer');
    if (pixContainer) {
      pixContainer.innerHTML = `<p style="color:#E24B4A;">Erro ao gerar Pix. Tente novamente.</p>`;
    }
  }
}
