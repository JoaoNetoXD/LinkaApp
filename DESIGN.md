# Empreende iCEV · Sistema visual

Marca: **Empreende iCEV — Conexões que geram negócios.** Uma vitrine de cupons de desconto das empresas criadas por alunos do iCEV. O aluno pega o código no app e compra direto com a empresa. O cupom (picote, canhoto, código) é o motivo visual do produto; a rede de conexões e o "≡" do logotipo são os da marca.

## Regras de ouro

1. **Uma ação magenta por tela.** `btn-primary` (magenta `--brand`) só na ação principal. O resto é `btn-secondary`, `btn-ghost` ou link.
2. **Marinho para peso.** Texto, chip ativo, carimbo de desconto, avatar e o botão "Anunciar" usam o marinho da marca (`--ink`).
3. **Magenta é o destaque.** Preço com cupom, a palavra de destaque do título (`.hl`) e a ação principal. Nunca como fundo de texto longo.
4. **Degradê da marca com parcimônia.** `--brand-gradient` (marinho → magenta → rosa) só em superfícies especiais: o bilhete de destaque da vitrine, o painel do login, o indicador de carregamento. No máximo uma por tela.
5. **Raio: 0 ou 8 a 16px.** Pílula (`--r-pill`) só para chips, badges e botões redondos de ícone.
6. **Sem estilo inline estático nos templates**, **sem `!important`**, seletores planos. Valores dinâmicos (largura de barra, cor vinda do banco) podem ficar inline.

## Marca

| Elemento | Onde está |
|---|---|
| Logo completa (símbolo + EMPR≡NDE + iCEV + slogan) | `public/brand/logo.svg`, `logo-on-dark.svg`, `logo-white.svg` |
| Nome sem símbolo, para cabeçalhos | `public/brand/wordmark.svg`, `wordmark-white.svg` |
| Símbolo de rede | `public/brand/symbol.svg` |
| Ícones do app e favicon | `public/icons/` |
| Logo para e-mails (PNG) e prévia de links | `public/brand/logo-email.png`, `og-image.png` |

Todos são gerados a partir dos arquivos originais em `design/brand/` com `python scripts/build-brand-assets.py` (usa o Chrome/Edge da máquina para os PNGs). No código, use `renderBrandLogo(variant, className)` de `src/main.js` e controle o tamanho só pela altura no CSS.

## Tokens (`src/styles/tokens.css`)

| Papel | Token | Valor |
|---|---|---|
| Marinho da marca / texto | `--navy`, `--ink` | #182A50 |
| Magenta da marca / ação | `--magenta`, `--brand` (+ `-press`, `-tint`, `-ink`) | #C0176B |
| Rosa da marca / destaque de gráficos | `--pink`, `--marker` | #ED1E79 |
| Degradê da marca | `--brand-gradient` | #182A50 → #C0176B (64%) → #ED1E79 |
| Fundo da página | `--porcelain` | #F3F4F8 |
| Superfícies | `--paper` / `--paper-sunken` | #FFFFFF / #F7F7FA |
| Texto secundário | `--ink-soft` / `--ink-mute` / `--ink-faint` | #465070 / #6B7289 / #A5AABB |
| Linhas | `--rule` / `--rule-strong` | #E4E6EE / #CFD3DE |
| Estados | `--success`, `--danger`, `--warning` (+ `-tint`) | verde, vermelho, âmbar |

Sombras em tom marinho: `--shadow-1` (repouso), `--shadow-2` (hover, popovers), `--shadow-3` (modais, docks). Movimento: `--ease-out`, `--dur-1/2/3`; `prefers-reduced-motion` é respeitado em `base.css`.

## Tipografia

A fonte da marca é a **Inter** (é a usada no slogan). Títulos em Inter 700–800 com tracking negativo; corpo em Inter 400–500. Rótulos em caixa-alta usam Inter 600 com `--tracking-label` (0,14em), ecoando "CONEXÕES QUE GERAM NEGÓCIOS.". Códigos de cupom usam Geist Mono, para não confundir 0/O e 1/I.

## Motivos

- **Palavra de destaque** `.hl`: uma palavra por título em magenta, sublinhada por uma barra fina no degradê da marca (como as barras magenta dentro do "EMPR≡NDE"). `.hl--draw` desenha a barra uma vez.
- **Picote** `.perforation`: linha tracejada com meias-luas nas bordas. O pai precisa de `overflow: visible` e de `--notch-bg` igual à cor atrás do card. Sobre degradê, use máscara CSS (veja `.auth-ticket`).
- **Carimbo** `.discount-badge`: marinho, mono, canto de 8px.
- **Bilhete de destaque**: card no degradê com canhoto destacável (`.buyer-featured-strip`).

## Componentes (`src/styles/components.css`)

Botões (`btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-success`, `btn-sm`, `btn-lg`, `btn-block`, `icon-btn`), campos (`input-group`, `input-field`, `filter-select`, `toggle`), `chip`, `badge` e `status-pill` com tons `badge-*`, `card`, `stat-card`, `tabs`, avatares, `alert-*`, `progress-bar`, `empty-state`, esqueletos, `modal-backdrop`/`modal-content` (sheet no celular, diálogo a partir de 720px), toasts e `bottom-nav` (dock flutuante).

## Arquivos

`tokens.css` → `reset.css` → `base.css` → `components.css` → `overlays.css` → áreas (`buyer.css`, `buyer-account.css`, `auth.css`, `seller.css`, `admin.css`). Cada área só estiliza as próprias classes. Não crie folhas de "polimento" por cima: corrija o arquivo da área.

## Prévia local

Com `npm run dev` e o Supabase inacessível, o app usa dados de exemplo. Para ver telas protegidas e tirar capturas sem abrir o navegador:

```bash
node scripts/dev-shot.mjs --path seller --role seller --out painel.png
```

Opções: `--role none|buyer|seller|admin|superadmin`, `--width/--height`, `--full`, `--tour`, e `--eval "JS"` (repetível) para clicar e abrir modais. Use o caminho sem barra inicial (o Git Bash reescreve `/seller`). O código de prévia fica só no modo DEV e não entra no build.
