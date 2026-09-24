import {
  requestPasswordReset,
  signInUser,
  signUpUser,
  updateUserPassword,
} from '../services/auth-service.js';
import { icons, renderBrandLogo } from '../main.js';
import { getAllowedSignupDomains } from '../services/institution-service.js';
import { bindPhoneFormatting } from '../utils/phone.js';

const PASSWORD_RECOVERY_KEY = 'empreende_password_recovery_active';

let isLoginMode = true;
let isResetRequestMode = false;
let selectedRole = 'buyer';
let lastIntent = '';
// E-mail domains accepted at sign-up (null until loaded, [] when unknown).
let allowedSignupDomains = null;
let allowedDomainsRequest = null;

function getEmailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  return at > -1 ? String(email).slice(at).trim().toLowerCase() : '';
}

function describeAllowedDomains() {
  if (!allowedSignupDomains?.length) return 'Use seu e-mail institucional do iCEV.';
  return `Use seu e-mail institucional do iCEV (${allowedSignupDomains.join(' ou ')}).`;
}

/** Loads the accepted domains once and refreshes the hint without re-rendering the form. */
function ensureAllowedSignupDomains() {
  if (allowedSignupDomains || allowedDomainsRequest) return;
  allowedDomainsRequest = getAllowedSignupDomains().then((domains) => {
    allowedSignupDomains = domains;
    const hint = document.getElementById('authEmailHint');
    if (hint) hint.textContent = describeAllowedDomains();
    const input = document.getElementById('authEmail');
    if (input && domains.length) input.placeholder = `voce${domains[0]}`;
  });
}

function readAuthParams() {
  const raw = window.location.hash.startsWith('#/auth') ? window.location.hash.split('?')[1] || '' : '';
  return new URLSearchParams(raw.split('#')[0]);
}

function hasPasswordRecoveryIntent() {
  const params = readAuthParams();
  return params.get('reset') === '1'
    || params.get('type') === 'recovery'
    || sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === '1';
}

function syncIntentFromUrl() {
  const params = readAuthParams();
  if (hasPasswordRecoveryIntent()) {
    isLoginMode = true;
    isResetRequestMode = false;
    return;
  }

  if (params.get('confirmed') === '1') {
    isLoginMode = true;
    selectedRole = params.get('role') === 'seller' ? 'seller' : 'buyer';
    isResetRequestMode = false;
    return;
  }

  const intent = params.get('role') || params.get('intent') || '';
  if (intent && intent !== lastIntent) {
    lastIntent = intent;
    if (intent === 'seller' || intent === 'signup') {
      selectedRole = intent === 'seller' ? 'seller' : 'buyer';
      isLoginMode = false;
      isResetRequestMode = false;
    }
  }
}

function showAuthMessage(text, type = 'error') {
  const errorBox = document.getElementById('authError');
  if (!errorBox) return;
  errorBox.textContent = text;
  errorBox.className = `auth-error visible ${type}`;
}

function setLoading(button, isLoading, text) {
  button.disabled = isLoading;
  button.innerHTML = isLoading ? '<span class="spinner" aria-hidden="true"></span> Aguarde…' : text;
}

function isEmailRateLimitError(text = '') {
  const normalized = text.toLowerCase();
  return normalized.includes('limite temporário')
    || normalized.includes('muitas tentativas')
    || normalized.includes('rate limit');
}

function startRetryCooldown(button, defaultText, seconds = 60) {
  if (!button) return;
  let remaining = seconds;

  const tick = () => {
    button.disabled = true;
    button.textContent = `Tente novamente em ${remaining}s`;
    remaining -= 1;

    if (remaining < 0) {
      clearInterval(timer);
      button.disabled = false;
      button.textContent = defaultText;
    }
  };

  tick();
  const timer = setInterval(tick, 1000);
}

function getAuthMode() {
  if (hasPasswordRecoveryIntent()) return 'recovery';
  if (isResetRequestMode) return 'forgot';
  return isLoginMode ? 'login' : 'signup';
}

function getTitle(mode) {
  if (mode === 'recovery') return 'Crie uma nova senha';
  if (mode === 'forgot') return 'Redefinir senha';
  if (isLoginMode) return 'Bem-vindo de volta';
  return selectedRole === 'seller' ? 'Cadastre sua empresa' : 'Crie sua conta de aluno';
}

function getSubtitle(mode) {
  if (mode === 'recovery') return 'Crie uma nova senha para voltar ao seu fluxo.';
  if (mode === 'forgot') return 'Informe seu e-mail e enviaremos um link seguro.';
  if (isLoginMode) return 'Entre com seu e-mail do iCEV para pegar cupons das empresas dos colegas.';
  return selectedRole === 'seller'
    ? 'Divulgue cupons da sua empresa para os alunos do iCEV. Os pedidos chegam no seu WhatsApp.'
    : 'Pegue cupons das empresas dos colegas e compre direto com elas.';
}

function renderModeSwitch(mode) {
  if (mode === 'recovery' || mode === 'forgot') return '';
  return `
    <div class="auth-mode-switch" role="tablist" aria-label="Modo de acesso">
      <button type="button" class="${isLoginMode ? 'active' : ''}" id="authModeLogin">Entrar</button>
      <button type="button" class="${!isLoginMode ? 'active' : ''}" id="authModeSignup">Criar conta</button>
    </div>
  `;
}

function renderSignupFields() {
  if (isLoginMode) return '';
  return `
    <div class="auth-form-group">
      <label for="authName">Nome completo</label>
      <input type="text" id="authName" class="auth-input" placeholder="Seu nome" autocomplete="name" />
    </div>

    <div class="auth-form-group">
      <span class="auth-label">Como você vai usar o Empreende iCEV?</span>
      <div class="auth-role-grid">
        <button type="button" class="auth-role-btn ${selectedRole === 'buyer' ? 'active' : ''}" data-role="buyer" aria-pressed="${selectedRole === 'buyer'}">
          <strong>Quero pegar cupons</strong>
          <span>Descontos das empresas dos colegas.</span>
        </button>
        <button type="button" class="auth-role-btn ${selectedRole === 'seller' ? 'active' : ''}" data-role="seller" aria-pressed="${selectedRole === 'seller'}">
          <strong>Tenho uma empresa</strong>
          <span>Divulgue cupons e receba pedidos no WhatsApp.</span>
        </button>
      </div>
    </div>

    ${selectedRole === 'seller' ? `
      <div class="auth-form-group">
        <label for="authWhatsapp">WhatsApp da empresa</label>
        <input type="tel" id="authWhatsapp" class="auth-input" placeholder="(86) 99900-1122" autocomplete="tel" inputmode="tel" aria-describedby="authWhatsappHint" />
        <p class="auth-field-hint" id="authWhatsappHint">Os alunos chamam a empresa por aqui para comprar.</p>
      </div>
    ` : ''}
  `;
}

function renderAuthForm(mode) {
  if (mode === 'recovery') {
    return `
      <form class="auth-form" id="authForm">
        <div id="authError" class="auth-error" role="alert" aria-live="polite"></div>
        <div class="auth-form-group">
          <label for="authPassword">Nova senha</label>
          <input type="password" id="authPassword" class="auth-input" placeholder="Mínimo de 6 caracteres" autocomplete="new-password" />
        </div>
        <div class="auth-form-group">
          <label for="authPasswordConfirm">Confirmar nova senha</label>
          <input type="password" id="authPasswordConfirm" class="auth-input" placeholder="Digite novamente" autocomplete="new-password" />
        </div>
        <button id="btnSubmitAuth" class="auth-btn" type="submit">Salvar nova senha</button>
      </form>
      <div class="auth-switch">
        Lembrou a senha? <button type="button" class="auth-link" id="btnBackToLogin">Voltar para o login</button>
      </div>
    `;
  }

  if (mode === 'forgot') {
    return `
      <form class="auth-form" id="authForm">
        <div id="authError" class="auth-error" role="alert" aria-live="polite"></div>
        <div class="auth-reset-note">
          Enviaremos um link de redefinição para o e-mail da sua conta Empreende iCEV.
        </div>
        <div class="auth-form-group">
          <label for="authEmail">E-mail</label>
          <input type="email" id="authEmail" class="auth-input" placeholder="voce@somosicev.com" autocomplete="email" />
        </div>
        <button id="btnSubmitAuth" class="auth-btn" type="submit">Enviar link</button>
      </form>
      <div class="auth-switch">
        Já tem acesso? <button type="button" class="auth-link" id="btnBackToLogin">Entrar</button>
      </div>
    `;
  }

  return `
    <form class="auth-form" id="authForm">
      <div id="authError" class="auth-error" role="alert" aria-live="polite"></div>
      ${renderSignupFields()}

      <div class="auth-form-group">
        <label for="authEmail">${isLoginMode ? 'E-mail' : 'E-mail institucional'}</label>
        <input type="email" id="authEmail" class="auth-input" placeholder="voce${allowedSignupDomains?.[0] || '@somosicev.com'}" autocomplete="email"${isLoginMode ? '' : ' aria-describedby="authEmailHint"'} />
        ${isLoginMode ? '' : `<p class="auth-field-hint" id="authEmailHint">${describeAllowedDomains()}</p>`}
      </div>

      <div class="auth-form-group">
        <label for="authPassword">Senha</label>
        <input type="password" id="authPassword" class="auth-input" placeholder="Mínimo de 6 caracteres" autocomplete="${isLoginMode ? 'current-password' : 'new-password'}" />
      </div>

      ${isLoginMode ? `
        <button type="button" class="auth-inline-action" id="btnForgotPassword">Esqueci minha senha</button>
      ` : ''}

      <button id="btnSubmitAuth" class="auth-btn" type="submit">
        ${isLoginMode ? 'Entrar' : selectedRole === 'seller' ? 'Cadastrar empresa' : 'Criar conta'}
      </button>
    </form>
  `;
}

function bindEnterSubmit() {
  let enterSubmitQueued = false;
  const submitAuthFromEnter = (event) => {
    const isEnterKey = event.key === 'Enter'
      || event.key === 'NumpadEnter'
      || event.code === 'Enter'
      || event.code === 'NumpadEnter'
      || event.keyCode === 13;

    if (!isEnterKey || event.isComposing) return;
    event.preventDefault();
    if (enterSubmitQueued || document.getElementById('btnSubmitAuth')?.disabled) return;
    enterSubmitQueued = true;
    document.getElementById('authForm')?.requestSubmit();
    window.setTimeout(() => {
      enterSubmitQueued = false;
    }, 300);
  };

  bindPhoneFormatting(document.getElementById('authWhatsapp'));

  document.querySelectorAll('#authEmail, #authPassword, #authPasswordConfirm, #authName, #authWhatsapp').forEach((input) => {
    ['keydown', 'keypress', 'keyup'].forEach((eventName) => {
      input.addEventListener(eventName, submitAuthFromEnter);
    });
  });
}

export function renderAuth(container) {
  syncIntentFromUrl();
  const mode = getAuthMode();
  const authParams = readAuthParams();
  const subtitle = getSubtitle(mode);

  container.innerHTML = `
    <div class="page auth-wrapper">
      <aside class="auth-aside" aria-hidden="true">
        ${renderBrandLogo('wordmark-white', 'auth-aside-logo')}
        <p class="auth-aside-title">Conexões que geram <span class="hl">negócios</span>.</p>
        <div class="auth-ticket">
          <div class="auth-ticket-main">
            <span class="auth-ticket-eyebrow">Cupom Empreende iCEV</span>
            <strong>Brownie com nozes</strong>
            <span class="auth-ticket-price">R$ 9,00 <s>R$ 12,00</s></span>
          </div>
          <div class="auth-ticket-stub">
            <span class="auth-ticket-code">K7QM-4TXP</span>
          </div>
        </div>
        <p class="auth-aside-note">Empresas de alunos do iCEV. Você pega o código aqui e compra direto com elas.</p>
      </aside>

      <main class="auth-main">
        <div class="auth-card">
          <div class="auth-header canopy">
            <button type="button" class="auth-back-home" id="btnBackHome">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Voltar para a vitrine
            </button>
            ${renderBrandLogo('wordmark-on-dark', 'brand-logo auth-logo')}
            <h1 class="auth-title">${getTitle(mode)}</h1>
            <p class="auth-subtitle">${subtitle}</p>
          </div>

          ${renderModeSwitch(mode)}
          ${renderAuthForm(mode)}
        </div>
      </main>
    </div>
  `;

  document.getElementById('authModeLogin')?.addEventListener('click', () => {
    isLoginMode = true;
    isResetRequestMode = false;
    renderAuth(container);
  });

  document.getElementById('authModeSignup')?.addEventListener('click', () => {
    isLoginMode = false;
    isResetRequestMode = false;
    renderAuth(container);
  });

  document.getElementById('btnForgotPassword')?.addEventListener('click', () => {
    isLoginMode = true;
    isResetRequestMode = true;
    renderAuth(container);
  });

  document.getElementById('btnBackToLogin')?.addEventListener('click', () => {
    sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
    isLoginMode = true;
    isResetRequestMode = false;
    if (window.location.hash.startsWith('#/auth?reset=1')) {
      window.location.hash = '#/auth';
      return;
    }
    renderAuth(container);
  });

  document.querySelectorAll('[data-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRole = btn.dataset.role;
      renderAuth(container);
    });
  });

  document.getElementById('btnBackHome')?.addEventListener('click', () => {
    window.location.hash = '#/';
  });

  if (authParams.get('confirmed') === '1') {
    const confirmedRole = authParams.get('role') === 'seller' ? 'seller' : 'buyer';
    showAuthMessage(confirmedRole === 'seller'
      ? 'E-mail confirmado. Entre para abrir o painel da sua empresa.'
      : 'E-mail confirmado. Entre para pegar seus cupons.', 'success');
  }

  bindEnterSubmit();
  if (!isLoginMode) ensureAllowedSignupDomains();

  document.getElementById('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitAuth');

    if (mode === 'forgot') {
      const email = document.getElementById('authEmail').value.trim();
      const defaultText = 'Enviar link de redefinição';
      if (!email) {
        showAuthMessage('Informe o e-mail da sua conta.');
        return;
      }

      setLoading(btn, true, defaultText);
      document.getElementById('authError').classList.remove('visible', 'success');
      const res = await requestPasswordReset(email);
      if (!res.success) {
        showAuthMessage(res.error || 'Não foi possível enviar o link agora.');
        setLoading(btn, false, defaultText);
        return;
      }

      showAuthMessage('Link enviado. Abra seu e-mail para criar uma nova senha.', 'success');
      setLoading(btn, false, defaultText);
      return;
    }

    if (mode === 'recovery') {
      const password = document.getElementById('authPassword').value;
      const confirmation = document.getElementById('authPasswordConfirm').value;
      const defaultText = 'Salvar nova senha';
      if (!password || !confirmation) {
        showAuthMessage('Preencha e confirme a nova senha.');
        return;
      }

      if (password.length < 6) {
        showAuthMessage('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }

      if (password !== confirmation) {
        showAuthMessage('As senhas não conferem.');
        return;
      }

      setLoading(btn, true, defaultText);
      document.getElementById('authError').classList.remove('visible', 'success');
      const res = await updateUserPassword(password);
      if (!res.success) {
        showAuthMessage(res.error || 'Não foi possível salvar a nova senha.');
        setLoading(btn, false, defaultText);
        return;
      }

      sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
      showAuthMessage('Senha atualizada. Você ja pode entrar com a nova senha.', 'success');
      setLoading(btn, false, defaultText);
      window.setTimeout(() => {
        window.location.hash = '#/auth';
      }, 900);
      return;
    }

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const defaultText = isLoginMode ? 'Entrar' : selectedRole === 'seller' ? 'Cadastrar empresa' : 'Criar conta';

    if (!email || !password) {
      showAuthMessage('Preencha e-mail e senha.');
      return;
    }

    if (password.length < 6) {
      showAuthMessage('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(btn, true, defaultText);
    document.getElementById('authError').classList.remove('visible', 'success');

    if (isLoginMode) {
      const res = await signInUser(email, password);
      if (res.success) {
        window.location.hash = res.homePath || '#/buyer';
        return;
      }

      showAuthMessage(res.error || 'Não foi possível entrar. Verifique os dados.');
      setLoading(btn, false, defaultText);
      return;
    }

    // The database rejects other domains too; checking here explains why before submitting.
    if (allowedSignupDomains?.length && !allowedSignupDomains.includes(getEmailDomain(email))) {
      showAuthMessage(describeAllowedDomains());
      setLoading(btn, false, defaultText);
      document.getElementById('authEmail')?.focus();
      return;
    }

    const name = document.getElementById('authName').value.trim();
    const whatsapp = document.getElementById('authWhatsapp')?.value.trim() || '';
    if (!name) {
      showAuthMessage('Preencha seu nome.');
      setLoading(btn, false, defaultText);
      return;
    }

    if (selectedRole === 'seller' && !whatsapp) {
      showAuthMessage('Informe o WhatsApp da empresa: é por ele que os alunos vão comprar.');
      setLoading(btn, false, defaultText);
      return;
    }

    const res = await signUpUser(email, password, name, selectedRole, { whatsapp });
    if (!res.success) {
      const message = res.error || 'Não foi possível criar a conta.';
      showAuthMessage(message);
      setLoading(btn, false, defaultText);
      if (isEmailRateLimitError(message)) {
        startRetryCooldown(btn, defaultText, 60);
      }
      return;
    }

    if (res.needsEmailConfirmation) {
      showAuthMessage('Conta criada. Confirme seu e-mail e depois faca login.', 'success');
      setLoading(btn, false, defaultText);
      return;
    }

    showAuthMessage(selectedRole === 'seller'
      ? 'Conta criada. Abrindo seu painel de vendas...'
      : 'Conta criada. Abrindo marketplace...', 'success');

    setTimeout(() => {
      window.location.hash = res.homePath || (selectedRole === 'seller' ? '#/seller' : '#/buyer');
    }, 500);
  });
}
