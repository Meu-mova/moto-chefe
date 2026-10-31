// Regras da tela do log (#198): pura, sem banco, para testar sem Postgres.
import { periodoBr } from '@/lib/notas-emitidas'

export const ROTULO_TIPO: Record<string, string> = {
  login: 'Entrou', troca_grupo: 'Trocou de grupo', acesso_dia: '1º acesso do dia',
  venda_cancelada: 'Cancelou venda', nf_emitida: 'Emitiu NF', nf_cancelada: 'Cancelou NF',
  permissao_alterada: 'Mudou permissão',
  certificado_aplicado: 'Aplicou certificado A1', portal_aplicado: 'Aplicou login do portal',
  notas_enviadas_contador: 'Enviou notas ao contador', logo_danfe_enviada: 'Enviou logo do DANFE',
  preco_compra_alterado: 'Corrigiu preço de compra',
  transferencia_grupos_alterada: 'Mudou transferência entre grupos',
}
export const TIPOS_SENSIVEIS = ['venda_cancelada', 'nf_emitida', 'nf_cancelada', 'permissao_alterada', 'certificado_aplicado', 'portal_aplicado', 'notas_enviadas_contador', 'logo_danfe_enviada', 'preco_compra_alterado', 'transferencia_grupos_alterada']
/** Desfazem algo já feito: a tela pinta de vermelho. */
export const TIPOS_DESTRUTIVOS = ['venda_cancelada', 'nf_cancelada']
export const ehSensivel = (tipo: string) => TIPOS_SENSIVEIS.includes(tipo)

export type EventoLog = {
  id: string
  tipo: string
  usuarioId: string
  /** Nulo quando o usuário foi excluído (o log não tem FK, 0136). */
  usuarioNome: string | null
  contaDoUsuario: string | null
  contaId: string | null
  grupoNome: string | null
  ip: string | null
  userAgent: string | null
  dia: string
  criadoEm: Date
  detalhe: Record<string, unknown> | null
}

export type PessoaNoLog = {
  usuarioId: string
  nome: string
  ultimo: Date
  dias: number
  dispositivos: number
  sensiveis: number
  /** Agiu numa Conta que não é a dele (admin_geral, autorização): o dono da Conta precisa notar. */
  deFora: boolean
  eventos: EventoLog[]
}

export function dispositivoLegivel(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido'
  const sistema = /iPhone|iPad/.test(ua) ? (ua.includes('iPad') ? 'iPad' : 'iPhone')
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'Outro'
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'navegador'
  return `${sistema} · ${navegador}`
}

/** Usuário excluído não tem Conta conhecida: sem como saber, não acusa. */
export function eventoDeFora(e: EventoLog): boolean {
  return e.contaId !== null && e.usuarioNome !== null && e.contaDoUsuario !== e.contaId
}

export function agruparPorPessoa(eventos: EventoLog[]): PessoaNoLog[] {
  const porPessoa = new Map<string, EventoLog[]>()
  for (const e of eventos) porPessoa.set(e.usuarioId, [...(porPessoa.get(e.usuarioId) ?? []), e])
  return [...porPessoa.entries()].map(([usuarioId, es]) => {
    const ordenados = [...es].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
    return {
      usuarioId,
      nome: ordenados[0].usuarioNome ?? 'Usuário excluído',
      ultimo: ordenados[0].criadoEm,
      dias: new Set(es.map(e => e.dia)).size,
      dispositivos: new Set(es.map(e => dispositivoLegivel(e.userAgent))).size,
      sensiveis: es.filter(e => ehSensivel(e.tipo)).length,
      deFora: es.some(eventoDeFora),
      eventos: ordenados,
    }
  }).sort((a, b) => b.ultimo.getTime() - a.ultimo.getTime())
}

const brl = (v: unknown) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  // toLocaleString usa espaço sem quebra entre R$ e o valor.
  .replace(/\u00a0/g, ' ')

export function resumoDoEvento(e: EventoLog): string {
  const d = e.detalhe ?? {}
  // Campo ausente (linha antiga) aparece como "?", nunca "undefined"; as condições leem d direto.
  const v = (k: string) => d[k] ?? '?'
  switch (e.tipo) {
    case 'troca_grupo': return `Entrou em ${e.grupoNome ?? 'grupo excluído'}`
    case 'venda_cancelada': return `Venda #${v('numeroVenda')} · ${v('cliente')} · ${d.valor == null ? '?' : brl(d.valor)} · “${v('motivo')}”`
    case 'nf_emitida': {
      const partes = [d.numeroNf ? `NF ${d.numeroNf} da venda #${d.numeroVenda ?? '?'}` : `NF da venda #${d.numeroVenda ?? '?'}`]
      if (d.status) partes.push(String(d.status))
      if (d.ambiente === 'Homologacao') partes.push('homologação')
      if (d.origem === 'bling') partes.push('pelo Bling')
      if (d.origem === 'confirmada') partes.push('emitida fora e confirmada')
      return partes.join(' · ')
    }
    case 'nf_cancelada':
      return [`NF ${v('numeroNf')}`, `“${v('motivo')}”`, d.extemporaneo ? 'extemporâneo' : null, d.ambiente === 'Homologacao' ? 'homologação' : null]
        .filter(Boolean).join(' · ')
    case 'permissao_alterada': {
      const campos = Array.isArray(d.campos) ? `: ${d.campos.join(', ')}` : ''
      const papel = d.papelAntes ? ` (${d.papelAntes} → ${d.papel})` : ''
      return `${v('alvoNome')} · ${v('acao')}${campos}${papel}`
    }
    case 'certificado_aplicado': return `${v('titular')} · válido até ${v('validoAte')} · UF ${v('uf')} · da adesão`
    case 'portal_aplicado': return `${v('loja')} · ${v('email')} · da adesão`
    case 'notas_enviadas_contador':
      return `${v('para')} · ${typeof d.de === 'string' && typeof d.ate === 'string' ? periodoBr(d.de, d.ate) : '?'} · ${v('notas')} notas${d.modo === 'link' ? ' · por link' : ''}`
    case 'logo_danfe_enviada': return `${e.grupoNome ?? 'grupo excluído'} · ${v('kb')} KB`
    case 'preco_compra_alterado': return `${v('chassi')} · ${d.de == null ? '?' : brl(d.de)} → ${brl(d.para)}`
    case 'transferencia_grupos_alterada': return `${v('contaNome')} · ${d.para ? 'ligou' : 'desligou'}`
    default: return `${dispositivoLegivel(e.userAgent)} · IP ${e.ip ?? '?'}`
  }
}

/** null = não vê nada (sócio sem Conta). 'todas' só para o admin_geral sem filtro. */
export function contaDoFiltro(usuario: { papel: string; contaId: string | null }, contaParam: string | undefined): { contaId: string } | null {
  if (usuario.papel === 'admin_geral') return { contaId: contaParam || 'todas' }
  return usuario.contaId ? { contaId: usuario.contaId } : null
}
