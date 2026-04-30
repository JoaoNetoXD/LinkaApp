import { signInUser, signUpUser } from '../services/auth-service.js';
import { icons } from '../main.js';

let isLoginMode = true;

export function renderAuth(container) {
  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-header">
        <div class="auth-logo">Link<span>a</span></div>
        <p class="auth-subtitle">${isLoginMode ? 'Bem-vindo de volta!' : 'Crie sua conta para acessar'}</p>
      </div>

      <div class="auth-form">
        <div id="authError" class="auth-error"></div>

        ${!isLoginMode ? `
          <div class="auth-form-group">
            <label for="authName">Nome Completo</label>
            <input type="text" id="authName" class="auth-input" placeholder="Seu nome" />
          </div>
        ` : ''}

        <div class="auth-form-group">
          <label for="authEmail">E-mail Universitário (ou Pessoal)</label>
          <input type="email" id="authEmail" class="auth-input" placeholder="exemplo@email.com" />
        </div>

        <div class="auth-form-group">
          <label for="authPassword">Senha</label>
          <input type="password" id="authPassword" class="auth-input" placeholder="••••••••" />
        </div>

        <button id="btnSubmitAuth" class="auth-btn">
          ${isLoginMode ? 'Entrar na Plataforma' : 'Criar minha conta'}
        </button>
      </div>

      <div class="auth-switch">
        ${isLoginMode 
          ? `Não tem uma conta? <span id="btnSwitchMode">Cadastre-se</span>` 
          : `Já tem uma conta? <span id="btnSwitchMode">Fazer Login</span>`
        }
      </div>
    </div>
  `;

  document.getElementById('btnSwitchMode').addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    renderAuth(container);
  });

  document.getElementById('btnSubmitAuth').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorBox = document.getElementById('authError');
    const btn = document.getElementById('btnSubmitAuth');

    if (!email || !password) {
      errorBox.textContent = 'Preencha todos os campos.';
      errorBox.classList.add('visible');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `${icons.loader || '...'} Aguarde...`;
    errorBox.classList.remove('visible');

    if (isLoginMode) {
      const res = await signInUser(email, password);
      if (res.success) {
        // App logic in main.js handles state change
        window.location.hash = '#/buyer';
      } else {
        errorBox.textContent = res.error || 'Erro ao fazer login. Verifique suas credenciais.';
        errorBox.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = 'Entrar na Plataforma';
      }
    } else {
      const name = document.getElementById('authName').value.trim();
      if (!name) {
        errorBox.textContent = 'Preencha seu nome.';
        errorBox.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = 'Criar minha conta';
        return;
      }
      
      const res = await signUpUser(email, password, name);
      if (res.success) {
        // Automatically redirects or shows success
        errorBox.textContent = 'Conta criada! Confirme seu e-mail se necessário.';
        errorBox.classList.add('visible');
        errorBox.style.background = 'rgba(0, 229, 160, 0.1)';
        errorBox.style.color = '#00E5A0';
        errorBox.style.borderColor = '#00E5A0';
        
        setTimeout(() => {
          window.location.hash = '#/buyer';
        }, 1500);
      } else {
        errorBox.textContent = res.error || 'Erro ao criar conta.';
        errorBox.classList.add('visible');
        btn.disabled = false;
        btn.innerHTML = 'Criar minha conta';
      }
    }
  });
}
