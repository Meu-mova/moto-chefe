import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  categoriaEnum, contratosGrupo, grupos, lojas, modeloAjustes, modelos, motos, usuarios, vendas,
} from '@/lib/db/schema'
import { grupoNoEscopo } from '@/lib/conta'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { montarHtmlDocumento, envolverDocumento, type DadosDocumento } from '@/lib/assinatura/documento'
import { renderizarContratoGrupo, validarTextoContrato } from '@/lib/assinatura/contrato-grupo'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>
type Usuario = { id?: string; papel: string; contaId: string | null; grupoLiberado?: string | null }

export type Categoria = (typeof categoriaEnum.enumValues)[number]
export const CATEGORIAS: readonly Categoria[] = categoriaEnum.enumValues

export const podeEditarContratos = (papel: string) => papel === 'admin_geral' || papel === 'admin_socio'
export const podeVerContratos = (papel: string) => podeEditarContratos(papel) || papel === 'aux_adm'

// Grupo de outra Conta e grupo inexistente recebem a mesma resposta.
async function grupoVisivel(usuario: Usuario, grupoId: string, exec: Executor): Promise<boolean> {
  if (!podeVerContratos(usuario.papel)) return false
  if (usuario.papel === 'admin_geral') {
    const [g] = await exec.select({ id: grupos.id }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
    return !!g
  }
  return grupoNoEscopo(grupoId, usuario, exec)
}

export type VersaoContrato = {
  id: string
  categoria: Categoria
  versao: number
  texto: string
  criadoEm: Date
  criadoPorNome: string | null
}

/** Todas as versões do grupo, da mais nova para a mais antiga. null = sem acesso ao grupo. */
export async function listarContratosDoGrupo(
  usuario: Usuario,
  grupoId: string,
  exec: Executor = db,
): Promise<VersaoContrato[] | null> {
  if (!await grupoVisivel(usuario, grupoId, exec)) return null
  return exec.select({
    id: contratosGrupo.id, categoria: contratosGrupo.categoria, versao: contratosGrupo.versao,
    texto: contratosGrupo.texto, criadoEm: contratosGrupo.criadoEm, criadoPorNome: usuarios.nome,
  })
    .from(contratosGrupo)
    .leftJoin(usuarios, eq(usuarios.id, contratosGrupo.criadoPor))
    .where(eq(contratosGrupo.grupoId, grupoId))
    .orderBy(contratosGrupo.categoria, desc(contratosGrupo.versao))
}

/**
 * Categorias que a tela mostra: as dos modelos que a Conta do grupo usa (com o ajuste dela),
 * e autopropelido sempre, porque é a que tem contrato padrão do MOVA.
 */
export async function categoriasDoGrupo(grupoId: string, exec: Executor = db): Promise<Categoria[]> {
  const [g] = await exec.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  const daConta = g?.contaId ? (await listarModelosDaConta(g.contaId, exec)).map(m => m.categoria) : []
  const usadas = new Set<Categoria>(['autopropelido', ...daConta])
  return CATEGORIAS.filter(c => usadas.has(c))
}

export type ResultadoSalvar = { ok: true; versao: number } | { ok: false; erro: string }

/** Salvar sempre cria versão nova: o que já foi enviado continua apontando para a sua. */
export async function salvarContratoGrupo(
  usuario: Usuario,
  entrada: { grupoId: string; categoria: string; texto: string },
  exec: Pick<typeof db, 'transaction'> = db,
): Promise<ResultadoSalvar> {
  if (!podeEditarContratos(usuario.papel)) return { ok: false, erro: 'Sem permissão para editar o contrato' }
  const categoria = CATEGORIAS.find(c => c === entrada.categoria)
  if (!categoria) return { ok: false, erro: 'Categoria inválida' }
  const validacao = validarTextoContrato(entrada.texto)
  if (!validacao.ok) return { ok: false, erro: validacao.erro }

  return exec.transaction(async tx => {
    if (!await grupoVisivel(usuario, entrada.grupoId, tx)) return { ok: false, erro: 'Grupo não encontrado' }
    // Dois sócios salvando juntos: o segundo espera e pega o número seguinte.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`contrato:${entrada.grupoId}:${categoria}`}, 0))`)
    const [ultima] = await tx.select({ versao: contratosGrupo.versao }).from(contratosGrupo)
      .where(and(eq(contratosGrupo.grupoId, entrada.grupoId), eq(contratosGrupo.categoria, categoria)))
      .orderBy(desc(contratosGrupo.versao)).limit(1)
    const versao = (ultima?.versao ?? 0) + 1
    await tx.insert(contratosGrupo).values({
      grupoId: entrada.grupoId, categoria, versao, texto: entrada.texto, criadoPor: usuario.id ?? null,
    })
    return { ok: true, versao }
  })
}

/**
 * Categoria da moto vendida, com o ajuste da Conta da venda por cima do modelo da plataforma.
 * O grupo vem de quem chama e entra no where: venda de outro grupo não devolve nada.
 */
export async function categoriaDaVenda(vendaId: string, grupoId: string, exec: Executor = db): Promise<Categoria | null> {
  const [linha] = await exec.select({
    categoria: sql<Categoria>`coalesce(${modeloAjustes.categoria}, ${modelos.categoria})`,
  })
    .from(vendas)
    .innerJoin(lojas, eq(lojas.id, vendas.lojaId))
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .innerJoin(motos, eq(motos.id, vendas.motoId))
    .innerJoin(modelos, eq(modelos.id, motos.modeloId))
    .leftJoin(modeloAjustes, and(eq(modeloAjustes.modeloId, modelos.id), eq(modeloAjustes.contaId, grupos.contaId)))
    .where(and(eq(vendas.id, vendaId), eq(grupos.id, grupoId)))
    .limit(1)
  return linha?.categoria ?? null
}

export type EscolhaContrato =
  | { ok: true; contratoGrupo: { id: string; texto: string } | null }
  | { ok: false; aviso: string }

/**
 * Qual contrato a venda usa, em todo lugar que o gera (envio, papel, impressão, painel):
 * 1. o do grupo para a categoria da moto, na versão mais nova;
 * 2. sem ele, autopropelido (ou venda sem modelo) usa o texto do MOVA, igual a antes;
 * 3. outra categoria sem contrato do grupo não gera nada: o texto do MOVA é de autopropelido.
 */
export async function escolherContrato(vendaId: string, grupoId: string, exec: Executor = db): Promise<EscolhaContrato> {
  const categoria = await categoriaDaVenda(vendaId, grupoId, exec)
  if (categoria) {
    const [ativo] = await exec.select({ id: contratosGrupo.id, texto: contratosGrupo.texto }).from(contratosGrupo)
      .where(and(eq(contratosGrupo.grupoId, grupoId), eq(contratosGrupo.categoria, categoria)))
      .orderBy(desc(contratosGrupo.versao)).limit(1)
    if (ativo) return { ok: true, contratoGrupo: ativo }
  }
  if (!categoria || categoria === 'autopropelido') return { ok: true, contratoGrupo: null }
  return { ok: false, aviso: `Esta empresa ainda não cadastrou o contrato de venda de ${categoria}. Fale com o administrador.` }
}

export type ContratoDaVenda =
  | { ok: true; html: string; contratoGrupoId: string | null }
  | { ok: false; aviso: string }

export async function contratoDaVenda(
  vendaId: string,
  grupoId: string,
  dados: DadosDocumento,
  exec: Executor = db,
): Promise<ContratoDaVenda> {
  const escolha = await escolherContrato(vendaId, grupoId, exec)
  if (!escolha.ok) return escolha
  if (!escolha.contratoGrupo) {
    return { ok: true, html: montarHtmlDocumento('contrato_venda', dados), contratoGrupoId: null }
  }
  const { id, texto } = escolha.contratoGrupo
  return { ok: true, html: envolverDocumento(renderizarContratoGrupo(texto, dados)), contratoGrupoId: id }
}
