// ─── Cadastro de cliente (CPF único por Conta) ────────────────────────────────
// Na persona do admin_rede (#517, ADR-0019), CPF repetido recebe uma frase neutra: a trava é
// da Conta dona inteira, e "já cadastrado" revelaria que o cliente existe em outro grupo dela.
// A recusa volta como { ok: false, erro } (#404): na produção o Next esconde a mensagem de erro
// lançado por Server Action, e a tela mostrava "React error #441".
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clientes } from '@/lib/db/schema'
import { clientesDoEscopo } from '@/lib/conta'

type Escopo = { contaId: string; grupoLiberado?: string | null }
export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

// Campos que a tela de cliente grava. A Server Action recebe o objeto cru do navegador: sem esta
// lista, um `contaId` mandado à mão no editar movia o cliente para outra Conta.
const CAMPOS_DO_FORMULARIO = [
  'nome', 'tipoPessoa', 'cpfCnpj', 'sexo', 'email', 'celular',
  'endereco', 'numero', 'complemento', 'bairro', 'cep', 'cidade', 'uf',
] as const
type DadosCliente = Pick<typeof clientes.$inferInsert, (typeof CAMPOS_DO_FORMULARIO)[number]>

const soDoFormulario = <T extends Partial<DadosCliente>>(dados: T): T =>
  Object.fromEntries(Object.entries(dados).filter(([campo]) => (CAMPOS_DO_FORMULARIO as readonly string[]).includes(campo))) as T

export const CPF_RECUSADO_NA_PERSONA = 'Não foi possível cadastrar este cliente. Fale com o administrador.'

// Só a trava de CPF por Conta vira "já cadastrado": o texto do erro do Drizzle traz a
// query inteira, então procurar "cpf_cnpj" nele pegava qualquer falha do insert.
function cpfRepetido(e: unknown): boolean {
  return (e as { cause?: { constraint?: string } })?.cause?.constraint === 'clientes_conta_cpf_cnpj_key'
}

function mensagemCpfRepetido(escopo: { grupoLiberado?: string | null }): string {
  return escopo.grupoLiberado ? CPF_RECUSADO_NA_PERSONA : 'CPF/CNPJ já cadastrado'
}

const recusaDoCpfRepetido = (e: unknown, escopo: Escopo): { ok: false; erro: string } => {
  if (cpfRepetido(e)) return { ok: false, erro: mensagemCpfRepetido(escopo) }
  throw e
}

export async function cadastrarCliente(
  exec: Pick<typeof db, 'insert'>,
  escopo: Escopo,
  dados: DadosCliente,
): Promise<Resultado<{ id: string }>> {
  try {
    const [novo] = await exec.insert(clientes).values({ ...soDoFormulario(dados), contaId: escopo.contaId }).returning({ id: clientes.id })
    return { ok: true, id: novo.id }
  } catch (e: unknown) {
    return recusaDoCpfRepetido(e, escopo)
  }
}

// Cliente de outra Conta e id inexistente recebem a mesma frase: não revela que ele existe.
export async function atualizarCliente(
  exec: Pick<typeof db, 'update'>,
  escopo: Escopo,
  id: string,
  dados: Partial<DadosCliente>,
): Promise<Resultado> {
  try {
    const atualizados = await exec.update(clientes).set({ ...soDoFormulario(dados), atualizadoEm: new Date() })
      .where(and(eq(clientes.id, id), clientesDoEscopo(escopo.contaId, escopo)))
      .returning({ id: clientes.id })
    return atualizados.length ? { ok: true } : { ok: false, erro: 'Cliente não encontrado' }
  } catch (e: unknown) {
    return recusaDoCpfRepetido(e, escopo)
  }
}
