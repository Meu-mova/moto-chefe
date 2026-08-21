import { randomInt } from 'node:crypto'
import { sha256 } from './hash'

export const MAX_TENTATIVAS = 5
export const VALIDADE_MINUTOS = 10

// Trava de reenvio. Em 21/08 um contrato acumulou 42 pedidos de código em 63
// minutos para o mesmo endereço — quatro deles em 10 segundos — e nenhuma
// tentativa de digitar código: o e-mail não estava chegando naquela caixa. Como
// cada pedido invalida o código anterior, o reenvio se sabotava; e uma rajada
// dessas contra um provedor grande é o que faz ele limitar o domínio inteiro,
// estragando a entrega para todos os outros clientes.
//
// O teto é de CÓDIGOS ENVIADOS no documento, contando o automático da abertura
// da página — o que custa reputação é o e-mail, não o clique. Quem estoura sai
// pela loja: reenviar o documento cancela este e cria outro, com token e
// contador zerados.
export const MAX_CODIGOS = 5
export const COOLDOWN_SEGUNDOS = 60

export type HistoricoEnvio = {
  /** Códigos JÁ ENVIADOS com sucesso neste documento. Falha de envio não conta:
   *  não gastou reputação nem ajudou o cliente, então não consome a cota dele. */
  enviados: number
  ultimoEnvioEm: Date | null
}

export type PermissaoEnvio =
  | { ok: true }
  | { ok: false; motivo: 'aguarde'; segundos: number }
  | { ok: false; motivo: 'excedeu' }

export function podeEnviarCodigo(h: HistoricoEnvio, agora: Date): PermissaoEnvio {
  // O teto é avaliado ANTES do cooldown: quem já estourou não pode receber
  // "aguarde 60s", que prometeria uma espera que nunca libera nada.
  if (h.enviados >= MAX_CODIGOS) return { ok: false, motivo: 'excedeu' }
  if (!h.ultimoEnvioEm) return { ok: true }

  const decorridos = (agora.getTime() - h.ultimoEnvioEm.getTime()) / 1000
  if (decorridos >= COOLDOWN_SEGUNDOS) return { ok: true }
  return { ok: false, motivo: 'aguarde', segundos: Math.ceil(COOLDOWN_SEGUNDOS - decorridos) }
}

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
