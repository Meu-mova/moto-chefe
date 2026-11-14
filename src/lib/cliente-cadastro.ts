// ─── Cadastro de cliente (CPF único por Conta) ────────────────────────────────
// Na persona do admin_rede (#517, ADR-0019), CPF repetido recebe uma frase neutra: a trava é
// da Conta dona inteira, e "já cadastrado" revelaria que o cliente existe em outro grupo dela.
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clientes } from '@/lib/db/schema'
import { clientesDoEscopo } from '@/lib/conta'

type Executor = Pick<typeof db, 'insert'>
type Escopo = { contaId: string; grupoLiberado?: string | null }

// Grava só os campos do formulário de cliente; o resto do que chega à Server Action fica de fora.
const CAMPOS_DO_FORMULARIO = [
  'nome', 'tipoPessoa', 'cpfCnpj', 'sexo', 'email', 'celular',
  'endereco', 'numero', 'complemento', 'bairro', 'cep', 'cidade', 'uf',
] as const

const soDoFormulario = <T extends object>(dados: T): T =>
  Object.fromEntries(Object.entries(dados).filter(([campo]) => (CAMPOS_DO_FORMULARIO as readonly string[]).includes(campo))) as T

export const CPF_RECUSADO_NA_PERSONA = 'Não foi possível cadastrar este cliente. Fale com o administrador.'

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
    const [novo] = await exec.insert(clientes).values({ ...soDoFormulario(dados), contaId: escopo.contaId }).returning({ id: clientes.id })
    return novo.id
  } catch (e: unknown) {
    if (cpfRepetido(e)) throw new Error(mensagemCpfRepetido(escopo))
    throw e
  }
}

export async function atualizarCliente(
  exec: Pick<typeof db, 'update'>,
  escopo: Escopo,
  id: string,
  dados: Partial<Omit<typeof clientes.$inferInsert, 'contaId'>>,
): Promise<void> {
  try {
    const atualizados = await exec.update(clientes).set({ ...soDoFormulario(dados), atualizadoEm: new Date() })
      .where(and(eq(clientes.id, id), clientesDoEscopo(escopo.contaId, escopo)))
      .returning({ id: clientes.id })
    if (!atualizados.length) throw new Error('Cliente não encontrado')
  } catch (e: unknown) {
    if (cpfRepetido(e)) throw new Error(mensagemCpfRepetido(escopo))
    throw e
  }
}
