import { z } from 'zod'
import { emailValido } from '@/lib/email-valido'
import { ROTULO_REGIME, type RegimeAdesao } from '@/lib/adesao-campos'
import type { adesoesMova } from '@/lib/db/schema'
import { erroEnderecoSede, faltamNoEnderecoSede, limparEnderecoSede, montarEnderecoSede, paraColunasSede, type EnderecoSede } from '@/lib/endereco-sede'

// Passos "Sua empresa" e "Impostos e notas" da adesão (#588). Roda no navegador e no
// servidor: o servidor reconfere tudo o que a tela já limpou.

/** IE, IM, série e número da nota: a NG e a SEFAZ querem só dígitos. */
// Próprio, não o soDigitosDoc: documento vai aceitar letra (CNPJ alfanumérico, #534) e
// IE, IM, série e número não, os checks da 0169 exigem só dígitos.
export const soDigitos = (v: string) => v.replace(/\D/g, '')

/**
 * Série e última nota de quem já emite: os dois obrigatórios, só dígitos. Série da NF-e vai
 * de 0 a 999 e o número tem até 9 dígitos (leiaute da SEFAZ). Vale na adesão e na correção
 * do admin, para o cliente não gravar o que o admin não consegue corrigir igual.
 */
export function erroNumeracao(serie: string, ultima: string): string | null {
  const s = soDigitos(serie)
  const u = soDigitos(ultima)
  if (!s || !u) return 'Informe a série e o número da última nota'
  if (s.length > 3) return 'Série tem no máximo 3 dígitos'
  if (u.length > 9) return 'Número da nota tem no máximo 9 dígitos'
  return null
}

export type DadosFiscais = {
  razaoSocial: string; nomeFantasia: string; telefone: string
  endereco: EnderecoSede; codigoIbge: string; situacao: string
  regime: RegimeAdesao | ''
  inscricaoEstadual: string; ieIsenta: boolean; inscricaoMunicipal: string
  emailNotas: string
  jaEmite: boolean; nfSerie: string; nfUltimoNumero: string
}

/**
 * Aplica um pedaço do endereço sobre o estado MAIS RECENTE (use dentro de setState(prev => ...)):
 * a resposta do CEP chega depois e não pode desfazer o que a pessoa digitou enquanto isso.
 * O código IBGE veio da Receita para o CEP e a cidade de lá: mudou CEP, cidade ou UF, some.
 */
export function comEndereco(f: DadosFiscais, patch: Partial<EnderecoSede>): DadosFiscais {
  const mudouMunicipio = (['cep', 'cidade', 'uf'] as const).some(k => k in patch && patch[k] !== f.endereco[k])
  return { ...f, endereco: { ...f.endereco, ...patch }, codigoIbge: mudouMunicipio ? '' : f.codigoIbge }
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
  if (d.jaEmite) return erroNumeracao(d.nfSerie, d.nfUltimoNumero)
  return null
}

const texto = z.string().default('')
const dadosFiscaisSchema = z.object({
  razaoSocial: texto, nomeFantasia: texto, telefone: texto,
  endereco: z.object({ cep: texto, logradouro: texto, numero: texto, complemento: texto, bairro: texto, cidade: texto, uf: texto }),
  codigoIbge: texto, situacao: texto,
  regime: z.union([z.enum(Object.keys(ROTULO_REGIME) as [RegimeAdesao, ...RegimeAdesao[]]), z.literal('')]).default(''),
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
