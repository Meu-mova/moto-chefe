'use server'
import { db } from '@/lib/db'
import { clientes, vendas, ordensServico, motos, modelos } from '@/lib/db/schema'
import { eq, ilike, or, and, desc, SQL } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type ClienteInput = {
  nome: string
  tipoPessoa: 'fisica' | 'juridica'
  cpfCnpj?: string | null
  sexo: 'masculino' | 'feminino' | 'nao_identificado'
  email?: string | null
  celular?: string | null
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cep?: string | null
  cidade?: string | null
  uf?: string | null
}

function limparCpfCnpj(v?: string | null) {
  return v?.replace(/\D/g, '') || null
}

export async function listarClientesAction(params: {
  busca?: string
  tipoPessoa?: string
  sexo?: string
  cidade?: string
}) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  const conds: SQL[] = []
  if (params.busca) {
    conds.push(or(
      ilike(clientes.nome, `%${params.busca}%`),
      ilike(clientes.cpfCnpj, `%${params.busca.replace(/\D/g, '')}%`),
      ilike(clientes.celular, `%${params.busca}%`),
    )!)
  }
  if (params.tipoPessoa && params.tipoPessoa !== 'todos') {
    conds.push(eq(clientes.tipoPessoa, params.tipoPessoa as 'fisica' | 'juridica'))
  }
  if (params.sexo && params.sexo !== 'todos') {
    conds.push(eq(clientes.sexo, params.sexo as 'masculino' | 'feminino' | 'nao_identificado'))
  }
  if (params.cidade && params.cidade !== 'todos') {
    conds.push(eq(clientes.cidade, params.cidade))
  }

  return db.select().from(clientes)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(clientes.nome)
    .limit(200)
}

export async function buscarClientesAction(termo: string) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  if (termo.length < 3) return []
  const termoCpf = termo.replace(/\D/g, '')
  return db.select({
    id: clientes.id,
    nome: clientes.nome,
    cpfCnpj: clientes.cpfCnpj,
    celular: clientes.celular,
  }).from(clientes)
    .where(or(
      ilike(clientes.nome, `%${termo}%`),
      termoCpf.length >= 3 ? ilike(clientes.cpfCnpj, `%${termoCpf}%`) : undefined,
    ))
    .orderBy(clientes.nome)
    .limit(5)
}

export async function buscarClientePorIdAction(id: string) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1)
  return cliente ?? null
}

export async function listarCidadesAction() {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  const rows = await db.selectDistinct({ cidade: clientes.cidade })
    .from(clientes)
    .orderBy(clientes.cidade)
  return rows.map(r => r.cidade).filter(Boolean) as string[]
}

export async function criarClienteAction(dados: ClienteInput): Promise<string> {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  const cpfCnpj = limparCpfCnpj(dados.cpfCnpj)

  try {
    const [novo] = await db.insert(clientes).values({
      ...dados,
      cpfCnpj,
    }).returning({ id: clientes.id })
    revalidatePath('/clientes')
    return novo.id
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('cpf_cnpj')) throw new Error('CPF/CNPJ já cadastrado')
    throw e
  }
}

export async function atualizarClienteAction(id: string, dados: Partial<ClienteInput>) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  const cpfCnpj = dados.cpfCnpj !== undefined ? limparCpfCnpj(dados.cpfCnpj) : undefined

  try {
    await db.update(clientes).set({
      ...dados,
      ...(cpfCnpj !== undefined ? { cpfCnpj } : {}),
      atualizadoEm: new Date(),
    }).where(eq(clientes.id, id))
    revalidatePath('/clientes')
    revalidatePath(`/clientes/${id}`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('cpf_cnpj')) throw new Error('CPF/CNPJ já cadastrado')
    throw e
  }
}

export async function excluirClienteAction(id: string) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') throw new Error('Sem permissão')
  await db.delete(clientes).where(eq(clientes.id, id))
  revalidatePath('/clientes')
}

export async function buscarHistoricoClienteAction(id: string, cpfCnpj: string | null) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel === 'mecanico') throw new Error('Sem permissão')

  const condicaoVendas = cpfCnpj
    ? or(eq(vendas.clienteId, id), eq(vendas.clienteCpf, cpfCnpj))!
    : eq(vendas.clienteId, id)

  const [vendasCliente, osCliente] = await Promise.all([
    db.select({
      id: vendas.id,
      numero: vendas.numero,
      dataVenda: vendas.dataVenda,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      marca: modelos.marca,
      modelo: modelos.modelo,
      chassi: motos.chassi,
    })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(condicaoVendas)
      .orderBy(desc(vendas.dataVenda)),

    db.select({
      id: ordensServico.id,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      marca: modelos.marca,
      modelo: modelos.modelo,
      chassi: motos.chassi,
    })
      .from(ordensServico)
      .innerJoin(motos, eq(ordensServico.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(eq(ordensServico.clienteId, id))
      .orderBy(desc(ordensServico.dataAbertura)),
  ])

  return { vendas: vendasCliente, os: osCliente }
}
