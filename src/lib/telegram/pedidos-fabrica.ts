import { db } from '@/lib/db'
import { grupos, pedidosFabricaAlerta } from '@/lib/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { enviarMensagem } from './api'
import {
  loginFabrica,
  listarPedidosCompraFabrica,
  STATUS_AGUARDANDO_PAGAMENTO,
  type PedidoCompraFabrica,
} from '@/lib/fabrica-scraper'

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
 * Sem parse_mode: `enviarMensagem` manda texto plano, então `#` e `·` não
 * correm risco de virar markdown quebrado.
 *
 * Devolve null quando não há nada a dizer, e é o que impede o cron de mandar
 * uma mensagem vazia todo dia em que está tudo pago.
 */
export function formatarAvisoPedidosFabrica(params: {
  grupo: string
  novos: PedidoAviso[]
  pendentes: PedidoAviso[]
}): string | null {
  const { grupo, novos, pendentes } = params
  if (novos.length === 0 && pendentes.length === 0) return null

  const linhas: string[] = [`💸 Pedido de compras aguardando pagamento — ${grupo}`]

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

export type ResultadoGrupo = {
  grupo: string
  status: 'enviado' | 'nada_pendente' | 'sem_chat' | 'sem_credencial' | 'erro'
  novos?: number
  pendentes?: number
  erro?: string
}

/**
 * Roda o alerta para um grupo: entra no portal com a conta daquela bandeira,
 * lista o que está aguardando pagamento e avisa o Telegram do grupo.
 *
 * Nunca lança — o cron roda os dois grupos e a falha de um não pode calar o outro.
 */
export async function alertarPedidosFabricaDoGrupo(
  grupo: { id: string; nome: string; fabricaEmail: string | null; fabricaSenha: string | null; telegramChatId: string | null },
  agora: Date,
): Promise<ResultadoGrupo> {
  const chatId = grupo.telegramChatId?.trim()
  const email  = grupo.fabricaEmail?.trim()
  const senha  = grupo.fabricaSenha?.trim()

  if (!email || !senha) return { grupo: grupo.nome, status: 'sem_credencial' }
  if (!chatId)          return { grupo: grupo.nome, status: 'sem_chat' }

  try {
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
      })
      .from(pedidosFabricaAlerta)
      .where(and(
        eq(pedidosFabricaAlerta.grupoId, grupo.id),
        isNull(pedidosFabricaAlerta.resolvidoEm),
      ))

    const conhecidos = new Map(jaAlertados.map(a => [a.numeroPedido, a.primeiroAlertaEm]))

    const novos: PedidoAviso[]     = []
    const pendentes: PedidoAviso[] = []

    for (const p of aguardando) {
      const primeiro = conhecidos.get(p.numeroPedido)
      const aviso: PedidoAviso = {
        numeroPedido: p.numeroPedido,
        valor:        p.valor,
        metodo:       p.metodo,
        dataPedido:   p.dataPedido,
        diasPendente: primeiro ? diasEntre(new Date(primeiro), agora) : 0,
      }
      if (primeiro) pendentes.push(aviso)
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
          eq(pedidosFabricaAlerta.grupoId, grupo.id),
          inArray(pedidosFabricaAlerta.numeroPedido, resolvidos),
        ))
    }

    const texto = formatarAvisoPedidosFabrica({ grupo: grupo.nome, novos, pendentes })
    if (!texto) return { grupo: grupo.nome, status: 'nada_pendente' }

    await enviarMensagem(chatId, texto)

    // Só grava depois do envio: se o Telegram falhar, o pedido continua "novo" e
    // a próxima rodada tenta de novo em vez de perder o aviso pra sempre.
    for (const p of aguardando) {
      await db.insert(pedidosFabricaAlerta)
        .values({
          grupoId:          grupo.id,
          numeroPedido:     p.numeroPedido,
          valor:            p.valor != null ? String(p.valor) : null,
          dataPedido:       p.dataPedido,
          primeiroAlertaEm: agora,
          ultimoAlertaEm:   agora,
        })
        .onConflictDoUpdate({
          target: [pedidosFabricaAlerta.grupoId, pedidosFabricaAlerta.numeroPedido],
          set:    { ultimoAlertaEm: agora, resolvidoEm: null },
        })
    }

    return { grupo: grupo.nome, status: 'enviado', novos: novos.length, pendentes: pendentes.length }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error(`alerta de pedidos da fábrica falhou para ${grupo.nome}:`, erro)
    return { grupo: grupo.nome, status: 'erro', erro }
  }
}

/** Roda o alerta para todos os grupos ativos. */
export async function alertarPedidosFabrica(agora: Date = new Date()): Promise<ResultadoGrupo[]> {
  const ativos = await db
    .select({
      id:             grupos.id,
      nome:           grupos.nome,
      fabricaEmail:   grupos.fabricaEmail,
      fabricaSenha:   grupos.fabricaSenha,
      telegramChatId: grupos.telegramChatId,
    })
    .from(grupos)
    .where(eq(grupos.ativo, true))

  const resultados: ResultadoGrupo[] = []
  // Sequencial: são 2 grupos e o portal da fábrica é frágil — paralelizar login
  // na mesma origem não vale o risco de derrubar a sessão do outro.
  for (const g of ativos) {
    resultados.push(await alertarPedidosFabricaDoGrupo(g, agora))
  }
  return resultados
}

export type { PedidoCompraFabrica }
