# Empreende iCEV

**Conexões que geram negócios.**

Aplicação web progressiva (PWA) desenvolvida como projeto da disciplina **Estágio Curricular Supervisionado – Fábrica de Software I** (Engenharia de Software – 6º Período, iCEV). O sistema centraliza ofertas com cupons de desconto criadas por empresas de estudantes do iCEV, com cadastro restrito ao domínio institucional (`@somosicev.com`), moderação prévia pela equipe administrativa e validação simples de códigos pelo empreendedor.

Ambiente publicado: https://empreende.somosicev.com

## Equipe

- **João Paes de Castro Neto** — Scrum Master e Desenvolvedor Full-Stack
- **Alessandri Castro** — Product Owner
- **Antônio Lucas** — Desenvolvedor Front-End (UI/UX e Vitrine)
- **Caio Nunes** — Desenvolvedor Front-End (Painéis e Autenticação)
- **Davi Queiroz** — Desenvolvedor Back-End e Banco de Dados
- **José Rodrigues Neto** — Analista de Qualidade (QA) e Documentação

## Funcionalidades principais

- **Acesso institucional:** cadastro e login restritos a e-mails `@somosicev.com` com perfis de aluno (`buyer`), empresa (`seller`), administrador (`admin`) e superadministrador (`superadmin`).
- **Vitrine de ofertas:** busca textual, filtragem por categorias com ofertas ativas, cards com percentual de desconto, galeria de fotos em tela cheia e compartilhamento direto por link.
- **Cupons rastreáveis:** retirada atômica via função RPC `claim_coupon` no PostgreSQL (1 cupom por conta/lote, código único no formato `XXXX-XXXX`), carteira pessoal do aluno e atalho direto para o WhatsApp da empresa.
- **Painel da empresa:** cadastro, edição, renovação e exclusão lógica de ofertas, escolha de prazo opcional em horas, acompanhamento de cliques/retiradas e validador de cupons.
- **Painel administrativo:** fila de moderação com aprovação (mantendo, alterando ou removendo o prazo), rejeição com motivo, gestão de categorias e limites de cupons (`max_slots`) e relatórios institucionais.
- **Notificações no app:** sino com contador de avisos não lidos para alunos, empresas e administradores, disparado por gatilhos no banco.

## Tecnologias utilizadas

- **Front-end:** Vite 8, JavaScript modular (ES Modules), CSS modular e PWA (`manifest.json` + Service Worker).
- **Back-end:** Node.js + Express 5 (`server.js`), empacotado via `serverless-http` como Netlify Function (`netlify/functions/api.js`).
- **Banco de dados e autenticação:** Supabase (PostgreSQL com Row Level Security, Triggers, RPCs, Storage e `pg_cron`).
- **Testes:** Node.js Test Runner (`node --test`) e PGlite (`@electric-sql/pglite`) para validação local do schema SQL e políticas de segurança.

## Estrutura do projeto

```text
├── index.html                  # Entrada da SPA e meta tags PWA
├── server.js                   # API Express (rotas de empresa, admin, superadmin e health)
├── supabase_schema.sql         # Schema inicial do PostgreSQL, funções e RLS
├── netlify.toml                # Configuração de build, redirects e funções
├── netlify/functions/api.js    # Adapter serverless do Express
├── public/                     # Manifest PWA, Service Worker e marca Empreende iCEV
├── scripts/                    # Migrações SQL idempotentes e utilitários de verificação
├── src/
│   ├── main.js                 # Roteador por hash, proteção de rotas e tour inicial
│   ├── pages/                  # Telas: auth.js, buyer.js, seller.js, admin.js
│   ├── services/               # Comunicação com Supabase e API (/api/*)
│   ├── styles/                 # Tokens e folhas de estilo modulares por área
│   └── utils/                  # Utilitários puros (cupom, preço, telefone, navegação, galeria)
└── tests/                      # Testes unitários, de segurança e suíte SQL com PGlite
```

## Como executar localmente

Pré-requisitos: Node.js 20+ e npm.

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie o arquivo de exemplo de variáveis de ambiente e preencha conforme necessário:
   ```bash
   cp .env.example .env
   ```
3. Inicie o ambiente de desenvolvimento (Vite + servidor Express):
   ```bash
   npm run dev
   ```
   Sem acesso ao Supabase configurado, o front-end carrega automaticamente dados de demonstração em modo de desenvolvimento.

## Testes e verificação

```bash
npm test              # Testes unitários, de segurança e integração SQL (PGlite)
npm run test:sql      # Executa apenas a suíte SQL de integridade e RLS
npm run build         # Gera o bundle de produção em dist/
npm run verify        # Validação completa: config, testes, SQL, sintaxe, build e audit
```
