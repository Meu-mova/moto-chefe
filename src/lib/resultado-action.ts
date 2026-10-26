// No build de produção o React troca a mensagem de erro lançado por Server Action por
// "Minified React error #441" (#404). Recusa que o usuário precisa ler volta como valor.

export type ResultadoAction<T = void> = { ok: true; dados: T } | { ok: false; erro: string }

/** Recusa com frase para o usuário (validação, permissão, registro não encontrado). */
export class RecusaUsuario extends Error {}

/**
 * Roda a action e devolve a recusa como `{ ok: false, erro }`. Qualquer outro erro
 * (falha interna, redirect/notFound do Next) continua sendo lançado.
 */
export async function acao<T>(fn: () => Promise<T>): Promise<ResultadoAction<T>> {
  try {
    return { ok: true, dados: await fn() }
  } catch (e) {
    if (e instanceof RecusaUsuario) return { ok: false, erro: e.message }
    throw e
  }
}
