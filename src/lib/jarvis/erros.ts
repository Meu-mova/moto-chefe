import { EsperaEsgotada } from '@/lib/limitar-concorrencia'

export type ConsultaTipoErro = 'vazio' | 'nao_select' | 'multiplos' | 'timeout' | 'erro'

export class ConsultaError extends Error {
  constructor(public tipo: ConsultaTipoErro, public detalhe = '') {
    super(tipo)
    this.name = 'ConsultaError'
  }
}

const STATUS: Record<ConsultaTipoErro, number> = { vazio: 400, nao_select: 400, multiplos: 400, timeout: 408, erro: 400 }
const MSG: Record<ConsultaTipoErro, string> = {
  vazio: 'sql vazio',
  nao_select: 'apenas SELECT e permitido',
  multiplos: 'apenas um comando (sem ;)',
  timeout: 'consulta demorou demais',
  erro: 'erro na consulta',
}

export interface RespostaDeErro {
  status: number
  corpo: { erro: string; detalhe?: string }
}

/** Resposta das rotas do Jarvis para um erro conhecido; `null` para os outros. */
export function respostaDoErro(e: unknown): RespostaDeErro | null {
  const conhecido =
    e instanceof EsperaEsgotada ? new ConsultaError('timeout', 'muitas consultas ao mesmo tempo')
    : e instanceof ConsultaError ? e
    : null
  if (!conhecido) return null
  return {
    status: STATUS[conhecido.tipo],
    corpo: { erro: MSG[conhecido.tipo], detalhe: conhecido.detalhe || undefined },
  }
}
