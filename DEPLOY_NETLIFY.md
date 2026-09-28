# Deploy no Netlify + Supabase — Empreende iCEV

Fase atual: a plataforma só divulga cupons. O aluno pega o código no app e compra direto com a empresa, sem pagamento dentro do app. Endereço oficial: `https://empreende.somosicev.com` (veja "Endereço do iCEV" abaixo); o endereço do Netlify só redireciona para ele.

## 1. Banco Supabase

Abra o SQL Editor do Supabase.

**Antes de tudo, confira o domínio de e-mail dos alunos.** Depois da migração, só e-mails desse domínio conseguem criar conta.

O e-mail do iCEV é do Google Workspace em `somosicev.com`. O domínio antigo da semente, `@icev.edu.br`, não tem servidor de e-mail: ninguém conseguiria confirmar a conta com ele. Por isso a migração troca `@icev.edu.br` por `@somosicev.com` sozinha. Confirme com a coordenação se os alunos têm e-mail `@somosicev.com`. Para conferir o que está no banco:

```sql
select id, name, domain, settings->'extra_domains' as extra_domains from public.institutions;
```

Se os alunos usarem outro domínio, corrija depois da migração (ou pelo painel admin, em Configurações > Acesso):

```sql
update public.institutions set domain = '@dominio-dos-alunos.com.br' where name = 'iCEV';
-- Domínios adicionais (ex.: alunos e professores com domínios diferentes):
update public.institutions
set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{extra_domains}', '["@outro-dominio.com.br"]')
where name = 'iCEV';
```

Depois rode:

```text
scripts/coupon-claim-migration.sql
```

Ela cria a função de retirada de cupom (`claim_coupon`), trava o cadastro por e-mail institucional e garante que a quantidade de cupons baixe a cada retirada. É idempotente: pode rodar de novo sem problema. Pode rodar antes ou logo depois do deploy; enquanto ela não roda, o botão "Pegar cupom" avisa que a retirada ainda não está ativa.

Projeto novo do zero: rode `supabase_schema.sql`, depois `scripts/superadmin-migration.sql`, `scripts/security-hardening-migration.sql`, `scripts/product-images-storage-policies.sql` (depois de criar o bucket público `product-images` em Storage), `scripts/coupon-claim-migration.sql` e, por último, `scripts/profile-privacy-migration.sql`. A ordem importa: a penúltima redefine a regra das ofertas.

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
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
PAYMENTS_ENABLED=false
```

`FRONTEND_URL`, `VITE_APP_URL` e `ALLOWED_ORIGINS` podem ficar vazios: o Netlify informa o domínio principal (`https://empreende.somosicev.com`) em cada deploy, os links dos e-mails voltam para o endereço que a pessoa está usando e a API aceita chamadas do próprio endereço. Se preencher algum, use só o subdomínio; nunca um endereço antigo.

Não coloque `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_`: tudo que começa com `VITE_` vai para o navegador. Com `PAYMENTS_ENABLED=false`, as rotas de pagamento respondem 410 e as chaves do Mercado Pago não são necessárias.

## 4. Supabase Auth

Em Authentication > URL Configuration:

```text
Site URL: https://empreende.somosicev.com
Redirect URLs:
https://empreende.somosicev.com/**
https://empreende-icev.netlify.app/**
http://localhost:5173/**
http://127.0.0.1:5173/**
```

Em Authentication > Email Templates, use os modelos de `SUPABASE_AUTH_EMAILS.md`.

### Endereço do iCEV (subdomínio)

O site mora em **https://empreende.somosicev.com** desde 28/09/2026.

- **DNS** (feito pela TI, no GoDaddy de `somosicev.com`): `empreende  CNAME  empreende-icev.netlify.app`. O endereço do Netlify é o destino técnico desse registro: não renomeie o site no Netlify, ou o subdomínio para de funcionar. Se um dia não der para usar CNAME, o substituto é um único registro A para `75.2.60.5` (balanceador do Netlify), nunca o IP que o endereço do Netlify mostra.
- **Netlify > Domain management**: `empreende.somosicev.com` é o domínio principal; o certificado HTTPS (Let's Encrypt) é renovado sozinho, desde que o CNAME continue lá. Não adicione registro CAA nem proxy/CDN na frente.
- **Endereço antigo**: `netlify.toml` manda `empreende-icev.netlify.app` para o subdomínio (302), com o caminho e o `#/...` intactos; `/api/*` continua respondendo nos dois endereços. Depois de uma semana sem problemas, troque `status = 302` por `301`.
- **Conferir**: `curl.exe -s https://empreende.somosicev.com/api/health` responde `"status":"ok"` e `"requestHost":"empreende.somosicev.com"`.
- **Quem já usava o endereço antigo** entra de novo (a sessão fica guardada por endereço) e, se instalou o app, remove e instala de novo a partir do endereço novo.

## 5. Privacidade dos perfis (depois do deploy)

Com o site novo no ar, rode no SQL Editor:

```text
scripts/profile-privacy-migration.sql
```

Até aqui, qualquer pessoa com a chave pública do site conseguia ler o e-mail e o WhatsApp de todos os perfis. Depois dela, só as empresas continuam públicas (nome e WhatsApp, para os alunos chamarem). O perfil de um aluno só aparece para ele mesmo, para as empresas cujos cupons ele pegou e para os admins. O e-mail deixa de sair pela API.

Não rode antes do deploy: a versão antiga do site pede o e-mail dos perfis e a vitrine pararia de carregar.

Para conferir, abra sem login `https://seu-projeto.supabase.co/rest/v1/profiles?select=email&apikey=SUA_CHAVE_ANON`. O esperado é um erro `permission denied`.

## 6. Teste final

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
