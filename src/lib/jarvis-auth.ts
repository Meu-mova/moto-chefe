import { timingSafeEqual } from 'node:crypto'

/** Confere o header Authorization contra JARVIS_API_TOKEN (comparacao timing-safe). */
export function tokenValido(authHeader: string | null): boolean {
  const token = process.env.JARVIS_API_TOKEN
  if (!token) return false
  const prefixo = 'Bearer '
  if (!authHeader || !authHeader.startsWith(prefixo)) return false
  const recebido = Buffer.from(authHeader.slice(prefixo.length))
  const esperado = Buffer.from(token)
  if (recebido.length !== esperado.length) return false
  return timingSafeEqual(recebido, esperado)
}
