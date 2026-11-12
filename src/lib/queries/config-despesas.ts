import { db } from '@/lib/db'
import { favorecidosNaoOperacionais } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { categoriasCaixaDoGrupo, categoriasDespesaDoGrupo } from '@/lib/categorias-do-grupo'
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
  const [doGrupo, favorecidosFora, caixaDoGrupo] = await Promise.all([
    categoriasDespesaDoGrupo(db, grupoId),
    db.select({
      cnpj: favorecidosNaoOperacionais.cnpj,
      nomePadrao: favorecidosNaoOperacionais.nomePadrao,
      motivo: favorecidosNaoOperacionais.motivo,
    })
      .from(favorecidosNaoOperacionais)
      .where(eq(favorecidosNaoOperacionais.grupoId, grupoId)),
    categoriasCaixaDoGrupo(db, grupoId),
  ])
  const categoriasFora = doGrupo.filter(c => !c.contaComoDespesa)
  const categoriasCaixaFora = caixaDoGrupo.filter(c => !c.contaComoDespesa)

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
      categoriasFora.filter(c => c.motivoNaoOperacional).map(c => [c.nome, c.motivoNaoOperacional as MotivoForaDoCalculo]),
    ),
  }
}
