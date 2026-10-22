import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuarios, usuariosDados } from '@/lib/db/schema'

type Executor = Pick<typeof db, 'select'>

// Lista de /admin/dados-funcionarios. contaId nulo = admin_geral, que vê todas as Contas;
// o sócio vê a Conta inteira, não só o grupo ativo (#320, ADR-0018).
// Sem next/headers, para ser testado contra o banco.
export async function listarDadosFuncionarios(contaId: string | null, exec: Executor = db) {
  return exec
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      cpf: usuariosDados.cpf,
      pixTipo: usuariosDados.pixTipo,
      pixChave: usuariosDados.pixChave,
      dataNascimento: usuariosDados.dataNascimento,
    })
    .from(usuarios)
    .leftJoin(usuariosDados, eq(usuariosDados.usuarioId, usuarios.id))
    .where(contaId ? eq(usuarios.contaId, contaId) : undefined)
    .orderBy(asc(usuarios.nome))
}
