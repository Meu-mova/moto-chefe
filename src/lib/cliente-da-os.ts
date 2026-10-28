/**
 * Cliente lido pela OS (#450): liberado pelo módulo OS, não pelo de clientes, porque quem
 * tem clientes bloqueado ainda abre OS. Só da Conta; outra Conta e id inexistente dão null.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { clientes } from '@/lib/db/schema'
import { acessaModulo, type UsuarioNav } from '@/lib/navegacao'

type Executor = Pick<typeof db, 'select'>

const colunas = { id: clientes.id, nome: clientes.nome, cpfCnpj: clientes.cpfCnpj, celular: clientes.celular, email: clientes.email }

export async function clienteDaOs(exec: Executor, usuario: UsuarioNav & { contaId: string }, id: string) {
  if (!acessaModulo(usuario, 'ordens-servico')) return null
  const [cliente] = await exec
    .select(colunas)
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, usuario.contaId)))
    .limit(1)
  return cliente ?? null
}

/** CPF/CNPJ inteiro, comparado só pelos dígitos: trecho do documento não acha ninguém. */
export async function clientePorCpfDaOs(exec: Executor, usuario: UsuarioNav & { contaId: string }, documento: string) {
  if (!acessaModulo(usuario, 'ordens-servico')) return null
  const digitos = documento.replace(/\D/g, '')
  if (digitos.length !== 11 && digitos.length !== 14) return null
  const [cliente] = await exec.select(colunas).from(clientes)
    .where(and(
      sql`regexp_replace(${clientes.cpfCnpj}, '\D', '', 'g') = ${digitos}`,
      eq(clientes.contaId, usuario.contaId),
    ))
    .limit(1)
  return cliente ?? null
}
