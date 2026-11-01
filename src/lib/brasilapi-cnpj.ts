// Consulta do CNPJ na BrasilAPI para pré-preencher a adesão (#588). Só servidor, uma
// consulta por adesão. Falha ou demora devolve null: a pessoa preenche e segue.
import type { RegimeAdesao } from '@/lib/adesao-campos'

export type EmpresaReceita = {
  razaoSocial: string
  nomeFantasia: string
  situacao: string
  regime: RegimeAdesao | null
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  codigoIbge: string
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const digitos = (v: unknown) => texto(v).replace(/\D/g, '')

/**
 * Lê só os campos que a adesão usa. O `qsa` (sócios) é dado pessoal e fica de fora de
 * propósito: nunca entra no retorno.
 */
export function mapearEmpresaReceita(r: Record<string, unknown>): EmpresaReceita {
  const cep = digitos(r.cep)
  const tipo = texto(r.descricao_tipo_de_logradouro)
  const logradouro = texto(r.logradouro)
  return {
    razaoSocial: texto(r.razao_social),
    nomeFantasia: texto(r.nome_fantasia),
    situacao: texto(r.descricao_situacao_cadastral),
    // MEI também é optante do Simples: confere o MEI primeiro.
    regime: r.opcao_pelo_mei === true ? 'mei' : r.opcao_pelo_simples === true ? 'simples' : r.opcao_pelo_simples === false ? 'normal' : null,
    telefone: digitos(r.ddd_telefone_1),
    // CEP que vem como número perde o zero da frente.
    cep: cep.length === 7 ? `0${cep}` : cep,
    logradouro: tipo && logradouro && !logradouro.toUpperCase().startsWith(tipo.toUpperCase()) ? `${tipo} ${logradouro}` : logradouro,
    numero: texto(r.numero),
    complemento: texto(r.complemento),
    bairro: texto(r.bairro),
    cidade: texto(r.municipio),
    uf: texto(r.uf).toUpperCase(),
    codigoIbge: digitos(r.codigo_municipio_ibge),
  }
}

export async function consultarEmpresaReceita(cnpj: string, buscar: typeof fetch = fetch): Promise<EmpresaReceita | null> {
  if (!/^\d{14}$/.test(cnpj)) return null
  try {
    const res = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: AbortSignal.timeout(5000), cache: 'no-store', headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      console.warn('consultarEmpresaReceita: BrasilAPI respondeu', res.status)
      return null
    }
    const json: unknown = await res.json()
    return json && typeof json === 'object' ? mapearEmpresaReceita(json as Record<string, unknown>) : null
  } catch (e) {
    console.warn('consultarEmpresaReceita: falhou', e instanceof Error ? e.name : e)
    return null
  }
}
