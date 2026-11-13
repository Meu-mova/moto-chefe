/**
 * Grava no navegador um cookie de um ano, para o site inteiro; o servidor lê no próximo pedido
 * (`cookies()` no layout). Só no cliente: usa `document`.
 */
export function gravarCookieDeUmAno(nome: string, valor: string): void {
  document.cookie = `${nome}=${valor}; path=/; max-age=31536000; samesite=lax`
}
