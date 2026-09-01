'use server'
import { db } from '@/lib/db'
import { cuponsRevisao, lojas, usuarios, motos, ordensServico } from '@/lib/db/schema'
import { eq, and, desc, inArray, ilike, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { gerarCodigoCupom, normalizarCodigoCupom } from '@/lib/cupom-revisao'
import { podeEmitirCupom, podeVerCupom } from './papeis'

async function checarLeitura() {
  const usuario = await getUsuarioLogado()
  if (!podeVerCupom(usuario.papel)) throw new Error('Sem permissão')
  return usuario
}

async function checarEmissao() {
  const usuario = await getUsuarioLogado()
  if (!podeEmitirCupom(usuario.papel)) throw new Error('Sem permissão')
  return usuario
}

export type CupomRow = Awaited<ReturnType<typeof listarCuponsAction>>[number]

export async function listarCuponsAction(filtros: { status?: string; q?: string } = {}) {
  const usuario = await checarLeitura()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (lojaIdsGrupo.length === 0) return []

  const emissor = alias(usuarios, 'emissor')
  const busca = filtros.q?.trim()
  const hoje = hojeBrt()

  // 'vencido' não existe na coluna — é `status = 'ativo'` com a validade no passado.
  // Ver statusCupom em @/lib/cupom-revisao.
  const filtroStatus =
    filtros.status === 'vencido'  ? sql`${cuponsRevisao.status} = 'ativo' AND ${cuponsRevisao.validoAte} < ${hoje}` :
    filtros.status === 'ativo'    ? sql`${cuponsRevisao.status} = 'ativo' AND ${cuponsRevisao.validoAte} >= ${hoje}` :
    filtros.status === 'usado'    ? eq(cuponsRevisao.status, 'usado') :
    filtros.status === 'cancelado'? eq(cuponsRevisao.status, 'cancelado') :
    undefined

  return db
    .select({
      id: cuponsRevisao.id,
      codigo: cuponsRevisao.codigo,
      status: cuponsRevisao.status,
      validoAte: cuponsRevisao.validoAte,
      clienteNome: cuponsRevisao.clienteNome,
      chassi: cuponsRevisao.chassi,
      observacao: cuponsRevisao.observacao,
      lojaNome: lojas.nome,
      emitidoPorNome: emissor.nome,
      emitidoEm: cuponsRevisao.emitidoEm,
      usadoEm: cuponsRevisao.usadoEm,
      valorAbatido: cuponsRevisao.valorAbatido,
      osId: cuponsRevisao.osId,
      osNumero: ordensServico.numero,
      motivoCancelamento: cuponsRevisao.motivoCancelamento,
    })
    .from(cuponsRevisao)
    .innerJoin(lojas, eq(cuponsRevisao.lojaId, lojas.id))
    .leftJoin(emissor, eq(cuponsRevisao.emitidoPor, emissor.id))
    .leftJoin(ordensServico, eq(cuponsRevisao.osId, ordensServico.id))
    .where(and(
      inArray(cuponsRevisao.lojaId, lojaIdsGrupo),
      filtroStatus,
      busca
        ? or(
            // Só o miolo alfanumérico do que foi digitado: quem procura "rev-a7k"
            // e quem procura "A7K" tem que achar o mesmo cupom.
            ilike(cuponsRevisao.codigo, `%${busca.toUpperCase().replace(/[^A-Z0-9]/g, '')}%`),
            ilike(cuponsRevisao.clienteNome, `%${busca}%`),
            ilike(cuponsRevisao.chassi, `%${busca}%`),
          )
        : undefined,
    ))
    .orderBy(desc(cuponsRevisao.emitidoEm))
    .limit(300)
}

export type EmitirCupomInput = {
  lojaId: string
  clienteNome?: string
  clienteId?: string | null
  chassi?: string
  validoAte: string
  observacao?: string
}

export async function emitirCupomAction(input: EmitirCupomInput) {
  const usuario = await checarEmissao()
  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(input.lojaId)) throw new Error('Loja fora do grupo ativo')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validoAte)) throw new Error('Validade inválida')
  if (input.validoAte < hojeBrt()) throw new Error('A validade não pode ser no passado')
  if (!input.clienteNome?.trim() && !input.chassi?.trim()) {
    throw new Error('Informe o cliente ou o chassi — sem isso o cupom não identifica de quem é')
  }

  // Chassi opcional, mas quando vem tem que existir: cupom apontando para um chassi
  // que não está no estoque nasce órfão e ninguém descobre depois.
  const chassi = input.chassi?.trim().toUpperCase() || null
  let motoId: string | null = null
  if (chassi) {
    const [moto] = await db.select({ id: motos.id }).from(motos).where(eq(motos.chassi, chassi)).limit(1)
    if (!moto) throw new Error('Chassi não encontrado no estoque')
    motoId = moto.id
  }

  // Colisão de código é improvável (30^6), mas a coluna é UNIQUE e o insert
  // estouraria na cara do operador — três tentativas resolvem sem drama.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = gerarCodigoCupom()
    const [existente] = await db
      .select({ id: cuponsRevisao.id })
      .from(cuponsRevisao)
      .where(eq(cuponsRevisao.codigo, codigo))
      .limit(1)
    if (existente) continue

    const [novo] = await db.insert(cuponsRevisao).values({
      grupoId: grupo.id,
      lojaId: input.lojaId,
      codigo,
      clienteId: input.clienteId || null,
      clienteNome: input.clienteNome?.trim() || null,
      motoId,
      chassi,
      observacao: input.observacao?.trim() || null,
      validoAte: input.validoAte,
      emitidoPor: usuario.id,
    }).returning({ id: cuponsRevisao.id, codigo: cuponsRevisao.codigo })

    revalidatePath('/cupons')
    return novo
  }

  throw new Error('Não foi possível gerar um código único — tente de novo')
}

export async function cancelarCupomAction(id: string, motivo: string) {
  const usuario = await checarEmissao()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const motivoLimpo = motivo.trim()
  if (motivoLimpo.length < 3) throw new Error('Informe o motivo do cancelamento')

  const [cupom] = await db
    .select({ lojaId: cuponsRevisao.lojaId, status: cuponsRevisao.status })
    .from(cuponsRevisao)
    .where(eq(cuponsRevisao.id, id))
    .limit(1)
  if (!cupom || !lojaIdsGrupo.includes(cupom.lojaId)) throw new Error('Cupom não encontrado no grupo ativo')
  // Cancelar um cupom já resgatado apagaria o registro de um desconto que a OS deu.
  if (cupom.status === 'usado') throw new Error('Cupom já utilizado numa OS — não pode ser cancelado')
  if (cupom.status === 'cancelado') throw new Error('Cupom já está cancelado')

  await db.update(cuponsRevisao).set({
    status: 'cancelado',
    canceladoPor: usuario.id,
    canceladoEm: new Date(),
    motivoCancelamento: motivoLimpo,
  }).where(eq(cuponsRevisao.id, id))

  revalidatePath('/cupons')
}

/**
 * Consulta um código na tela de pagamento da OS, antes de salvar.
 *
 * Devolve o cupom cru (sem julgar) para a tela mostrar de quem é e até quando
 * vale. Quem decide se pode resgatar é `motivoCupomInvalido`, aplicado tanto aqui
 * na tela quanto de novo no servidor ao gravar o pagamento — a tela é conveniência,
 * a trava é a do servidor.
 */
export async function buscarCupomPorCodigoAction(codigo: string) {
  const usuario = await checarLeitura()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const normalizado = normalizarCodigoCupom(codigo)
  if (!normalizado || lojaIdsGrupo.length === 0) return null

  const [cupom] = await db
    .select({
      id: cuponsRevisao.id,
      codigo: cuponsRevisao.codigo,
      status: cuponsRevisao.status,
      validoAte: cuponsRevisao.validoAte,
      osId: cuponsRevisao.osId,
      clienteNome: cuponsRevisao.clienteNome,
      chassi: cuponsRevisao.chassi,
      lojaNome: lojas.nome,
    })
    .from(cuponsRevisao)
    .innerJoin(lojas, eq(cuponsRevisao.lojaId, lojas.id))
    // Escopo de grupo, não de loja: o cupom emitido numa loja vale nas outras do
    // mesmo grupo — o cliente compra em Pouso Alegre e revisa em Varginha.
    .where(and(eq(cuponsRevisao.codigo, normalizado), inArray(cuponsRevisao.lojaId, lojaIdsGrupo)))
    .limit(1)

  return cupom ?? null
}

