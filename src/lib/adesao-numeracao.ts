import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { adesoesMova } from '@/lib/db/schema'
import { lerNumeracaoInformada, type NumeracaoInformada } from '@/lib/adesao-nota-gateway'
import { registrarAcaoSensivel } from '@/lib/log-acoes'

type Executor = Pick<typeof db, 'transaction'>

/**
 * O admin_geral corrige a série e a última nota que o cliente informou na adesão (#588).
 * Grava e registra no log na mesma transação: sem log, não grava.
 */
export async function corrigirNumeracaoDaAdesao(
  p: { adesaoId: string; usuarioId: string; entrada: { naoEmite: boolean; serie: string; ultima: string } },
  exec: Executor = db,
): Promise<{ ok: true; valor: NumeracaoInformada } | { ok: false; erro: string }> {
  const lido = lerNumeracaoInformada(p.entrada)
  if (!lido.ok) return lido
  return exec.transaction(async tx => {
    const [a] = await tx.select({ loja: adesoesMova.loja, grupoId: adesoesMova.grupoId, serie: adesoesMova.nfSerieAnterior, ultima: adesoesMova.nfUltimoNumero })
      .from(adesoesMova).where(eq(adesoesMova.id, p.adesaoId)).for('update').limit(1)
    if (!a) return { ok: false as const, erro: 'Adesão não encontrada' }
    await tx.update(adesoesMova)
      .set({ nfSerieAnterior: lido.valor.serie, nfUltimoNumero: lido.valor.ultima, atualizadoPor: p.usuarioId, atualizadoEm: new Date() })
      .where(eq(adesoesMova.id, p.adesaoId))
    await registrarAcaoSensivel({
      tipo: 'numeracao_adesao_alterada', usuarioId: p.usuarioId, grupoId: a.grupoId,
      detalhe: { adesaoId: p.adesaoId, loja: a.loja, antes: { serie: a.serie, ultima: a.ultima }, depois: lido.valor },
    }, tx)
    return { ok: true as const, valor: lido.valor }
  })
}
