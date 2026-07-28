/** minúsculas, sem acento, espaços colapsados — base do roteamento. */
export function normalizar(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
