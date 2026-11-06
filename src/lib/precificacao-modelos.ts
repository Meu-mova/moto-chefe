import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { configuracaoTaxas, motos, precificacao } from '@/lib/db/schema'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { travarPrecificacaoDoGrupo } from '@/lib/tabela-preco-padrao'
import { lerTotal12x, type PadraoSimulador } from '@/lib/simulador-padrao'
import { RecusaUsuario } from '@/lib/resultado-action'

type Executor = Pick<typeof db, 'select'>

// O preço casa com o modelo pelo nome original em caixa alta (ver custoMotoExpr).
export const chaveNome = (s: string) => s.trim().toUpperCase()

/**
 * Modelos que a Conta precifica: o mesmo conjunto de /admin/modelos, sem os ocultos
 * (#496). O estoque conta por modelo_id só nas lojas pedidas; por nome, um modelo de
 * outra Conta com o mesmo nome levava o estoque desta.
 */
export async function catalogoDePrecificacao(contaId: string, lojaIds: string[], exec: Executor = db) {
  const [catalogo, estoque] = await Promise.all([
    listarModelosDaConta(contaId, exec),
    lojaIds.length === 0 ? [] : exec
      .select({ modeloId: motos.modeloId, qtd: sql<number>`count(*)::int` })
      .from(motos)
      .where(and(eq(motos.disponibilidade, 'disponivel'), inArray(motos.lojaId, lojaIds)))
      .groupBy(motos.modeloId),
  ])
  const qtdPorModelo = new Map(estoque.map(e => [e.modeloId, e.qtd]))
  return catalogo.map(m => ({
    id: m.id,
    modelo: m.modeloOriginal,
    marca: m.marca,
    estoqueDisponivel: qtdPorModelo.get(m.id) ?? 0,
  }))
}

/** O nome é de um modelo que a Conta precifica? Fora dela responde igual a inexistente. */
export async function modeloPrecificavel(contaId: string, nome: string, exec: Executor = db) {
  const alvo = chaveNome(nome)
  return (await listarModelosDaConta(contaId, exec)).some(m => chaveNome(m.modeloOriginal) === alvo)
}

function total12xParaGravar(v: string): string | null {
  const n = lerTotal12x(v)
  if (n === 'invalido') throw new RecusaUsuario('Valor em 12x inválido')
  return n === null ? null : n.toFixed(2)
}

/**
 * Grava o preço de um modelo no grupo. `precId` vem preenchido quando a linha já tem
 * preço; null é um modelo do catálogo ainda não precificado no grupo, e a linha nasce agora.
 *
 * O nome grava em caixa alta porque é ele que casa com `modelos.modelo` nas consultas de
 * preço mínimo e de custo. O upsert é por (grupo, nome), com a trava do grupo, para não
 * criar duas linhas do mesmo modelo se dois usuários salvarem ao mesmo tempo.
 * `precId` de outro grupo não acha linha e não muda nada.
 */
export async function salvarPrecoDoModelo(
  grupo: { id: string; contaId: string },
  data: {
    precId?: string | null
    nome: string
    valorMinimo: string
    custo?: string
    /** Total em 12x: undefined não mexe; vazio ou zero limpa. */
    valor12x?: string
  },
  exec: Pick<typeof db, 'select' | 'update' | 'transaction'> = db,
): Promise<void> {
  const nome = chaveNome(data.nome)
  if (!nome) throw new RecusaUsuario('Nome do modelo é obrigatório')
  const campos = {
    nome,
    valorMinimo: data.valorMinimo,
    custo: data.custo || null,
    // Não veio: não mexe no que está gravado. Veio vazio ou zero: limpa.
    ...(data.valor12x === undefined ? {} : { valor12x: total12xParaGravar(data.valor12x) }),
  }

  // Só modelo do catálogo da Conta (#496). O preço avulso antigo continua
  // editável enquanto mantém o próprio nome.
  const daLinha = data.precId ? and(eq(precificacao.id, data.precId), eq(precificacao.grupoId, grupo.id)) : undefined
  const atual = daLinha
    ? (await exec.select({ nome: precificacao.nome }).from(precificacao).where(daLinha).limit(1))[0]
    : undefined
  const mantemNome = !!atual && chaveNome(atual.nome) === nome
  if (!mantemNome && !(await modeloPrecificavel(grupo.contaId, nome, exec))) {
    throw new RecusaUsuario('Modelo não encontrado')
  }

  if (daLinha) {
    await exec.update(precificacao).set(campos).where(daLinha)
    return
  }
  // Mesma trava do preenchimento automático: os dois conferem e inserem pelo nome (#522).
  await exec.transaction(async tx => {
    await travarPrecificacaoDoGrupo(tx, grupo.id)
    const [existente] = await tx
      .select({ id: precificacao.id })
      .from(precificacao)
      .where(and(eq(precificacao.grupoId, grupo.id), sql`upper(btrim(${precificacao.nome})) = ${nome}`))
      .limit(1)
    if (existente) {
      await tx.update(precificacao).set(campos).where(and(eq(precificacao.id, existente.id), eq(precificacao.grupoId, grupo.id)))
    } else {
      await tx.insert(precificacao).values({
        grupoId: grupo.id,
        ...campos,
        taxaPix: '0',
        taxasCartao: {},
        taxasLink: {},
        taxasFinanciamento: {},
      })
    }
  })
}

/** Padrão de cards do simulador do grupo. Grupo sem configuração nasce com as taxas zeradas. */
export async function salvarPadraoSimulador(
  grupoId: string,
  padrao: PadraoSimulador,
  exec: Pick<typeof db, 'insert'> = db,
): Promise<void> {
  await exec.insert(configuracaoTaxas)
    .values({ grupoId, padraoSimulador: padrao })
    .onConflictDoUpdate({
      target: configuracaoTaxas.grupoId,
      set: { padraoSimulador: padrao, atualizadoEm: sql`now()` },
      setWhere: eq(configuracaoTaxas.grupoId, grupoId),
    })
}
