import { dataEHoraBrt, diaBrt } from '@/lib/data-venda'
import { formatarCpfCnpj } from '@/lib/documento'

// Lista única: o card, o filtro e o comprovante derivam daqui.
export const STATUS_TRANSFERENCIA = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'aceita',   label: 'Aceita' },
  { value: 'recusada', label: 'Recusada' },
] as const

export function rotuloStatusTransferencia(status: string): string {
  return STATUS_TRANSFERENCIA.find(s => s.value === status)?.label ?? status
}

export type TransferenciaParaComprovante = {
  status: string
  dataSolicitacao: Date
  dataResposta: Date | null
  observacao: string | null
  modelo: string
  cor: string | null
  chassi: string
  motor: string | null
  lojaOrigemNome: string
  lojaDestinoNome: string
  solicitadoPorNome: string
  respondidoPorNome: string | null
  empresaNome: string
  empresaRazaoSocial: string | null
  empresaCnpj: string
}

export type ComprovanteTransferencia = {
  empresa: string
  cnpj: string
  data: string
  status: string
  moto: string
  origem: string
  destino: string
  solicitado: string
  resposta: { rotulo: 'Aprovado por' | 'Recusado por'; texto: string } | null
  observacao: string | null
}

const quemEQuando = (nome: string, quando: Date) => `${nome} · ${dataEHoraBrt(quando.toISOString())}`

function respostaDa(t: TransferenciaParaComprovante): ComprovanteTransferencia['resposta'] {
  if (t.status === 'pendente' || !t.respondidoPorNome || !t.dataResposta) return null
  return {
    rotulo: t.status === 'aceita' ? 'Aprovado por' : 'Recusado por',
    texto: quemEQuando(t.respondidoPorNome, t.dataResposta),
  }
}

export function comprovanteDaTransferencia(t: TransferenciaParaComprovante): ComprovanteTransferencia {
  const moto = [t.modelo, t.cor, `chassi ${t.chassi}`, t.motor && `motor ${t.motor}`].filter(Boolean).join(' · ')
  return {
    empresa: t.empresaRazaoSocial ?? t.empresaNome,
    cnpj: formatarCpfCnpj(t.empresaCnpj),
    data: diaBrt(t.dataSolicitacao.toISOString()),
    status: rotuloStatusTransferencia(t.status),
    moto,
    origem: t.lojaOrigemNome,
    destino: t.lojaDestinoNome,
    solicitado: quemEQuando(t.solicitadoPorNome, t.dataSolicitacao),
    resposta: respostaDa(t),
    observacao: t.observacao?.trim() || null,
  }
}
