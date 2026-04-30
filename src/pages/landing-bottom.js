import { landingIcons as ico, checkSvg, plansData } from './landing-data.js';

function planCard(p, period) {
  const priceHTML = p.price
    ? `<div class="lk-plan__price"><span>R$ </span>${p.price}<span>/${period === 'monthly' ? 'mes' : 'mes'}</span></div>`
    : `<div class="lk-plan__price" style="font-size:1.5rem;">Sob consulta</div>`;
  return `
    <div class="lk-plan ${p.featured ? 'lk-plan--featured' : ''} lk-reveal">
      ${p.featured ? '<div class="lk-plan__popular">Mais popular</div>' : ''}
      <div class="lk-plan__name">${p.name}</div>
      ${priceHTML}
      <div class="lk-plan__desc">${p.desc}</div>
      <ul class="lk-plan__features">
        ${p.features.map(f => `<li>${checkSvg} ${f}</li>`).join('')}
      </ul>
      <button class="lk-plan__cta ${p.ctaClass}" aria-label="${p.cta}">${p.cta}</button>
      <div class="lk-plan__guarantee">${ico.lock} 14 dias de garantia</div>
    </div>`;
}

export function getBottomHTML() {
  return `
    <!-- FOR WHO -->
    <section class="lk-section" id="para-quem">
      <div class="lk-section__header lk-section__header--center">
        <div class="lk-section__tag">para quem</div>
        <h2 class="lk-section__title">Uma plataforma, quatro histórias.</h2>
        <p class="lk-section__sub">Cada perfil encontra na Linka exatamente o que precisa.</p>
      </div>
      <div class="lk-who__grid lk-stagger" id="lk-who-grid">
        <div class="lk-who-card lk-reveal">
          <div class="lk-who-card__avatar lk-who-card__avatar--seller">${ico.pkg}</div>
          <div class="lk-who-card__name">Aluno Vendedor</div>
          <div class="lk-who-card__quote">"Finalmente tenho uma vitrine que a faculdade aprova e que os colegas confiam."</div>
          <ul class="lk-who-card__benefits">
            <li>${checkSvg} Cadastro rápido de produtos</li>
            <li>${checkSvg} Cupons rastreáveis automáticos</li>
            <li>${checkSvg} Contato direto pelo WhatsApp</li>
          </ul>
        </div>
        <div class="lk-who-card lk-reveal">
          <div class="lk-who-card__avatar lk-who-card__avatar--buyer">${ico.user}</div>
          <div class="lk-who-card__name">Aluno Comprador</div>
          <div class="lk-who-card__quote">"Encontro tudo em um só lugar, com desconto e sem precisar ficar perguntando em grupo."</div>
          <ul class="lk-who-card__benefits">
            <li>${checkSvg} Vitrine organizada por categoria</li>
            <li>${checkSvg} Cupons exclusivos com desconto</li>
            <li>${checkSvg} Conversa direta com vendedor</li>
          </ul>
        </div>
        <div class="lk-who-card lk-reveal">
          <div class="lk-who-card__avatar lk-who-card__avatar--admin">${ico.shield}</div>
          <div class="lk-who-card__name">Coordenador / Admin</div>
          <div class="lk-who-card__quote">"Agora consigo moderar o que circula e gerar relatórios de empreendedorismo real."</div>
          <ul class="lk-who-card__benefits">
            <li>${checkSvg} Moderação de anúncios</li>
            <li>${checkSvg} Métricas de engajamento</li>
            <li>${checkSvg} Relatórios institucionais</li>
          </ul>
        </div>
        <div class="lk-who-card lk-reveal">
          <div class="lk-who-card__avatar lk-who-card__avatar--inst">${ico.store}</div>
          <div class="lk-who-card__name">Instituicao</div>
          <div class="lk-who-card__quote">"Dados reais de empreendedorismo discente para nossos relatórios de impacto."</div>
          <ul class="lk-who-card__benefits">
            <li>${checkSvg} Dashboard institucional</li>
            <li>${checkSvg} Evidencias de impacto</li>
            <li>${checkSvg} Relatorios em PDF</li>
          </ul>
        </div>
      </div>
      <div class="lk-who__dots" id="lk-who-dots"></div>
    </section>

    <!-- FEATURES BENTO -->
    <section class="lk-section lk-section--full" id="funcionalidades" style="background:var(--lk-bg-alt);">
      <div style="max-width:var(--lk-max);margin:0 auto;">
        <div class="lk-section__header lk-section__header--center">
          <div class="lk-section__tag">recursos</div>
          <h2 class="lk-section__title">Tudo que uma vitrine séria precisa.</h2>
          <p class="lk-section__sub">Funcionalidades pensadas para vendedores, compradores e gestores.</p>
        </div>
        <div class="lk-features__grid lk-stagger">
          <div class="lk-feat-card lk-feat-card--lg lk-reveal">
            <div class="lk-feat-card__icon">${ico.ticket}</div>
            <h4>Cupons únicos</h4>
            <p>Rastreáveis, vinculados ao perfil do aluno, com validade e uso único.</p>
            <div class="lk-feat-coupon-demo">
              <div class="lk-feat-coupon-gen">
                <span id="lk-feat-coupon-code">LNK-</span>
                <span class="lk-feat-coupon-gen__cursor"></span>
              </div>
            </div>
            <div class="lk-feat-card__easter">coupon.generate({ unique: true, track: true })</div>
          </div>
          <div class="lk-feat-card lk-reveal">
            <div class="lk-feat-card__icon">${ico.grid}</div>
            <h4>Vitrine por categoria</h4>
            <p>Anúncios organizados e fáceis de navegar.</p>
            <div class="lk-feat-card__easter">vitrine.filter({ category: 'lanches' })</div>
          </div>
          <div class="lk-feat-card lk-reveal">
            <div class="lk-feat-card__icon" style="background:rgba(37,211,102,0.1);color:#25D366;">${ico.wa}</div>
            <h4>WhatsApp automatico</h4>
            <p>Mensagem pronta com código do cupom.</p>
            <div class="lk-feat-card__easter">wa.send({ to: seller, coupon: code })</div>
          </div>
          <div class="lk-feat-card lk-reveal">
            <div class="lk-feat-card__icon" style="background:rgba(245,166,35,0.1);color:var(--lk-amber);">${ico.shield}</div>
            <h4>Moderação institucional</h4>
            <p>Aprovação obrigatória antes da publicação.</p>
            <div class="lk-feat-card__easter">admin.moderate({ autoReject: false })</div>
          </div>
          <div class="lk-feat-card lk-feat-card--md lk-reveal">
            <div class="lk-feat-card__icon" style="background:rgba(168,85,247,0.1);color:#a855f7;">${ico.chart}</div>
            <h4>Dashboard de impacto</h4>
            <p>Métricas de cliques, cupons gerados e taxa de conversão em tempo real.</p>
            <div class="lk-feat-card__easter">analytics.track({ event: 'coupon_used' })</div>
          </div>
          <div class="lk-feat-card lk-reveal">
            <div class="lk-feat-card__icon" style="background:rgba(239,68,68,0.1);color:#ef4444;">${ico.clock}</div>
            <h4>Fila por categoria</h4>
            <p>Vagas limitadas garantem rotatividade justa.</p>
            <div class="lk-feat-card__easter">queue.position({ fair: true })</div>
          </div>
          <div class="lk-feat-card lk-reveal">
            <div class="lk-feat-card__icon" style="background:rgba(59,130,246,0.1);color:#3b82f6;">${ico.file}</div>
            <h4>Relatorios em PDF</h4>
            <p>Exportação para apresentação institucional.</p>
            <div class="lk-feat-card__easter">report.export({ format: 'pdf' })</div>
          </div>
          <div class="lk-feat-card lk-reveal">
            <div class="lk-feat-card__icon" style="background:rgba(124,58,237,0.1);color:#7c3aed;">${ico.phone}</div>
            <h4>PWA instalável</h4>
            <p>Experiência de app nativo sem download.</p>
            <div class="lk-feat-card__easter">pwa.install({ prompt: true })</div>
          </div>
        </div>
      </div>
    </section>

    <!-- PLANS -->
    <section class="lk-section lk-section--full lk-plans-wrap" id="planos">
      <div style="max-width:var(--lk-max);margin:0 auto;">
        <div class="lk-section__header lk-section__header--center">
          <div class="lk-section__tag">planos</div>
          <h2 class="lk-section__title">Escolha o plano ideal para sua instituição</h2>
        </div>
        <div class="lk-plans__toggle">
          <span class="lk-plans__toggle-label active" id="lk-toggle-monthly">Mensal</span>
          <div class="lk-plans__toggle-switch" id="lk-toggle-switch" role="switch" aria-label="Alternar plano anual" tabindex="0"></div>
          <span class="lk-plans__toggle-label" id="lk-toggle-annual">Anual</span>
          <span class="lk-plans__save">-20%</span>
        </div>
        <div class="lk-plans__grid lk-stagger" id="lk-plans-grid">
          ${plansData.monthly.map(p => planCard(p, 'monthly')).join('')}
        </div>
      </div>
    </section>

    <!-- CTA FINAL -->
    <section class="lk-cta-final" id="contato">
      <div class="lk-cta-final__noise"></div>
      <div class="lk-cta-final__shapes">
        <div class="lk-cta-shape lk-cta-shape--1"></div>
        <div class="lk-cta-shape lk-cta-shape--2"></div>
        <div class="lk-cta-shape lk-cta-shape--3"></div>
        <div class="lk-cta-shape lk-cta-shape--4"></div>
      </div>
      <div class="lk-cta-final__content">
        <h2>Pronto para transformar sua instituição?</h2>
        <p>Mais de 500 alunos ja vendem com aprovacao institucional. Comece hoje.</p>
        <form class="lk-cta-form" id="lk-cta-form" aria-label="Formulário de contato">
          <input type="text" placeholder="Seu nome" aria-label="Nome" required />
          <input type="email" placeholder="Seu e-mail" aria-label="E-mail" required />
          <input type="text" placeholder="Nome da instituição" aria-label="Instituicao" style="grid-column:span 2;" />
          <button type="submit" class="lk-cta-form__submit lk-cta-form__submit">Solicitar demonstração</button>
        </form>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="lk-footer">
      <div class="lk-footer__content">
        <div class="lk-footer__brand">
          <div class="lk-footer__logo">Link<span>a</span></div>
          <div class="lk-footer__slogan">Conecta. Venda. Acontece.</div>
          <p>A vitrine digital que conecta quem vende e quem compra dentro de instituições de ensino.</p>
          <div class="lk-footer__social">
            <a href="#" aria-label="Instagram">${ico.ig}</a>
            <a href="#" aria-label="LinkedIn">${ico.li}</a>
            <a href="#" aria-label="X / Twitter">${ico.tw}</a>
          </div>
        </div>
        <div class="lk-footer__col">
          <h5>PRODUTO</h5>
          <a href="#fluxo">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#">Atualizações</a>
          <a href="#">Roadmap</a>
        </div>
        <div class="lk-footer__col">
          <h5>INSTITUCIONAL</h5>
          <a href="#">Sobre nos</a>
          <a href="#">Parceiros</a>
          <a href="#">Blog</a>
          <a href="#">Contato</a>
        </div>
        <div class="lk-footer__col">
          <h5>LEGAL</h5>
          <a href="#">Termos de uso</a>
          <a href="#">Privacidade</a>
          <a href="#">LGPD</a>
        </div>
      </div>
      <div class="lk-footer__bottom">
        <span>&copy; 2026 Linka. Todos os direitos reservados.</span>
        <div class="lk-footer__badges">
          <span class="lk-footer__badge">${ico.lock} SSL</span>
          <span class="lk-footer__badge">${ico.shield} LGPD</span>
        </div>
      </div>
    </footer>`;
}
