# Deploy no Netlify + Supabase — Empreende iCEV

Fase atual: a plataforma só divulga cupons. O aluno pega o código no app e compra direto com a empresa, sem pagamento dentro do app. O subdomínio gratuito do Netlify (`https://seu-app.netlify.app`) já serve para frontend e API.

## 1. Banco Supabase

Abra o SQL Editor do Supabase.

**Antes de tudo, confira o domínio de e-mail dos alunos.** Depois da migração, só e-mails desse domínio conseguem criar conta:

```sql
select id, name, domain, settings->'extra_domains' as extra_domains from public.institutions;
```

Se o domínio estiver errado, corrija (exemplo):

```sql
update public.institutions set domain = '@icev.edu.br' where name = 'iCEV';
-- Domínios adicionais (ex.: alunos e professores com domínios diferentes):
update public.institutions
set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{extra_domains}', '["@outro-dominio.edu.br"]')
where name = 'iCEV';
```

Depois rode:

```text
scripts/coupon-claim-migration.sql
```

Ela cria a função de retirada de cupom (`claim_coupon`), trava o cadastro por e-mail institucional e garante que a quantidade de cupons baixe a cada retirada. É idempotente: pode rodar de novo sem problema.

Projeto novo do zero: rode `supabase_schema.sql`, depois `scripts/superadmin-migration.sql`, `scripts/security-hardening-migration.sql`, `scripts/product-images-storage-policies.sql` (depois de criar o bucket público `product-images` em Storage) e, por último, `scripts/coupon-claim-migration.sql`. A ordem importa: a última redefine a regra das ofertas.

Para promover seu usuário a admin, use o bloco comentado de `scripts/admin-role-fix.sql` (troque `SEU_EMAIL_AQUI`).

## 2. Deploy no Netlify

Use deploy conectado ao repositório GitHub ou Netlify CLI. Não use só drag-and-drop da pasta `dist`, porque o app precisa das Netlify Functions em `netlify/functions`.

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

## 3. Variáveis de ambiente no Netlify

Em Site configuration > Environment variables:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
VITE_APP_URL=https://seu-site.netlify.app
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
FRONTEND_URL=https://seu-site.netlify.app
PAYMENTS_ENABLED=false
```

Não coloque `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_`: tudo que começa com `VITE_` vai para o navegador. Com `PAYMENTS_ENABLED=false`, as rotas de pagamento respondem 410 e as chaves do Mercado Pago não são necessárias.

## 4. Supabase Auth

Em Authentication > URL Configuration:

```text
Site URL: https://seu-site.netlify.app
Redirect URLs:
https://seu-site.netlify.app/**
http://localhost:5173/**
http://127.0.0.1:5173/**
```

Em Authentication > Email Templates, use os modelos de `SUPABASE_AUTH_EMAILS.md`.

### Endereço com o nome novo

Se o site ainda estiver com o endereço antigo no Netlify, renomeie em Site configuration > Site details > Change site name (por exemplo `empreende-icev`, se estiver livre). Depois atualize `VITE_APP_URL` e `FRONTEND_URL` no Netlify e a Site URL e as Redirect URLs no Supabase Auth, e faça um novo deploy. As prévias de link (WhatsApp, Instagram) e os e-mails passam a usar o endereço novo automaticamente.

## 5. Teste final

Abra `https://seu-site.netlify.app/api/health`. O esperado:

```json
{
  "readyForProduction": true,
  "schemaReady": true,
  "missingDatabaseObjects": [],
  "missingProductionConfig": [],
  "paymentsEnabled": false
}
```

Se aparecer `claim_coupon function` em `missingDatabaseObjects`, a migração do passo 1 não foi aplicada.

Fluxo completo para testar:

1. Criar uma conta com e-mail do iCEV escolhendo "Tenho uma empresa" e informando o WhatsApp.
2. Criar uma oferta no painel "Minha empresa".
3. Entrar como admin e aprovar a oferta.
4. Entrar com outra conta de aluno, abrir a oferta e tocar em "Pegar cupom".
5. Conferir que o código aparece em Cupons e que "Chamar a empresa no WhatsApp" abre a conversa certa.
6. Voltar como empresa, validar o código em Cupons e marcar como usado.
7. Tentar criar conta com um e-mail de fora do iCEV: o app deve explicar a regra e o banco deve recusar.

## Apêndice: religar pagamentos no futuro

O código do Mercado Pago (Pix, Checkout Pro, OAuth dos vendedores, webhook) continua no servidor. Para religar: defina `PAYMENTS_ENABLED=true`, configure `MP_ACCESS_TOKEN`, `MP_CLIENT_ID` e `MP_CLIENT_SECRET`, rode `scripts/seller-mp-migration.sql` e `scripts/mercadopago-pkce-migration.sql`, e cadastre no painel do Mercado Pago:

```text
Redirect URI: https://seu-site.netlify.app/api/mercadopago/oauth/callback
Webhook URL: https://seu-site.netlify.app/api/webhook
Evento: payments / payment
```

As telas de pagamento do app foram removidas nesta fase e precisariam voltar a partir do histórico do git.
