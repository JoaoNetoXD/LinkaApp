# Deploy real no Netlify + Supabase + Mercado Pago

Este projeto nao precisa de dominio comprado para funcionar. O subdominio gratuito do Netlify, como `https://seu-app.netlify.app`, ja serve para frontend, API, webhook e OAuth do Mercado Pago.

## 1. Banco Supabase

No Supabase, abra o SQL Editor e rode:

```text
scripts/seller-mp-migration.sql
```

Essa migration cria as tabelas privadas para conexao Mercado Pago dos vendedores e garante comissao Linka 0%.

Se voce ja criou um usuario admin e ele continua entrando como comprador, rode tambem:

```text
scripts/admin-role-fix.sql
```

Depois substitua `SEU_EMAIL_AQUI` no bloco comentado desse arquivo e execute o bloco para promover seu usuario real a admin.

## 2. Deploy no Netlify

Use deploy conectado ao repositorio GitHub ou Netlify CLI. Nao use apenas drag-and-drop da pasta `dist`, porque o app precisa das Netlify Functions em `netlify/functions`.

Build settings:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

## 3. Variaveis de ambiente no Netlify

Depois que o site existir no Netlify, configure em Site configuration > Environment variables:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

MP_ACCESS_TOKEN=APP_USR-seu-access-token-de-producao
MP_CLIENT_ID=seu-app-id-mercado-pago
MP_CLIENT_SECRET=seu-client-secret-mercado-pago

FRONTEND_URL=https://seu-site.netlify.app
```

Nao coloque `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN` ou `MP_CLIENT_SECRET` em variaveis `VITE_`. Tudo que comeca com `VITE_` vai para o navegador.

`WEBHOOK_URL` e `MP_REDIRECT_URI` sao derivados automaticamente de `FRONTEND_URL`, mas voce pode cadastrar manualmente se quiser:

```env
WEBHOOK_URL=https://seu-site.netlify.app/api/webhook
MP_REDIRECT_URI=https://seu-site.netlify.app/api/mercadopago/oauth/callback
```

## 4. Mercado Pago

No painel da sua aplicacao Mercado Pago, cadastre:

```text
Redirect URI: https://seu-site.netlify.app/api/mercadopago/oauth/callback
Webhook URL: https://seu-site.netlify.app/api/webhook
Evento: payments / payment
```

Use as credenciais de producao da sua conta Mercado Pago nas variaveis `MP_ACCESS_TOKEN`, `MP_CLIENT_ID` e `MP_CLIENT_SECRET`.

## 5. Teste final

Abra:

```text
https://seu-site.netlify.app/api/health
```

O ideal e retornar:

```json
{
  "readyForProduction": true,
  "missingProductionConfig": []
}
```

Depois teste o fluxo real:

1. Login como vendedor.
2. Abrir painel do vendedor.
3. Clicar em conectar Mercado Pago.
4. Autorizar a conta.
5. Criar produto.
6. Login como comprador.
7. Comprar via Pix ou Checkout.
8. Confirmar que o pagamento caiu direto na conta Mercado Pago do vendedor.
