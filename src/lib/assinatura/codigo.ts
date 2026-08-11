import { randomInt } from 'node:crypto'
import { sha256 } from './hash'

export const MAX_TENTATIVAS = 5
export const VALIDADE_MINUTOS = 10

export type EstadoCodigo = {
  codigoHash: string
  expiraEm: Date
  tentativas: number
  usadoEm: Date | null
}

export type ResultadoCodigo = 'ok' | 'expirado' | 'usado' | 'excedeu' | 'incorreto'

// randomInt do node:crypto, não Math.random: é código de autenticação.
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// O documentoId entra no hash para que o mesmo código em documentos diferentes
// gere hashes diferentes — sem isso, vazar um hash valeria para outro documento.
export function hashCodigo(codigo: string, documentoId: string): string {
  return sha256(`${documentoId}:${codigo}`)
}

// Um código já enviado ainda serve? Se serve, NÃO se gera outro: o cliente
// precisa sair para o WhatsApp e voltar, e voltar recarrega a página no
// celular. Gerar um código novo aí invalidaria o que ele acabou de copiar.
export function codigoAindaVale(estado: EstadoCodigo | null | undefined, agora: Date): boolean {
  if (!estado) return false
  return !estado.usadoEm
    && estado.tentativas < MAX_TENTATIVAS
    && estado.expiraEm > agora
}

export function validarCodigo(
  estado: EstadoCodigo,
  digitado: string,
  documentoId: string,
  agora: Date,
): ResultadoCodigo {
  if (estado.usadoEm) return 'usado'
  if (estado.tentativas >= MAX_TENTATIVAS) return 'excedeu'
  if (agora > estado.expiraEm) return 'expirado'
  return hashCodigo(digitado, documentoId) === estado.codigoHash ? 'ok' : 'incorreto'
}
