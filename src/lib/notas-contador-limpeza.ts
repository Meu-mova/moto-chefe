import { VALIDADE_LINK_DIAS } from '@/lib/notas-contador'
import { apagarArquivosVencidos, type Armazem } from '@/lib/storage-limpeza'

export { bucketInexistente } from '@/lib/storage-limpeza'

// Zips do "Enviar ao contador" que foram por link (#402): uma pasta por grupo.
export const BUCKET_CONTADOR = 'notas-contador'

export type ArmazemZips = Armazem

/** O link vence em 7 dias, mas o zip (XML com CPF de cliente) ficaria no bucket para sempre. */
export function apagarZipsVencidos(a: ArmazemZips, agora: number = Date.now()): Promise<{ apagados: number; falhas: number }> {
  return apagarArquivosVencidos(a, { raiz: '', dias: VALIDADE_LINK_DIAS }, agora)
}
