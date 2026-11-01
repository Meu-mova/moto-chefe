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
 * Mesma regra do `ltrim(coluna, '0')` usado no SQL; quem compara número ou série
 * em JS passa por aqui (#597).
 */
export function semZerosAEsquerda(texto: string | null | undefined): string {
  const aparado = (texto ?? '').trim()
  if (!aparado) return ''
  return aparado.replace(/^0+/, '') || '0'
}
