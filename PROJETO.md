# Empreende iCEV — Status do Projeto

**Conexões que geram negócios.** Vitrine de cupons de desconto das empresas criadas por alunos do iCEV.

## Como funciona (fase atual)

- Só alunos do iCEV participam: o cadastro exige e-mail institucional (domínio configurado na tabela `institutions`).
- Alunos com empresa ("Tenho uma empresa") publicam ofertas com cupom: preço, desconto, quantidade de cupons e validade.
- A equipe (admin) aprova cada oferta antes de ela aparecer na vitrine.
- O aluno cliente abre a oferta e toca em **Pegar cupom**: recebe um código único (ex.: `K7QM-4TXP`), guardado em Cupons.
- A compra acontece **fora da plataforma**, direto com a empresa (normalmente pelo WhatsApp). A empresa confere o código e marca como usado.
- Não há pagamento dentro do app. O código do Mercado Pago continua no servidor, desligado por `PAYMENTS_ENABLED=false`.

## Peças principais

- `scripts/coupon-claim-migration.sql`: retirada de cupom (`claim_coupon`), trava de cadastro por domínio, baixa da quantidade de cupons.
- `src/pages/buyer.js`: vitrine, detalhe da oferta, retirada do cupom, carteira de cupons, perfil.
- `src/pages/seller.js`: painel "Minha empresa" (ofertas, cupons retirados, validação de código).
- `src/pages/admin.js`: moderação de ofertas, categorias, relatórios, domínios de e-mail aceitos.
- `server.js` + `netlify/functions/api.js`: API (admin, empresa, saúde). Rotas de pagamento respondem 410.
- `DESIGN.md`: identidade visual e regras do sistema. `DEPLOY_NETLIFY.md`: passo a passo de publicação.

## Verificação local

```bash
npm test
```

```bash
npm run build
```

```bash
npm run check:config
```

Para ver as telas sem backend: `npm run dev` e, para capturas, `node scripts/dev-shot.mjs --path buyer --out vitrine.png` (veja `DESIGN.md`).

## Pendências para produção

1. Confirmar o domínio de e-mail dos alunos em `public.institutions` e rodar `scripts/coupon-claim-migration.sql` no Supabase de produção.
2. Atualizar os modelos de e-mail do Supabase com `SUPABASE_AUTH_EMAILS.md`.
3. Definir `PAYMENTS_ENABLED=false` no Netlify e publicar.
4. Rodar o teste de ponta a ponta do `DEPLOY_NETLIFY.md` com contas reais do iCEV.
5. Separar dados públicos de privados em `profiles`: hoje a policy de leitura expõe e-mail e WhatsApp de todos os perfis. O ideal é uma view pública só com nome e contato das empresas.
6. Renomear o site no Netlify para o nome novo e atualizar `VITE_APP_URL`, `FRONTEND_URL` e as URLs do Supabase Auth (passo a passo em `DEPLOY_NETLIFY.md`). O app não tem mais endereço fixo no código.
