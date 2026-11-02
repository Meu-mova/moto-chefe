/** minúsculas, sem acento, espaços colapsados — base do roteamento. */
export function normalizar(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Número de nota como a SEFAZ compara: "0974" e "974" são o mesmo; só zeros vira "0".
 * O SQL pré-filtra com `ltrim(coluna, '0')` (que difere só em "000" e em espaços);
 * a comparação final de número ou série em JS passa sempre por aqui (#597).
 */
export function semZerosAEsquerda(texto: string | null | undefined): string {
  const aparado = (texto ?? '').trim()
  if (!aparado) return ''
  return aparado.replace(/^0+/, '') || '0'
}
