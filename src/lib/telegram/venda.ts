import { db } from '@/lib/db'
import { grupos, lojas, modelos, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { enviarMensagem } from './api'

export type DadosVendaTelegram = {
  marca: string
  modelo: string
  valor: number
  vendedor: string
  loja: string
}

export type ResultadoAvisoVenda = 'enviado' | 'sem_chat' | 'erro'

/**
 * Texto do aviso. Puro de propósito — é o que os testes cobrem.
 * Sem parse_mode: `enviarMensagem` manda texto plano, então nome com `_` ou `*`
 * (ex.: modelo "BIZ_110") não corre risco de virar markdown quebrado.
 */
export function formatarAvisoVenda(d: DadosVendaTelegram): string {
  // toLocaleString('pt-BR') separa "R$" do número com espaço não-quebrável
  // (U+00A0). Invisível na tela, mas atrapalha comparação e busca em log —
  // normalizado para espaço comum.
  const valor = d.valor
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ')

  // Modelo cadastrado sem marca não pode virar "Modelo:  X" (espaço duplo).
  const veiculo = [d.marca, d.modelo].map(s => s.trim()).filter(Boolean).join(' ')

  return [
    '🏍️ Moto vendida',
    `Modelo: ${veiculo}`,
    `Valor: ${valor}`,
    `Vendedor: ${d.vendedor}`,
    `Loja: ${d.loja}`,
  ].join('\n')
}

/**
 * Avisa o grupo do Telegram da bandeira sobre uma venda.
 *
 * O destino sai do grupo da LOJA DA MOTO, não do cookie `grupoAtivo`: um admin
 * pode estar olhando BH no seletor e efetivar uma venda de Varginha — pelo
 * cookie o aviso iria para o grupo errado.
 *
 * Nunca lança: aviso é efeito colateral e não pode derrubar o registro da venda.
 */
export async function notificarVendaTelegram(params: {
  lojaId: string
  modeloId: string
  vendedorId: string
  valor: number
}): Promise<ResultadoAvisoVenda> {
  try {
    const [row] = await db
      .select({
        chatId:   grupos.telegramChatId,
        loja:     lojas.nome,
        marca:    modelos.marca,
        modelo:   modelos.modelo,
        vendedor: usuarios.nome,
      })
      .from(lojas)
      .innerJoin(grupos,   eq(lojas.grupoId, grupos.id))
      .innerJoin(modelos,  eq(modelos.id,  params.modeloId))
      .innerJoin(usuarios, eq(usuarios.id, params.vendedorId))
      .where(eq(lojas.id, params.lojaId))
      .limit(1)

    if (!row) return 'erro'
    const chatId = row.chatId?.trim()
    if (!chatId) return 'sem_chat'

    await enviarMensagem(chatId, formatarAvisoVenda({
      marca:    row.marca,
      modelo:   row.modelo,
      valor:    params.valor,
      vendedor: row.vendedor,
      loja:     row.loja,
    }))
    return 'enviado'
  } catch (e) {
    console.error('aviso de venda no telegram falhou:', e instanceof Error ? e.message : String(e))
    return 'erro'
  }
}
