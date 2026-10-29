'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { db } from '@/lib/db'
import { conferirMaquininhas } from '@/lib/maquininhas'
import { demandas } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { modeloUsavelNaLoja } from '@/lib/modelos-da-conta'
import { pagamentosFecham, somaPagamentos, type PagamentoEntrada } from '@/lib/pagamentos-entrada'
import { lerDocumentoCliente } from '@/lib/documento'

const ADMINS = ['admin_geral', 'admin_socio']
const PODE = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export type ClienteSnapshot = {
  clienteNome: string
  clienteCpf: string
  clienteCelular: string
  clienteEmail: string
  clienteCep: string
  clienteLogradouro: string
  clienteNumero: string
  clienteComplemento: string
  clienteBairro: string
  clienteCidade: string
  clienteEstado: string
}

export type DadosSinal = ClienteSnapshot & {
  /** Valor do sinal — obrigatório desde a 0089, é contra ele que a soma fecha. */
  valorSinal: number
  /** O sinal pode ser dividido em mais de uma forma de pagamento. */
  pagamentos: PagamentoEntrada[]
}

export type NovaDemanda = {
  modelo: string            // label exibido (marca + modelo)
  modeloId: string | null
  cor: string
  lojaId: string
  sinal?: DadosSinal | null
}

function validarSnapshot(s: ClienteSnapshot) {
  if (!s.clienteNome?.trim()) throw new Error('Nome do cliente é obrigatório')
  const doc = lerDocumentoCliente(s.clienteCpf)
  if (!doc.ok) throw new Error(doc.erro)
  if (!s.clienteCelular?.trim()) throw new Error('Celular do cliente é obrigatório')
}

/**
 * Confere o sinal e devolve a forma principal — a que vai para `meio_pagamento`,
 * lido pelo recibo impresso. O detalhe completo vai no jsonb `pagamentos`.
 */
function validarSinal(sinal: DadosSinal): PagamentoEntrada {
  if (!(sinal.valorSinal > 0)) throw new Error('Valor do sinal é obrigatório')
  const pgs = sinal.pagamentos ?? []
  if (pgs.length === 0) throw new Error('Meio de pagamento do sinal é obrigatório')
  if (pgs.some(p => !p.tipo || !(p.valor > 0))) {
    throw new Error('Toda forma de pagamento precisa de tipo e valor')
  }
  if (!pagamentosFecham(pgs, sinal.valorSinal)) {
    throw new Error(
      `A soma das formas de pagamento (${somaPagamentos(pgs).toFixed(2)}) não bate com o sinal (${sinal.valorSinal.toFixed(2)})`,
    )
  }
  return pgs[0]
}

function snapshotCols(s: ClienteSnapshot) {
  return {
    clienteNome: s.clienteNome.trim(),
    clienteCpf: s.clienteCpf,
    clienteCelular: s.clienteCelular,
    clienteEmail: s.clienteEmail || null,
    clienteCep: s.clienteCep || null,
    clienteLogradouro: s.clienteLogradouro || null,
    clienteNumero: s.clienteNumero || null,
    clienteComplemento: s.clienteComplemento || null,
    clienteBairro: s.clienteBairro || null,
    clienteCidade: s.clienteCidade || null,
    clienteEstado: s.clienteEstado || null,
  }
}

export async function criarDemandaAction(dados: NovaDemanda): Promise<{ id: string }> {
  const usuario = await getUsuarioLogado()
  if (!PODE.includes(usuario.papel)) throw new Error('Sem permissão')
  // Não-admins só criam na própria loja
  const effectiveLojaId = ADMINS.includes(usuario.papel) ? dados.lojaId : usuario.lojaId
  if (!effectiveLojaId) throw new Error('Usuário sem loja associada')
  if (!(await podeAgirNaLoja(usuario, effectiveLojaId))) throw new Error('Sem permissão para esta loja')
  if (!dados.modelo.trim() || !dados.cor.trim()) throw new Error('Modelo e cor são obrigatórios')
  if (dados.modeloId && !(await modeloUsavelNaLoja(effectiveLojaId, dados.modeloId))) {
    throw new Error('Modelo não encontrado')
  }
  if (dados.sinal) await conferirMaquininhas(db, effectiveLojaId, dados.sinal.pagamentos ?? [])

  const base = {
    modelo: dados.modelo.trim(),
    modeloId: dados.modeloId || null,
    cor: dados.cor.trim(),
    lojaId: effectiveLojaId,
    solicitanteId: usuario.id,
  }

  if (dados.sinal) {
    validarSnapshot(dados.sinal)
    const principal = validarSinal(dados.sinal)
    const [row] = await db.insert(demandas).values({
      ...base,
      sinalRecebido: true,
      valorSinal: String(dados.sinal.valorSinal),
      meioPagamento: principal.tipo,
      pagamentos: dados.sinal.pagamentos,
      numero: sql`nextval('numero_venda_seq')`,
      sinalRecebidoEm: new Date(),
      ...snapshotCols(dados.sinal),
    }).returning({ id: demandas.id })
    revalidatePath('/demandas')
    return { id: row.id }
  }

  const [row] = await db.insert(demandas)
    .values({ ...base, sinalRecebido: false })
    .returning({ id: demandas.id })
  revalidatePath('/demandas')
  return { id: row.id }
}

async function exigirDemandaNoEscopo(usuario: Awaited<ReturnType<typeof getUsuarioLogado>>, demandaId: string) {
  const [demanda] = await db.select({ lojaId: demandas.lojaId }).from(demandas).where(eq(demandas.id, demandaId)).limit(1)
  if (!demanda || !(await podeAgirNaLoja(usuario, demanda.lojaId))) throw new Error('Demanda não encontrada')
}

export async function darBaixaAction(demandaId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) {
    throw new Error('Sem permissão para dar baixa')
  }
  await exigirDemandaNoEscopo(usuario, demandaId)
  await db.delete(demandas).where(eq(demandas.id, demandaId))
  revalidatePath('/demandas')
}

// Registrar o sinal numa demanda existente — passa a exigir o cadastro completo do cliente.
export async function marcarSinalDemandaAction(demandaId: string, sinal: DadosSinal): Promise<{ id: string }> {
  const usuario = await getUsuarioLogado()
  if (!PODE.includes(usuario.papel)) throw new Error('Sem permissão')

  const [demanda] = await db.select({ lojaId: demandas.lojaId, sinalRecebido: demandas.sinalRecebido, numero: demandas.numero })
    .from(demandas).where(eq(demandas.id, demandaId)).limit(1)
  if (!demanda || !(await podeAgirNaLoja(usuario, demanda.lojaId))) throw new Error('Demanda não encontrada')

  validarSnapshot(sinal)
  const principal = validarSinal(sinal)
  await conferirMaquininhas(db, demanda.lojaId, sinal.pagamentos ?? [])

  await db.update(demandas).set({
    sinalRecebido: true,
    valorSinal: String(sinal.valorSinal),
    meioPagamento: principal.tipo,
    pagamentos: sinal.pagamentos,
    // atribui número do recibo só na primeira vez
    numero: demanda.numero ?? sql`nextval('numero_venda_seq')`,
    sinalRecebidoEm: new Date(),
    ...snapshotCols(sinal),
  }).where(eq(demandas.id, demandaId))

  revalidatePath('/demandas')
  return { id: demandaId }
}

// Desmarcar o sinal (remover a prioridade) — ação sensível, só admin.
export async function desmarcarSinalDemandaAction(demandaId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão para desmarcar o sinal')
  await exigirDemandaNoEscopo(usuario, demandaId)

  await db.update(demandas)
    .set({ sinalRecebido: false })
    .where(eq(demandas.id, demandaId))
  revalidatePath('/demandas')
}
