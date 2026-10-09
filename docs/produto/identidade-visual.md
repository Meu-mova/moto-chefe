# Identidade visual do MOVA

O que a interface do MOVA usa de marca, cor e tipografia, nos temas claro e escuro. A decisão e
o porquê estão no [ADR-0016](../adr/0016-identidade-visual-e-tema-claro-escuro.md); as escolhas
saíram do protótipo de 2026-10-09 (épica #90).

O MOVA é o produto; a MotoChefe é um cliente. A interface leva só a marca MOVA. Os documentos
impressos para o consumidor final (`src/app/(print)/`) continuam com a marca da loja e ficam fora
deste guia.

## Logo

| Peça | Uso | Arquivo |
|---|---|---|
| Nome "MOVA" (claro) | header e sidebar no tema claro: letras `#0F151A`, "O" em verde | `public/brand/mova-nome-claro.svg` |
| Nome "MOVA" (escuro) | idem no tema escuro: letras brancas, "O" em verde | `public/brand/mova-nome-escuro.svg` |
| Ícone "M" (claro) | sidebar recolhida, favicon, ícone de app | `public/brand/mova-icone-claro.svg` |
| Ícone "M" (escuro) | sidebar recolhida no tema escuro | `public/brand/mova-icone-escuro.svg` |

- Com espaço, vai **só o nome**. O ícone aparece só onde o nome não cabe (sidebar recolhida,
  favicon, tela inicial do celular).
- O ícone escuro **não tem brilho** em volta do "M": em tamanho pequeno, o brilho vira borrão.
- O desenho é vetorial (formas, sem imagem embutida). As referências originais (PNG) ficam no
  protótipo; não entram no repo.
- Área de respiro: no mínimo a altura do "O" em volta do nome. Não distorcer, não trocar as cores
  do nome, não aplicar sombra.

**Degradê da marca** (`#21F49A` → `#02C184` → `#028775`): só no ícone, na tela de login e na
tela de carregamento. Botões e destaques usam o verde chapado da paleta.

## Favicon e ícones de app

Convenção de arquivos do Next ([app-icons](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons)),
em `src/app/`:

| Arquivo | Para quê |
|---|---|
| `favicon.ico` | aba do navegador, navegadores antigos |
| `icon.svg` | favicon nítido em qualquer tela; o Next marca `sizes="any"` ("`sizes="any"` is added to icons when the extension is `.svg`") |
| `apple-icon.png` (180 × 180) | tela inicial do iPhone; a convenção não aceita SVG para `apple-icon` |

O favicon é uma versão simplificada do ícone: quadrado arredondado com o degradê e o "M" branco,
**com traço mais grosso** que o do ícone grande, sem ondas nem sombra. É isso que o mantém nítido
em 16 e 32 px.

## Tipografia

**Inter**, servida pelo `next/font/google`
([Fonts](https://nextjs.org/docs/app/getting-started/fonts)), uma fonte só para títulos e texto.

- Valores em R$ e quantidades usam números tabulares (`tabular-nums`), para alinhar em coluna.
- Chassi, número de venda e códigos usam a fonte mono do sistema.

## Cores

A interface usa **cores com nome** (variáveis CSS no `src/app/globals.css`), nunca cor fixa
(`bg-slate-900`, `bg-white`). É o que permite o tema escuro: o nome é o mesmo e o valor muda com o
tema. O Tailwind aplica o tema escuro pela variante `dark`
([Dark mode](https://tailwindcss.com/docs/dark-mode)).

Paleta 1 (neutro frio + verde da marca):

| Nome | Para quê | Claro | Escuro |
|---|---|---|---|
| `background` | fundo da página | `#f4f6f9` | `#0b1120` |
| `card` | cartão, tabela, menu | `#ffffff` | `#121a2b` |
| `muted` | fundo secundário, linha em hover | `#eef1f5` | `#19233a` |
| `foreground` | texto | `#0f172a` | `#e8edf5` |
| `muted-foreground` | texto secundário | `#526079` | `#9aa8bf` |
| `border` | divisória decorativa | `#dde3ea` | `#26324a` |
| `input` | borda de campo e controle | `#7c8aa0` | `#64748f` |
| `primary` | botão principal, foco | `#047a4f` | `#2ee09a` |
| `primary-foreground` | texto sobre `primary` | `#ffffff` | `#03140c` |
| `primary-text` | link e texto em verde | `#036443` | `#4ee8a8` |
| `primary-soft` | fundo de item ativo, selo "concluída" | `#e3f6ee` | `#0f3326` |
| `warning` | texto e ícone de alerta; fundo = a mesma cor a 10% | `#8a5300` | `#ffc861` |
| `destructive` | texto e ícone de erro/pendência; fundo = a mesma cor a 10% (claro) ou 20% (escuro) | `#b42318` | `#ff8a80` |

O verde do botão no claro (`#047a4f`) é mais escuro que o verde do logo de propósito: o verde do
logo com texto branco não chega a 4.5:1.

## Contraste (WCAG 2.2, nível AA)

Regras:
- Texto: **4.5:1** ([1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):
  "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1").
- Borda de campo, ícone que é controle, anel de foco: **3:1**
  ([1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html):
  "a contrast ratio of at least 3:1 against adjacent color(s)").
- `border` é só decorativa (1.29:1 no claro, 1.36:1 no escuro). Campo e controle usam `input`.

Medido com a fórmula de luminância do WCAG sobre os valores acima:

| Par | Claro | Escuro | Mínimo |
|---|---|---|---|
| `foreground` / `background` | 16.49 | 16.02 | 4.5 |
| `muted-foreground` / `card` | 6.35 | 7.22 | 4.5 |
| `muted-foreground` / `background` | 5.86 | 7.83 | 4.5 |
| `primary-foreground` / `primary` | 5.38 | 11.04 | 4.5 |
| `primary-text` / `card` | 7.22 | 11.12 | 4.5 |
| `primary-text` / `primary-soft` | 6.43 | 8.83 | 4.5 |
| `warning` / `card` | 6.33 | 11.33 | 4.5 |
| `warning` / fundo de alerta (`warning` a 10%/20% sobre `card`) | 5.47 | 7.04 | 4.5 |
| `destructive` / `card` | 6.57 | 7.61 | 4.5 |
| `destructive` / fundo de erro (sobre `card`) | 5.57 | 5.34 | 4.5 |
| `destructive` / fundo de erro (sobre `background`, claro) | 5.16 | — | 4.5 |
| `input` / `card` | 3.50 | 3.67 | 3 |
| `input` / `background` | 3.23 | 3.98 | 3 |
| `primary` (foco) / `card` | 5.38 | 10.13 | 3 |

Cor nova só entra nesta tabela com o par medido.

## Tema

- Padrão: **segue o sistema** (claro ou escuro, conforme o celular ou o computador).
- Troca manual no menu do usuário: Claro / Escuro / Sistema. A escolha fica salva no navegador.
- Impressos ficam sempre claros.
