import { db } from '@/lib/db'
import { grupos, lojas, pedidosFabricaAlerta, fabricaSyncLoja } from '@/lib/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { enviarAlertaWhatsapp } from './client'
import {
  loginFabrica,
  listarPedidosCompraFabrica,
  STATUS_AGUARDANDO_PAGAMENTO,
  type PedidoCompraFabrica,
} from '@/lib/fabrica-scraper'
import { lerSenhaFabrica } from '@/lib/fabrica-senha'

const URL_PORTAL = 'https://motochefebrasil.store/clientes/pedidos?aba=compras'

export type PedidoAviso = {
  numeroPedido: string
  valor: number | null
  metodo: string | null
  /** "29/07/2026 18:17" como vem do portal */
  dataPedido: string | null
  /** Dias desde o primeiro aviso. 0 = descoberto agora. */
  diasPendente: number
}

function formatarValor(valor: number | null): string {
  if (valor == null) return 'valor não informado'
  // toLocaleString('pt-BR') separa "R$" do número com espaço não-quebrável (U+00A0),
  // invisível na tela mas ruim em log e comparação — normalizado. Escrito como
  // escape: o caractere cru não sobrevive a uma edição de arquivo.
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
}

function linhaPedido(p: PedidoAviso): string {
  const partes = [`#${p.numeroPedido}`, formatarValor(p.valor)]
  if (p.metodo) partes.push(p.metodo)
  if (p.dataPedido) partes.push(`aberto ${p.dataPedido.split(' ')[0]}`)
  return partes.join(' · ')
}

/**
 * Texto do aviso. Puro de propósito — é o que os testes cobrem.
 * Texto plano (sem markdown), então `#` e `·` não correm risco de virar
 * markdown quebrado.
 *
 * Devolve null quando não há nada a dizer, e é o que impede o cron de mandar
 * uma mensagem vazia todo dia em que está tudo pago.
 */
export function formatarAvisoPedidosFabrica(params: {
  loja: string
  novos: PedidoAviso[]
  pendentes: PedidoAviso[]
}): string | null {
  const { loja, novos, pendentes } = params
  if (novos.length === 0 && pendentes.length === 0) return null

  const linhas: string[] = [`💸 Pedido de compras aguardando pagamento — ${loja}`]

  if (novos.length > 0) {
    linhas.push('', novos.length === 1 ? '🆕 Novo:' : `🆕 Novos (${novos.length}):`)
    linhas.push(...novos.map(linhaPedido))
  }

  if (pendentes.length > 0) {
    linhas.push('', `⏳ Ainda pendente${pendentes.length > 1 ? 's' : ''}:`)
    linhas.push(...pendentes.map(p => {
      const dias = p.diasPendente === 1 ? 'há 1 dia' : `há ${p.diasPendente} dias`
      return `${linhaPedido(p)} · ${dias}`
    }))
  }

  linhas.push('', 'A fábrica cancela por prazo de pagamento.', URL_PORTAL)
  return linhas.join('\n')
}

/** Dias inteiros entre duas datas, pelo relógio (não arredonda pra baixo por hora). */
export function diasEntre(de: Date, ate: Date): number {
  const diaDe  = Date.UTC(de.getUTCFullYear(),  de.getUTCMonth(),  de.getUTCDate())
  const diaAte = Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate())
  return Math.max(0, Math.round((diaAte - diaDe) / 86_400_000))
}

export type ResultadoLoja = {
  loja: string
  grupo: string
  /** 'lido' = portal lido e gravado, sem tentar avisar (leitura manual). */
  status: 'enviado' | 'lido' | 'nada_pendente' | 'sem_numero' | 'sem_credencial' | 'erro'
  novos?: number
  pendentes?: number
  erro?: string
}

/** `avisar: false` lê e grava, mas não manda WhatsApp — é o modo da leitura manual. */
export type OpcoesLeitura = { avisar?: boolean }

/**
 * Roda o alerta para uma loja: entra no portal com a conta dela, lista o que
 * está aguardando pagamento e avisa o WhatsApp da bandeira.
 *
 * Nunca lança — o cron roda todas as lojas e a falha de uma não pode calar as
 * outras.
 */
export async function alertarPedidosFabricaDaLoja(
  loja: {
    id: string
    nome: string
    grupoId: string
    grupoNome: string
    fabricaEmail: string | null
    fabricaSenha: string | null
  },
  agora: Date,
  opcoes: OpcoesLeitura = {},
): Promise<ResultadoLoja> {
  const base = { loja: loja.nome, grupo: loja.grupoNome }
  const email  = loja.fabricaEmail?.trim()

  if (!email || !loja.fabricaSenha) return { ...base, status: 'sem_credencial' }

  try {
    const senha = lerSenhaFabrica(loja.fabricaSenha)?.trim() ?? ''
    const session = await loginFabrica({ email, senha })
    const pedidos = await listarPedidosCompraFabrica(session, STATUS_AGUARDANDO_PAGAMENTO)

    // O filtro do portal é por texto e já vem certo, mas uma mudança de rótulo lá
    // devolveria a lista inteira — conferimos o status de cada linha.
    const aguardando = pedidos.filter(p =>
      (p.status ?? '').toLowerCase().includes('aguardando pagamento'),
    )
    const numeros = aguardando.map(p => p.numeroPedido)

    const jaAlertados = await db
      .select({
        numeroPedido:     pedidosFabricaAlerta.numeroPedido,
        primeiroAlertaEm: pedidosFabricaAlerta.primeiroAlertaEm,
        avisadoEm:        pedidosFabricaAlerta.avisadoEm,
      })
      .from(pedidosFabricaAlerta)
      .where(and(
        eq(pedidosFabricaAlerta.lojaId, loja.id),
        isNull(pedidosFabricaAlerta.resolvidoEm),
      ))

    const conhecidos = new Map(jaAlertados.map(a => [a.numeroPedido, a]))

    const novos: PedidoAviso[]     = []
    const pendentes: PedidoAviso[] = []

    for (const p of aguardando) {
      const anterior = conhecidos.get(p.numeroPedido)
      const aviso: PedidoAviso = {
        numeroPedido: p.numeroPedido,
        valor:        p.valor,
        metodo:       p.metodo,
        dataPedido:   p.dataPedido,
        diasPendente: anterior ? diasEntre(new Date(anterior.primeiroAlertaEm), agora) : 0,
      }
      // "Novo" é o que ainda não foi AVISADO — não o que ainda não foi visto.
      // Um pedido conhecido cujo aviso falhou continua entrando como novo até
      // a mensagem sair de verdade.
      if (anterior?.avisadoEm) pendentes.push(aviso)
      else novos.push(aviso)
    }

    // Pedido que saiu da lista foi pago ou cancelado — fecha pra não voltar como
    // "pendente há N dias" caso a fábrica reabra o mesmo número mais tarde.
    const resolvidos = jaAlertados
      .map(a => a.numeroPedido)
      .filter(n => !numeros.includes(n))
    if (resolvidos.length > 0) {
      await db.update(pedidosFabricaAlerta)
        .set({ resolvidoEm: agora })
        .where(and(
          eq(pedidosFabricaAlerta.lojaId, loja.id),
          inArray(pedidosFabricaAlerta.numeroPedido, resolvidos),
        ))
    }

    // Grava o que foi VISTO, antes e independentemente do aviso. O dashboard lê
    // desta tabela: se a gravação dependesse do WhatsApp, um disparo com erro
    // deixaria o card zerado com pedido vencendo na fábrica.
    for (const p of aguardando) {
      await db.insert(pedidosFabricaAlerta)
        .values({
          grupoId:          loja.grupoId,
          lojaId:           loja.id,
          numeroPedido:     p.numeroPedido,
          valor:            p.valor != null ? String(p.valor) : null,
          dataPedido:       p.dataPedido,
          primeiroAlertaEm: agora,
          ultimoAlertaEm:   agora,
        })
        .onConflictDoUpdate({
          target: [pedidosFabricaAlerta.lojaId, pedidosFabricaAlerta.numeroPedido],
          set:    { ultimoAlertaEm: agora, resolvidoEm: null },
        })
    }

    // Leitura manual (botão do dashboard) para aqui: o dado já está gravado e é
    // isso que o card mostra. Não mandamos WhatsApp porque quem clica está
    // olhando a tela, e um refresh não pode virar mensagem no grupo da bandeira.
    // `avisado_em` continua nulo, então o cron ainda anuncia o pedido novo.
    if (opcoes.avisar === false) {
      return { ...base, status: 'lido', novos: novos.length, pendentes: pendentes.length }
    }

    const texto = formatarAvisoPedidosFabrica({ loja: loja.nome, novos, pendentes })
    if (!texto) return { ...base, status: 'nada_pendente' }

    const envio = await enviarAlertaWhatsapp(texto)
    if (envio !== 'enviado') {
      // avisado_em fica nulo: o pedido segue como "novo" e a próxima rodada
      // tenta de novo, mas o dado já está no banco para o dashboard.
      return { ...base, status: envio === 'sem_numero' ? 'sem_numero' : 'erro' }
    }

    // Aviso confirmado — só agora o pedido deixa de ser novidade.
    await db.update(pedidosFabricaAlerta)
      .set({ avisadoEm: agora })
      .where(and(
        eq(pedidosFabricaAlerta.lojaId, loja.id),
        inArray(pedidosFabricaAlerta.numeroPedido, numeros),
      ))

    return { ...base, status: 'enviado', novos: novos.length, pendentes: pendentes.length }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error(`alerta de pedidos da fábrica falhou para ${loja.nome}:`, erro)
    return { ...base, status: 'erro', erro }
  }
}

/**
 * Roda o alerta para todas as lojas ativas de grupos ativos.
 *
 * `grupoId` limita a um grupo — a leitura manual do dashboard é da bandeira que
 * o usuário está olhando, e não faz sentido logar nas contas da outra.
 */
export async function alertarPedidosFabrica(
  agora: Date = new Date(),
  opcoes: OpcoesLeitura & { grupoId?: string } = {},
): Promise<ResultadoLoja[]> {
  const ativas = await db
    .select({
      id:             lojas.id,
      nome:           lojas.nome,
      grupoId:        lojas.grupoId,
      grupoNome:      grupos.nome,
      fabricaEmail:   lojas.fabricaEmail,
      fabricaSenha:   lojas.fabricaSenha,
    })
    .from(lojas)
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(and(
      eq(grupos.ativo, true),
      eq(lojas.ativa, true),
      opcoes.grupoId ? eq(lojas.grupoId, opcoes.grupoId) : undefined,
    ))
    .orderBy(grupos.nome, lojas.nome)

  const resultados: ResultadoLoja[] = []
  // Sequencial: o portal da fábrica é frágil e paralelizar login na mesma origem
  // não vale o risco de derrubar a sessão de outra loja.
  for (const l of ativas) {
    const r = await alertarPedidosFabricaDaLoja(l, agora, opcoes)
    resultados.push(r)
    // Registra o resultado da leitura. É o que permite ao card do dashboard
    // distinguir "nenhum pedido pendente" de "ninguém conseguiu ler esta conta"
    // — as duas coisas aparecem como zero pedidos.
    await db.insert(fabricaSyncLoja).values({
      lojaId: l.id,
      status: statusDaLeitura(r),
      erro: r.erro ?? null,
      pedidos: (r.novos ?? 0) + (r.pendentes ?? 0),
      executadoEm: agora,
    }).onConflictDoUpdate({
      target: fabricaSyncLoja.lojaId,
      set: {
        status: statusDaLeitura(r),
        erro: r.erro ?? null,
        pedidos: (r.novos ?? 0) + (r.pendentes ?? 0),
        executadoEm: agora,
      },
    })
  }
  return resultados
}

/**
 * O que a leitura conseguiu fazer, do ponto de vista do dado.
 *
 * 'sem_numero' (leu certo, mas não havia para quem avisar no WhatsApp) conta
 * como leitura OK: os pedidos foram lidos e gravados, só o aviso não saiu.
 */
export function statusDaLeitura(r: ResultadoLoja): 'ok' | 'sem_credencial' | 'erro' {
  if (r.status === 'sem_credencial') return 'sem_credencial'
  if (r.status === 'erro') return 'erro'
  return 'ok'
}

export type { PedidoCompraFabrica }
