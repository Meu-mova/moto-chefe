// A tabela da Folha do Mês é uma grade CSS, e não um <table>, para o campo do valor real ser UM
// elemento só: na célula da coluna (>= 680 px de conteúdo) ou dentro do detalhe aberto (celular).
// Cabeçalho, linhas e total usam o mesmo molde, para as colunas alinharem.
// Celular: nome, total, seta. Tablet: + salário, comissão, valor real. Desktop: todas.
export const GRADE = [
  'grid grid-cols-[minmax(0,1fr)_auto_44px]',
  '@[680px]/folha:grid-cols-[minmax(140px,2fr)_repeat(2,minmax(0,1fr))_minmax(0,1.2fr)_minmax(140px,1.1fr)_44px]',
  '@[960px]/folha:grid-cols-[minmax(150px,1.8fr)_repeat(5,minmax(0,1fr))_minmax(0,1.1fr)_minmax(130px,1.1fr)_36px]',
].join(' ')

export const CELULA = 'min-w-0 px-2.5 py-2.5'
export const NUMERO = `${CELULA} text-right tabular-nums whitespace-nowrap`
// Colunas que só entram quando cabem: p2 a partir do tablet, p3 só no desktop.
export const SO_TABLET = 'hidden @[680px]/folha:block'
export const SO_DESKTOP = 'hidden @[960px]/folha:block'
