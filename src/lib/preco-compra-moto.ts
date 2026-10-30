import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { lojasDaConta } from '@/lib/conta'
import { registrarAcaoSensivel } from '@/lib/log-acoes'

type Escritor = Pick<typeof db, 'select' | 'update' | 'insert' | 'delete' | 'transaction'>

type Usuario = Parameters<typeof podeAbrirRegistroDaLoja>[0] & { id: string }

/**
 * Correção do preço de compra de moto já cadastrada (#514). Só sócio e admin_geral, que
 * são quem vê o preço. Moto de outra Conta recebe a mesma frase de moto inexistente.
 * Moto vendida fica com o preço que entrou no custo da venda (decisão do Luis).
 */
export async function corrigirPrecoCompra(
  usuario: Usuario,
  motoId: string,
  precoDigitado: string,
  exec: Escritor = db,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!['admin_socio', 'admin_geral'].includes(usuario.papel)) return { ok: false, erro: 'Sem permissão' }

  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(motos.lojaId, lojasDaConta(usuario.contaId)) : null
  if (daConta === null) return { ok: false, erro: 'Moto não encontrada' }
  const [moto] = await exec
    .select({ id: motos.id, chassi: motos.chassi, lojaId: motos.lojaId, status: motos.status, precoCompra: motos.precoCompra })
    .from(motos).where(and(eq(motos.id, motoId), daConta)).limit(1)
  if (!moto || !(await podeAbrirRegistroDaLoja(usuario, moto.lojaId, exec))) return { ok: false, erro: 'Moto não encontrada' }
  if (moto.status === 'vendida') return { ok: false, erro: 'Moto vendida: o preço de compra não pode mais ser corrigido' }

  const n = Number(precoDigitado)
  if (!precoDigitado.trim() || !Number.isFinite(n) || n <= 0) return { ok: false, erro: 'Preço de compra inválido' }
  const para = n.toFixed(2)
  const de = moto.precoCompra === null ? null : Number(moto.precoCompra).toFixed(2)
  if (de === para) return { ok: true }

  await exec.transaction(async tx => {
    await tx.update(motos).set({ precoCompra: para }).where(eq(motos.id, moto.id))
    await registrarAcaoSensivel({
      tipo: 'preco_compra_alterado', usuarioId: usuario.id, lojaId: moto.lojaId,
      detalhe: { motoId: moto.id, chassi: moto.chassi, de, para },
    }, tx)
  })
  return { ok: true }
}
