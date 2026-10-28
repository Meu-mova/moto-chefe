'use server'
import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { clientes, vendas, ordensServico, motos, modelos } from '@/lib/db/schema'
import { lojasDaConta } from '@/lib/conta'
import { eq, ilike, or, and, desc, inArray, SQL, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { acessaModulo } from '@/lib/navegacao'
import { contaDoGrupoAtivo } from '@/lib/grupo'
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

const PAGE_SIZE = 50

export async function listarClientesAction(params: {
  busca?: string
  tipoPessoa?: string
  sexo?: string
  cidade?: string
  page?: number
  /** 20 no celular/tablet, 50 no desktop; qualquer outro valor vira 50. */
  porPagina?: number
}) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  const pageSize = params.porPagina === 20 ? 20 : PAGE_SIZE
  const page = Math.max(1, params.page ?? 1)
  const offset = (page - 1) * pageSize

  const conds: SQL[] = []
  if (params.busca) {
    // Busca só por letras não tem dígito: sem este cuidado, o CPF virava '%%' e casava com todos.
    const digitos = params.busca.replace(/\D/g, '')
    conds.push(or(
      ilike(clientes.nome, `%${params.busca}%`),
      ilike(clientes.celular, `%${params.busca}%`),
      ...(digitos ? [ilike(clientes.cpfCnpj, `%${digitos}%`)] : []),
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

  conds.push(eq(clientes.contaId, await contaDoGrupoAtivo(usuario)))
  const where = and(...conds)

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(clientes)
      .where(where)
      .orderBy(clientes.nome)
      .limit(pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(clientes).where(where),
  ])

  return { clientes: rows, total, page, pageSize }
}

export async function buscarClientesAction(termo: string) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  if (termo.length < 3) return []
  const termoCpf = termo.replace(/\D/g, '')
  return db.select({
    id: clientes.id,
    nome: clientes.nome,
    cpfCnpj: clientes.cpfCnpj,
    celular: clientes.celular,
  }).from(clientes)
    .where(and(
      eq(clientes.contaId, await contaDoGrupoAtivo(usuario)),
      or(
        ilike(clientes.nome, `%${termo}%`),
        termoCpf.length >= 3 ? ilike(clientes.cpfCnpj, `%${termoCpf}%`) : undefined,
      ),
    ))
    .orderBy(clientes.nome)
    .limit(5)
}

export async function buscarClientePorIdAction(id: string) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  const [cliente] = await db.select().from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, await contaDoGrupoAtivo(usuario))))
    .limit(1)
  return cliente ?? null
}

export async function listarCidadesAction() {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  const rows = await db.selectDistinct({ cidade: clientes.cidade })
    .from(clientes)
    .where(eq(clientes.contaId, await contaDoGrupoAtivo(usuario)))
    .orderBy(clientes.cidade)
  return rows.map(r => r.cidade).filter(Boolean) as string[]
}

// Só a trava de CPF por Conta vira "já cadastrado": o texto do erro do Drizzle traz a
// query inteira, então procurar "cpf_cnpj" nele pegava qualquer falha do insert.
function cpfRepetido(e: unknown): boolean {
  return (e as { cause?: { constraint?: string } })?.cause?.constraint === 'clientes_conta_cpf_cnpj_key'
}

export async function criarClienteAction(dados: ClienteInput): Promise<string> {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  const cpfCnpj = limparCpfCnpj(dados.cpfCnpj)

  try {
    const [novo] = await db.insert(clientes).values({
      ...dados,
      cpfCnpj,
      contaId: await contaDoGrupoAtivo(usuario),
    }).returning({ id: clientes.id })
    revalidatePath('/clientes')
    return novo.id
  } catch (e: unknown) {
    if (cpfRepetido(e)) throw new Error('CPF/CNPJ já cadastrado')
    throw e
  }
}

export async function atualizarClienteAction(id: string, dados: Partial<ClienteInput>) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  const cpfCnpj = dados.cpfCnpj !== undefined ? limparCpfCnpj(dados.cpfCnpj) : undefined

  try {
    const atualizados = await db.update(clientes).set({
      ...dados,
      ...(cpfCnpj !== undefined ? { cpfCnpj } : {}),
      atualizadoEm: new Date(),
    }).where(and(eq(clientes.id, id), eq(clientes.contaId, await contaDoGrupoAtivo(usuario))))
      .returning({ id: clientes.id })
    if (!atualizados.length) throw new Error('Cliente não encontrado')
    revalidatePath('/clientes')
    revalidatePath(`/clientes/${id}`)
  } catch (e: unknown) {
    if (cpfRepetido(e)) throw new Error('CPF/CNPJ já cadastrado')
    throw e
  }
}

export async function excluirClienteAction(id: string) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') throw new Error('Sem permissão')
  await db.delete(clientes).where(and(eq(clientes.id, id), eq(clientes.contaId, await contaDoGrupoAtivo(usuario))))
  revalidatePath('/clientes')
}

export async function buscarHistoricoClienteAction(id: string, cpfCnpj: string | null) {
  const usuario = await getUsuarioLogado()
  if (!acessaModulo(usuario, 'clientes')) throw new Error('Sem permissão')

  // Histórico só da Conta: o CPF casa com vendas de qualquer loja do sistema, e o
  // cliente pode ser de outra Conta (aí não há histórico nenhum a mostrar).
  const contaId = await contaDoGrupoAtivo(usuario)
  const [doCliente] = await db.select({ id: clientes.id }).from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, contaId))).limit(1)
  if (!doCliente) return { vendas: [], os: [] }

  const condicaoVendas = and(
    inArray(vendas.lojaId, lojasDaConta(contaId)),
    cpfCnpj ? or(eq(vendas.clienteId, id), eq(vendas.clienteCpf, cpfCnpj))! : eq(vendas.clienteId, id),
  )

  const [vendasCliente, osCliente] = await Promise.all([
    db.select({
      id: vendas.id,
      numero: vendas.numero,
      dataVenda: vendas.dataVenda,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      marca: modelos.marca,
      modelo: nomeDoModeloNaLoja(vendas.lojaId),
      chassi: motos.chassi,
    })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(condicaoVendas)
      .orderBy(desc(vendas.dataVenda)),

    db.select({
      id: ordensServico.id,
      numero: ordensServico.numero,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      valorTotal: ordensServico.valorTotal,
      marca: modelos.marca,
      modelo: nomeDoModeloNaLoja(ordensServico.lojaId),
      chassi: motos.chassi,
    })
      .from(ordensServico)
      .leftJoin(motos, eq(ordensServico.motoId, motos.id))
      .leftJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(eq(ordensServico.clienteId, id), inArray(ordensServico.lojaId, lojasDaConta(contaId))))
      .orderBy(desc(ordensServico.dataAbertura)),
  ])

  return { vendas: vendasCliente, os: osCliente }
}
