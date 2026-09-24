# Empreende iCEV · Sistema visual

Marca: **Empreende iCEV — Conexões que geram negócios.** Uma vitrine de cupons de desconto das empresas criadas por alunos do iCEV. O aluno pega o código no app e compra direto com a empresa. O cupom (picote, canhoto, código) é o motivo visual do produto; a rede de conexões e o "≡" do logotipo são os da marca.

## Regras de ouro

1. **Moldura marinha em toda tela.** O topo de cada tela é o **toldo** (`.canopy`): uma faixa marinha de ponta a ponta com o título, a busca e as ações. Embaixo, a barra de navegação (e a barra de compra no detalhe) também é marinha. O conteúdo fica no fundo lilás entre as duas. Nada de tela toda branca.
2. **Uma ação magenta por tela.** `btn-primary` (magenta `--brand`) só na ação principal. O resto é `btn-secondary`, `btn-ghost` ou link.
3. **Marinho para peso.** Texto, carimbo de desconto e os ícones das categorias usam o marinho da marca (`--ink`). Dentro do toldo, o texto é branco (`--on-navy*`), o chip ativo e o avatar são magenta.
4. **Magenta e rosa são o destaque.** Preço com cupom, a palavra de destaque do título (`.hl`, rosa sobre o marinho) e a ação principal. Nunca como fundo de texto longo.
5. **Um bilhete quente por tela.** O bilhete de destaque (`--brand-gradient-warm`, magenta → rosa) atravessa a borda do toldo. O degradê completo (`--brand-gradient`, que começa no marinho) fica para superfícies fora do marinho: o painel do login, a métrica principal do painel da empresa e do admin.
6. **Raio: 0 ou 8 a 16px.** Pílula (`--r-pill`) só para chips, badges e botões redondos de ícone.
7. **Sem estilo inline estático nos templates**, **sem `!important`**, seletores planos. Valores dinâmicos (largura de barra, cor vinda do banco) podem ficar inline.

## Marca

| Elemento | Onde está |
|---|---|
| Logo completa (símbolo + EMPR≡NDE + iCEV + slogan) | `public/brand/logo.svg`, `logo-on-dark.svg`, `logo-white.svg` |
| Nome sem símbolo, para cabeçalhos | `public/brand/wordmark.svg`, `wordmark-white.svg`, `wordmark-on-dark.svg` (letras brancas e barras magenta, para o toldo) |
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
| Degradê quente (sobre o marinho) | `--brand-gradient-warm` | #C0176B → #ED1E79 |
| Texto e linhas sobre o marinho | `--on-navy`, `--on-navy-soft`, `--on-navy-mute`, `--on-navy-line`, `--on-navy-fill` | branco a 100%, 74%, 58%, 16%, 9% |
| Fundo da página (névoa lilás) | `--porcelain` | #ECE8F2 |
| Superfícies | `--paper` / `--paper-sunken` | #FFFFFF / #F7F7FA |
| Texto secundário | `--ink-soft` / `--ink-mute` / `--ink-faint` | #465070 / #5E6580 / #A5AABB |
| Linhas | `--rule` / `--rule-strong` | #E4E6EE / #CFD3DE |
| Estados | `--success`, `--danger`, `--warning` (+ `-tint`) | verde, vermelho, âmbar |

Sombras em tom marinho: `--shadow-1` (repouso), `--shadow-2` (hover, popovers), `--shadow-3` (modais, docks). Movimento: `--ease-out`, `--dur-1/2/3`; `prefers-reduced-motion` é respeitado em `base.css`.

## Tipografia

A fonte da marca é a **Inter** (é a usada no slogan). Títulos em Inter 700–800 com tracking negativo; corpo em Inter 400–500. Rótulos em caixa-alta usam Inter 600 com `--tracking-label` (0,14em), ecoando "CONEXÕES QUE GERAM NEGÓCIOS.". Códigos de cupom usam Geist Mono, para não confundir 0/O e 1/I.

## Motivos

- **Toldo** `.canopy`: faixa marinha de ponta a ponta atrás do cabeçalho, com um brilho rosa no canto (a luz do degradê do logo). `--canopy-cut` faz o marinho parar antes do fim, para o último filho atravessar a borda; `--canopy-lift` estende o marinho para cima (por trás de um "Voltar" ou do espaçamento do corpo). Sob uma barra fixa marinha (empresa, admin), use `.canopy--continued`: o brilho desce para o canto de baixo e barra e toldo viram uma superfície só.
- **Bilhete que atravessa a borda**: o destaque da vitrine, o "Ver tudo" das categorias e o primeiro card das telas da empresa ficam metade no marinho, metade no lilás. O recorte de cima do canhoto é marinho, o de baixo é lilás. Um card que vem depois do cabeçalho precisa de `position: relative` para ficar por cima do toldo.
- **Palavra de destaque** `.hl`: uma palavra por título em magenta, sublinhada por uma barra fina no degradê da marca (como as barras magenta dentro do "EMPR≡NDE"). `.hl--draw` desenha a barra uma vez.
- **Picote** `.perforation`: linha tracejada com meias-luas nas bordas. O pai precisa de `overflow: visible` e de `--notch-bg` igual à cor atrás do card. Sobre degradê, use máscara CSS (veja `.auth-ticket`).
- **Carimbo** `.discount-badge`: marinho, mono, canto de 8px.
- **Bilhete de destaque**: card no degradê quente com canhoto destacável (`.buyer-featured-strip`).

## Estados e padrões

- **Prazo da oferta**: as ofertas duram 24h, então a urgência é em horas: neutro por padrão, âmbar abaixo de 6h, vermelho pulsando só na última hora. Esgotado não mostra prazo: diz "Cupons esgotados", com foto em cinza e preço apagado.
- **Status de cupom** (igual para aluno e empresa): Ativo verde, Usado cinza, Expirado vermelho. Oferta ativa também é verde.
- **Filtros de status** são pílulas (`.chip` + contador), nunca a trilha segmentada. Faixas roláveis vão de ponta a ponta com esmaecimento nas bordas e 4 a 6px de respiro interno, para o anel de foco não ser cortado.
- **Folhas com ação principal** (cupom retirado, detalhe da moderação) fixam o rodapé com a ação no pé da folha; use `--modal-pad-x` e `--modal-pad-bottom` para o rodapé atravessar o espaçamento.
- **Confirmação destrutiva** dentro de diálogo usa `btn-danger--solid` (vermelho cheio). Botão desativado explica o motivo em texto, não em tooltip.
- **Avisos (toasts)** são brancos com ícone colorido: eles costumam aparecer sobre o toldo marinho.
- **Foco de teclado**: anel magenta em superfícies claras, branco sobre o marinho (toldo, barras, dock).
- **Navegação**: toda tela tem endereço próprio (`#/buyer/offer?id=…`, `#/seller/edit?id=…`, `#/admin/moderation`), então o voltar do celular, o recarregar e os links compartilhados caem no lugar certo. Docks e abas são links (`<a href>`); troque de tela com `navigate()` e use `goBack(fallback)` nos botões "Voltar" (`src/utils/navigation.js`). Filtros e buscas ficam na memória, não no endereço. Ao voltar, a tela reabre na mesma rolagem.
- **Textos**: números ficam presos à unidade (`&nbsp;`), "e-mail" não quebra em títulos (`.nowrap`), "iCEV" mantém o i minúsculo em rótulos em caixa-alta (`brandCaseHTML`). Telefones aparecem como (86) 99900-1122 (`src/utils/phone.js`).

## Componentes (`src/styles/components.css`)

Botões (`btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-success`, `btn-sm`, `btn-lg`, `btn-block`, `icon-btn`), campos (`input-group`, `input-field`, `filter-select`, `toggle`), `chip`, `badge` e `status-pill` com tons `badge-*`, `card`, `stat-card`, `tabs`, avatares, `alert-*`, `progress-bar`, `empty-state`, esqueletos, `modal-backdrop`/`modal-content` (sheet no celular, diálogo a partir de 720px), toasts, `bottom-nav` (dock flutuante marinho) e `.canopy` (o toldo).

## Arquivos

`tokens.css` → `reset.css` → `base.css` → `components.css` → `overlays.css` → áreas (`buyer.css`, `buyer-account.css`, `auth.css`, `seller.css`, `admin.css`). Cada área só estiliza as próprias classes. Não crie folhas de "polimento" por cima: corrija o arquivo da área.

## Prévia local

Com `npm run dev` e o Supabase inacessível, o app usa dados de exemplo. Para ver telas protegidas e tirar capturas sem abrir o navegador:

```bash
node scripts/dev-shot.mjs --path seller --role seller --out painel.png
```

Opções: `--role none|buyer|seller|admin|superadmin`, `--width/--height`, `--full`, `--tour`, `--eval "JS"` (repetível) para clicar e abrir modais, e `--tab N` para apertar Tab de verdade e conferir o anel de foco. Use o caminho sem barra inicial (o Git Bash reescreve `/seller`). O código de prévia fica só no modo DEV e não entra no build.
