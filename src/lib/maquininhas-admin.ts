/**
 * Cadastro de maquininhas do grupo (#471). O grupo vem sempre do servidor (grupo ativo do
 * sócio); toda leitura e gravação leva o grupo no where, então a de outra Conta e a inexistente
 * recebem a mesma frase.
 */
import { and, asc, eq, ne } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { maquininhas } from '@/lib/db/schema'
import { RecusaUsuario } from '@/lib/resultado-action'
import { codigoOperadora } from '@/lib/operadoras'

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

export type MaquininhaDoCadastro = { id: string; nome: string; operadora: string; ativo: boolean }
export type DadosMaquininha = { escolha: string; nome: string }

export async function listarMaquininhasDoCadastro(exec: Executor, grupoId: string): Promise<MaquininhaDoCadastro[]> {
  return exec.select({ id: maquininhas.id, nome: maquininhas.nome, operadora: maquininhas.operadora, ativo: maquininhas.ativo })
    .from(maquininhas).where(eq(maquininhas.grupoId, grupoId)).orderBy(asc(maquininhas.nome))
}

async function validar(exec: Executor, grupoId: string, dados: DadosMaquininha, idAtual?: string) {
  const nome = dados.nome.trim()
  if (!nome) throw new RecusaUsuario('Informe o nome da maquininha')
  const operadora = codigoOperadora(dados.escolha, nome)
  if (!operadora) throw new RecusaUsuario('Escolha a operadora')
  const repetida = await exec.select({ id: maquininhas.id }).from(maquininhas).where(and(
    eq(maquininhas.grupoId, grupoId), eq(maquininhas.operadora, operadora),
    ...(idAtual ? [ne(maquininhas.id, idAtual)] : []),
  )).limit(1)
  if (repetida.length > 0) throw new RecusaUsuario('Essa operadora já está cadastrada no grupo')
  return { nome, operadora }
}

async function exigirDoGrupo(exec: Executor, grupoId: string, id: string) {
  const [m] = await exec.select({ id: maquininhas.id }).from(maquininhas)
    .where(and(eq(maquininhas.id, id), eq(maquininhas.grupoId, grupoId))).limit(1)
  if (!m) throw new RecusaUsuario('Maquininha não encontrada')
}

export async function criarMaquininha(exec: Executor, grupoId: string, dados: DadosMaquininha): Promise<void> {
  const valores = await validar(exec, grupoId, dados)
  await exec.insert(maquininhas).values({ grupoId, ...valores })
}

export async function editarMaquininha(exec: Executor, grupoId: string, id: string, dados: DadosMaquininha): Promise<void> {
  await exigirDoGrupo(exec, grupoId, id)
  const valores = await validar(exec, grupoId, dados, id)
  await exec.update(maquininhas).set(valores).where(and(eq(maquininhas.id, id), eq(maquininhas.grupoId, grupoId)))
}

export async function definirMaquininhaAtiva(exec: Executor, grupoId: string, id: string, ativo: boolean): Promise<void> {
  await exigirDoGrupo(exec, grupoId, id)
  await exec.update(maquininhas).set({ ativo }).where(and(eq(maquininhas.id, id), eq(maquininhas.grupoId, grupoId)))
}
