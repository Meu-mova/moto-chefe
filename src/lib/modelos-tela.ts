import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contas, contaMarcas, modelos, modeloBlingCodigos, modeloApelidos } from '@/lib/db/schema'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'

type Executor = Pick<typeof db, 'select'>

// O que /admin/modelos carrega. O sócio vê só os modelos das marcas da própria Conta
// e nada das outras Contas (#320); a lista de Contas é só do admin_geral, que edita.
// Sem next/headers, para ser testado contra o banco.
export async function carregarTelaModelos(
  quem: { adminGeral: true; contaId: null; grupoId: string } | { adminGeral: false; contaId: string; grupoId: string },
  exec: Executor = db,
) {
  const [lista, codigos, apelidos, contasComMarcas] = await Promise.all([
    quem.adminGeral
      ? exec.select().from(modelos).orderBy(modelos.marca)
      : listarModelosDaConta(quem.contaId, exec),
    exec.select({ modeloId: modeloBlingCodigos.modeloId, codigo: modeloBlingCodigos.codigo })
      .from(modeloBlingCodigos)
      .where(eq(modeloBlingCodigos.grupoId, quem.grupoId)),
    // Apelidos nao sao por grupo: e como a NOTA escreve o produto, e a mesma
    // LAIOUNS vende para os dois CNPJs.
    exec.select({ modeloId: modeloApelidos.modeloId, apelido: modeloApelidos.apelido })
      .from(modeloApelidos)
      .orderBy(modeloApelidos.apelido),
    quem.adminGeral ? listarContasComMarcas(exec) : null,
  ])
  return { modelos: lista, codigos, apelidos, contas: contasComMarcas }
}

async function listarContasComMarcas(exec: Executor) {
  const [listaContas, escolhas] = await Promise.all([
    exec.select({ id: contas.id, nome: contas.nome }).from(contas).orderBy(asc(contas.nome)),
    exec.select().from(contaMarcas),
  ])
  return listaContas.map(c => ({
    ...c, marcas: escolhas.filter(e => e.contaId === c.id).map(e => e.marca),
  }))
}
