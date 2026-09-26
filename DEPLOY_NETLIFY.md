# Deploy no Netlify + Supabase — Empreende iCEV

Fase atual: a plataforma só divulga cupons. O aluno pega o código no app e compra direto com a empresa, sem pagamento dentro do app. O mesmo deploy responde no endereço do Netlify (`https://linka-app.netlify.app`) e no subdomínio do iCEV (veja "Endereço do iCEV" abaixo).

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
FRONTEND_URL=https://linka-app.netlify.app
ALLOWED_ORIGINS=https://<sub>,https://linka-app.netlify.app
PAYMENTS_ENABLED=false
```

`VITE_APP_URL` fica vazio até o subdomínio ter HTTPS: sem ele, os links dos e-mails voltam para o endereço que a pessoa está usando. Nunca coloque o endereço antigo nele.

Não coloque `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_`: tudo que começa com `VITE_` vai para o navegador. Com `PAYMENTS_ENABLED=false`, as rotas de pagamento respondem 410 e as chaves do Mercado Pago não são necessárias.

## 4. Supabase Auth

Em Authentication > URL Configuration:

```text
Site URL: https://linka-app.netlify.app  (troque para https://<sub> só depois do HTTPS do subdomínio)
Redirect URLs:
https://<sub>/**
https://linka-app.netlify.app/**
http://localhost:5173/**
http://127.0.0.1:5173/**
```

Em Authentication > Email Templates, use os modelos de `SUPABASE_AUTH_EMAILS.md`.

### Endereço do iCEV (subdomínio)

O site vai morar num subdomínio do iCEV (ex.: `empreende.somosicev.com`). Não renomeie o site no Netlify: o endereço `linka-app.netlify.app` continua sendo o destino técnico do subdomínio e o link antigo que os alunos já têm. Depois da troca, ele só redireciona para o endereço novo.

Faça nesta ordem. Onde está `<sub>`, use o subdomínio completo (ex.: `empreende.somosicev.com`).

1. **Combine com a TI o método**: um registro DNS apontando o nome inteiro para o Netlify. Nada de "redirecionamento", "encaminhamento com máscara", iframe, proxy ou caminho (`icev.edu.br/empreende`): o site bloqueia ser aberto dentro de outra página e usa caminhos absolutos (`/api`, `/assets`).
2. **Netlify > Environment variables**: `ALLOWED_ORIGINS=https://<sub>,https://linka-app.netlify.app` (escopo que inclua Functions) e faça um deploy. A API passa a aceitar os dois endereços.
3. **Supabase > Authentication > URL Configuration > Redirect URLs**: adicione `https://<sub>/**` e mantenha `https://linka-app.netlify.app/**`, `http://localhost:5173/**` e `http://127.0.0.1:5173/**`. Não troque a Site URL ainda.
4. **Netlify > Domain management > Add a domain you already own**: digite `<sub>`. Ele vira o domínio principal na hora. Abra "Pending DNS verification" e mande para a TI exatamente os registros que o Netlify mostrar.
5. **A TI**, no DNS do domínio (hoje `somosicev.com` fica no GoDaddy e `icev.edu.br` no Linode):
   - apaga todos os registros com esse nome exato (A, AAAA, CNAME, MX, TXT);
   - cria `<nome>  CNAME  linka-app.netlify.app` (TTL 300), mais o TXT de verificação, se o Netlify pedir;
   - se não der para usar CNAME: um único registro A para `75.2.60.5` (balanceador do Netlify), sem AAAA. **Nunca** o IP que `linka-app.netlify.app` mostra hoje: ele muda;
   - não adiciona registro CAA nem proxy/CDN na frente;
   - se houver DNS interno no campus, cria o mesmo registro lá, e libera `*.netlify.app` e `*.supabase.co` no filtro de rede.
6. **Confira** (cmd ou Git Bash): `nslookup -type=CNAME <sub> 8.8.8.8` mostra `linka-app.netlify.app`; `curl.exe -s https://<sub>/api/health` responde `"status":"ok"` e `"requestHost":"<sub>"`. Em Domain management > HTTPS, espere o certificado (minutos, às vezes horas; use "Verify DNS configuration"). Só divulgue quando o cadeado aparecer.
7. **Com o HTTPS funcionando**: em Environment variables, `VITE_APP_URL=https://<sub>` (opcional, põe o endereço novo nos e-mails de todo mundo) e Deploys > Trigger deploy > Clear cache and deploy site.
8. **Supabase > Site URL** = `https://<sub>`. Teste um cadastro e um "Esqueci minha senha": o botão do e-mail deve abrir `https://<sub>/#/auth?...`.
9. **Teste no 4G e no Wi-Fi do campus**: cadastro, confirmação, nova senha, pegar cupom, cadastrar empresa, editar e renovar oferta.
10. **Redirecione o endereço antigo**: em `netlify.toml`, logo depois do bloco `/api/*` e antes de `/assets/*`:

    ```toml
    [[redirects]]
      from = "https://linka-app.netlify.app/*"
      to = "https://<sub>/:splat"
      status = 302
      force = true
    ```

    Depois, `FRONTEND_URL=https://<sub>` no Netlify e novo deploy. Troque 302 por 301 depois de uma semana sem problemas.
11. **Avise os alunos**: endereço novo, entrar de novo (a sessão é por endereço) e, quem instalou o app, remover e instalar de novo a partir do endereço novo.

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
