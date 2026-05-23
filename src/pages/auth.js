import { signInUser, signUpUser } from '../services/auth-service.js';
import { icons } from '../main.js';

let isLoginMode = true;
let selectedRole = 'buyer';
let lastIntent = '';

function readAuthParams() {
  const raw = window.location.hash.startsWith('#/auth') ? window.location.hash.split('?')[1] || '' : '';
  return new URLSearchParams(raw);
}

function syncIntentFromUrl() {
  const params = readAuthParams();
  const intent = params.get('role') || params.get('intent') || '';
  if (intent && intent !== lastIntent) {
    lastIntent = intent;
    if (intent === 'seller') {
      selectedRole = 'seller';
      isLoginMode = false;
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

export function renderAuth(container) {
  syncIntentFromUrl();
  const subtitle = isLoginMode
    ? 'Entre e volte para o seu fluxo correto.'
    : selectedRole === 'seller'
      ? 'Crie sua conta de vendedor e publique seu primeiro produto.'
      : 'Crie sua conta para comprar com cupom e acompanhar pedidos.';

  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-header">
        <div class="auth-logo">Link<span>a</span></div>
        <p class="auth-subtitle">${subtitle}</p>
        <button type="button" class="auth-back-home" id="btnBackHome">${icons.home || ''} Voltar para home</button>
      </div>

      <div class="auth-mode-switch" role="tablist" aria-label="Modo de acesso">
        <button type="button" class="${isLoginMode ? 'active' : ''}" id="authModeLogin">Entrar</button>
        <button type="button" class="${!isLoginMode ? 'active' : ''}" id="authModeSignup">Criar conta</button>
      </div>

      <form class="auth-form" id="authForm">
        <div id="authError" class="auth-error"></div>

        ${!isLoginMode ? `
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
        ` : ''}

        <div class="auth-form-group">
          <label for="authEmail">E-mail</label>
          <input type="email" id="authEmail" class="auth-input" placeholder="voce@email.com" autocomplete="email" />
        </div>

        <div class="auth-form-group">
          <label for="authPassword">Senha</label>
          <input type="password" id="authPassword" class="auth-input" placeholder="Minimo 6 caracteres" autocomplete="${isLoginMode ? 'current-password' : 'new-password'}" />
        </div>

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
    </div>
  `;

  document.getElementById('authModeLogin').addEventListener('click', () => {
    isLoginMode = true;
    renderAuth(container);
  });

  document.getElementById('authModeSignup').addEventListener('click', () => {
    isLoginMode = false;
    renderAuth(container);
  });

  document.getElementById('btnSwitchMode').addEventListener('click', () => {
    isLoginMode = !isLoginMode;
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

  document.querySelectorAll('#authEmail, #authPassword, #authName, #authWhatsapp').forEach((input) => {
    ['keydown', 'keypress', 'keyup'].forEach((eventName) => {
      input.addEventListener(eventName, submitAuthFromEnter);
    });
  });

  document.getElementById('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('btnSubmitAuth');
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
      showAuthMessage(res.error || 'Nao foi possivel criar a conta.');
      setLoading(btn, false, defaultText);
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
