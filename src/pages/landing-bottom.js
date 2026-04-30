import { landingIcons as ico, checkSvg, plansData, whoImages } from './landing-data.js';

function planCard(p, period) {
  const priceHTML = p.price
    ? `<div class="lk-plan-card__price"><span>R$ </span>${p.price}<span>/${period === 'monthly' ? 'mês' : 'mês'}</span></div>`
    : `<div class="lk-plan-card__price" style="font-size:1.5rem;">Sob consulta</div>`;
  return `
    <div class="lk-plan-card ${p.featured ? 'lk-plan-card--featured' : ''} lk-reveal">
      ${p.featured ? '<div class="lk-plan-card__badge">Mais popular</div>' : ''}
      <div class="lk-plan-card__name">${p.name}</div>
      ${priceHTML}
      <div class="lk-plan-card__desc">${p.desc}</div>
      <ul class="lk-plan-card__features">
        ${p.features.map(f => `<li>${checkSvg} ${f}</li>`).join('')}
      </ul>
      <button class="lk-btn-primary ${p.ctaClass || ''} lk-plan-card__btn" aria-label="${p.cta}">${p.cta}</button>
    </div>`;
}

export function getBottomHTML() {
  return `
    <!-- CASE STUDIES (WHO) -->
    <section class="lk-section" id="para-quem">
      <div class="lk-section__header">
        <div class="lk-section__tag">Uma plataforma, quatro histórias.</div>
        <h2 class="lk-section__title">Feito para estudantes reais.</h2>
      </div>
      <div class="lk-cases">
        <div class="lk-case-card lk-reveal">
          <div class="lk-case-card__img" style="background-image: url('${whoImages.seller}')"></div>
          <div class="lk-case-card__content">
            <div class="lk-case-card__tag">Aluno Vendedor</div>
            <p>"Finalmente tenho uma vitrine que a faculdade aprova e que os colegas confiam."</p>
          </div>
        </div>
        <div class="lk-case-card lk-reveal">
          <div class="lk-case-card__img" style="background-image: url('${whoImages.buyer}')"></div>
          <div class="lk-case-card__content">
            <div class="lk-case-card__tag">Aluno Comprador</div>
            <p>"Encontro tudo em um só lugar, com desconto e sem precisar ficar perguntando em grupo."</p>
          </div>
        </div>
        <div class="lk-case-card lk-reveal">
          <div class="lk-case-card__img" style="background-image: url('${whoImages.admin}')"></div>
          <div class="lk-case-card__content">
            <div class="lk-case-card__tag">Coordenador</div>
            <p>"Agora consigo moderar o que circula e gerar relatórios de empreendedorismo real."</p>
          </div>
        </div>
        <div class="lk-case-card lk-reveal">
          <div class="lk-case-card__img" style="background-image: url('${whoImages.inst}')"></div>
          <div class="lk-case-card__content">
            <div class="lk-case-card__tag">Instituição</div>
            <p>"Dados reais de empreendedorismo discente para nossos relatórios de impacto."</p>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES BENTO (2-column grid) -->
    <section class="lk-section lk-section--dark" id="funcionalidades">
      <div class="lk-section__header lk-section__header--center">
        <div class="lk-section__tag">Tudo que uma vitrine séria precisa.</div>
        <h2 class="lk-section__title">Recursos projetados para conversão.</h2>
      </div>
      <div class="lk-features-grid">
        <div class="lk-feat lk-reveal">
          <div class="lk-feat__icon">${ico.store}</div>
          <div class="lk-feat__title">Vitrine Digital</div>
          <div class="lk-feat__desc">Catálogo organizado por categorias.</div>
        </div>
        <div class="lk-feat lk-reveal">
          <div class="lk-feat__icon">${ico.ticket}</div>
          <div class="lk-feat__title">Cupons Únicos</div>
          <div class="lk-feat__desc">Códigos rastreáveis com validade.</div>
        </div>
        <div class="lk-feat lk-reveal">
          <div class="lk-feat__icon">${ico.wa}</div>
          <div class="lk-feat__title">WhatsApp Auto</div>
          <div class="lk-feat__desc">Mensagem pronta com código.</div>
        </div>
        <div class="lk-feat lk-reveal">
          <div class="lk-feat__icon">${ico.shield}</div>
          <div class="lk-feat__title">Moderação</div>
          <div class="lk-feat__desc">Aprovação de anúncios via admin.</div>
        </div>
        <div class="lk-feat lk-reveal">
          <div class="lk-feat__icon">${ico.chart}</div>
          <div class="lk-feat__title">Dashboard</div>
          <div class="lk-feat__desc">Métricas de impacto em tempo real.</div>
        </div>
        <div class="lk-feat lk-reveal">
          <div class="lk-feat__icon">${ico.phone}</div>
          <div class="lk-feat__title">PWA Nativo</div>
          <div class="lk-feat__desc">Instalação direta pelo navegador.</div>
        </div>
      </div>
    </section>

    <!-- PRICING CAROUSEL -->
    <section class="lk-section" id="planos">
      <div class="lk-section__header lk-section__header--center">
        <div class="lk-section__tag">Escolha o plano ideal</div>
        <h2 class="lk-section__title">Planos flexíveis para sua instituição</h2>
      </div>
      <div class="lk-plans-carousel" id="lk-plans-carousel">
        ${plansData.monthly.map(p => planCard(p, 'monthly')).join('')}
      </div>
    </section>

    <!-- CTA FINAL -->
    <section class="lk-cta-final" id="contato">
      <div class="lk-cta-final__bg"></div>
      <div class="lk-cta-final__content">
        <h2>Pronto para transformar sua instituição?</h2>
        <p>Agende uma demonstração gratuita e veja como a Linka pode impulsionar o empreendedorismo dos seus alunos.</p>
        <form class="lk-cta-form" id="lk-cta-form" aria-label="Formulário de contato">
          <div class="lk-form-group">
            <input type="text" placeholder="Seu nome" required />
          </div>
          <div class="lk-form-group">
            <input type="email" placeholder="E-mail profissional" required />
          </div>
          <div class="lk-form-group">
            <input type="text" placeholder="Instituição de ensino" required />
          </div>
          <button type="submit" class="lk-btn-primary lk-btn-primary--full lk-btn-primary--large">AGENDAR DEMONSTRAÇÃO</button>
        </form>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="lk-footer">
      <div class="lk-footer__content">
        <div class="lk-footer__brand">
          <div class="lk-footer__logo">Link<span>a</span></div>
          <p>O marketplace estudantil inteligente.</p>
        </div>
        <div class="lk-footer__nav">
          <div class="lk-footer__col">
            <h5>Produto</h5>
            <a href="#fluxo">Como funciona</a>
            <a href="#planos">Planos</a>
          </div>
          <div class="lk-footer__col">
            <h5>Legal</h5>
            <a href="#">Privacidade</a>
            <a href="#">Termos</a>
          </div>
        </div>
        <div class="lk-footer__social">
          <a href="#" aria-label="Instagram">${ico.ig}</a>
          <a href="#" aria-label="LinkedIn">${ico.li}</a>
          <a href="#" aria-label="X / Twitter">${ico.tw}</a>
        </div>
      </div>
      <div class="lk-footer__bottom">
        <p>&copy; 2026 Linka. Todos os direitos reservados.</p>
      </div>
    </footer>
  `;
}
