import { ufValida } from '@/lib/sefaz/uf'

// Endereço da sede da adesão em campos (#292): o CEP preenche logradouro, bairro,
// cidade e UF, e o contrato recebe a linha montada daqui. Cidade e UF em campo
// próprio servem à loja e ao certificado sem adivinhar pelo texto.

export type EnderecoSede = {
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string
}

export const ENDERECO_SEDE_VAZIO: EnderecoSede = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }

const OBRIGATORIOS = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'] as const

export function limparEnderecoSede(e: Partial<EnderecoSede>): EnderecoSede {
  const t = (k: keyof EnderecoSede) => (e[k] ?? '').trim()
  const cep = t('cep').replace(/\D/g, '')
  return {
    cep: cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : t('cep'),
    logradouro: t('logradouro'), numero: t('numero'), complemento: t('complemento'),
    bairro: t('bairro'), cidade: t('cidade'), uf: t('uf').toUpperCase(),
  }
}

export const enderecoSedeVazio = (e: EnderecoSede) => Object.values(e).every(v => !v)

/** Erro de formato (CEP, UF); campo faltando não é erro: salvar parcial vale. */
export function erroEnderecoSede(e: EnderecoSede): string | null {
  if (e.cep && !/^\d{5}-\d{3}$/.test(e.cep)) return 'CEP inválido'
  if (e.uf && !ufValida(e.uf)) return 'UF inválida'
  return null
}

/** Linha do contrato; null enquanto faltar campo obrigatório. */
export function montarEnderecoSede(e: EnderecoSede): string | null {
  if (OBRIGATORIOS.some(k => !e[k])) return null
  return [`${e.logradouro}, ${e.numero}`, e.complemento, e.bairro, `CEP ${e.cep}`, `${e.cidade} – ${e.uf}`]
    .filter(Boolean).join(', ')
}
