import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contas, contaMarcas, modelos, modeloBlingCodigos, modeloApelidos } from '@/lib/db/schema'
import { listarApelidosDaConta, listarModelosDaConta } from '@/lib/modelos-da-conta'
import { contaDoGrupoUsaBling } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

// O que /admin/modelos carrega. O sócio vê só os modelos das marcas da própria Conta
// e nada das outras Contas (#320); a lista de Contas é só do admin_geral, que edita.
// Sem next/headers, para ser testado contra o banco.
export async function carregarTelaModelos(
  quem: { adminGeral: true; contaId: null; grupoId: string } | { adminGeral: false; contaId: string; grupoId: string },
  exec: Executor = db,
) {
  // Conta sem Bling não vê Cód. Bling nem Apelidos: nem busca (#476).
  const usaBling = await contaDoGrupoUsaBling(quem.grupoId, exec)
  const [lista, codigos, apelidos, contasComMarcas] = await Promise.all([
    quem.adminGeral
      // O admin_geral vê o original; ajuste e ocultação são de cada Conta.
      ? exec.select().from(modelos).orderBy(modelos.marca).then(l => l.map(m => ({ ...m, oculto: false, ajustado: false })))
      // Com os ocultos: é aqui que o sócio volta a mostrá-los (#476).
      : listarModelosDaConta(quem.contaId, exec, { incluirOcultos: true }),
    !usaBling ? [] : exec.select({ modeloId: modeloBlingCodigos.modeloId, codigo: modeloBlingCodigos.codigo })
      .from(modeloBlingCodigos)
      .where(eq(modeloBlingCodigos.grupoId, quem.grupoId)),
    !usaBling ? [] : quem.adminGeral
      ? exec.select({ modeloId: modeloApelidos.modeloId, apelido: modeloApelidos.apelido })
        .from(modeloApelidos)
        .orderBy(modeloApelidos.apelido)
      : listarApelidosDaConta(quem.contaId, exec).then(l => l.map(a => ({ modeloId: a.modeloId, apelido: a.nome }))),
    quem.adminGeral ? listarContasComMarcas(exec) : null,
  ])
  return { modelos: lista, codigos, apelidos, contas: contasComMarcas, usaBling }
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
