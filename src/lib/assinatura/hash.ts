import { createHash } from 'node:crypto'

// As evidências que compõem a prova de integridade do documento assinado.
// Toda string — nada de Date nem number, para a serialização não depender de
// locale nem de precisão de ponto flutuante anos depois.
export type Evidencias = {
  documentoId: string
  vendaId: string
  tipo: string
  snapshotHash: string
  selfieHash: string
  assinaturaHash: string
  celularDestino: string
  ipAssinatura: string
  userAgent: string
  codigoVerificadoEm: string
  assinadoEm: string
}

// Ordem fixa das chaves. É o que torna o hash reproduzível: JSON.stringify
// segue a ordem de inserção do objeto, então sem isto o hash mudaria conforme
// a ordem em que o código montou as evidências.
const ORDEM: (keyof Evidencias)[] = [
  'documentoId', 'vendaId', 'tipo', 'snapshotHash', 'selfieHash', 'assinaturaHash',
  'celularDestino', 'ipAssinatura', 'userAgent', 'codigoVerificadoEm', 'assinadoEm',
]

export function canonizar(ev: Evidencias): string {
  return JSON.stringify(Object.fromEntries(ORDEM.map(k => [k, ev[k]])))
}

export function sha256(dado: string | Buffer): string {
  return createHash('sha256').update(dado).digest('hex')
}

export function docHash(ev: Evidencias): string {
  return sha256(canonizar(ev))
}

// Contrato de adesão ao MOVA (#165): mesma ideia, com os vínculos dele. Tipo e
// ordem próprios para não tocar no hash dos documentos de venda já assinados.
export type EvidenciasAdesao = {
  contratoId: string
  adesaoId: string
  snapshotHash: string
  selfieHash: string
  assinaturaHash: string
  emailDestino: string
  ipAssinatura: string
  userAgent: string
  codigoVerificadoEm: string
  assinadoEm: string
}

const ORDEM_ADESAO: (keyof EvidenciasAdesao)[] = [
  'contratoId', 'adesaoId', 'snapshotHash', 'selfieHash', 'assinaturaHash',
  'emailDestino', 'ipAssinatura', 'userAgent', 'codigoVerificadoEm', 'assinadoEm',
]

export function docHashAdesao(ev: EvidenciasAdesao): string {
  return sha256(JSON.stringify(Object.fromEntries(ORDEM_ADESAO.map(k => [k, ev[k]]))))
}
