// Reconhece de qual operadora é o relatório pelo próprio texto. Pura, para testar sem a action.

/** Código da operadora do arquivo, ou null se não for nenhum dos formatos conhecidos. */
export function detectarFormato(texto: string): string | null {
  const primeiraLinha = texto.trimStart().split(/\r?\n/)[0] ?? ''
  if (primeiraLinha.startsWith('Data e hora'))         return 'infinitypay'
  if (primeiraLinha.startsWith('Cod PagueVeloz') ||
      primeiraLinha.startsWith('Cod Pague'))            return 'pagueveloz'
  if (primeiraLinha.startsWith('DOCUMENTO;STONECODE'))  return 'stone'
  if (primeiraLinha.startsWith('data do recebimento;data original da venda;')) return 'rede'
  // Trecho do meio do cabeçalho da Rendimento: só ASCII (resiste a acento mal lido) e não depende
  // de qual coluna vem por último.
  if (primeiraLinha.includes(';Data Pagamento;Data Efetiva'))   return 'rendimento'
  // A 1ª linha da Cielo é a capa do relatório, não o cabeçalho: reconhece pela linha de
  // cabeçalho das vendas ou pelo título da capa.
  if (/^Data da venda;Hora da venda;/m.test(texto) ||
      texto.includes('Detalhado de vendas Cielo'))      return 'cielo'
  return null
}
