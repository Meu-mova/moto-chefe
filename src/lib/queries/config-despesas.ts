import { db } from '@/lib/db'
import { categoriasDespesa, categoriasCaixa, favorecidosNaoOperacionais } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { ConfigDespesas, MotivoForaDoCalculo } from '@/lib/despesas-operacionais'

/**
 * As regras de exclusão do card de despesas, num lugar só.
 *
 * O /financeiro e o /admin/dre montavam esta configuração cada um do seu jeito,
 * com o comentário "idêntica à do /financeiro" segurando a promessa. O
 * resultado operacional do DRE tem que bater com o Lucro Líquido do
 * /financeiro, e duas cópias da mesma regra são exatamente o jeito de os dois
 * desandarem — bastava alguém cadastrar um favorecido novo e lembrar de um
 * arquivo só.
 *
 * Favorecido sem `nome_padrao` não vira chave: `''` está contido em qualquer
 * texto e tiraria TODAS as saídas do cálculo de uma vez.
 */
export async function configDespesas(grupoId: string): Promise<ConfigDespesas> {
  const [categoriasFora, favorecidosFora, categoriasCaixaFora] = await Promise.all([
    db.select({ nome: categoriasDespesa.nome, motivo: categoriasDespesa.motivoNaoOperacional })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.contaComoDespesa, false)),
    db.select({
      cnpj: favorecidosNaoOperacionais.cnpj,
      nomePadrao: favorecidosNaoOperacionais.nomePadrao,
      motivo: favorecidosNaoOperacionais.motivo,
    })
      .from(favorecidosNaoOperacionais)
      .where(eq(favorecidosNaoOperacionais.grupoId, grupoId)),
    db.select({ nome: categoriasCaixa.nome })
      .from(categoriasCaixa)
      .where(eq(categoriasCaixa.contaComoDespesa, false)),
  ])

  return {
    categoriasForaDoCalculo: new Set(categoriasFora.map(c => c.nome)),
    cnpjsForaDoCalculo: new Map(
      favorecidosFora
        .filter((f): f is typeof f & { cnpj: string } => !!f.cnpj)
        .map(f => [f.cnpj, f.motivo as MotivoForaDoCalculo]),
    ),
    nomesForaDoCalculo: new Map(
      favorecidosFora
        .filter((f): f is typeof f & { nomePadrao: string } => !!f.nomePadrao?.trim())
        .map(f => [f.nomePadrao, f.motivo as MotivoForaDoCalculo]),
    ),
    categoriasCaixaForaDoCalculo: new Set(categoriasCaixaFora.map(c => c.nome)),
    motivoPorCategoria: new Map(
      categoriasFora.filter(c => c.motivo).map(c => [c.nome, c.motivo as MotivoForaDoCalculo]),
    ),
  }
}
