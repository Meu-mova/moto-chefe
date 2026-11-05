/** Texto que entra num HTML montado à mão, inclusive dentro de atributo entre aspas duplas. */
export function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
