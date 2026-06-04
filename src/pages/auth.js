import {
  requestPasswordReset,
  signInUser,
  signUpUser,
  updateUserPassword,
} from '../services/auth-service.js';
import { icons } from '../main.js';

const PASSWORD_RECOVERY_KEY = 'linka_password_recovery_active';

let isLoginMode = true;
let isResetRequestMode = false;
let selectedRole = 'buyer';
let lastIntent = '';

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
    if (intent === 'seller') {
      selectedRole = 'seller';
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
  button.innerHTML = isLoading ? `${icons.loader || ''} Aguarde...` : text;
}

function isEmailRateLimitError(text = '') {
  const normalized = text.toLowerCase();
  return normalized.includes('limite temporario')
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

function getSubtitle(mode) {
  if (mode === 'recovery') return 'Crie uma nova senha para voltar ao seu fluxo.';
  if (mode === 'forgot') return 'Informe seu e-mail e enviaremos um link seguro.';
  if (isLoginMode) return 'Entre para continuar usando o Linka.';
  return selectedRole === 'seller'
    ? 'Crie sua conta de vendedor e publique seu primeiro produto.'
    : 'Crie sua conta para comprar com cupom e acompanhar pedidos.';
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
      <label>Como voce vai usar o Linka?</label>
      <div class="auth-role-grid">
        <button type="button" class="auth-role-btn ${selectedRole === 'buyer' ? 'active' : ''}" data-role="buyer">
          <strong>Comprar</strong>
          <span>Ver ofertas, pagar e receber cupons.</span>
        </button>
        <button type="button" class="auth-role-btn ${selectedRole === 'seller' ? 'active' : ''}" data-role="seller">
          <strong>Vender</strong>
          <span>Cadastrar produtos e receber no Mercado Pago.</span>
        </button>
      </div>
    </div>

    ${selectedRole === 'seller' ? `
      <div class="auth-form-group">
        <label for="authWhatsapp">WhatsApp do vendedor</label>
        <input type="tel" id="authWhatsapp" class="auth-input" placeholder="(86) 99900-1122" autocomplete="tel" />
      </div>
    ` : ''}
  `;
}

function renderAuthForm(mode) {
  if (mode === 'recovery') {
    return `
      <form class="auth-form" id="authForm">
        <div id="authError" class="auth-error"></div>
        <div class="auth-form-group">
          <label for="authPassword">Nova senha</label>
          <input type="password" id="authPassword" class="auth-input" placeholder="Minimo 6 caracteres" autocomplete="new-password" />
        </div>
        <div class="auth-form-group">
          <label for="authPasswordConfirm">Confirmar nova senha</label>
          <input type="password" id="authPasswordConfirm" class="auth-input" placeholder="Digite novamente" autocomplete="new-password" />
        </div>
        <button id="btnSubmitAuth" class="auth-btn" type="submit">Salvar nova senha</button>
      </form>
      <div class="auth-switch">
        Lembrou a senha? <span id="btnBackToLogin">Voltar ao login</span>
      </div>
    `;
  }

  if (mode === 'forgot') {
    return `
      <form class="auth-form" id="authForm">
        <div id="authError" class="auth-error"></div>
        <div class="auth-reset-note">
          Enviaremos um link de redefinicao para o e-mail da sua conta Linka.
        </div>
        <div class="auth-form-group">
          <label for="authEmail">E-mail</label>
          <input type="email" id="authEmail" class="auth-input" placeholder="seu@email.com" autocomplete="email" />
        </div>
        <button id="btnSubmitAuth" class="auth-btn" type="submit">Enviar link de redefinicao</button>
      </form>
      <div class="auth-switch">
        Ja tem acesso? <span id="btnBackToLogin">Fazer login</span>
      </div>
    `;
  }

  return `
    <form class="auth-form" id="authForm">
      <div id="authError" class="auth-error"></div>
      ${renderSignupFields()}

      <div class="auth-form-group">
        <label for="authEmail">E-mail</label>
        <input type="email" id="authEmail" class="auth-input" placeholder="seu@email.com" autocomplete="email" />
      </div>

      <div class="auth-form-group">
        <label for="authPassword">Senha</label>
        <input type="password" id="authPassword" class="auth-input" placeholder="Minimo 6 caracteres" autocomplete="${isLoginMode ? 'current-password' : 'new-password'}" />
      </div>

      ${isLoginMode ? `
        <button type="button" class="auth-inline-action" id="btnForgotPassword">Esqueci minha senha</button>
      ` : ''}

      <button id="btnSubmitAuth" class="auth-btn" type="submit">
        ${isLoginMode ? 'Entrar' : selectedRole === 'seller' ? 'Criar conta de vendedor' : 'Criar conta de comprador'}
      </button>
    </form>

    <div class="auth-switch">
      ${isLoginMode
        ? `Ainda nao tem conta? <span id="btnSwitchMode">Cadastre-se</span>`
        : `Ja tem conta? <span id="btnSwitchMode">Fazer login</span>`
      }
    </div>
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
    <div class="auth-wrapper">
      <div class="auth-header">
        <div class="auth-logo">Link<span>a</span></div>
        <p class="auth-subtitle">${subtitle}</p>
        <button type="button" class="auth-back-home" id="btnBackHome">${icons.home || ''} Voltar ao inicio</button>
      </div>

      ${renderModeSwitch(mode)}
      ${renderAuthForm(mode)}
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

  document.getElementById('btnSwitchMode')?.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
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
      ? 'E-mail confirmado. Entre para abrir seu painel de vendedor.'
      : 'E-mail confirmado. Entre para acessar suas ofertas e cupons.', 'success');
  }

  bindEnterSubmit();

  document.getElementById('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = document.getElementById('btnSubmitAuth');

    if (mode === 'forgot') {
      const email = document.getElementById('authEmail').value.trim();
      const defaultText = 'Enviar link de redefinicao';
      if (!email) {
        showAuthMessage('Informe o e-mail da sua conta.');
        return;
      }

      setLoading(btn, true, defaultText);
      document.getElementById('authError').classList.remove('visible', 'success');
      const res = await requestPasswordReset(email);
      if (!res.success) {
        showAuthMessage(res.error || 'Nao foi possivel enviar o link agora.');
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
        showAuthMessage('As senhas nao conferem.');
        return;
      }

      setLoading(btn, true, defaultText);
      document.getElementById('authError').classList.remove('visible', 'success');
      const res = await updateUserPassword(password);
      if (!res.success) {
        showAuthMessage(res.error || 'Nao foi possivel salvar a nova senha.');
        setLoading(btn, false, defaultText);
        return;
      }

      sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
      showAuthMessage('Senha atualizada. Voce ja pode entrar com a nova senha.', 'success');
      setLoading(btn, false, defaultText);
      window.setTimeout(() => {
        window.location.hash = '#/auth';
      }, 900);
      return;
    }

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const defaultText = isLoginMode ? 'Entrar' : selectedRole === 'seller' ? 'Criar conta de vendedor' : 'Criar conta de comprador';

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

      showAuthMessage(res.error || 'Nao foi possivel entrar. Verifique os dados.');
      setLoading(btn, false, defaultText);
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
      showAuthMessage('Informe um WhatsApp para seus compradores falarem com voce.');
      setLoading(btn, false, defaultText);
      return;
    }

    const res = await signUpUser(email, password, name, selectedRole, { whatsapp });
    if (!res.success) {
      const message = res.error || 'Nao foi possivel criar a conta.';
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
