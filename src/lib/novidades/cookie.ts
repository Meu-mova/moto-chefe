/**
 * Cookie em que o navegador guarda a versão das Novidades que a pessoa já viu. Um por pessoa: o
 * Entendi de uma não esconde a janela de outra no mesmo navegador. Sem grupo: vale em todos.
 */
export const nomeDoCookieDaNovidade = (usuarioId: string) => `novidade-vista-${usuarioId}`
