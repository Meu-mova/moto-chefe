'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { demandas } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

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
  valorSinal: number | null
  meioPagamento: string
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
  const cpf = (s.clienteCpf ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) throw new Error('CPF do cliente é obrigatório (11 dígitos)')
  if (!s.clienteCelular?.trim()) throw new Error('Celular do cliente é obrigatório')
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
  if (!dados.modelo.trim() || !dados.cor.trim()) throw new Error('Modelo e cor são obrigatórios')

  const base = {
    modelo: dados.modelo.trim(),
    modeloId: dados.modeloId || null,
    cor: dados.cor.trim(),
    lojaId: effectiveLojaId,
    solicitanteId: usuario.id,
  }

  if (dados.sinal) {
    validarSnapshot(dados.sinal)
    if (!dados.sinal.meioPagamento) throw new Error('Meio de pagamento do sinal é obrigatório')
    const [row] = await db.insert(demandas).values({
      ...base,
      sinalRecebido: true,
      valorSinal: dados.sinal.valorSinal != null ? String(dados.sinal.valorSinal) : null,
      meioPagamento: dados.sinal.meioPagamento,
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

export async function darBaixaAction(demandaId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) {
    throw new Error('Sem permissão para dar baixa')
  }
  await db.delete(demandas).where(eq(demandas.id, demandaId))
  revalidatePath('/demandas')
}

// Registrar o sinal numa demanda existente — passa a exigir o cadastro completo do cliente.
export async function marcarSinalDemandaAction(demandaId: string, sinal: DadosSinal): Promise<{ id: string }> {
  const usuario = await getUsuarioLogado()
  if (!PODE.includes(usuario.papel)) throw new Error('Sem permissão')

  const [demanda] = await db.select({ lojaId: demandas.lojaId, sinalRecebido: demandas.sinalRecebido, numero: demandas.numero })
    .from(demandas).where(eq(demandas.id, demandaId)).limit(1)
  if (!demanda) throw new Error('Demanda não encontrada')
  if (!ADMINS.includes(usuario.papel) && demanda.lojaId !== usuario.lojaId) {
    throw new Error('Sem permissão para essa loja')
  }

  validarSnapshot(sinal)
  if (!sinal.meioPagamento) throw new Error('Meio de pagamento do sinal é obrigatório')

  await db.update(demandas).set({
    sinalRecebido: true,
    valorSinal: sinal.valorSinal != null ? String(sinal.valorSinal) : null,
    meioPagamento: sinal.meioPagamento,
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

  await db.update(demandas)
    .set({ sinalRecebido: false })
    .where(eq(demandas.id, demandaId))
  revalidatePath('/demandas')
}
