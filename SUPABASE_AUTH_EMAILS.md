# Supabase Auth - e-mails oficiais do Empreende iCEV

Use este arquivo para configurar os e-mails de autenticação no Supabase com a marca Empreende iCEV.

Painel Supabase:

```text
Authentication > Email Templates
```

Importante: mantenha `{{ .ConfirmationURL }}` nos botões. Essa URL carrega o `redirectTo` enviado pelo app e evita que a confirmação ou a redefinição de senha voltem para localhost.

A logo dos e-mails é um PNG (`/brand/logo-email.png`), porque a maioria dos clientes de e-mail bloqueia SVG. O endereço vem de `{{ .SiteURL }}`, a Site URL configurada no Supabase Auth.

## Confirm signup

Template:

```text
Authentication > Email Templates > Confirm signup
```

Assunto:

```text
Confirme sua conta no Empreende iCEV
```

Corpo HTML:

```html
<div style="margin:0;padding:0;background:#F3F4F8;color:#182A50;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E4E6EE;border-radius:16px;padding:28px 24px;">
      <img src="{{ .SiteURL }}/brand/logo-email.png" width="180" alt="Empreende iCEV" style="display:block;margin:0 0 24px;border:0;" />

      {{ if eq .Data.role "seller" }}
        <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#182A50;">Confirme o cadastro da sua empresa</h1>
        <p style="margin:0 0 22px;color:#465070;font-size:16px;line-height:1.55;">
          Olá, {{ .Data.full_name }}. Confirme seu e-mail para publicar cupons de desconto da sua empresa para os alunos do iCEV. Os pedidos chegam direto no seu WhatsApp.
        </p>
      {{ else }}
        <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#182A50;">Confirme sua conta de aluno</h1>
        <p style="margin:0 0 22px;color:#465070;font-size:16px;line-height:1.55;">
          Olá, {{ .Data.full_name }}. Confirme seu e-mail para pegar cupons das empresas dos colegas e comprar direto com elas.
        </p>
      {{ end }}

      <a href="{{ .ConfirmationURL }}"
         style="display:block;text-align:center;text-decoration:none;background:#C0176B;color:#FFFFFF;border-radius:12px;padding:15px 20px;font-weight:700;font-size:16px;">
        Confirmar e-mail
      </a>

      <p style="margin:24px 0 0;color:#6B7289;font-size:13px;line-height:1.5;">
        Se você não criou uma conta no Empreende iCEV, ignore este e-mail.
      </p>
    </div>
    <p style="margin:16px 0 0;text-align:center;color:#6B7289;font-size:12px;letter-spacing:0.14em;">CONEXÕES QUE GERAM NEGÓCIOS.</p>
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
Redefina sua senha do Empreende iCEV
```

Corpo HTML:

```html
<div style="margin:0;padding:0;background:#F3F4F8;color:#182A50;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#FFFFFF;border:1px solid #E4E6EE;border-radius:16px;padding:28px 24px;">
      <img src="{{ .SiteURL }}/brand/logo-email.png" width="180" alt="Empreende iCEV" style="display:block;margin:0 0 24px;border:0;" />

      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;color:#182A50;">Redefina sua senha</h1>
      <p style="margin:0 0 22px;color:#465070;font-size:16px;line-height:1.55;">
        Recebemos um pedido para redefinir a senha da sua conta. O link abaixo abre o app para você criar uma senha nova.
      </p>

      <a href="{{ .ConfirmationURL }}"
         style="display:block;text-align:center;text-decoration:none;background:#C0176B;color:#FFFFFF;border-radius:12px;padding:15px 20px;font-weight:700;font-size:16px;">
        Criar nova senha
      </a>

      <p style="margin:24px 0 0;color:#6B7289;font-size:13px;line-height:1.5;">
        Se você não pediu essa redefinição, ignore este e-mail. Sua senha atual continua valendo.
      </p>
    </div>
    <p style="margin:16px 0 0;text-align:center;color:#6B7289;font-size:12px;letter-spacing:0.14em;">CONEXÕES QUE GERAM NEGÓCIOS.</p>
  </div>
</div>
```

## URLs obrigatorias

Em `Authentication > URL Configuration`, configure:

```text
Site URL:
https://seu-site.netlify.app

Redirect URLs:
https://seu-site.netlify.app/**
http://localhost:5173/**
http://127.0.0.1:5173/**
```

O app envia estes redirects automaticamente:

```text
Confirmação de aluno:
https://seu-site.netlify.app/#/auth?confirmed=1&role=buyer&next=buyer

Confirmação de empresa:
https://seu-site.netlify.app/#/auth?confirmed=1&role=seller&next=seller

Redefinição de senha:
https://seu-site.netlify.app/#/auth?reset=1
```

## Aplicar automaticamente via API de gerenciamento

O plugin Supabase desta sessao permite consultar projeto, banco e docs, mas nao expoe uma ferramenta direta para alterar templates de Auth. Para aplicar por API, e necessario um `SUPABASE_ACCESS_TOKEN` da conta Supabase, diferente da service role key do banco.
