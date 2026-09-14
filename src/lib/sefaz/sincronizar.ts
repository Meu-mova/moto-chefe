// src/lib/sefaz/sincronizar.ts
import { db } from '@/lib/db'
import { nfeRecebidas, nfeDfeSync } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { carregarCertificado } from './certificado'
import { consultarDistribuicao } from './distribuicao'
import { podeConsultar, proximoEstado } from './nsu'

/** 110111 = Cancelamento de NF-e. Vem mesmo sem manifestação. */
const EVENTO_CANCELAMENTO = '110111'

export type ResultadoSync = {
  status: 'ok' | 'esperando' | 'sem_certificado' | 'erro'
  documentos: number
  cStat?: number
  erro?: string
}

export async function sincronizarGrupo(
  grupo: { id: string; nome: string },
  agora = new Date(),
): Promise<ResultadoSync> {
  const grupoId = grupo.id
  const [estado] = await db.select().from(nfeDfeSync).where(eq(nfeDfeSync.grupoId, grupoId)).limit(1)

  if (estado && !podeConsultar({ proximaConsultaEm: estado.proximaConsultaEm }, agora)) {
    return { status: 'esperando', documentos: 0 }
  }

  const cert = await carregarCertificado(grupoId)
  if (!cert) return { status: 'sem_certificado', documentos: 0 }

  let retorno
  try {
    retorno = await consultarDistribuicao({
      pfx: cert.pfx,
      senha: cert.senha,
      cnpj: cert.cnpj,
      ultNSU: estado?.ultNsu ?? '0',
    })
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao falar com a SEFAZ'
    // Falha de rede NÃO avança o NSU e NÃO arma a trava: na próxima hora tenta
    // de novo do mesmo ponto. Só registra para a tela poder dizer que a
    // sincronização está parada, em vez de ficar muda.
    await db.insert(nfeDfeSync)
      .values({ grupoId, ultimoErro: erro, atualizadoEm: agora })
      .onConflictDoUpdate({ target: nfeDfeSync.grupoId, set: { ultimoErro: erro, atualizadoEm: agora } })
    return { status: 'erro', documentos: 0, erro }
  }

  const proximo = proximoEstado(retorno, agora)

  // Lote e NSU na MESMA transação. Gravar as notas e perder o NSU faz reprocessar
  // (inofensivo, a chave é única); gravar o NSU e perder as notas perde nota para
  // sempre, porque a SEFAZ não oferece o mesmo NSU de novo.
  await db.transaction(async (tx) => {
    for (const doc of retorno.documentos) {
      if (doc.tipo === 'evento') {
        if (doc.tipoEvento === EVENTO_CANCELAMENTO) {
          await tx.update(nfeRecebidas)
            .set({ situacao: 'cancelada' })
            .where(sql`${nfeRecebidas.grupoId} = ${grupoId} AND ${nfeRecebidas.chave} = ${doc.chave}`)
        }
        continue
      }

      await tx.insert(nfeRecebidas)
        .values({
          grupoId,
          chave: doc.chave,
          nsu: doc.nsu,
          emitenteCnpj: doc.emitenteCnpj,
          emitenteNome: doc.emitenteNome,
          valor: doc.valor || null,
          dataEmissao: doc.dataEmissao,
          situacao: doc.tipo === 'completa' ? 'completa' : 'resumo',
          xml: doc.tipo === 'completa' ? doc.xml : null,
        })
        // A nota completa chega DEPOIS do resumo, com NSU novo: a linha do
        // resumo precisa poder virar completa. Situação 'cancelada' não é
        // reescrita — cancelamento é definitivo.
        .onConflictDoUpdate({
          target: [nfeRecebidas.grupoId, nfeRecebidas.chave],
          set: {
            nsu: doc.nsu,
            situacao: sql`CASE WHEN ${nfeRecebidas.situacao} = 'cancelada' THEN 'cancelada' ELSE excluded.situacao END`,
            xml: sql`COALESCE(excluded.xml, ${nfeRecebidas.xml})`,
          },
        })
    }

    await tx.insert(nfeDfeSync)
      .values({
        grupoId,
        ultNsu: proximo.ultNSU || '0',
        maxNsu: proximo.maxNSU || '0',
        proximaConsultaEm: proximo.proximaConsultaEm,
        ultimoCstat: retorno.cStat,
        ultimoErro: null,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: nfeDfeSync.grupoId,
        set: {
          ultNsu: proximo.ultNSU || '0',
          maxNsu: proximo.maxNSU || '0',
          proximaConsultaEm: proximo.proximaConsultaEm,
          ultimoCstat: retorno.cStat,
          ultimoErro: null,
          atualizadoEm: agora,
        },
      })
  })

  return { status: 'ok', documentos: retorno.documentos.length, cStat: retorno.cStat }
}
