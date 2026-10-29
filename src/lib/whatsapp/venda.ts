import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { lojas, modelos, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { enviarAlertaWhatsapp } from './client'

export type DadosVendaWhatsapp = {
  marca: string
  modelo: string
  valor: number
  vendedor: string
  loja: string
}

export type ResultadoAvisoVenda = 'enviado' | 'sem_numero' | 'erro'

/**
 * Texto do aviso. Puro de propósito — é o que os testes cobrem.
 * Texto plano (sem markdown), então nome com `_` ou `*` não vira formatação quebrada.
 */
export function formatarAvisoVenda(d: DadosVendaWhatsapp): string {
  // toLocaleString('pt-BR') separa "R$" do número com espaço não-quebrável
  // (U+00A0) — normalizado para espaço comum.
  const valor = d.valor
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ')

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
 * Avisa por WhatsApp sobre uma venda. Os dados de loja/modelo/vendedor saem da
 * LOJA DA MOTO (não do cookie grupoAtivo). Destino é o número único da env.
 * Nunca lança: aviso é efeito colateral e não pode derrubar o registro da venda.
 */
export async function notificarVendaWhatsapp(params: {
  lojaId: string
  modeloId: string
  vendedorId: string
  valor: number
}): Promise<ResultadoAvisoVenda> {
  try {
    const [row] = await db
      .select({
        loja:     lojas.nome,
        marca:    modelos.marca,
        modelo:   nomeDoModeloNaLoja(lojas.id),
        vendedor: usuarios.nome,
      })
      .from(lojas)
      .innerJoin(modelos,  eq(modelos.id,  params.modeloId))
      .innerJoin(usuarios, eq(usuarios.id, params.vendedorId))
      .where(eq(lojas.id, params.lojaId))
      .limit(1)

    if (!row) return 'erro'

    return await enviarAlertaWhatsapp(formatarAvisoVenda({
      marca:    row.marca,
      modelo:   row.modelo,
      valor:    params.valor,
      vendedor: row.vendedor,
      loja:     row.loja,
    }))
  } catch (e) {
    console.error('aviso de venda no whatsapp falhou:', e instanceof Error ? e.message : String(e))
    return 'erro'
  }
}
