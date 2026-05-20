# LINKA - Status do Projeto

Marketplace institucional com fluxo real de compra, venda, aprovação e emissão de cupom.

## Estado Atual

- A rota inicial agora cai direto no fluxo funcional do comprador.
- A tela de divulgação/landing deixou de ser a entrada padrão e ficou acessível apenas em `#/landing`.
- O comprador entra direto na vitrine real do app.
- O pagamento usa Pix ou Checkout Pro via backend.
- O vendedor acessa apenas com perfil `seller`.
- O admin acessa apenas com perfil `admin`.
- Os mocks ficaram restritos ao modo DEV.
- O cliente Supabase falha explicitamente em produção se as variáveis obrigatórias não estiverem configuradas.
- A configuração agora pode ser verificada com `npm run check:config` e `npm run check:config:prod`.

## O Que Foi Reforçado

- Validação de rotas por perfil.
- Remoção de sucesso falso em serviços críticos.
- Backend com integração real de pagamento.
- Registro de intenção de pagamento calculado no servidor.
- Emissão idempotente de cupom no retorno do pagamento e no webhook.
- Schema com colunas, funções, triggers e políticas para o fluxo real.
- Cadastro com escolha de papel comprador/vendedor.
- Upload com erro real em produção quando o storage falha.
- Auditoria de dependências corrigida.

## Verificação Local

- `npm run build`: passou.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm run check:config`: passou para ambiente local.
- `npm run check:config:prod`: aponta somente as pendências externas.
- `node --check server.js`: passou.
- `http://localhost:5173/`: abre direto na vitrine funcional.
- `#/seller` e `#/admin` sem sessão: redirecionam para autenticação.
- Backend `GET /api/health`: saudável, com Mercado Pago e Supabase configurados.
- Alerta atual do ambiente local: `serviceRoleConfigured` e `webhookConfigured` estão `false`.

## O Que Ainda Falta Para Dizer "100%"

### Infraestrutura

- Publicar o backend em ambiente estável.
- Configurar `SUPABASE_SERVICE_ROLE_KEY` no servidor de produção.
- Configurar `WEBHOOK_URL` público do Mercado Pago.
- Garantir o bucket `product-images` no Supabase Storage.

### Operação

- Criar o primeiro usuário admin oficial.
- Definir o fluxo de promoção de seller/admin para produção.
- Validar política de expiração de anúncios e cupons em cron real.

### Dados e Segurança

- Aplicar `supabase_schema.sql` no projeto Supabase real.
- Revisar dados antigos do banco para evitar conflitos de índice.
- Confirmar que as policies do Supabase estão ativas no projeto real.
- Validar webhook do Mercado Pago com pagamento real aprovado.

### UX e QA

- Testar login, compra, aprovação, cupom e uso do cupom em navegador mobile real.
- Testar retorno do Checkout Pro após pagamento aprovado.
- Testar cenários de rede ruim, sessão expirada e upload falho.
- Fazer uma passada final de texto, espaçamento e estados vazios com dados reais.

## Resumo Honesto

O núcleo funcional já está muito mais próximo de produção. O que ainda impede chamar de "100%" não é a tela inicial nem o fluxo básico do app, e sim a validação final em ambiente real: secrets de produção, webhook público, schema aplicado no Supabase, primeiro admin e testes ponta a ponta com pagamento real.
