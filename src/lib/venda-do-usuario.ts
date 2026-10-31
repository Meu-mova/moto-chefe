import { and, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas, vendas } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { podeVerGrupo } from '@/lib/acesso-grupo'
import { lojasDoEscopo } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Venda mais recente que casa com o filtro (por id ou pela moto) e que o usuário pode
 * abrir, ou null. A Conta entra no where, antes do orderBy: venda de outra Conta não
 * conta como "a última da moto" nem responde diferente de venda inexistente (#404).
 * Regra de loja mais estreita (editar, cancelar) quem chama confere depois.
 */
export async function vendaDoUsuario(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  filtro: SQL,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(vendas.lojaId, lojasDoEscopo(usuario)) : null
  if (daConta === null) return null
  const [venda] = await exec.select().from(vendas)
    .where(and(filtro, daConta))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
  if (!venda || !(await podeAbrirRegistroDaLoja(usuario, venda.lojaId, exec))) return null
  return venda
}

/**
 * Como vendaDoUsuario, para as rotas de NF de saída: a Conta continua no where, mas o
 * grupo inativo não barra quem ainda o vê (sócio, aux_adm). Cancelar ou corrigir a nota
 * de um grupo recém-desativado tem prazo fiscal (decisão do Luis, #404).
 */
export async function vendaDoUsuarioParaNf(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  filtro: SQL,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(vendas.lojaId, lojasDoEscopo(usuario)) : null
  if (daConta === null) return null
  const [linha] = await exec.select({ venda: vendas, grupoId: lojas.grupoId, contaId: grupos.contaId })
    .from(vendas)
    .innerJoin(lojas, eq(lojas.id, vendas.lojaId))
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(and(filtro, daConta))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
  if (!linha) return null
  const [propria] = usuario.lojaId
    ? await exec.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, usuario.lojaId)).limit(1)
    : []
  const pode = podeVerGrupo(
    { papel: usuario.papel, gruposAcesso: usuario.gruposAcesso ? [...usuario.gruposAcesso] : null, contaId: usuario.contaId },
    propria?.grupoId ?? null,
    { id: linha.grupoId, contaId: linha.contaId },
  )
  return pode ? linha.venda : null
}
