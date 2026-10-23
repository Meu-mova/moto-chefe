/**
 * Qual parte do cadastro corrige a recusa da nota (#347). Códigos das tabelas
 * B.1.1 (Nota Gateway) e B.1.2 (SEFAZ) da documentação NF-e modelo 55 da Nota
 * Gateway. A da SEFAZ vem no início do motivo ("237 - Rejeição: ..."); a da
 * Nota Gateway vem como "Código: GW7324\r\nDescrição: ...", às vezes várias.
 */
export type GrupoCorrecao = 'comprador' | 'moto' | 'empresa'

const GRUPOS: Record<string, GrupoCorrecao[]> = {}
function mapear(grupos: GrupoCorrecao[], codigos: string) {
  for (const c of codigos.split(' ')) GRUPOS[c] = grupos
}
mapear(['comprador'], '208 210 225 237 690 724 726 728 _0004 _0005 _0006 _0008 GW6758')
mapear(['moto'], '446 471 777 778 891 892 CEST001 NCM001 E008 GW99223')
mapear(['empresa'], '209 213 244 245 257 481 518 519 678 GW3331 GW3332 GW3333 GW0901 GW0902 GW7324 CFOP001 E003 GW073 GW1324')
mapear(['comprador', 'empresa'], '523 732 733')

const EDITAVEIS: GrupoCorrecao[] = ['comprador', 'moto']
const ORDEM: GrupoCorrecao[] = ['comprador', 'moto', 'empresa']

export function codigosDaRecusa(motivo: string | null): string[] {
  if (!motivo) return []
  const daNg = [...motivo.matchAll(/C[óo]digo:\s*([A-Za-z_0-9]+)/g)].map(m => m[1])
  if (daNg.length) return daNg
  const sefaz = motivo.trim().match(/^(\d{3})(?!\d)/)
  return sefaz ? [sefaz[1]] : []
}

/** Sem código conhecido, abre tudo o que dá para editar. */
export function gruposDaRecusa(motivo: string | null): GrupoCorrecao[] {
  const grupos = new Set(codigosDaRecusa(motivo).flatMap(c => GRUPOS[c] ?? []))
  return grupos.size ? ORDEM.filter(g => grupos.has(g)) : EDITAVEIS
}
