// src/lib/sefaz/sincronizar.ts
import { db } from '@/lib/db'
import { nfeRecebidas, nfeDfeSync } from '@/lib/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { carregarCertificado } from './certificado'
import { consultarDistribuicao } from './distribuicao'
import { podeConsultar, proximoEstado } from './nsu'
import { avisarNotasNovas } from '@/lib/whatsapp/nfe-recebida'

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

  // `proximoEstado` devolve '' quando a SEFAZ não respondeu o campo (rejeição,
  // cStat de erro etc.) — isso significa "não sei", não "começar do zero".
  // `|| '0'` já causou um incidente real: um cStat 656 com maxNSU vazio virou
  // `max_nsu = 0` no banco, o que reabriria a leitura desde o início da fila
  // (até 90 dias) na próxima consulta. O fallback correto é o ÚLTIMO ESTADO
  // CONHECIDO (o que já estava salvo), e só na ausência de qualquer estado
  // anterior é que cai em '0' — primeira consulta do grupo, nunca houve nada.
  const ultNsuFinal = proximo.ultNSU || estado?.ultNsu || '0'
  const maxNsuFinal = proximo.maxNSU || estado?.maxNsu || '0'

  // Descobre o que é nota nova de verdade ANTES da transação: `returning` do
  // upsert lá embaixo devolve linha tanto em INSERT quanto em UPDATE, então não
  // serve para diferenciar nota nova de nota que só teve o NSU atualizado (ex.:
  // resumo que virou completa). Comparar contra o que já está no banco, aqui, é
  // a única forma confiável.
  //
  // Filtra pelas chaves do próprio lote (`inArray`) em vez de trazer a tabela
  // inteira do grupo: a tabela cresce para sempre, o lote tem só a dúzia de
  // chaves que importam agora. Lote sem documento (só evento, ou vazio) nem
  // chega a consultar — `inArray` com lista vazia é sempre falso no Postgres,
  // então a guarda evita uma query inútil, não corrige um bug.
  const chavesDoLote = [...new Set(retorno.documentos.filter(d => d.tipo !== 'evento').map(d => d.chave))]
  const jaConhecidas = chavesDoLote.length === 0
    ? new Set<string>()
    : new Set(
        (await db.select({ chave: nfeRecebidas.chave }).from(nfeRecebidas)
           .where(and(eq(nfeRecebidas.grupoId, grupoId), inArray(nfeRecebidas.chave, chavesDoLote))))
          .map(l => l.chave),
      )
  const novas = retorno.documentos.filter(d => d.tipo !== 'evento' && !jaConhecidas.has(d.chave))

  // Lote e NSU na MESMA transação. Gravar as notas e perder o NSU faz reprocessar
  // (inofensivo, a chave é única); gravar o NSU e perder as notas perde nota para
  // sempre, porque a SEFAZ não oferece o mesmo NSU de novo.
  await db.transaction(async (tx) => {
    for (const doc of retorno.documentos) {
      if (doc.tipo === 'evento') {
        if (doc.tipoEvento === EVENTO_CANCELAMENTO) {
          // O cancelamento pode chegar ANTES da nota (o parser descarta docZip
          // ilegível e aquele NSU não é reoferecido, então a nota pode nunca
          // ter passado por aqui). Um UPDATE simples não acha linha nenhuma e
          // o cancelamento se perde: quando a nota enfim chegar, entra como
          // ativa, sem memória de que foi cancelada. Por isso é upsert: se a
          // linha não existe, cria já como 'cancelada' com o que o evento tem;
          // se existe, só marca 'cancelada' e NSU — não mexe nos campos
          // descritivos (emitente, valor, xml) que já estejam lá.
          await tx.insert(nfeRecebidas)
            .values({
              grupoId,
              chave: doc.chave,
              nsu: doc.nsu,
              emitenteCnpj: doc.emitenteCnpj,
              emitenteNome: '',
              valor: null,
              dataEmissao: doc.dataEmissao,
              situacao: 'cancelada',
              xml: null,
            })
            .onConflictDoUpdate({
              target: [nfeRecebidas.grupoId, nfeRecebidas.chave],
              set: {
                nsu: doc.nsu,
                situacao: 'cancelada',
              },
            })
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
        // reescrita — cancelamento é definitivo. Os campos descritivos
        // (emitente, valor, data) são sempre atualizados aqui: se o
        // cancelamento chegou primeiro e criou a linha com emitente vazio, é
        // quando a nota de verdade chega que esses campos são preenchidos.
        .onConflictDoUpdate({
          target: [nfeRecebidas.grupoId, nfeRecebidas.chave],
          set: {
            nsu: doc.nsu,
            emitenteNome: doc.emitenteNome,
            valor: doc.valor || null,
            dataEmissao: doc.dataEmissao,
            situacao: sql`CASE WHEN ${nfeRecebidas.situacao} = 'cancelada' THEN 'cancelada' ELSE excluded.situacao END`,
            xml: sql`COALESCE(excluded.xml, ${nfeRecebidas.xml})`,
          },
        })
    }

    await tx.insert(nfeDfeSync)
      .values({
        grupoId,
        ultNsu: ultNsuFinal,
        maxNsu: maxNsuFinal,
        proximaConsultaEm: proximo.proximaConsultaEm,
        ultimoCstat: retorno.cStat,
        ultimoErro: null,
        atualizadoEm: agora,
      })
      .onConflictDoUpdate({
        target: nfeDfeSync.grupoId,
        set: {
          ultNsu: ultNsuFinal,
          maxNsu: maxNsuFinal,
          proximaConsultaEm: proximo.proximaConsultaEm,
          ultimoCstat: retorno.cStat,
          ultimoErro: null,
          atualizadoEm: agora,
        },
      })
  })

  // Fora da transação de propósito: WhatsApp fora do ar não pode desfazer a
  // gravação das notas nem o avanço do NSU. O aviso é consequência, não parte
  // do registro.
  //
  // Só avisa quando a fila acabou (regime), nunca durante o backlog: o cron
  // roda de hora em hora e `podeConsultar` libera enquanto houver fila, então
  // numa ativação nova (lote grande, milhares de notas atrasadas) o aviso
  // dispararia dezenas de mensagens ao longo de várias rodadas — ninguém quer
  // isso no celular. `proximo.proximaConsultaEm === null` é a mesma condição
  // que `proximoEstado` (nsu.ts) usa para dizer "ainda tem fila"; só quando
  // ela vem preenchida é que esta rodada alcançou o fim da fila, e "chegou
  // nota nova" volta a significar nota nova de verdade. As notas continuam
  // sendo gravadas normalmente durante o backlog e aparecem na tela — só o
  // WhatsApp fica quieto até então.
  if (novas.length > 0 && proximo.proximaConsultaEm !== null) {
    await avisarNotasNovas(grupo.nome, novas.map(d => ({
      emitenteNome: d.emitenteNome,
      valor: d.valor,
      chave: d.chave,
    }))).catch(() => {})
  }

  return { status: 'ok', documentos: retorno.documentos.length, cStat: retorno.cStat }
}
