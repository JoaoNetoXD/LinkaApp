# Supabase Auth - e-mail de confirmação do Linka

Use este arquivo para configurar o e-mail oficial de confirmação no Supabase.

Painel Supabase:

```text
Authentication > Email Templates > Confirm signup
```

## Assunto

```text
Confirme sua conta no Linka
```

## Corpo HTML

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
        Olá, {{ .Data.full_name }}. Falta só confirmar seu e-mail para ativar sua loja no Linka, cadastrar produtos e receber pagamentos pelo seu Mercado Pago.
      </p>
    {{ else }}
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1;color:#F0EEE8;">Confirme sua conta no Linka</h1>
      <p style="margin:0 0 22px;color:#B9B7C8;font-size:16px;line-height:1.55;">
        Olá, {{ .Data.full_name }}. Confirme seu e-mail para acessar ofertas, pagar com segurança e acompanhar seus cupons.
      </p>
    {{ end }}

    <a href="{{ .ConfirmationURL }}"
       style="display:block;text-align:center;text-decoration:none;background:#C8F135;color:#0D0D12;border-radius:18px;padding:16px 20px;font-weight:800;font-size:16px;">
      Confirmar e abrir o Linka
    </a>

    <p style="margin:24px 0 0;color:#7A7A8A;font-size:13px;line-height:1.5;">
      Se você não criou uma conta no Linka, ignore este e-mail.
    </p>
  </div>
</div>
```

## URLs obrigatórias

Em `Authentication > URL Configuration`, configure:

```text
Site URL:
https://linka-app.netlify.app

Redirect URLs:
https://linka-app.netlify.app/**
http://localhost:5173/**
http://127.0.0.1:5173/**
```

O app agora envia `emailRedirectTo` automaticamente para:

```text
https://linka-app.netlify.app/#/auth?confirmed=1&role=buyer&next=buyer
https://linka-app.netlify.app/#/auth?confirmed=1&role=seller&next=seller
```

Depois da confirmação, se a sessão vier ativa do Supabase, o Linka redireciona para a área correta. Se a sessão não vier ativa, a tela de login mostra uma mensagem em português e mantém o fluxo correto.
