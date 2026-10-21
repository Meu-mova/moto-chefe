import { cifrar, decifrar } from '@/lib/cripto'

// Senha do portal da fábrica em `lojas.fabrica_senha` (#292). Grava cifrada com
// cripto.ts, como o certificado A1: quem lê o banco não entra no portal da loja.

const RE_B64 = /^[A-Za-z0-9+/]+=*$/

// Pacote de cifrar(): iv de 12 bytes e tag de 16. O tamanho é o que separa um
// pacote de uma senha antiga, em texto puro, que por acaso tenha dois ":".
export function senhaFabricaCifrada(valor: string): boolean {
  const partes = valor.split(':')
  if (partes.length !== 3 || !partes.every(p => RE_B64.test(p))) return false
  const [iv, tag] = partes
  return Buffer.from(iv, 'base64').length === 12 && Buffer.from(tag, 'base64').length === 16
}

export function cifrarSenhaFabrica(senha: string): string {
  return cifrar(senha)
}

/**
 * Senha pronta para o login no portal. Aceita ainda a senha em texto puro: as
 * gravadas antes da #292 seguem assim até o scripts/cifrar-senhas-fabrica.ts rodar
 * no banco, e o deploy pode chegar antes dele.
 */
export function lerSenhaFabrica(valor: string | null): string | null {
  if (!valor) return null
  return senhaFabricaCifrada(valor) ? decifrar(valor).toString('utf8') : valor
}
