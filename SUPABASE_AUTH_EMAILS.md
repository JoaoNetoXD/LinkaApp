# Supabase Auth - e-mails oficiais do Linka

Use este arquivo para configurar os e-mails oficiais do Linka no Supabase.

Painel Supabase:

```text
Authentication > Email Templates
```

Importante: mantenha `{{ .ConfirmationURL }}` nos botoes. Essa URL carrega o `redirectTo` enviado pelo app e evita que confirmacao ou reset de senha voltem para localhost.

## Confirm signup

Template:

```text
Authentication > Email Templates > Confirm signup
```

Assunto:

```text
Confirme sua conta no Linka
```

Corpo HTML:

```html
<div style="margin:0;padding:0;background:#0D0D12;color:#F0EEE8;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:28px;">
      <div style="width:42px;height:42px;border-radius:14px;background:#C8F135;color:#0D0D12;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;">L</div>
      <strong style="font-size:24px;color:#F0EEE8;">Linka</strong>
    </div>

    {{ if eq .Data.role "seller" }}
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;color:#F0EEE8;">Confirme sua conta de vendedor</h1>
      <p style="margin:0 0 22px;color:#B9B7C8;font-size:16px;line-height:1.55;">
        Ola, {{ .Data.full_name }}. Falta so confirmar seu e-mail para ativar sua loja no Linka, cadastrar produtos e receber pagamentos pelo seu Mercado Pago.
      </p>
    {{ else }}
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;color:#F0EEE8;">Confirme sua conta no Linka</h1>
      <p style="margin:0 0 22px;color:#B9B7C8;font-size:16px;line-height:1.55;">
        Ola, {{ .Data.full_name }}. Confirme seu e-mail para acessar ofertas, pagar com seguranca e acompanhar seus cupons.
      </p>
    {{ end }}

    <a href="{{ .ConfirmationURL }}"
       style="display:block;text-align:center;text-decoration:none;background:#C8F135;color:#0D0D12;border-radius:18px;padding:16px 20px;font-weight:800;font-size:16px;">
      Confirmar e abrir o Linka
    </a>

    <p style="margin:24px 0 0;color:#7A7A8A;font-size:13px;line-height:1.5;">
      Se voce nao criou uma conta no Linka, ignore este e-mail.
    </p>
  </div>
</div>
```

## Reset password

Template:

```text
Authentication > Email Templates > Reset password
```

Assunto:

```text
Redefina sua senha no Linka
```

Corpo HTML:

```html
<div style="margin:0;padding:0;background:#0D0D12;color:#F0EEE8;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:28px;">
      <div style="width:42px;height:42px;border-radius:14px;background:#C8F135;color:#0D0D12;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;">L</div>
      <strong style="font-size:24px;color:#F0EEE8;">Linka</strong>
    </div>

    {{ if eq .Data.role "seller" }}
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;color:#F0EEE8;">Redefina sua senha de vendedor</h1>
      <p style="margin:0 0 22px;color:#B9B7C8;font-size:16px;line-height:1.55;">
        Recebemos um pedido para redefinir a senha da sua conta de vendedor no Linka. Use o botao abaixo para criar uma nova senha com seguranca.
      </p>
    {{ else }}
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;color:#F0EEE8;">Redefina sua senha no Linka</h1>
      <p style="margin:0 0 22px;color:#B9B7C8;font-size:16px;line-height:1.55;">
        Recebemos um pedido para redefinir a senha da sua conta Linka. Use o botao abaixo para criar uma nova senha com seguranca.
      </p>
    {{ end }}

    <a href="{{ .ConfirmationURL }}"
       style="display:block;text-align:center;text-decoration:none;background:#C8F135;color:#0D0D12;border-radius:18px;padding:16px 20px;font-weight:800;font-size:16px;">
      Criar nova senha
    </a>

    <p style="margin:24px 0 0;color:#7A7A8A;font-size:13px;line-height:1.5;">
      Se voce nao pediu essa redefinicao, ignore este e-mail. Sua senha atual continua valida.
    </p>
  </div>
</div>
```

## URLs obrigatorias

Em `Authentication > URL Configuration`, configure:

```text
Site URL:
https://linka-app.netlify.app

Redirect URLs:
https://linka-app.netlify.app/**
http://localhost:5173/**
http://127.0.0.1:5173/**
```

O app envia estes redirects automaticamente:

```text
Confirmacao comprador:
https://linka-app.netlify.app/#/auth?confirmed=1&role=buyer&next=buyer

Confirmacao vendedor:
https://linka-app.netlify.app/#/auth?confirmed=1&role=seller&next=seller

Redefinicao de senha:
https://linka-app.netlify.app/#/auth?reset=1
```

## Aplicar automaticamente via API de gerenciamento

O plugin Supabase desta sessao permite consultar projeto, banco e docs, mas nao expoe uma ferramenta direta para alterar templates de Auth. Para aplicar por API, e necessario um `SUPABASE_ACCESS_TOKEN` da conta Supabase, diferente da service role key do banco.
