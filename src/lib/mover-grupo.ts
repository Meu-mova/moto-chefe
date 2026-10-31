// ─── Mover grupo para outra Conta (#554, adendo de 2026-10-31 ao ADR-0018) ─────
// Só o admin_geral. A Conta de origem precisa ter só esse grupo; tudo o que é dela vai
// para a Conta de destino numa transação, e ela é desativada (não apagada: o log aponta
// para ela). Qualquer repetição na destino (CPF/CNPJ, apelido, chassi...) bloqueia tudo.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  cargos, clientes, contaMarcas, contas, grupos, gruposLiberados, modeloAjustes, modeloApelidos, modelos,
  notasEntrada, pecasCatalogo, pecasVinculoFornecedor, usuarios, veiculosHistorico,
} from '@/lib/db/schema'
import { registrarAcao, type Origem } from '@/lib/log-acoes'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Leitor = Pick<typeof db, 'select' | 'execute'>

export type ConflitosMover = {
  clientes: { cpfCnpj: string; nomeOrigem: string; nomeDestino: string }[]
  apelidos: string[]
  chassis: string[]
  vinculosPeca: string[]
  ajustesModelo: string[]
}

export type PreviaMover = {
  grupo: { id: string; nome: string }
  origem: { id: string; nome: string }
  destino: { id: string; nome: string }
  /** Motivo para nem tentar (mesma Conta, origem com outros grupos...). */
  recusa: string | null
  vaiJunto: {
    usuarios: number; clientes: number; modelos: number; apelidos: number; veiculos: number
    pecas: number; vinculosPeca: number; notasEntrada: number; cargos: number; marcasNovas: string[]
    /** Usuários da destino que tinham o grupo liberado (admin_rede): passam a vê-lo pela Conta. */
    liberacoesViramAcesso: number
  }
  conflitos: ConflitosMover
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const contar = async (exec: Leitor, q: ReturnType<typeof sql>) =>
  Number(((await exec.execute(q)) as unknown as { rows: { n: number }[] }).rows[0].n)

export function temConflito(c: ConflitosMover): boolean {
  return Object.values(c).some(l => l.length > 0)
}

/** O que a mudança faria, sem gravar nada. null = grupo ou Conta de destino inexistente. */
export async function previaMoverGrupo(exec: Leitor, grupoId: string, destinoId: string): Promise<PreviaMover | null> {
  if (!UUID.test(grupoId) || !UUID.test(destinoId)) return null
  const [g] = await exec.select({ id: grupos.id, nome: grupos.nome, contaId: grupos.contaId, contaNome: contas.nome })
    .from(grupos).innerJoin(contas, eq(contas.id, grupos.contaId)).where(eq(grupos.id, grupoId)).limit(1)
  const [d] = await exec.select({ id: contas.id, nome: contas.nome, desativadaEm: contas.desativadaEm })
    .from(contas).where(eq(contas.id, destinoId)).limit(1)
  if (!g || !d) return null
  const o = g.contaId
  const irmaos = await contar(exec, sql`select count(*)::int n from grupos where conta_id = ${o} and id <> ${g.id}`)
  const recusa = o === d.id ? 'O grupo já está nesta Conta'
    : d.desativadaEm ? 'A Conta de destino está desativada'
    : irmaos > 0 ? `A Conta ${g.contaNome} tem outros ${irmaos} grupo(s): só se move grupo de Conta com um grupo só`
    : null

  const rows = async <T>(q: ReturnType<typeof sql>) => ((await exec.execute(q)) as unknown as { rows: T[] }).rows
  const conflitos: ConflitosMover = {
    clientes: (await rows<{ cpf: string; a: string; b: string }>(sql`
      select o.cpf_cnpj cpf, o.nome a, d.nome b from clientes o join clientes d on d.cpf_cnpj = o.cpf_cnpj and d.conta_id = ${d.id}
      where o.conta_id = ${o} and o.cpf_cnpj is not null order by o.cpf_cnpj`)).map(r => ({ cpfCnpj: r.cpf, nomeOrigem: r.a, nomeDestino: r.b })),
    apelidos: (await rows<{ x: string }>(sql`
      select o.apelido x from modelo_apelidos o join modelo_apelidos d on d.apelido = o.apelido and d.conta_id = ${d.id}
      where o.conta_id = ${o} order by 1`)).map(r => r.x),
    chassis: (await rows<{ x: string }>(sql`
      select o.chassi x from veiculos_historico o join veiculos_historico d on d.chassi = o.chassi and d.conta_id = ${d.id}
      where o.conta_id = ${o} order by 1`)).map(r => r.x),
    vinculosPeca: (await rows<{ x: string }>(sql`
      select o.fornecedor_cnpj || ' / ' || o.codigo x from pecas_vinculo_fornecedor o join pecas_vinculo_fornecedor d
        on d.conta_id = ${d.id} and d.fornecedor_cnpj = o.fornecedor_cnpj and d.codigo = o.codigo and d.nome_xml = o.nome_xml
      where o.conta_id = ${o} order by 1`)).map(r => r.x),
    ajustesModelo: (await rows<{ x: string }>(sql`
      select m.marca || ' ' || m.modelo x from modelo_ajustes o join modelo_ajustes d on d.modelo_id = o.modelo_id and d.conta_id = ${d.id}
      join modelos m on m.id = o.modelo_id where o.conta_id = ${o} order by 1`)).map(r => r.x),
  }

  const n = (t: string) => contar(exec, sql`select count(*)::int n from ${sql.raw(t)} where conta_id = ${o}`)
  const marcasNovas = (await rows<{ x: string }>(sql`
    select marca x from conta_marcas where conta_id = ${o} and marca not in (select marca from conta_marcas where conta_id = ${d.id}) order by 1`)).map(r => r.x)
  const liberacoesViramAcesso = await contar(exec, sql`
    select count(*)::int n from grupos_liberados gl join usuarios u on u.id = gl.usuario_id
    where gl.grupo_id = ${g.id} and gl.revogado_em is null and u.conta_id = ${d.id}`)

  return {
    grupo: { id: g.id, nome: g.nome },
    origem: { id: o, nome: g.contaNome },
    destino: { id: d.id, nome: d.nome },
    recusa,
    vaiJunto: {
      usuarios: await n('usuarios'), clientes: await n('clientes'), modelos: await n('modelos'),
      apelidos: await n('modelo_apelidos'), veiculos: await n('veiculos_historico'), pecas: await n('pecas_catalogo'),
      vinculosPeca: await n('pecas_vinculo_fornecedor'), notasEntrada: await n('notas_entrada'), cargos: await n('cargos'),
      marcasNovas, liberacoesViramAcesso,
    },
    conflitos,
  }
}

export type ResultadoMover =
  | { ok: true; previa: PreviaMover }
  | { ok: false; erro: string; previa: PreviaMover | null }

/**
 * Move de verdade. Refaz a prévia dentro da transação, com as duas Contas travadas: o que
 * a tela mostrou pode ter mudado. Recusa ou conflito: devolve sem gravar nada.
 */
export async function moverGrupo(
  tx: Tx,
  gestor: { id: string; papel: string },
  grupoId: string,
  destinoId: string,
  origemRequisicao: Origem = { ip: null, userAgent: null },
): Promise<ResultadoMover> {
  if (gestor.papel !== 'admin_geral') return { ok: false, erro: 'Só o Admin Geral move grupo de Conta', previa: null }
  if (!UUID.test(grupoId) || !UUID.test(destinoId)) return { ok: false, erro: 'Grupo ou Conta não encontrado', previa: null }
  const [g] = await tx.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  if (!g) return { ok: false, erro: 'Grupo ou Conta não encontrado', previa: null }
  // Trava as duas Contas (em ordem de id, para duas mudanças cruzadas não se travarem).
  await tx.execute(sql`select id from contas where id in (${g.contaId}, ${destinoId}) order by id for update`)

  const previa = await previaMoverGrupo(tx, grupoId, destinoId)
  if (!previa) return { ok: false, erro: 'Grupo ou Conta não encontrado', previa: null }
  if (previa.recusa) return { ok: false, erro: previa.recusa, previa }
  if (temConflito(previa.conflitos)) return { ok: false, erro: 'Há dados repetidos na Conta de destino: nada foi gravado', previa }

  const o = previa.origem.id, d = previa.destino.id
  // Liberação de usuário da destino para este grupo vira grupo de acesso: o grupo passa a ser
  // da Conta dele, e a liberação (só de outra Conta) deixaria de valer.
  await tx.execute(sql`
    update usuarios u set grupos_acesso = array_append(coalesce(u.grupos_acesso, '{}'), ${grupoId}::uuid)
    where u.conta_id = ${d} and not (${grupoId}::uuid = any(coalesce(u.grupos_acesso, '{}')))
      and exists (select 1 from grupos_liberados gl where gl.usuario_id = u.id and gl.grupo_id = ${grupoId} and gl.revogado_em is null)`)
  await tx.update(gruposLiberados).set({ revogadoEm: sql`now()` as unknown as Date })
    .where(and(eq(gruposLiberados.grupoId, grupoId), isNull(gruposLiberados.revogadoEm),
      inArray(gruposLiberados.usuarioId, tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.contaId, d)))))

  await tx.insert(contaMarcas).values(previa.vaiJunto.marcasNovas.map(marca => ({ contaId: d, marca }))).onConflictDoNothing()
  for (const t of [usuarios, clientes, modelos, modeloApelidos, modeloAjustes, veiculosHistorico, notasEntrada, cargos]) {
    await tx.update(t).set({ contaId: d }).where(eq(t.contaId, o))
  }
  // Catálogo de peças e vínculo com o fornecedor numa instrução só: a chave composta
  // (conta_id, peca_id) entre os dois só é conferida no fim da instrução.
  await tx.execute(sql`
    with cat as (update ${pecasCatalogo} set conta_id = ${d} where conta_id = ${o} returning 1)
    update ${pecasVinculoFornecedor} set conta_id = ${d} where conta_id = ${o}`)
  await tx.update(grupos).set({ contaId: d }).where(eq(grupos.id, grupoId))
  await tx.update(contas).set({ desativadaEm: sql`now()` as unknown as Date }).where(eq(contas.id, o))

  await registrarAcao({
    tipo: 'grupo_movido_de_conta', usuarioId: gestor.id, contaId: d, grupoId, ...origemRequisicao,
    detalhe: { grupoNome: previa.grupo.nome, origemId: o, origemNome: previa.origem.nome, destinoNome: previa.destino.nome, vaiJunto: previa.vaiJunto },
  }, tx)
  return { ok: true, previa }
}
