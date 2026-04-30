import { landingIcons as ico, checkSvg, arrowRight, arrowDown, closeIcon, flowSteps } from './landing-data.js';

export function getTopHTML() {
  return `
    <!-- NAVBAR MOBILE-FIRST -->
    <nav class="lk-nav" id="lk-nav" aria-label="Navegação principal">
      <a href="#/" class="lk-nav__logo" aria-label="Linka - Página inicial">Link<span>a</span></a>
      <button class="lk-hamburger" id="lk-hamburger" aria-label="Abrir menu">
        <span></span><span></span><span></span>
      </button>
      <ul class="lk-nav__links">
        <li><a href="#problema">POR QUÊ</a></li>
        <li><a href="#fluxo">COMO FUNCIONA</a></li>
        <li><a href="#funcionalidades">RECURSOS</a></li>
        <li><a href="#planos">PLANOS</a></li>
      </ul>
      <a href="#/admin" class="lk-nav__cta" aria-label="Painel Admin">Painel Admin</a>
    </nav>

    <!-- MOBILE MENU -->
    <div class="lk-mobile-menu" id="lk-mobile-menu" aria-hidden="true">
      <button class="lk-mobile-menu__close" id="lk-mobile-close" aria-label="Fechar menu">${closeIcon}</button>
      <a href="#problema">Por quê</a>
      <a href="#fluxo">Como funciona</a>
      <a href="#funcionalidades">Recursos</a>
      <a href="#planos">Planos</a>
      <a href="#/admin" class="lk-btn-primary" style="margin-top:12px; display:block; text-align:center;">Painel Admin</a>
    </div>

    <!-- HERO -->
    <section class="lk-hero" id="lk-hero">
      <div class="lk-hero__content">
        <div class="lk-hero__inner">
          <div class="lk-hero__text">
            <h1 class="lk-hero__title">O marketplace que transforma alunos em <span class="lk-hero__hl">empreendedores de verdade.</span></h1>
            <p class="lk-hero__sub">Uma vitrine educacional com cupons rastreáveis, WhatsApp integrado e gestão institucional. O comércio estudantil sem burocracia.</p>
            <div class="lk-hero__btns">
              <a href="#contato" class="lk-btn-primary lk-btn-primary--large" aria-label="Quero Conhecer a Linka">Quero Conhecer ${arrowRight}</a>
            </div>
            
            <div class="lk-hero__portals" style="margin-top: 40px; display: flex; flex-direction: column; gap: 16px;">
              <span style="font-size: 0.875rem; color: var(--lk-text3); text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Já possui acesso? Entre aqui:</span>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <a href="#/buyer" class="lk-btn-ghost" style="flex: 1; min-width: 110px; font-size: 0.875rem; padding: 10px 16px;">🛍️ Comprar</a>
                <a href="#/seller" class="lk-btn-ghost" style="flex: 1; min-width: 110px; font-size: 0.875rem; padding: 10px 16px;">🏪 Vender</a>
                <a href="#/admin" class="lk-btn-ghost" style="flex: 1; min-width: 110px; font-size: 0.875rem; padding: 10px 16px;">🏛️ Painel</a>
              </div>
            </div>
          </div>
          <div class="lk-hero__visual">
             <!-- Animated Ecosystem visual -->
             <div class="lk-eco">
               <div class="lk-eco__ring lk-eco__ring--1"></div>
               <div class="lk-eco__ring lk-eco__ring--2"></div>
               
               <div class="lk-mockup-phone lk-eco__phone">
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
                 </div>
               </div>

               <div class="lk-eco__float lk-eco__float--1">${ico.store}</div>
               <div class="lk-eco__float lk-eco__float--2">${ico.wa}</div>
               <div class="lk-eco__float lk-eco__float--3">${ico.chart}</div>
             </div>
          </div>
        </div>
      </div>
    </section>

    <!-- PROBLEM SNAP CAROUSEL -->
    <section class="lk-section" id="problema">
      <div class="lk-section__header">
        <div class="lk-section__tag">Por que o comércio estudantil falha?</div>
        <h2 class="lk-section__title">Potencial perdido entre grupos e planilhas.</h2>
      </div>
      <div class="lk-snap-carousel" id="lk-problem-snap">
        <div class="lk-snap-card">
          <div class="lk-snap-icon">${ico.eye}</div>
          <h4>Falta de Visibilidade</h4>
          <p>Anúncios somem rapidamente em milhares de mensagens de grupos de WhatsApp.</p>
        </div>
        <div class="lk-snap-card">
          <div class="lk-snap-icon">${ico.gear}</div>
          <h4>Gestão Travada</h4>
          <p>Zero controle sobre as vendas e dificuldade em rastrear quem comprou o quê.</p>
        </div>
        <div class="lk-snap-card">
          <div class="lk-snap-icon">${ico.bridge}</div>
          <h4>Conexão Quebrada</h4>
          <p>Dificuldade de conectar compradores de outros cursos com os vendedores.</p>
        </div>
        <div class="lk-snap-card">
          <div class="lk-snap-icon">${ico.transaction}</div>
          <h4>Pagamentos Lentos</h4>
          <p>O fluxo de transação costuma ser improvisado e inseguro para ambos os lados.</p>
        </div>
      </div>
      <div class="lk-snap-dots" id="lk-problem-dots"></div>
    </section>

    <!-- SOLUTION TIMELINE -->
    <section class="lk-section lk-section--dark" id="fluxo">
      <div class="lk-section__header lk-section__header--center">
        <div class="lk-section__tag">Da ideia à venda em 6 minutos.</div>
        <h2 class="lk-section__title">Um ecossistema feito para crescer.</h2>
      </div>
      
      <div class="lk-timeline" id="lk-timeline">
        <div class="lk-timeline__line">
          <div class="lk-timeline__glow" id="lk-timeline-glow"></div>
        </div>
        ${flowSteps.map((s, i) => `
          <div class="lk-timeline__item lk-reveal">
            <div class="lk-timeline__point">
              <div class="lk-timeline__icon">${s.icon}</div>
            </div>
            <div class="lk-timeline__content">
              <h3>${s.title}</h3>
              <p>${s.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}
