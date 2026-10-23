import { desc, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { lojas, motosFiscal, vendas } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { normalizarCest } from '@/lib/nfe-fiscal'
import { escolherTentativa } from '@/lib/notagateway/tentativa'
import { conferirCompradorDaVenda, gravarCompradorDaVenda, type CompradorVenda } from '@/lib/venda-comprador'

/**
 * Correção da nota recusada (#347): grava no cadastro de origem (comprador na
 * venda, NCM e CEST na ficha da moto) e a nota é remontada dele no reenvio.
 * Empresa e tributação não se corrigem aqui: são da configuração do grupo.
 */
export type CorrecaoNf = {
  comprador?: Pick<CompradorVenda,
    'clienteNome' | 'clienteCpf' | 'clienteCep' | 'clienteLogradouro' | 'clienteNumero' | 'clienteComplemento'
    | 'clienteBairro' | 'clienteCidade' | 'clienteEstado' | 'clienteIndicadorIe' | 'clienteInscricaoEstadual'>
  moto?: { ncm: string; cest: string }
}

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
type Usuario = Parameters<typeof podeAbrirRegistroDaLoja>[0]

export async function gravarCorrecaoDaNf(
  tx: Executor,
  usuario: Usuario,
  motoId: string,
  ambiente: 'Homologacao' | 'Producao',
  correcao: CorrecaoNf,
): Promise<void> {
  const [venda] = await tx.select({ id: vendas.id, numero: vendas.numero, lojaId: vendas.lojaId, motoId: vendas.motoId, clienteCpf: vendas.clienteCpf, grupoId: lojas.grupoId })
    .from(vendas).innerJoin(lojas, eq(lojas.id, vendas.lojaId))
    .where(eq(vendas.motoId, motoId)).orderBy(desc(vendas.dataVenda)).limit(1)
  // Mesma regra da edição da venda; venda de outra Conta responde como inexistente.
  const pode = venda && (usuario.lojaId ? venda.lojaId === usuario.lojaId : await podeAbrirRegistroDaLoja(usuario, venda.lojaId, tx))
  if (!venda || !pode) throw new Error('Venda não encontrada')

  const tentativa = await escolherTentativa(tx, { vendaId: venda.id, grupoId: venda.grupoId, numeroVenda: venda.numero, ambiente })
  if (!tentativa.notaId) throw new Error('A última nota desta venda não está recusada: não há o que corrigir')

  let ficha: { ncm: string; cest: string | null } | null = null
  if (correcao.moto) {
    const ncm = correcao.moto.ncm.replace(/\D/g, '')
    if (ncm.length !== 8) throw new Error('NCM precisa ter 8 dígitos')
    const c = normalizarCest(correcao.moto.cest)
    if (!c.ok) throw new Error(c.error)
    ficha = { ncm, cest: c.cest }
  }
  // Documento inválido barra antes de gravar qualquer coisa (ADR-0015).
  const comprador = correcao.comprador ? conferirCompradorDaVenda(correcao.comprador, venda.clienteCpf) : null

  if (comprador) await gravarCompradorDaVenda(tx, venda, comprador)
  if (ficha) {
    const atualizadas = await tx.update(motosFiscal).set(ficha)
      .where(eq(motosFiscal.motoId, venda.motoId)).returning({ id: motosFiscal.motoId })
    if (!atualizadas.length) throw new Error('Moto sem ficha fiscal')
  }
}
