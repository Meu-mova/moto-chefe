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

/** "Por quê?" da tela, em linguagem de loja. Código sem frase: a tela mostra o motivo como veio. */
const FRASES: Record<string, string> = {
  '208': 'O CNPJ do cliente está errado.',
  '237': 'O CPF do cliente está errado.',
  '210': 'A Inscrição Estadual do cliente está errada.',
  '728': 'Falta a Inscrição Estadual do cliente.',
  '690': 'O cliente não tem Inscrição Estadual, e a nota precisa dizer que ele é consumidor final.',
  '225': 'A cidade do cliente não foi reconhecida.',
  '_0006': 'A cidade do cliente não foi reconhecida.',
  '_0005': 'O estado (UF) do cliente está errado.',
  '_0004': 'O telefone do cliente está errado.',
  '_0008': 'O e-mail do cliente está errado.',
  '724': 'Falta o nome do cliente.',
  '726': 'Falta o endereço do cliente.',
  'GW6758': 'Falta o endereço do cliente.',
  '446': 'O CEST da moto não existe.',
  'CEST001': 'O CEST da moto precisa ter 7 números.',
  '471': 'O NCM da moto está errado.',
  '777': 'O NCM da moto está incompleto.',
  '778': 'O NCM da moto não existe.',
  'NCM001': 'Falta o NCM da moto.',
  'E008': 'O NCM da moto está errado.',
  'GW99223': 'O NCM da moto está errado.',
  '891': 'O código de barras da moto não combina com o NCM.',
  '892': 'O código de barras da moto não combina com o CEST.',
  '209': 'A Inscrição Estadual da sua empresa está errada na configuração.',
  '481': 'O regime de impostos da sua empresa na configuração não bate com o da SEFAZ.',
  '678': 'O CFOP não combina com a tributação configurada.',
  '518': 'O CFOP configurado é de entrada, e esta nota é de saída.',
  'GW7324': 'O CFOP do produto está num formato que a nota não aceita.',
  'CFOP001': 'Falta o CFOP na configuração fiscal.',
  'GW3331': 'A tributação de ICMS configurada não é aceita.',
  'GW0901': 'A tributação de ICMS configurada não é aceita.',
  'GW3332': 'A tributação de PIS configurada não é aceita.',
  'GW3333': 'A tributação de COFINS configurada não é aceita.',
  '523': 'O CFOP não combina com o estado do cliente.',
  '732': 'O CFOP não combina com o estado do cliente.',
  '733': 'O CFOP não combina com o estado do cliente.',
  '301': 'A Inscrição Estadual da sua empresa está com problema na SEFAZ (suspensa, baixada ou cancelada).',
  '302': 'A Inscrição Estadual do cliente está com problema na SEFAZ.',
  '303': 'A Inscrição Estadual do cliente está com problema na SEFAZ.',
  '539': 'Este número de nota já foi usado em outra nota.',
}

export function fraseDaRecusa(motivo: string | null): string | null {
  for (const c of codigosDaRecusa(motivo)) if (FRASES[c]) return FRASES[c]
  return null
}
