import { adesoesMova } from '@/lib/db/schema'
import { COLUNA_SEDE, type EnderecoSede } from '@/lib/endereco-sede'

// Select do endereço da sede em campos, pronto para `db.select({ sede: colunasSede })`.
// Separado de endereco-sede.ts porque puxa o schema, e aquele roda no navegador.
export const colunasSede = Object.fromEntries(
  Object.entries(COLUNA_SEDE).map(([campo, coluna]) => [campo, adesoesMova[coluna]]),
) as { [K in keyof EnderecoSede]: typeof adesoesMova.sedeCep }
