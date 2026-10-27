/**
 * Entrada de peças pela NF-e (#341, #426). Tudo é gravado na Conta da LOJA de destino,
 * nunca na que vier do payload, e só se o usuário pode usar a loja. Quem chama roda isto
 * dentro da mesma transação das motos (#429).
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { grupos, historicoEstoque, lojas, motos, notasEntrada, pecasCatalogo, pecasVinculoFornecedor, usuarios } from '@/lib/db/schema'
import { daContaDaLoja, inserirPeca, pecaUsavelNaLoja } from '@/lib/pecas-da-conta'
import { moverSaldo } from '@/lib/estoque-pecas-loja'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

export type LinhaEntradaPeca = {
  codigo: string
  nomeXml: string
  quantidade: number
  custoUnitario: number
} & ({ pecaId: string } | { nova: { nome: string; valor: number } })

export type EntradaPecas = {
  lojaId: string
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0] & { id: string }
  nota: { chaveAcesso: string; numero: string; fornecedorCnpj: string }
  linhas: LinhaEntradaPeca[]
}

/** Entrada recusada; a transação desfaz tudo. A frase não revela dado de outra Conta. */
export class EntradaPecasRecusada extends Error {}

/**
 * O que impede cada linha de entrar, sem gravar nada. Peça de outra Conta e id
 * inexistente recebem a mesma frase.
 */
export async function conferirLinhasPecas(exec: Executor, lojaId: string, linhas: LinhaEntradaPeca[]): Promise<string[]> {
  const erros: string[] = []
  for (const linha of linhas) {
    if (!Number.isInteger(linha.quantidade) || linha.quantidade <= 0) {
      erros.push(`${linha.nomeXml}: a quantidade precisa ser um número inteiro maior que zero`)
    } else if ('nova' in linha && !(linha.nova.valor > 0)) {
      erros.push(`${linha.nomeXml}: peça nova precisa de preço de venda`)
    } else if ('pecaId' in linha && !(await pecaUsavelNaLoja(exec, lojaId, linha.pecaId))) {
      erros.push(`${linha.nomeXml}: peça não encontrada`)
    }
  }
  return erros
}

export async function gravarEntradaPecas(exec: Executor, entrada: EntradaPecas): Promise<void> {
  // Loja de outra Conta e loja inexistente recebem a mesma frase: a diferença revelaria
  // que a loja existe.
  if (!(await podeAbrirRegistroDaLoja(entrada.usuario, entrada.lojaId, exec))) {
    throw new EntradaPecasRecusada('Loja de destino não encontrada')
  }
  const [loja] = await exec.select({ grupoId: grupos.id, contaId: grupos.contaId })
    .from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(eq(lojas.id, entrada.lojaId))
  if (!loja) throw new EntradaPecasRecusada('Loja de destino não encontrada')
  const { contaId, grupoId } = loja

  const erros = await conferirLinhasPecas(exec, entrada.lojaId, entrada.linhas)
  if (erros.length) throw new EntradaPecasRecusada(erros.join('\n'))

  for (const linha of entrada.linhas) {
    const pecaId = 'pecaId' in linha
      ? linha.pecaId
      : (await inserirPeca(exec, contaId, linha.nova)).id

    await exec.update(pecasCatalogo)
      .set({ custo: String(linha.custoUnitario), atualizadoEm: new Date() })
      .where(and(eq(pecasCatalogo.id, pecaId), eq(pecasCatalogo.contaId, contaId)))
    await moverSaldo(exec, pecaId, entrada.lojaId, linha.quantidade)
    await exec.insert(pecasVinculoFornecedor).values({
      contaId,
      fornecedorCnpj: entrada.nota.fornecedorCnpj,
      codigo: linha.codigo,
      nomeXml: linha.nomeXml,
      pecaId,
    }).onConflictDoUpdate({
      target: [pecasVinculoFornecedor.contaId, pecasVinculoFornecedor.fornecedorCnpj, pecasVinculoFornecedor.codigo, pecasVinculoFornecedor.nomeXml],
      set: { pecaId, atualizadoEm: sql`now()` },
      setWhere: eq(pecasVinculoFornecedor.contaId, contaId),
    })
  }

  await exec.insert(notasEntrada).values({
    contaId,
    grupoId,
    lojaId: entrada.lojaId,
    ...entrada.nota,
    criadoPor: entrada.usuario.id,
  })
}

export type Conferencia = {
  pecas: { id: string; nome: string; valor: string }[]
  /** Peça sugerida pelo vínculo para cada item, na ordem recebida. */
  sugestoes: (string | null)[]
  /**
   * Quando e por quem a nota já entrou nesta Conta. `soPeloNumero`: achada só pelo número
   * da nota nas motos, que se repete entre fornecedores; é um indício, não certeza.
   */
  notaJaLancada: { em: Date; por: string; soPeloNumero: boolean } | null
}

/**
 * Tudo o que a tela de conferência lê, só da Conta da loja de destino. `null` se o
 * usuário não pode usar a loja (ou ela não existe), sem distinguir os dois.
 */
export async function carregarConferencia(
  exec: Pick<typeof db, 'select'>,
  usuario: EntradaPecas['usuario'],
  lojaId: string,
  nota: EntradaPecas['nota'] & { itens: { codigo: string; nomeXml: string }[] },
): Promise<Conferencia | null> {
  if (!(await podeAbrirRegistroDaLoja(usuario, lojaId, exec))) return null
  const [loja] = await exec.select({ contaId: grupos.contaId }).from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId)).where(eq(lojas.id, lojaId))
  const contaId = loja.contaId

  const pecas = await exec.select({ id: pecasCatalogo.id, nome: pecasCatalogo.nome, valor: pecasCatalogo.valor })
    .from(pecasCatalogo)
    .where(and(daContaDaLoja(lojaId), eq(pecasCatalogo.ativo, true)))
    .orderBy(asc(pecasCatalogo.nome))

  const vinculos = nota.itens.length
    ? await exec.select({ codigo: pecasVinculoFornecedor.codigo, nomeXml: pecasVinculoFornecedor.nomeXml, pecaId: pecasVinculoFornecedor.pecaId })
      .from(pecasVinculoFornecedor)
      .where(and(
        eq(pecasVinculoFornecedor.contaId, contaId),
        eq(pecasVinculoFornecedor.fornecedorCnpj, nota.fornecedorCnpj),
        inArray(pecasVinculoFornecedor.codigo, nota.itens.map(i => i.codigo)),
      ))
    : []
  const sugestoes = nota.itens.map(i =>
    vinculos.find(v => v.codigo === i.codigo && v.nomeXml === i.nomeXml)?.pecaId ?? null)

  return { pecas, sugestoes, notaJaLancada: await notaJaLancadaNaConta(exec, contaId, nota) }
}

// Duas fontes (#429): notas_entrada pela chave e, sem ela, a entrada das motos pelo número.
async function notaJaLancadaNaConta(
  exec: Pick<typeof db, 'select'>,
  contaId: string,
  nota: EntradaPecas['nota'],
): Promise<Conferencia['notaJaLancada']> {
  const [pela] = await exec.select({ em: notasEntrada.criadoEm, por: usuarios.nome })
    .from(notasEntrada).innerJoin(usuarios, eq(usuarios.id, notasEntrada.criadoPor))
    .where(and(eq(notasEntrada.contaId, contaId), eq(notasEntrada.chaveAcesso, nota.chaveAcesso)))
    .orderBy(desc(notasEntrada.criadoEm)).limit(1)
  if (pela) return { ...pela, soPeloNumero: false }
  const [moto] = await exec.select({ em: historicoEstoque.data, por: usuarios.nome }).from(motos)
    .innerJoin(lojas, eq(lojas.id, motos.lojaId)).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .innerJoin(historicoEstoque, and(eq(historicoEstoque.motoId, motos.id), eq(historicoEstoque.tipo, 'entrada')))
    .innerJoin(usuarios, eq(usuarios.id, historicoEstoque.usuarioId))
    .where(and(eq(grupos.contaId, contaId), eq(motos.notaFiscalEntrada, nota.numero)))
    .orderBy(desc(historicoEstoque.data)).limit(1)
  return moto ? { ...moto, soPeloNumero: true } : null
}
