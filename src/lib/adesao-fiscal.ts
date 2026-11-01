import { z } from 'zod'
import { emailValido } from '@/lib/email-valido'
import type { RegimeAdesao } from '@/lib/adesao-campos'
import type { adesoesMova } from '@/lib/db/schema'
import { erroEnderecoSede, faltamNoEnderecoSede, limparEnderecoSede, montarEnderecoSede, paraColunasSede, type EnderecoSede } from '@/lib/endereco-sede'

// Passos "Sua empresa" e "Impostos e notas" da adesão (#588). Roda no navegador e no
// servidor: o servidor reconfere tudo o que a tela já limpou.

/** IE, IM, série e número da nota: a NG e a SEFAZ querem só dígitos. */
export const soDigitos = (v: string) => v.replace(/\D/g, '')

export type DadosFiscais = {
  razaoSocial: string; nomeFantasia: string; telefone: string
  endereco: EnderecoSede; codigoIbge: string; situacao: string
  regime: RegimeAdesao | ''
  inscricaoEstadual: string; ieIsenta: boolean; inscricaoMunicipal: string
  emailNotas: string
  jaEmite: boolean; nfSerie: string; nfUltimoNumero: string
}

/** Passo 3 (Sua empresa): primeiro campo que falta; null = pode seguir. */
export function faltaNaEmpresa(d: DadosFiscais): string | null {
  if (!d.razaoSocial.trim()) return 'Informe a razão social'
  const end = limparEnderecoSede(d.endereco)
  const formato = erroEnderecoSede(end)
  if (formato) return formato
  const falta = faltamNoEnderecoSede(end)[0]
  return falta ? `Informe o ${falta} da empresa` : null
}

/** Passo 4 (Impostos e notas). */
export function faltaNosImpostos(d: DadosFiscais): string | null {
  if (!d.regime) return 'Escolha o regime de impostos'
  if (!d.ieIsenta && !soDigitos(d.inscricaoEstadual)) return 'Informe a inscrição estadual ou marque que a loja é isenta'
  if (!emailValido(d.emailNotas.trim())) return 'Informe o e-mail que recebe as notas'
  if (d.jaEmite && (!soDigitos(d.nfSerie) || !soDigitos(d.nfUltimoNumero))) return 'Informe a série e o número da última nota'
  return null
}

const texto = z.string().default('')
const dadosFiscaisSchema = z.object({
  razaoSocial: texto, nomeFantasia: texto, telefone: texto,
  endereco: z.object({ cep: texto, logradouro: texto, numero: texto, complemento: texto, bairro: texto, cidade: texto, uf: texto }),
  codigoIbge: texto, situacao: texto,
  regime: z.enum(['simples', 'mei', 'normal', '']).default(''),
  inscricaoEstadual: texto, ieIsenta: z.boolean().default(false), inscricaoMunicipal: texto,
  emailNotas: texto,
  jaEmite: z.boolean().default(false), nfSerie: texto, nfUltimoNumero: texto,
})

export type ColunasFiscais = Pick<typeof adesoesMova.$inferInsert,
  'cnpj' | 'razaoSocial' | 'nomeFantasia' | 'telefone' | 'sedeCep' | 'sedeLogradouro' | 'sedeNumero' | 'sedeComplemento'
  | 'sedeBairro' | 'sedeCidade' | 'sedeUf' | 'enderecoSede' | 'sedeCodigoIbge' | 'situacaoCadastral' | 'regime'
  | 'inscricaoEstadual' | 'ieIsenta' | 'inscricaoMunicipal' | 'emailNotas' | 'nfSerieAnterior' | 'nfUltimoNumero'>

const ouNull = (v: string) => v.trim() || null

/**
 * Reconfere no servidor e devolve as colunas de adesoes_mova. O `cnpj` é sempre o do A1,
 * lido no servidor: nunca vem do formulário.
 */
export function colunasFiscais(entrada: unknown, cnpj: string): { ok: true; colunas: ColunasFiscais } | { ok: false; erro: string } {
  const lido = dadosFiscaisSchema.safeParse(entrada)
  if (!lido.success) return { ok: false, erro: 'Confira os dados da empresa e tente de novo.' }
  const d = lido.data as DadosFiscais
  const falta = faltaNaEmpresa(d) ?? faltaNosImpostos(d)
  if (falta) return { ok: false, erro: falta }
  const endereco = limparEnderecoSede(d.endereco)
  return {
    ok: true,
    colunas: {
      cnpj,
      razaoSocial: d.razaoSocial.trim(),
      nomeFantasia: ouNull(d.nomeFantasia),
      telefone: ouNull(soDigitos(d.telefone)),
      ...paraColunasSede(endereco),
      enderecoSede: montarEnderecoSede(endereco),
      sedeCodigoIbge: ouNull(soDigitos(d.codigoIbge)),
      situacaoCadastral: ouNull(d.situacao),
      regime: d.regime || null,
      inscricaoEstadual: d.ieIsenta ? null : soDigitos(d.inscricaoEstadual),
      ieIsenta: d.ieIsenta,
      inscricaoMunicipal: ouNull(soDigitos(d.inscricaoMunicipal)),
      emailNotas: d.emailNotas.trim(),
      nfSerieAnterior: d.jaEmite ? soDigitos(d.nfSerie) : null,
      nfUltimoNumero: d.jaEmite ? soDigitos(d.nfUltimoNumero) : null,
    },
  }
}
