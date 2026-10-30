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
import { cnpjValido } from '@/lib/documento'
import { somenteDigitos } from '@/lib/grupo-cnpj'
import { createHash } from 'node:crypto'

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

// Loja de outra Conta e loja inexistente recebem a mesma frase: a diferença revelaria
// que a loja existe.
async function lojaDeDestino(exec: Executor, usuario: EntradaPecas['usuario'], lojaId: string) {
  if (!(await podeAbrirRegistroDaLoja(usuario, lojaId, exec))) {
    throw new EntradaPecasRecusada('Loja de destino não encontrada')
  }
  const [loja] = await exec.select({ grupoId: grupos.id, contaId: grupos.contaId })
    .from(lojas).innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(eq(lojas.id, lojaId))
  if (!loja) throw new EntradaPecasRecusada('Loja de destino não encontrada')
  return loja
}

/** Sem fornecedor (planilha sem CNPJ) não há vínculo: '' juntaria fornecedores diferentes. */
async function gravarLinhas(
  exec: Executor, contaId: string, lojaId: string, linhas: LinhaEntradaPeca[], fornecedorCnpj: string | null,
) {
  const erros = await conferirLinhasPecas(exec, lojaId, linhas)
  if (erros.length) throw new EntradaPecasRecusada(erros.join('\n'))

  for (const linha of linhas) {
    const pecaId = 'pecaId' in linha
      ? linha.pecaId
      : (await inserirPeca(exec, contaId, linha.nova)).id

    await exec.update(pecasCatalogo)
      .set({ custo: String(linha.custoUnitario), atualizadoEm: new Date() })
      .where(and(eq(pecasCatalogo.id, pecaId), eq(pecasCatalogo.contaId, contaId)))
    await moverSaldo(exec, pecaId, lojaId, linha.quantidade)
    if (fornecedorCnpj === null) continue
    await exec.insert(pecasVinculoFornecedor).values({
      contaId,
      fornecedorCnpj,
      codigo: linha.codigo,
      nomeXml: linha.nomeXml,
      pecaId,
    }).onConflictDoUpdate({
      target: [pecasVinculoFornecedor.contaId, pecasVinculoFornecedor.fornecedorCnpj, pecasVinculoFornecedor.codigo, pecasVinculoFornecedor.nomeXml],
      set: { pecaId, atualizadoEm: sql`now()` },
      setWhere: eq(pecasVinculoFornecedor.contaId, contaId),
    })
  }
}

export async function gravarEntradaPecas(exec: Executor, entrada: EntradaPecas): Promise<void> {
  const { contaId, grupoId } = await lojaDeDestino(exec, entrada.usuario, entrada.lojaId)
  await gravarLinhas(exec, contaId, entrada.lojaId, entrada.linhas, entrada.nota.fornecedorCnpj)
  await exec.insert(notasEntrada).values({
    contaId,
    grupoId,
    lojaId: entrada.lojaId,
    ...entrada.nota,
    criadoPor: entrada.usuario.id,
  })
}

type ItemDaPlanilha = Pick<LinhaEntradaPeca, 'codigo' | 'nomeXml' | 'quantidade' | 'custoUnitario'>

export type EntradaPlanilhaPecas = {
  lojaId: string
  usuario: EntradaPecas['usuario']
  /** Opcional; com ele, a entrada grava o vínculo código/fornecedor como no XML. */
  fornecedorCnpj: string | null
  linhas: LinhaEntradaPeca[]
}

/**
 * Mesmo conteúdo, mesma impressão, em qualquer ordem das linhas. O que se escolhe na
 * conferência (peça existente ou nova) fica de fora: a planilha é a mesma.
 */
export function impressaoDaPlanilha(itens: ItemDaPlanilha[]): string {
  const chave = itens
    .map(i => JSON.stringify([i.codigo.trim(), i.nomeXml.trim().toUpperCase(), i.quantidade, i.custoUnitario]))
    .sort()
    .join('\n')
  return createHash('sha256').update(chave).digest('hex')
}

function cnpjDoFornecedor(cnpj: string | null): string | null {
  if (!cnpj?.trim()) return null
  if (!cnpjValido(cnpj)) throw new EntradaPecasRecusada('CNPJ do fornecedor inválido')
  return somenteDigitos(cnpj)
}

/** Planilha de peças (#519): tudo ou nada, registrada como "planilha", sem chave nem número. */
export async function gravarEntradaPlanilhaPecas(exec: Executor, entrada: EntradaPlanilhaPecas): Promise<void> {
  const { contaId, grupoId } = await lojaDeDestino(exec, entrada.usuario, entrada.lojaId)
  if (!entrada.linhas.length) throw new EntradaPecasRecusada('A planilha não tem itens')
  const fornecedorCnpj = cnpjDoFornecedor(entrada.fornecedorCnpj)
  await gravarLinhas(exec, contaId, entrada.lojaId, entrada.linhas, fornecedorCnpj)
  await exec.insert(notasEntrada).values({
    contaId,
    grupoId,
    lojaId: entrada.lojaId,
    origem: 'planilha',
    fornecedorCnpj,
    impressaoDigital: impressaoDaPlanilha(entrada.linhas),
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

const catalogoAtivoDaLoja = (exec: Pick<typeof db, 'select'>, lojaId: string) =>
  exec.select({ id: pecasCatalogo.id, nome: pecasCatalogo.nome, valor: pecasCatalogo.valor })
    .from(pecasCatalogo)
    .where(and(daContaDaLoja(lojaId), eq(pecasCatalogo.ativo, true)))
    .orderBy(asc(pecasCatalogo.nome))

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

  const pecas = await catalogoAtivoDaLoja(exec, lojaId)

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

export type ConferenciaPlanilha = Omit<Conferencia, 'notaJaLancada'> & {
  /** Quando e por quem a mesma planilha já entrou nesta loja. Aviso, não bloqueio. */
  planilhaJaLancada: { em: Date; por: string } | null
}

const nomeComparavel = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()

/**
 * Conferência da planilha (#519), só da Conta da loja de destino. Sugestão pelo vínculo
 * do fornecedor quando há CNPJ; sem vínculo, pelo nome igual no catálogo. `null` se o
 * usuário não pode usar a loja (ou ela não existe), sem distinguir os dois.
 */
export async function carregarConferenciaPlanilha(
  exec: Pick<typeof db, 'select'>,
  usuario: EntradaPecas['usuario'],
  lojaId: string,
  planilha: { fornecedorCnpj: string | null; itens: ItemDaPlanilha[] },
): Promise<ConferenciaPlanilha | null> {
  if (!(await podeAbrirRegistroDaLoja(usuario, lojaId, exec))) return null
  const [loja] = await exec.select({ contaId: grupos.contaId }).from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId)).where(eq(lojas.id, lojaId))
  const pecas = await catalogoAtivoDaLoja(exec, lojaId)

  const cnpj = planilha.fornecedorCnpj && cnpjValido(planilha.fornecedorCnpj) ? somenteDigitos(planilha.fornecedorCnpj) : null
  const vinculos = cnpj && planilha.itens.length
    ? await exec.select({ codigo: pecasVinculoFornecedor.codigo, nomeXml: pecasVinculoFornecedor.nomeXml, pecaId: pecasVinculoFornecedor.pecaId })
      .from(pecasVinculoFornecedor)
      .where(and(
        eq(pecasVinculoFornecedor.contaId, loja.contaId),
        eq(pecasVinculoFornecedor.fornecedorCnpj, cnpj),
        inArray(pecasVinculoFornecedor.codigo, planilha.itens.map(i => i.codigo)),
      ))
    : []
  const sugestoes = planilha.itens.map(i =>
    vinculos.find(v => v.codigo === i.codigo && v.nomeXml === i.nomeXml)?.pecaId
    ?? pecas.find(p => nomeComparavel(p.nome) === nomeComparavel(i.nomeXml))?.id
    ?? null)

  const [ja] = await exec.select({ em: notasEntrada.criadoEm, por: usuarios.nome })
    .from(notasEntrada).innerJoin(usuarios, eq(usuarios.id, notasEntrada.criadoPor))
    .where(and(
      eq(notasEntrada.contaId, loja.contaId),
      eq(notasEntrada.lojaId, lojaId),
      eq(notasEntrada.impressaoDigital, impressaoDaPlanilha(planilha.itens)),
    ))
    .orderBy(desc(notasEntrada.criadoEm)).limit(1)

  return { pecas, sugestoes, planilhaJaLancada: ja ?? null }
}
