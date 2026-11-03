import { diaBrt, diaCurtoBrt } from './data-venda'

// Regras de apresentação da aba Holerites da /folha-pagamento: a conta do topo, quem ainda falta
// e os textos de cada envio. Sem banco nem data atual, para o teste rodar sem nada em volta.

// Os dois arquivos que a contabilidade manda todo mês; a ordem é a das colunas.
export const TIPOS_HOLERITE = [
  { valor: 'adiantamento', nome: 'Adiantamento', curto: 'Adiantamento' },
  { valor: 'salario', nome: 'Pagamento do salário', curto: 'Salário' },
] as const

export type Resumo = {
  enviados: number
  esperados: number
  porcentagem: number
  porTipo: { valor: string; nome: string; enviados: number }[]
  pessoasComFalta: string[]
}

/** Conta só quem está em `funcionarios` (os ativos): o holerite de quem saiu não é pendência nem
 *  progresso, e contá-lo deixaria "N de M" passar de 100%. */
export function resumirEnvios(
  funcionarios: { id: string }[],
  holerites: { usuarioId: string; tipo: string }[],
): Resumo {
  const enviadosPor = new Set(holerites.map(h => `${h.usuarioId}|${h.tipo}`))
  const foi = (id: string, tipo: string) => enviadosPor.has(`${id}|${tipo}`)
  const porTipo = TIPOS_HOLERITE.map(t => ({
    valor: t.valor,
    nome: t.nome,
    enviados: funcionarios.filter(f => foi(f.id, t.valor)).length,
  }))
  const enviados = porTipo.reduce((soma, t) => soma + t.enviados, 0)
  const esperados = funcionarios.length * TIPOS_HOLERITE.length
  return {
    enviados,
    esperados,
    porcentagem: esperados === 0 ? 0 : Math.round((enviados / esperados) * 100),
    porTipo,
    pessoasComFalta: funcionarios.filter(f => !TIPOS_HOLERITE.every(t => foi(f.id, t.valor))).map(f => f.id),
  }
}

// Dia de Brasília (data-venda.ts): um envio das 23h30 do dia 31 é 02h30 UTC do dia 1º e não pode
// virar "01/11".
export const rotuloEnviado = (d: Date) => `Enviado ${diaCurtoBrt(d.toISOString())}`

export function fmtTamanho(bytes: number | null): string {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

/** O que a linha não mostra (quem enviou e o tamanho): só aparece no detalhe. */
export function descricaoEnvio(h: { enviadoEm: Date; enviadoPorNome: string | null; tamanho: number | null }): string {
  const quando = diaBrt(h.enviadoEm.toISOString())
  const partes = [h.enviadoPorNome ? `por ${h.enviadoPorNome}` : '', fmtTamanho(h.tamanho)].filter(Boolean)
  return `Enviado em ${quando}${partes.length ? ` ${partes.join(', ')}` : ''}.`
}
