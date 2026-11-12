import { and, eq, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import { contas, grupos, lojas, motos } from '@/lib/db/schema'
import { configNotaGateway, ufDaEmpresa } from './client'

type Executor = Pick<typeof db, 'execute'>

const linhas = async <T>(exec: Executor, q: SQL) => ((await exec.execute(q)) as unknown as { rows: T[] }).rows

export type GrupoEmissor = {
  /** Grupo cujo CNPJ emite a NF de saída. */
  grupoId: string
  nome: string
  cnpj: string
  /** Grupo da loja da venda: é nele que a permissão do usuário se confere. */
  grupoDaLojaId: string
  /** A NF sai por um CNPJ diferente do da loja da venda. */
  outroCnpj: boolean
}

/**
 * A NF de saída sai pelo CNPJ que comprou a moto (#552): o grupo de entrada, quando a
 * chave de transferência da Conta está ligada e esse grupo é da mesma Conta da loja da
 * venda. Em qualquer outro caso, o grupo da loja, como antes.
 */
export async function grupoEmissorDaVenda(motoId: string, lojaIdDaVenda: string, exec: Pick<typeof db, 'select'> = db): Promise<GrupoEmissor | null> {
  const ge = alias(grupos, 'ge')
  const [r] = await exec.select({
    grupoDaLojaId: grupos.id, nomeLoja: grupos.nome, cnpjLoja: grupos.cnpj,
    entradaId: ge.id, nomeEntrada: ge.nome, cnpjEntrada: ge.cnpj,
  })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .innerJoin(contas, eq(contas.id, grupos.contaId))
    .leftJoin(motos, eq(motos.id, motoId))
    .leftJoin(ge, and(eq(ge.id, motos.grupoEntradaId), eq(ge.contaId, grupos.contaId), eq(contas.transferenciaEntreGrupos, true)))
    .where(eq(lojas.id, lojaIdDaVenda)).limit(1)
  if (!r) return null
  return r.entradaId && r.nomeEntrada != null && r.cnpjEntrada != null
    ? { grupoId: r.entradaId, nome: r.nomeEntrada, cnpj: r.cnpjEntrada, grupoDaLojaId: r.grupoDaLojaId, outroCnpj: r.entradaId !== r.grupoDaLojaId }
    : { grupoId: r.grupoDaLojaId, nome: r.nomeLoja, cnpj: r.cnpjLoja, grupoDaLojaId: r.grupoDaLojaId, outroCnpj: false }
}

/** O que falta para o grupo emitir pelo MOVA; vazio = pronto. */
export async function faltasParaEmitir(grupoId: string, exec: Executor = db): Promise<string[]> {
  const [r] = await linhas<{ empresa: boolean; a1: boolean }>(exec, sql`
    select
      exists (select 1 from notagateway_config n where n.grupo_id = ${grupoId} and n.token <> '' and coalesce(n.empresa_id, '') <> '') as empresa,
      exists (select 1 from certificados_digitais d where d.grupo_id = ${grupoId} and d.valido_ate > now()) as a1`)
  const faltas: string[] = []
  if (!r?.a1) faltas.push('sem certificado A1 válido')
  if (!r?.empresa) faltas.push('sem empresa na Nota Gateway')
  return faltas
}

/**
 * UF do CNPJ que emite a NF da moto, pela mesma consulta da emissão (Consultar Empresa na NG). Nula quando
 * não dá para saber (grupo sem NG, NG fora do ar): quem chama decide; o pedido segue (#848).
 */
export async function ufDoEmissorDaMoto(motoId: string, lojaId: string): Promise<string | null> {
  try {
    const emissor = await grupoEmissorDaVenda(motoId, lojaId)
    const cfg = emissor && await configNotaGateway(emissor.grupoId)
    return cfg ? await ufDaEmpresa(cfg) : null
  } catch (e) {
    // Mensagens do client só trazem o status HTTP, sem token nem empresaId.
    console.warn('[pedido] UF do emissor indisponível, pedido segue sem a trava:', e instanceof Error ? e.message : e)
    return null
  }
}
