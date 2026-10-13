# 0016. Identidade visual do MOVA, cores com nome e tema claro/escuro

- **Status:** Aceita
- **Data da decisão:** 2026-10-09
- **Fontes:** épica #90 e sub-issue #91; protótipo de 2026-10-09 (branch
  `prototipo/ui-ux-2026-10-09`, fora do repo); guia em
  [`docs/produto/identidade-visual.md`](../produto/identidade-visual.md)

## Contexto

A interface não tinha identidade definida: fonte e cores eram as do template (Geist e o cinza
padrão do shadcn), o logo existia só em PNG e não havia tema escuro. Cerca de 250 arquivos usam
cor fixa (`bg-slate-*`, `bg-white`), que não muda com o tema. No celular, aparelho principal dos
usuários, a usabilidade afastava quem não é vendedor.

## Decisão

- A interface leva a marca **MOVA**, não a dos clientes (MotoChefe). Impressos ficam com a marca
  da loja.
- Estilo continua **Tailwind 4 + shadcn/Base UI**; não migrar para Bootstrap nem CSS puro.
- Fonte **Inter**; paleta 1 (neutro frio + verde da marca); contraste **WCAG 2.2 AA** nos dois
  temas, medido par a par no guia.
- Cor sempre por **nome** (variável CSS); tema escuro pela variante `dark` do Tailwind.
- Tema padrão **segue o sistema**, com troca manual salva.
- Logo em SVG vetorial; header só com o nome; ícone escuro sem brilho; degradê só no logo, no
  login e no carregamento.

## Por quê

- Trocar de biblioteca de estilo reescreveria cerca de 290 arquivos sem ganho de acessibilidade;
  o Bootstrap traria um segundo reset global e um JS que a própria doc diz não ser compatível com
  React ([JavaScript](https://getbootstrap.com/docs/5.3/getting-started/javascript/)).
- Cor por nome é o único jeito de ter tema escuro sem duplicar cada classe com `dark:`.
- As escolhas foram vistas em 3 cenários cada, em telas reais, antes de decidir.

## Alternativas descartadas

- **Paletas 2 (neutro quente) e 3 (cinza + menu petróleo)**, **Geist** e **Manrope**: vistas no
  protótipo; o Luis escolheu a paleta 1 e a Inter.
- **Cada cliente com suas cores (white-label)**: multiplica o trabalho de contraste. Logo do
  cliente num canto fica para o futuro.
- **Degradê em botões**: atrapalha o contraste e cansa no uso diário.

## Quando revisar

Se um cliente pedir a própria marca no app, ou se o MOVA ganhar manual de marca feito por designer.
