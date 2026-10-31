// ─── Cadastro de cliente (CPF único por Conta) ────────────────────────────────
// Na persona do admin_rede (#517, ADR-0019), CPF repetido recebe uma frase neutra: a trava é
// da Conta dona inteira, e "já cadastrado" revelaria que o cliente existe em outro grupo dela.
import { db } from '@/lib/db'
import { clientes } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'insert'>
type Escopo = { contaId: string; grupoLiberado?: string | null }

export const CPF_RECUSADO_NA_PERSONA = 'Não foi possível usar este CPF/CNPJ neste grupo'

// Só a trava de CPF por Conta vira "já cadastrado": o texto do erro do Drizzle traz a
// query inteira, então procurar "cpf_cnpj" nele pegava qualquer falha do insert.
export function cpfRepetido(e: unknown): boolean {
  return (e as { cause?: { constraint?: string } })?.cause?.constraint === 'clientes_conta_cpf_cnpj_key'
}

export function mensagemCpfRepetido(escopo: { grupoLiberado?: string | null }): string {
  return escopo.grupoLiberado ? CPF_RECUSADO_NA_PERSONA : 'CPF/CNPJ já cadastrado'
}

export async function cadastrarCliente(
  exec: Executor,
  escopo: Escopo,
  dados: Omit<typeof clientes.$inferInsert, 'contaId'>,
): Promise<string> {
  try {
    const [novo] = await exec.insert(clientes).values({ ...dados, contaId: escopo.contaId }).returning({ id: clientes.id })
    return novo.id
  } catch (e: unknown) {
    if (cpfRepetido(e)) throw new Error(mensagemCpfRepetido(escopo))
    throw e
  }
}
