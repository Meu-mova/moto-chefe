// Cor da moto: uma grafia só por cor.
//
// A cor é parte da CHAVE em todo lugar que conta estoque por variação — o
// /compras agrupa por (modelo, cor) e a demanda escolhe a cor de uma lista que
// sai do `select distinct cor from motos`. Uma moto cadastrada como "PRETA"
// entre 451 "PRETO" não é um detalhe cosmético: ela vira uma linha separada,
// com estoque zero, e o módulo de compras pede reposição de uma cor que está
// cheia no showroom. Foi exatamente o que aconteceu com a JETMAX em 14/09/2026.
//
// A cor não é digitada na maior parte das vezes: vem do XML da NF-e de entrada,
// escrita pela fábrica. Por isso a defesa é normalizar na gravação, não só
// oferecer uma lista na tela.

/**
 * As cores que existem na base, uma grafia por cor. É o que a tela oferece.
 *
 * Cor nova de fábrica não está aqui — e não pode travar a entrada por causa
 * disso (ver `normalizarCor`). Quando aparecer uma que veio para ficar, é só
 * acrescentar nesta lista.
 */
export const CORES_MOTO = [
  'AMARELO',
  'AZUL',
  'AZUL TURQUESA',
  'BEGE',
  'BLACK EDITION',
  'BRANCO',
  'BRANCO VASCO',
  'CARBONO',
  'CEU',
  'CINZA',
  'FANTASIA',
  'FOGO',
  'MARFIM',
  'PRETO',
  'UK',
  'VERDE',
  'VERDE/AMARELO',
  'VERMELHO',
  'VERMELHO/BRANCO',
] as const

/**
 * Grafias que já entraram na base e significam uma cor que já existe. Chave e
 * valor sempre em caixa alta, do jeito que a cor é gravada.
 */
const SINONIMOS: Record<string, string> = {
  PRETA: 'PRETO',
  BRANCA: 'BRANCO',
  CINZENTO: 'CINZA',
  VERMELHA: 'VERMELHO',
  AMARELA: 'AMARELO',
}

/**
 * A cor como ela deve ser gravada: sem espaço sobrando, em caixa alta e com as
 * variantes conhecidas trocadas pela grafia canônica.
 *
 * Cor desconhecida passa direto, só arrumada. Recusar a entrada de uma moto
 * porque a fábrica inventou um nome de cor seria travar o trabalho por causa de
 * um cadastro — o preço de uma cor nova fora da lista é uma linha a mais no
 * /compras, e isso o cadastro conserta depois.
 */
export function normalizarCor(texto: string): string {
  const limpa = texto.trim().toUpperCase().replace(/\s+/g, ' ')
  return SINONIMOS[limpa] ?? limpa
}
