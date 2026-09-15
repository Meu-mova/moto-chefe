// src/lib/sefaz/sincronizar.ts
import { db, execRows } from '@/lib/db'
import { nfeRecebidas, nfeDfeSync } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { carregarCertificado } from './certificado'
import { consultarDistribuicao } from './distribuicao'
import { proximoEstado, deveContinuarDrenando, proximaConsultaEmDrenagem, estadoInicialDaLeitura, TETO_ITERACOES_DRENAGEM } from './nsu'

/** 110111 = Cancelamento de NF-e. Vem mesmo sem manifestação. */
const EVENTO_CANCELAMENTO = '110111'

export type ResultadoSync = {
  status: 'ok' | 'esperando' | 'sem_certificado' | 'erro'
  documentos: number
  /**
   * Documentos que a SEFAZ entregou e que o parser não conseguiu virar nota
   * (XML ilegível, ou schema fora das formas conhecidas). Sobe junto no
   * retorno, e não só em `ultimo_erro`, porque `ultimo_erro` é sobrescrito
   * pela execução seguinte: um descarte de hoje sumia da tela amanhã, e era
   * exatamente essa a informação que faltava quando BH e Vale apareceram com
   * o NSU avançado e zero nota gravada.
   */
  descartados: number
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

/**
 * `desdeZero` relê a fila inteira dos últimos 90 dias em vez de continuar do
 * NSU guardado.
 *
 * A leitura normal é um ponteiro que só anda pra frente: o que a SEFAZ
 * entregou uma vez e não virou linha em `nfe_recebidas` (documento descartado
 * pelo parser, ou lote lido antes de uma correção) fica pra trás e o botão
 * comum nunca mais o alcança — foi o estado em que BH (NSU 184) e Vale (NSU
 * 90) ficaram, com zero nota gravada. A Distribuição DF-e reentrega tudo o
 * que ainda está dentro dos 90 dias quando se consulta com `ultNSU=0`, e as
 * gravações de nota são upsert por (grupo, chave), então reler não duplica
 * nada: só preenche o que faltou.
 *
 * Isso NÃO fura a trava de 1 hora — `reivindicarJanela` continua sendo a
 * primeira coisa a rodar, e uma releitura gasta a janela como qualquer outra
 * consulta.
 */
export async function sincronizarGrupo(
  grupo: { id: string; nome: string },
  agora = new Date(),
  opts: { desdeZero?: boolean } = {},
): Promise<ResultadoSync> {
  const grupoId = grupo.id
  const inicioMs = Date.now()

  const claim = await reivindicarJanela(grupoId, agora)
  if (!claim) return { status: 'esperando', documentos: 0, descartados: 0 }

  // Na releitura o estado ANTERIOR também volta a zero, não só o NSU enviado —
  // a razão está em `estadoInicialDaLeitura` (nsu.ts), que é onde essa regra
  // mora e é testada.
  const inicio = estadoInicialDaLeitura(
    { ultNSU: claim.ultNsu, maxNSU: claim.maxNsu },
    { desdeZero: opts.desdeZero },
  )
  let ultNsuAtual = inicio.ultNSU
  let maxNsuAtual = inicio.maxNSU
  let totalDocumentos = 0
  let totalDescartados = 0
  let ultimoCstat: number | undefined

  try {
    // C3(a): `carregarCertificado` decifra com CERT_MASTER_KEY. Se a chave
    // mestra estiver ausente/errada na Vercel, isto lança — e antes ficava
    // FORA deste try/catch: a exceção subia sem nada gravado em `ultimo_erro`,
    // e a tela ficava muda sobre o motivo (só um 500 em log que ninguém lê).
    // Estar dentro do try é o que faz a falha aparecer pro Cesar.
    const cert = await carregarCertificado(grupoId)
    if (!cert) return { status: 'sem_certificado', documentos: 0, descartados: 0 }

    // C1(b): drena a fila numa execução só, em vez de processar um lote e
    // sair. É o padrão sancionado pela SEFAZ (puxar até esvaziar). A decisão
    // de quando parar é toda de `deveContinuarDrenando` (nsu.ts, testada) —
    // aqui só se monta o que ela precisa a cada iteração e se reage à
    // resposta. Ver o comentário da função lá pra entender o CRITICAL que
    // ela fecha (rajada de consultas idênticas quando o NSU pára de avançar).
    for (let i = 0; i < TETO_ITERACOES_DRENAGEM; i++) {
      const nsuAntesIteracao = ultNsuAtual

      const retorno = await consultarDistribuicao({
        pfx: cert.pfx,
        senha: cert.senha,
        cnpj: cert.cnpj,
        uf: cert.uf,
        ultNSU: ultNsuAtual,
      })

      const proximo = proximoEstado(retorno, agora, { ultNSU: ultNsuAtual, maxNSU: maxNsuAtual })
      // `proximo.proximaConsultaEm` não-nulo é o sinal (calculado em nsu.ts)
      // de que a fila zerou de verdade (cStat 137, ou ultNSU bruto alcançou
      // maxNSU bruto). `nsuAvancou` é a guarda de progresso do CRITICAL: o
      // NSU normalizado que ESTA iteração devolveu é diferente do que ela
      // recebeu? Se não for, e a fila "parece" ter mais, insistir só repete
      // a mesma consulta.
      const filaZerouNestaIteracao = proximo.proximaConsultaEm !== null
      const nsuAvancou = proximo.ultNSU !== nsuAntesIteracao

      // I2: um lote com documento descartado (XML ilegível, ou schema que o
      // parser não reconhece) some da leitura normal — o NSU avança e a
      // consulta seguinte já pede o próximo. Não é perda definitiva enquanto
      // o documento estiver dentro dos 90 dias: é isso que a releitura
      // (`desdeZero`) recupera. Grava em `ultimo_erro` pra não ficar em
      // silêncio, e volta também no `descartados` do retorno, que a tela
      // mostra na hora — `ultimo_erro` a execução seguinte apaga.
      //
      // Acumulado ao longo da EXECUÇÃO (não só deste lote): antes, cada
      // iteração sobrescrevia `ultimo_erro` com o descarte só dela — um
      // descarte numa iteração do meio do dreno era apagado pela iteração
      // seguinte, e como a iteração que encerra o dreno normalmente não tem
      // descarte, a mensagem quase sempre acabava `null`, escondendo o
      // problema de novo. Uma vez que `totalDescartados` sobe, a mensagem
      // não volta a `null` nesta execução.
      totalDescartados += retorno.descartados
      const erroDescarte = totalDescartados === 0
        ? null
        : totalDescartados === 1
          ? '1 documento não pôde ser lido nesta execução — use "Reler os últimos 90 dias" para pedir a fila inteira de novo'
          : `${totalDescartados} documentos não puderam ser lidos nesta execução — use "Reler os últimos 90 dias" para pedir a fila inteira de novo`

      const decisao = deveContinuarDrenando({
        filaZerou: filaZerouNestaIteracao,
        nsuAvancou,
        iteracao: i,
        decorridoMs: Date.now() - inicioMs,
      })

      // CRITICAL: quando pára por falta de progresso, grava o motivo em
      // `ultimo_erro` — citando o NSU travado — pra aparecer na tela em vez
      // de virar rajada silenciosa (era exatamente essa rajada que gerou o
      // cStat 656 de hoje).
      const ultimoErroGravar = decisao.motivo === 'sem_progresso'
        ? [
            `NSU não avançou (permanece em ${proximo.ultNSU}) — sincronização interrompida para não repetir ` +
            'a mesma consulta à SEFAZ. Provável troca de certificado/CNPJ do grupo (a sequência de NSU é por ' +
            'CNPJ e recomeça do zero) ou NSU salvo incorreto antes da correção anterior.',
            erroDescarte,
          ].filter(Boolean).join(' ')
        : erroDescarte

      // Lease renovado a cada iteração enquanto a fila não zerou de verdade
      // — inclusive quando o laço vai parar por sem_progresso/teto/tempo.
      // Antes, essas iterações gravavam `proxima_consulta_em: null`, e como
      // o claim atômico só grava a trava de 1h UMA vez, no início
      // (`reivindicarJanela`), esse `null` liberava a janela pra qualquer
      // processo concorrente reivindicar e consultar a MESMA faixa de NSU
      // que a iteração seguinte deste laço ia consultar — a mesma corrida
      // que o claim foi criado pra fechar, só que reaberta durante os até
      // 45s do dreno.
      //
      // O tamanho do lease depende do MOTIVO (`proximaConsultaEmDrenagem`,
      // nsu.ts, pura e testada): teto/tempo usam o lease curto de 2 min (o
      // NSU está avançando, só faltou fôlego); `sem_progresso` usa a trava
      // longa de 1h, porque NSU travado é exatamente a condição que gera
      // cStat 656 se reconsultada cedo demais — foi assim que o CNPJ desta
      // empresa foi suspenso. Só grava a trava de verdade (1h, dentro de
      // `proximo.proximaConsultaEm`) quando a fila realmente esvazia.
      const proximaConsultaEmGravar = proximaConsultaEmDrenagem({
        proximaConsultaEmSeFilaZerou: proximo.proximaConsultaEm,
        motivoParada: decisao.motivo,
        agora,
      })

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
            proximaConsultaEm: proximaConsultaEmGravar,
            ultimoCstat: retorno.cStat,
            ultimoErro: ultimoErroGravar,
            atualizadoEm: agora,
          })
          .onConflictDoUpdate({
            target: nfeDfeSync.grupoId,
            set: {
              ultNsu: proximo.ultNSU,
              maxNsu: proximo.maxNSU,
              proximaConsultaEm: proximaConsultaEmGravar,
              ultimoCstat: retorno.cStat,
              ultimoErro: ultimoErroGravar,
              atualizadoEm: agora,
            },
          })
      })

      ultNsuAtual = proximo.ultNSU
      maxNsuAtual = proximo.maxNSU
      totalDocumentos += retorno.documentos.length
      ultimoCstat = retorno.cStat

      if (!decisao.continuar) break
      // Senão, segue emendando: a fila ainda tem documento, o NSU avançou, e
      // teto/orçamento não foram atingidos.
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'Falha ao falar com a SEFAZ'
    // Falha de rede (ou de certificado, C3a) NÃO avança o NSU além de onde já
    // tinha chegado — o que já foi drenado em iterações anteriores deste
    // laço já está commitado e fica. NÃO mexe em `proxima_consulta_em` aqui:
    // fica valendo o que a última gravação bem-sucedida deixou. Se a falha é
    // na 1ª iteração (nada commitado ainda), isso é a trava de 1h que
    // `reivindicarJanela` gravou no início — comportamento normal, evita
    // martelar a SEFAZ de novo em seguida com o mesmo erro. Se a falha é
    // depois de ao menos uma iteração ter commitado, o que fica valendo é o
    // lease curto de 2 minutos (`LEASE_DRENAGEM_MS`) que aquela iteração
    // gravou — não trava por 1h à toa, mas também não libera a janela na
    // hora, então um retry imediato não martela a SEFAZ com o mesmo erro de
    // rede. De todo modo, só registra o motivo aqui, pra tela poder dizer
    // que a sincronização está parada, em vez de ficar muda.
    await db.insert(nfeDfeSync)
      .values({ grupoId, ultimoErro: erro, atualizadoEm: agora })
      .onConflictDoUpdate({ target: nfeDfeSync.grupoId, set: { ultimoErro: erro, atualizadoEm: agora } })
    return { status: 'erro', documentos: totalDocumentos, descartados: totalDescartados, erro }
  }

  return { status: 'ok', documentos: totalDocumentos, descartados: totalDescartados, cStat: ultimoCstat }
}
