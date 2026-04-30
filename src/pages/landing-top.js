import { landingIcons as ico, checkSvg, arrowRight, arrowDown, closeIcon, getTrustLogos, flowSteps } from './landing-data.js';

export function getTopHTML() {
  return `
    <!-- NAVBAR -->
    <nav class="lk-nav" id="lk-nav" aria-label="Navegação principal">
      <a href="#/" class="lk-nav__logo" aria-label="Linka - Página inicial">Link<span>a</span></a>
      <ul class="lk-nav__links">
        <li><a href="#problema">PROBLEMA</a></li>
        <li><a href="#fluxo">FLUXO</a></li>
        <li><a href="#para-quem">PARA QUEM</a></li>
        <li><a href="#funcionalidades">RECURSOS</a></li>
        <li><a href="#planos">PLANOS</a></li>
      </ul>
      <a href="#/admin" class="lk-nav__cta" aria-label="Painel Admin">Painel Admin</a>
      <button class="lk-hamburger" id="lk-hamburger" aria-label="Abrir menu">
        <span></span><span></span><span></span>
      </button>
    </nav>

    <!-- MOBILE MENU -->
    <div class="lk-mobile-menu" id="lk-mobile-menu" aria-hidden="true">
      <button class="lk-mobile-menu__close" id="lk-mobile-close" aria-label="Fechar menu">${closeIcon}</button>
      <a href="#problema">Problema</a>
      <a href="#fluxo">Fluxo</a>
      <a href="#para-quem">Para quem</a>
      <a href="#funcionalidades">Recursos</a>
      <a href="#planos">Planos</a>
      <a href="#/admin" class="lk-btn-primary" style="margin-top:12px; display:block; text-align:center;">Painel Admin</a>
    </div>

    <!-- HERO -->
    <section class="lk-hero" id="lk-hero">
      <div class="lk-hero__grid"></div>
      <div class="lk-hero__content">
        <div class="lk-hero__inner">
          <div class="lk-hero__text">
            <div class="lk-hero__badge">
              <span class="lk-hero__badge-dot"></span>
              Vitrine Educacional Inteligente
            </div>
            <h1>O marketplace que transforma alunos em <em>empreendedores de verdade.</em></h1>
            <p class="lk-hero__sub">Vitrine aprovada pela instituição. Cupom rastreável. Venda pelo WhatsApp. Zero burocracia.</p>
            <div class="lk-hero__btns">
              <a href="#/buyer" class="lk-btn-primary" aria-label="Comprar Produtos">Sou Aluno (Comprar) ${arrowRight}</a>
              <a href="#/seller" class="lk-btn-outline" aria-label="Vender Produtos">Sou Empreendedor (Vender)</a>
            </div>
          </div>
          <div class="lk-hero__mockup">
            <div class="lk-mockup-phone">
              <div class="lk-mockup-notch"></div>
              <div class="lk-mockup-screen">
                <div class="lk-mock-hdr">
                  <div><div class="lk-mock-hdr__name">Olá, João</div><div class="lk-mock-hdr__inst">iCEV</div></div>
                  <div class="lk-mock-avatar">JP</div>
                </div>
                <div class="lk-mock-product">
                  <div class="lk-mock-product__img"></div>
                  <div class="lk-mock-product__name">Brownie Artesanal</div>
                  <div class="lk-mock-product__price">R$ 9,00</div>
                </div>
                <div class="lk-mock-coupon">
                  <div class="lk-mock-coupon__label">CUPOM GERADO</div>
                  <div class="lk-mock-coupon__code" id="lk-typewriter"></div>
                  <div class="lk-mock-coupon__info">Brownie Artesanal - R$ 9,00</div>
                  <div class="lk-mock-coupon__status"><span class="lk-mock-coupon__dot"></span> Ativo</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lk-scroll-hint" aria-hidden="true">
        <span>scroll</span>
        ${arrowDown}
      </div>
    </section>

    <!-- TRUST MARQUEE -->
    <section class="lk-trust" aria-label="Instituições parceiras">
      <div class="lk-trust__label">Pensado para instituições como</div>
      <div class="lk-trust__track" id="lk-marquee">${getTrustLogos()}</div>
    </section>

    <!-- PROBLEM -->
    <section class="lk-section" id="problema">
      <div class="lk-problem">
        <div class="lk-problem__text lk-section__header">
          <div class="lk-section__tag">o problema real</div>
          <h2 class="lk-section__title">Por que o comércio estudantil falha?</h2>
          <p class="lk-section__sub">Sem estrutura, o potencial empreendedor dos alunos se perde entre grupos de WhatsApp e planilhas.</p>
        </div>
        <div class="lk-problem__cards lk-stagger">
          <div class="lk-problem-card lk-problem-card--lg lk-reveal">
            <div class="lk-problem-card__icon">${ico.chat}</div>
            <div class="lk-problem-card__stat lk-countup" data-target="73">0%</div>
            <h4>Vendedores abandonam</h4>
            <p>73% dos vendedores desistem por falta de controle e visibilidade sobre suas vendas.</p>
          </div>
          <div class="lk-problem-card lk-reveal">
            <div class="lk-problem-card__icon lk-problem-card__icon--red">${ico.shield}</div>
            <div class="lk-problem-card__stat lk-countup" data-target="89">0%</div>
            <h4>Falta de credibilidade</h4>
            <p>Compradores não confiam em vendedores sem validação institucional.</p>
          </div>
          <div class="lk-problem-card lk-reveal">
            <div class="lk-problem-card__icon lk-problem-card__icon--amber">${ico.card}</div>
            <div class="lk-problem-card__stat lk-countup" data-target="61">0%</div>
            <h4>Burocracia financeira</h4>
            <p>Gateways são complexos e caros para quem está começando.</p>
          </div>
          <div class="lk-problem-card lk-reveal">
            <div class="lk-problem-card__icon lk-problem-card__icon--purple">${ico.chart}</div>
            <div class="lk-problem-card__stat lk-countup" data-target="94">0%</div>
            <h4>Sem dados para a gestão</h4>
            <p>Instituições não têm visibilidade sobre empreendedorismo interno.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- FLOW -->
    <section class="lk-section lk-section--full" id="fluxo" style="background:var(--lk-bg-alt);">
      <div style="max-width:var(--lk-max);margin:0 auto;">
        <div class="lk-section__header lk-section__header--center">
          <div class="lk-section__tag">fluxo simples</div>
          <h2 class="lk-section__title">Da ideia à venda em 6 minutos.</h2>
          <p class="lk-section__sub">Um processo claro e rastreável do cadastro ao registro da venda.</p>
        </div>
        <div class="lk-flow">
          <!-- Desktop timeline -->
          <div class="lk-flow__timeline" id="lk-flow-timeline">
            <div class="lk-flow__line"><div class="lk-flow__progress" id="lk-flow-progress"></div></div>
            <div class="lk-flow__nodes">
              ${flowSteps.map((s, i) => `
                <div class="lk-flow__node ${i === 0 ? 'active' : ''}" data-step="${i}" aria-label="${s.title}">
                  <div class="lk-flow__node-circle">${i + 1}</div>
                  <div class="lk-flow__node-label">${s.title}</div>
                </div>
              `).join('')}
            </div>
            <div class="lk-flow__preview" id="lk-flow-preview">
              <div class="lk-flow__preview-icon">${flowSteps[0].icon}</div>
              <div>
                <div class="lk-flow__preview-title">${flowSteps[0].title}</div>
                <div class="lk-flow__preview-desc">${flowSteps[0].desc}</div>
              </div>
            </div>
          </div>
          <!-- Mobile accordion -->
          <div class="lk-flow__accordion">
            ${flowSteps.map((s, i) => `
              <div class="lk-flow__acc-item ${i === 0 ? 'open' : ''}">
                <button class="lk-flow__acc-head" data-acc="${i}" aria-label="${s.title}">
                  <div class="lk-flow__acc-num">${i + 1}</div>
                  <div class="lk-flow__acc-title">${s.title}</div>
                </button>
                <div class="lk-flow__acc-body"><p>${s.desc}</p></div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </section>`;
}
