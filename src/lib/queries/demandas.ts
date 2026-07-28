import { db } from '@/lib/db'
import { demandas, lojas, usuarios } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

export type DemandaRecibo = Awaited<ReturnType<typeof buscarDemandaParaRecibo>>

// Dados para o recibo imprimível do sinal de uma demanda.
export async function buscarDemandaParaRecibo(id: string) {
  const [d] = await db
    .select({
      id: demandas.id,
      numero: demandas.numero,
      modelo: demandas.modelo,
      cor: demandas.cor,
      valorSinal: demandas.valorSinal,
      meioPagamento: demandas.meioPagamento,
      sinalRecebido: demandas.sinalRecebido,
      sinalRecebidoEm: demandas.sinalRecebidoEm,
      criadoEm: demandas.criadoEm,
      lojaId: demandas.lojaId,
      lojaNome: lojas.nome,
      solicitanteNome: usuarios.nome,
      clienteNome: demandas.clienteNome,
      clienteCpf: demandas.clienteCpf,
      clienteCelular: demandas.clienteCelular,
      clienteEmail: demandas.clienteEmail,
      clienteCep: demandas.clienteCep,
      clienteLogradouro: demandas.clienteLogradouro,
      clienteNumero: demandas.clienteNumero,
      clienteComplemento: demandas.clienteComplemento,
      clienteBairro: demandas.clienteBairro,
      clienteCidade: demandas.clienteCidade,
      clienteEstado: demandas.clienteEstado,
    })
    .from(demandas)
    .innerJoin(lojas, eq(demandas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
    .where(eq(demandas.id, id))
    .limit(1)
  return d ?? null
}

export type DemandaCompativel = Awaited<ReturnType<typeof listarDemandasComSinalAbertas>>[number]

// Demandas abertas com sinal e cliente — candidatas a vínculo com uma venda no estoque.
export async function listarDemandasComSinalAbertas(lojaIds: string[]) {
  if (lojaIds.length === 0) return []
  return db
    .select({
      id: demandas.id,
      numero: demandas.numero,
      modelo: demandas.modelo,
      modeloId: demandas.modeloId,
      cor: demandas.cor,
      valorSinal: demandas.valorSinal,
      meioPagamento: demandas.meioPagamento,
      lojaId: demandas.lojaId,
      solicitanteNome: usuarios.nome,
      clienteNome: demandas.clienteNome,
      clienteCpf: demandas.clienteCpf,
      clienteCelular: demandas.clienteCelular,
      clienteEmail: demandas.clienteEmail,
      clienteCep: demandas.clienteCep,
      clienteLogradouro: demandas.clienteLogradouro,
      clienteNumero: demandas.clienteNumero,
      clienteComplemento: demandas.clienteComplemento,
      clienteBairro: demandas.clienteBairro,
      clienteCidade: demandas.clienteCidade,
      clienteEstado: demandas.clienteEstado,
    })
    .from(demandas)
    .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
    .where(and(
      eq(demandas.status, 'aberta'),
      eq(demandas.sinalRecebido, true),
      inArray(demandas.lojaId, lojaIds),
    ))
}
