// src/lib/sefaz/sincronizar.ts
import { db, execRows } from '@/lib/db'
import { nfeRecebidas, nfeDfeSync } from '@/lib/db/schema'
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { carregarCertificado } from './certificado'
import { consultarDistribuicao } from './distribuicao'
import { proximoEstado } from './nsu'
import { avisarNotasNovas } from '@/lib/whatsapp/nfe-recebida'

/** 110111 = Cancelamento de NF-e. Vem mesmo sem manifestação. */
const EVENTO_CANCELAMENTO = '110111'

// Teto de iterações do laço de drenagem: mesmo num backlog de 90 dias, isso
// tem que ter fim — sem teto, um lote sempre-tem-mais poderia rodar pra
// sempre e nunca devolver a função (e a Vercel mataria no meio, sem gravar
// nada de jeito nenhum).
const TETO_ITERACOES = 40

// Orçamento de tempo do laço, em ms: pára de drenar bem antes do
// `maxDuration` de 60s da rota do cron (route.ts), pra sobrar folga pro que
// vem depois de cada iteração (grava no banco) e pro aviso de WhatsApp no
// fim, quando a fila realmente zerar.
const ORCAMENTO_MS = 45_000

export type ResultadoSync = {
  status: 'ok' | 'esperando' | 'sem_certificado' | 'erro'
  documentos: number
  cStat?: number
  erro?: string
}

/**
 * Reivindica a janela de consulta do grupo, num UPSERT condicional: só grava
 * — e só devolve linha — se `proxima_consulta_em` estiver livre (nulo, ou já
 * no passado). Isto substitui a checagem de `podeConsultar` feita ANTES da
 * chamada de rede: aquele padrão (SELECT → decide em JS → grava DEPOIS da
 * consulta, que pode levar até 60s) deixava uma janela aberta grande o
 * bastante pra dois processos concorrentes (o cron e um `curl` de
 * verificação manual, por exemplo) passarem os dois pela checagem antes de
 * qualquer um gravar a trava — e consultarem a mesma faixa de NSU. Foi
 * exatamente essa corrida que causou o cStat 656 de hoje.
 *
 * O UPSERT é atômico: o Postgres serializa duas execuções concorrentes que
 * cheguem juntas nesta linha, e só a primeira enxerga a condição do WHERE
 * como verdadeira — pra segunda a condição já não bate mais, o UPDATE não
 * acha o que atualizar, e o RETURNING vem vazio. Zero linhas = outro
 * processo está na janela → `esperando`.
 *
 * `podeConsultar` (nsu.ts) continua existindo e testado: é a definição de
 * referência da regra (a mesma condição, em JS). O claim aqui é só o guarda
 * de corrida na frente — a regra em si não mudou.
 *
 * Quando o grupo ainda não tem linha em `nfe_dfe_sync`, o INSERT cria a linha
 * (com os defaults de `ult_nsu`/`max_nsu` = '0') e a devolve — antes disso o
 * `podeConsultar` nem chegava a ser chamado, e a primeira consulta do grupo
 * furava a checagem por simplesmente não ter estado nenhum pra checar.
 */
async function reivindicarJanela(grupoId: string, agora: Date): Promise<{ ultNsu: string; maxNsu: string } | null> {
  const agoraIso = agora.toISOString()
  const linhas = await execRows(sql`
    INSERT INTO nfe_dfe_sync (grupo_id, proxima_consulta_em)
    VALUES (${grupoId}, ${agoraIso}::timestamptz + interval '1 hour')
    ON CONFLICT (grupo_id) DO UPDATE SET proxima_consulta_em = ${agoraIso}::timestamptz + interval '1 hour'
      WHERE nfe_dfe_sync.proxima_consulta_em IS NULL
         OR nfe_dfe_sync.proxima_consulta_em <= ${agoraIso}::timestamptz
    RETURNING ult_nsu, max_nsu
  `)
  if (linhas.length === 0) return null
  return { ultNsu: String(linhas[0].ult_nsu), maxNsu: String(linhas[0].max_nsu) }
}

export async function sincronizarGrupo(
  grupo: { id: string; nome: string },
  agora = new Date(),
): Promise<ResultadoSync> {
  const grupoId = grupo.id
  const inicioMs = Date.now()

  const claim = await reivindicarJanela(grupoId, agora)
  if (!claim) return { status: 'esperando', documentos: 0 }

  let ultNsuAtual = claim.ultNsu
  let maxNsuAtual = claim.maxNsu
  let totalDocumentos = 0
  let ultimoCstat: number | undefined
  let filaZerou = false

  try {
    // C3(a): `carregarCertificado` decifra com CERT_MASTER_KEY. Se a chave
    // mestra estiver ausente/errada na Vercel, isto lança — e antes ficava
    // FORA deste try/catch: a exceção subia sem nada gravado em `ultimo_erro`,
    // e a tela ficava muda sobre o motivo (só um 500 em log que ninguém lê).
    // Estar dentro do try é o que faz a falha aparecer pro Cesar.
    const cert = await carregarCertificado(grupoId)
    if (!cert) return { status: 'sem_certificado', documentos: 0 }

    // C1(b): drena a fila numa execução só, em vez de processar um lote e
    // sair. É o padrão sancionado pela SEFAZ (puxar até esvaziar) — e não
    // fura a trava de 1 hora: enquanto `proximoEstado` devolver
    // `proximaConsultaEm: null` (ainda tem fila) o laço consulta de novo na
    // mesma execução; só sai sem armar trava nenhuma. A trava só passa a
    // valer quando a fila realmente zera (cStat 137, ou ultNSU alcança
    // maxNSU) — e nesse ponto o claim já tinha reivindicado a janela de
    // qualquer forma, então não há brecha.
    for (let i = 0; i < TETO_ITERACOES; i++) {
      if (Date.now() - inicioMs > ORCAMENTO_MS) break // orçamento de tempo: sai sem armar trava

      const retorno = await consultarDistribuicao({
        pfx: cert.pfx,
        senha: cert.senha,
        cnpj: cert.cnpj,
        ultNSU: ultNsuAtual,
      })

      const proximo = proximoEstado(retorno, agora, { ultNSU: ultNsuAtual, maxNSU: maxNsuAtual })

      // I2: um lote com documento descartado (XML ilegível, ou schema que o
      // parser não reconhece) perde nota pra sempre — o NSU avança e a SEFAZ
      // não reoferece. Grava em `ultimo_erro` pra não ficar em silêncio.
      const erroDescarte = retorno.descartados === 0
        ? null
        : retorno.descartados === 1
          ? '1 documento do lote não pôde ser lido (NSU perdido, sem como reobter)'
          : `${retorno.descartados} documentos do lote não puderam ser lidos (NSU perdido, sem como reobter)`

      // Lote e NSU na MESMA transação. Gravar as notas e perder o NSU faz
      // reprocessar (inofensivo, a chave é única); gravar o NSU e perder as
      // notas perde nota para sempre, porque a SEFAZ não oferece o mesmo NSU
      // de novo.
      await db.transaction(async (tx) => {
        for (const doc of retorno.documentos) {
          if (doc.tipo === 'evento') {
            if (doc.tipoEvento === EVENTO_CANCELAMENTO) {
              // O cancelamento pode chegar ANTES da nota (o parser descarta
              // docZip ilegível e aquele NSU não é reoferecido, então a nota
              // pode nunca ter passado por aqui). Um UPDATE simples não acha
              // linha nenhuma e o cancelamento se perde: quando a nota enfim
              // chegar, entra como ativa, sem memória de que foi cancelada.
              // Por isso é upsert: se a linha não existe, cria já como
              // 'cancelada' com o que o evento tem; se existe, só marca
              // 'cancelada' e NSU — não mexe nos campos descritivos
              // (emitente, valor, xml) que já estejam lá.
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
            // A nota completa chega DEPOIS do resumo, com NSU novo: a linha
            // do resumo precisa poder virar completa. Situação 'cancelada'
            // não é reescrita — cancelamento é definitivo. Os campos
            // descritivos (emitente, valor, data) são sempre atualizados
            // aqui: se o cancelamento chegou primeiro e criou a linha com
            // emitente vazio, é quando a nota de verdade chega que esses
            // campos são preenchidos.
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
            ultNsu: proximo.ultNSU,
            maxNsu: proximo.maxNSU,
            proximaConsultaEm: proximo.proximaConsultaEm,
            ultimoCstat: retorno.cStat,
            ultimoErro: erroDescarte,
            atualizadoEm: agora,
          })
          .onConflictDoUpdate({
            target: nfeDfeSync.grupoId,
            set: {
              ultNsu: proximo.ultNSU,
              maxNsu: proximo.maxNSU,
              proximaConsultaEm: proximo.proximaConsultaEm,
              ultimoCstat: retorno.cStat,
              ultimoErro: erroDescarte,
              atualizadoEm: agora,
            },
          })
      })

      ultNsuAtual = proximo.ultNSU
      maxNsuAtual = proximo.maxNSU
      totalDocumentos += retorno.documentos.length
      ultimoCstat = retorno.cStat

      if (proximo.proximaConsultaEm !== null) {
        // Fila zerou (cStat 137, ou ultNSU alcançou maxNSU): a trava de 1
        // hora acabou de ser gravada acima, dentro da transação. Sai do laço
        // — não tem mais o que drenar.
        filaZerou = true
        break
      }
      // Senão, `proximaConsultaEm` já saiu `null` da transação acima — ainda
      // tem fila, e nenhuma trava foi armada. Segue emendando.
    }
    // Se o laço saiu por teto de iterações ou por orçamento de tempo (sem
    // `filaZerou`), a última gravação já deixou `proxima_consulta_em: null`
    // — de propósito. Não é preciso "desarmar" nada aqui: a próxima execução
    // do cron já vai poder reivindicar a janela de novo e continuar de onde
    // parou, sem esperar 1 hora.
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao falar com a SEFAZ'
    // Falha de rede (ou de certificado, C3a) NÃO avança o NSU além de onde já
    // tinha chegado — o que já foi drenado em iterações anteriores deste
    // laço já está commitado e fica. NÃO mexe em `proxima_consulta_em`: a
    // janela reivindicada no início continua valendo (evita martelar a SEFAZ
    // de novo em seguida com o mesmo erro); só registra o motivo, pra tela
    // poder dizer que a sincronização está parada, em vez de ficar muda.
    await db.insert(nfeDfeSync)
      .values({ grupoId, ultimoErro: erro, atualizadoEm: agora })
      .onConflictDoUpdate({ target: nfeDfeSync.grupoId, set: { ultimoErro: erro, atualizadoEm: agora } })
    return { status: 'erro', documentos: totalDocumentos, erro }
  }

  // Fora do try/catch de propósito: WhatsApp fora do ar não pode virar
  // status 'erro' de uma sincronização que, na verdade, deu certo.
  //
  // O gatilho é a fila ter zerado NESTA execução (`filaZerou`) — não "este
  // lote trouxe nota nova" (isso já foi tentado e deu errado): combinado com
  // "só avisa quando a fila zerar", a nota gravada numa rodada de backlog
  // vira "conhecida" na mesma rodada e nunca mais aparece como nova depois —
  // ela nunca seria avisada. Em vez disso, `avisado_em` marca no banco o que
  // já foi avisado; o aviso sobrevive entre execuções, e não depende do que
  // cada lote trouxe.
  //
  // Durante o backlog (fila ainda não zerou, ou o laço saiu por teto/tempo
  // sem zerar) não avisa e não marca nada — as notas seguem gravadas e
  // visíveis na tela, só pendentes de aviso. Quando a fila zera, busca TODAS
  // as pendentes do grupo (de qualquer execução anterior, não só desta) e
  // tenta avisar de uma vez, numa mensagem só.
  if (filaZerou) {
    try {
      const pendentes = await db.select({
        emitenteNome: nfeRecebidas.emitenteNome,
        valor: nfeRecebidas.valor,
        chave: nfeRecebidas.chave,
      }).from(nfeRecebidas)
        .where(and(
          eq(nfeRecebidas.grupoId, grupoId),
          isNull(nfeRecebidas.avisadoEm),
          ne(nfeRecebidas.situacao, 'cancelada'),
        ))

      if (pendentes.length > 0) {
        const resultado = await avisarNotasNovas(grupo.nome, pendentes.map(d => ({
          emitenteNome: d.emitenteNome,
          valor: d.valor ?? '0',
          chave: d.chave,
        })))

        // Só marca como avisada se o WhatsApp confirmou o envio (`'enviado'`).
        // `'sem_numero'` ou `'erro'` não marcam nada: a nota continua
        // pendente e entra de novo na busca da próxima execução — não pode
        // sumir da fila de pendências sem ter avisado ninguém de verdade.
        if (resultado === 'enviado') {
          await db.update(nfeRecebidas)
            .set({ avisadoEm: agora })
            .where(and(
              eq(nfeRecebidas.grupoId, grupoId),
              inArray(nfeRecebidas.chave, pendentes.map(p => p.chave)),
            ))
        }
      }
    } catch {
      // Aviso é efeito colateral: falha aqui (SELECT, envio, UPDATE) não pode
      // subir e derrubar a sincronização. Como nada foi marcado, a próxima
      // execução tenta de novo — as pendentes continuam no banco.
    }
  }

  return { status: 'ok', documentos: totalDocumentos, cStat: ultimoCstat }
}
