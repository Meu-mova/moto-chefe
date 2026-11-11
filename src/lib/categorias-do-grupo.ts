/**
 * Categorias de despesa e de caixa do grupo (#834): opção do cliente, lida só por aqui e
 * sempre com o grupo no where. Antes eram uma lista só para todas as Contas.
 */
import { and, asc, eq, inArray, sql, type AnyColumn } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
import { RecusaUsuario } from '@/lib/resultado-action'
import { chaveCategoria } from '@/lib/despesas-operacionais'
import { tiposDeCategoriaPara, type TipoLancamentoCaixa } from '@/lib/categoria-caixa-tipo'

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

/**
 * Categoria se compara sem caixa e sem espaço nas pontas, como o índice único da 0180 e o DRE
 * (chaveCategoria): o lançamento guarda o nome como texto e nem sempre com a grafia do catálogo.
 */
export const mesmoNome = (coluna: AnyColumn, nome: string) => sql`lower(trim(${coluna})) = lower(trim(${nome}))`

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
 * Na edição (`categoriaAtual`), a categoria que não mudou não é reconferida: o registro antigo com
 * nome fora do catálogo continua gravando (avise, não bloqueie; mesmo critério do #399).
 * Devolve se a categoria pede beneficiário, para quem grava não ler a categoria de novo.
 */
export async function conferirCategoriaDespesa(
  exec: Leitor, grupoId: string, nome: string, categoriaAtual?: string | null,
): Promise<{ exigeBeneficiario: boolean }> {
  const [cat] = await exec.select({ exigeBeneficiario: categoriasDespesa.exigeBeneficiario })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.grupoId, grupoId), mesmoNome(categoriasDespesa.nome, nome)))
    .limit(1)
  if (cat) return cat
  const naoMudou = categoriaAtual != null && chaveCategoria(categoriaAtual) === chaveCategoria(nome)
  if (naoMudou) return { exigeBeneficiario: false }
  throw new RecusaUsuario(CATEGORIA_NAO_ENCONTRADA)
}

/**
 * O lançamento de caixa usa as categorias do grupo da LOJA do lançamento, não do grupo ativo, e do
 * tipo dele ("ambos" serve aos dois).
 */
export async function conferirCategoriaCaixaDaLoja(
  exec: Leitor, lojaId: string, nome: string, tipo: TipoLancamentoCaixa,
): Promise<void> {
  const [cat] = await exec.select({ id: categoriasCaixa.id })
    .from(categoriasCaixa)
    .where(and(
      // A coluna fica fora da subconsulta, então casa com categorias_caixa e não com lojas.grupo_id.
      sql`${categoriasCaixa.grupoId} = (select l.grupo_id from lojas l where l.id = ${lojaId})`,
      mesmoNome(categoriasCaixa.nome, nome),
      inArray(categoriasCaixa.tipo, tiposDeCategoriaPara(tipo)),
    ))
    .limit(1)
  if (!cat) throw new RecusaUsuario(CATEGORIA_NAO_ENCONTRADA)
}
