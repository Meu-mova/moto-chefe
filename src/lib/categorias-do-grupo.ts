/**
 * Categorias de despesa e de caixa do grupo (#834): opção do cliente, lida só por aqui e
 * sempre com o grupo no where. Antes eram uma lista só para todas as Contas.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
import { RecusaUsuario } from '@/lib/resultado-action'

type Leitor = Pick<typeof db, 'select'>

export type CategoriaDespesaDoGrupo = {
  id: string
  nome: string
  ativo: boolean
  ordem: number
  contaComoDespesa: boolean
  motivoNaoOperacional: string | null
  grupoDre: string | null
  exigeBeneficiario: boolean
}

export type CategoriaCaixaDoGrupo = {
  id: string
  nome: string
  tipo: string
  ativo: boolean
  ordem: number
  contaComoDespesa: boolean
}

export const CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada'

export async function categoriasDespesaDoGrupo(exec: Leitor, grupoId: string): Promise<CategoriaDespesaDoGrupo[]> {
  return exec.select({
    id: categoriasDespesa.id,
    nome: categoriasDespesa.nome,
    ativo: categoriasDespesa.ativo,
    ordem: categoriasDespesa.ordem,
    contaComoDespesa: categoriasDespesa.contaComoDespesa,
    motivoNaoOperacional: categoriasDespesa.motivoNaoOperacional,
    grupoDre: categoriasDespesa.grupoDre,
    exigeBeneficiario: categoriasDespesa.exigeBeneficiario,
  })
    .from(categoriasDespesa)
    .where(eq(categoriasDespesa.grupoId, grupoId))
    .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
}

export async function categoriasCaixaDoGrupo(exec: Leitor, grupoId: string): Promise<CategoriaCaixaDoGrupo[]> {
  return exec.select({
    id: categoriasCaixa.id,
    nome: categoriasCaixa.nome,
    tipo: categoriasCaixa.tipo,
    ativo: categoriasCaixa.ativo,
    ordem: categoriasCaixa.ordem,
    contaComoDespesa: categoriasCaixa.contaComoDespesa,
  })
    .from(categoriasCaixa)
    .where(eq(categoriasCaixa.grupoId, grupoId))
    .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome))
}

/**
 * Recusa a despesa cuja categoria não é do grupo. Inativa vale: a despesa antiga continua editável.
 * Devolve se a categoria pede beneficiário, para quem grava não ler a categoria de novo.
 */
export async function conferirCategoriaDespesa(
  exec: Leitor, grupoId: string, nome: string,
): Promise<{ exigeBeneficiario: boolean }> {
  const [cat] = await exec.select({ exigeBeneficiario: categoriasDespesa.exigeBeneficiario })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.grupoId, grupoId), eq(categoriasDespesa.nome, nome)))
    .limit(1)
  if (!cat) throw new RecusaUsuario(CATEGORIA_NAO_ENCONTRADA)
  return cat
}

/** O lançamento de caixa usa as categorias do grupo da LOJA do lançamento, não do grupo ativo. */
export async function conferirCategoriaCaixaDaLoja(exec: Leitor, lojaId: string, nome: string): Promise<void> {
  const [cat] = await exec.select({ id: categoriasCaixa.id })
    .from(categoriasCaixa)
    .where(and(
      // A coluna fica fora da subconsulta, então casa com categorias_caixa e não com lojas.grupo_id.
      sql`${categoriasCaixa.grupoId} = (select l.grupo_id from lojas l where l.id = ${lojaId})`,
      eq(categoriasCaixa.nome, nome),
    ))
    .limit(1)
  if (!cat) throw new RecusaUsuario(CATEGORIA_NAO_ENCONTRADA)
}
