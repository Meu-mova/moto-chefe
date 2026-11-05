// A tabela da Folha do Mês é uma grade CSS, e não um <table>, para o campo do valor real ser UM
// elemento só: na célula da coluna (>= 680 px de conteúdo) ou dentro do detalhe aberto (celular).
// Cabeçalho, linhas e total usam o mesmo molde, para as colunas alinharem.
// Os limites de largura do CONTEÚDO (680, 720 e 960 px) precisam estar escritos por extenso em cada
// classe `@[..]/folha:` (o Tailwind só enxerga classe literal), então moram em: aqui, na linha, no
// detalhe, no resumo (720), no ValorRealInput e na FolhaCasca (680, 820, 900, 960). Mudar uma faixa
// é buscar o número em `components/` e em `docs`: não há uma constante para trocar.
// Celular: nome, total, seta. Tablet: + salário, comissão, valor real. Desktop: todas.
export const GRADE = [
  'grid grid-cols-[minmax(0,1fr)_auto_44px]',
  '@[680px]/folha:grid-cols-[minmax(140px,2fr)_repeat(2,minmax(0,1fr))_minmax(0,1.2fr)_minmax(140px,1.1fr)_44px]',
  '@[960px]/folha:grid-cols-[minmax(150px,1.8fr)_repeat(5,minmax(0,1fr))_minmax(0,1.1fr)_minmax(130px,1.1fr)_36px]',
].join(' ')

export const TITULO = 'text-xs font-medium text-muted-foreground'
// Campo de formulário da folha: 44 px de altura abaixo de 960 px de conteúdo, compacto a partir dele.
export const CAMPO = 'h-11 text-base @[960px]/folha:h-8 @[960px]/folha:text-xs'
export const CELULA = 'min-w-0 px-2.5 py-2.5'
export const NUMERO = `${CELULA} text-right tabular-nums whitespace-nowrap`
// Colunas que só entram quando cabem: p2 a partir do tablet, p3 só no desktop.
export const SO_TABLET = 'hidden @[680px]/folha:block'
export const SO_DESKTOP = 'hidden @[960px]/folha:block'
