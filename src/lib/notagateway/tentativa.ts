import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { notasFiscaisSaida } from '@/lib/db/schema'
import { registrarAcaoSensivel } from '@/lib/log-acoes'
import { reenviaMesmoNumero } from '@/lib/notagateway/status'
import { idExternoNfe, proximaTentativa } from '@/lib/notagateway/venda'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
type Ambiente = 'Homologacao' | 'Producao'

/** notaId preenchido: reenvio da tentativa recusada, na mesma linha. */
export type Tentativa = { notaId: string | null; idExterno: string }

/**
 * Id do próximo envio da venda (#347). A última tentativa recusada que não foi
 * denegada se reenvia com o mesmo id, e a Nota Gateway mantém o número da nota;
 * nos demais casos, id novo. Filtra pelo grupo: nota de outra Conta nunca vira
 * reenvio.
 */
export async function escolherTentativa(
  tx: Executor,
  venda: { vendaId: string; grupoId: string; numeroVenda: number; ambiente: Ambiente },
): Promise<Tentativa & { tentativa: number }> {
  const notas = await tx.select({ id: notasFiscaisSaida.id, idExterno: notasFiscaisSaida.idExterno, status: notasFiscaisSaida.status, motivoStatus: notasFiscaisSaida.motivoStatus })
    .from(notasFiscaisSaida)
    .where(and(eq(notasFiscaisSaida.vendaId, venda.vendaId), eq(notasFiscaisSaida.grupoId, venda.grupoId)))
  const proxima = proximaTentativa(notas.map(n => n.idExterno), venda.numeroVenda, venda.ambiente)
  const ultima = proxima > 1 ? notas.find(n => n.idExterno === idExternoNfe(venda.numeroVenda, proxima - 1, venda.ambiente)) : undefined
  if (ultima && reenviaMesmoNumero(ultima)) return { notaId: ultima.id, idExterno: ultima.idExterno, tentativa: proxima - 1 }
  return { notaId: null, idExterno: idExternoNfe(venda.numeroVenda, proxima, venda.ambiente), tentativa: proxima }
}

/**
 * Grava o envio: linha nova, ou a linha recusada volta a "Enviando" com o payload
 * novo. O número da nota fica; o motivo da recusa anterior está no log
 * nf_emitida daquele envio. Só reaproveita linha recusada do mesmo grupo.
 */
export async function gravarEnvio(
  tx: Executor,
  tentativa: Tentativa,
  v: { vendaId: string; vendaNumero: number; grupoId: string; ambiente: Ambiente; payload: unknown; emitidaPor: string },
): Promise<string> {
  if (!tentativa.notaId) {
    const [nova] = await tx.insert(notasFiscaisSaida).values({
      vendaId: v.vendaId, vendaNumero: v.vendaNumero, grupoId: v.grupoId, idExterno: tentativa.idExterno, ambiente: v.ambiente,
      status: 'Enviando', payload: v.payload, emitidaPor: v.emitidaPor,
    }).returning({ id: notasFiscaisSaida.id })
    return nova.id
  }
  const mesmaLinha = and(
    eq(notasFiscaisSaida.id, tentativa.notaId),
    eq(notasFiscaisSaida.idExterno, tentativa.idExterno),
    eq(notasFiscaisSaida.vendaId, v.vendaId),
    eq(notasFiscaisSaida.grupoId, v.grupoId),
    eq(notasFiscaisSaida.status, 'Negada'),
  )
  const [anterior] = await tx.select({ numero: notasFiscaisSaida.numero, status: notasFiscaisSaida.status, motivoStatus: notasFiscaisSaida.motivoStatus })
    .from(notasFiscaisSaida).where(mesmaLinha).limit(1)
  if (!anterior) throw new Error('A nota recusada mudou enquanto o reenvio era preparado. Atualize a tela e tente de novo.')
  // O UPDATE apaga o motivo: a recusa de antes do deploy, sem log, se perderia (#347).
  try {
    await registrarAcaoSensivel({
      tipo: 'nf_emitida', usuarioId: v.emitidaPor, grupoId: v.grupoId,
      detalhe: {
        origem: 'mova', etapa: 'reenvio', notaId: tentativa.notaId, vendaId: v.vendaId, numeroVenda: v.vendaNumero, numeroNf: anterior.numero,
        ambiente: v.ambiente, statusAnterior: anterior.status, motivoAnterior: anterior.motivoStatus,
      },
    }, tx)
  } catch (e) {
    console.error('[log-acoes] falha ao registrar o reenvio:', e instanceof Error ? e.message : e)
  }
  const [reenvio] = await tx.update(notasFiscaisSaida)
    .set({
      status: 'Enviando', motivoStatus: null, payload: v.payload, emitidaPor: v.emitidaPor,
      chave: null, protocolo: null, linkDanfe: null, linkXml: null, dataAutorizacao: null,
      atualizadoEm: sql`now()` as unknown as Date,
    })
    .where(mesmaLinha)
    .returning({ id: notasFiscaisSaida.id })
  if (!reenvio) throw new Error('A nota recusada mudou enquanto o reenvio era preparado. Atualize a tela e tente de novo.')
  return reenvio.id
}

/**
 * Um registro nf_emitida por envio, com o motivo: o reenvio sobrescreve o motivo
 * na linha da nota, e a recusa de cada envio só fica aqui (#347).
 */
export async function registrarEnvio(
  tx: Executor,
  envio: { usuarioId: string; grupoId: string; vendaId: string; numeroVenda: number; ambiente: Ambiente },
  nota: { id: string; numero: string | null; status: string; motivoStatus: string | null },
): Promise<void> {
  await registrarAcaoSensivel({
    tipo: 'nf_emitida', usuarioId: envio.usuarioId, grupoId: envio.grupoId,
    detalhe: {
      origem: 'mova', notaId: nota.id, vendaId: envio.vendaId, numeroVenda: envio.numeroVenda, numeroNf: nota.numero,
      ambiente: envio.ambiente, status: nota.status, motivoStatus: nota.motivoStatus,
    },
  }, tx)
}
