import { ROTULO_REGIME, type RegimeAdesao } from '@/lib/adesao-campos'
import { erroNumeracao, soDigitos } from '@/lib/adesao-fiscal'

// Bloco "Dados para a Nota Gateway" em /admin/adesoes (#588): os dados da adesão na ordem
// do cadastro "Nova empresa" do painel da NG, prontos para copiar. Roda no navegador.

export type DadosAdesaoNg = {
  razaoSocial: string | null; nomeFantasia: string | null; cnpj: string | null; telefone: string | null
  sedeCep: string | null; sedeLogradouro: string | null; sedeNumero: string | null; sedeComplemento: string | null
  sedeBairro: string | null; sedeCidade: string | null; sedeUf: string | null; sedeCodigoIbge: string | null
  situacaoCadastral: string | null; regime: RegimeAdesao | null
  inscricaoEstadual: string | null; ieIsenta: boolean; inscricaoMunicipal: string | null; emailNotas: string | null
  nfSerieAnterior: string | null; nfUltimoNumero: string | null
}

/** `valor` null = o cliente não informou; `copiar` false = só leitura (marcar no painel). */
export type CampoNg = { rotulo: string; valor: string | null; copiar: boolean }

const so = (v: string | null) => (v?.trim() ? v.trim() : null)
const digitos = (v: string | null) => so(v?.replace(/\D/g, '') ?? null)

export function camposLocalizacao(a: DadosAdesaoNg): CampoNg[] {
  return [
    { rotulo: 'CEP', valor: digitos(a.sedeCep), copiar: true },
    { rotulo: 'Logradouro', valor: so(a.sedeLogradouro), copiar: true },
    { rotulo: 'Número', valor: so(a.sedeNumero), copiar: true },
    { rotulo: 'Complemento', valor: so(a.sedeComplemento), copiar: true },
    { rotulo: 'Bairro', valor: so(a.sedeBairro), copiar: true },
    { rotulo: 'Cidade / UF', valor: a.sedeCidade && a.sedeUf ? `${a.sedeCidade} / ${a.sedeUf}` : null, copiar: false },
    { rotulo: 'Código IBGE (informado na adesão)', valor: digitos(a.sedeCodigoIbge), copiar: true },
  ]
}

export function camposIdentificacao(a: DadosAdesaoNg): CampoNg[] {
  return [
    { rotulo: 'Razão social', valor: so(a.razaoSocial), copiar: true },
    { rotulo: 'Nome fantasia', valor: so(a.nomeFantasia), copiar: true },
    { rotulo: 'CNPJ', valor: digitos(a.cnpj), copiar: true },
    { rotulo: 'Inscrição municipal', valor: digitos(a.inscricaoMunicipal), copiar: true },
    { rotulo: 'Inscrição estadual', valor: a.ieIsenta ? 'ISENTO' : digitos(a.inscricaoEstadual), copiar: true },
    { rotulo: 'E-mail', valor: so(a.emailNotas), copiar: true },
    { rotulo: 'Telefone comercial', valor: digitos(a.telefone), copiar: true },
    { rotulo: 'Regime', valor: a.regime ? ROTULO_REGIME[a.regime] : null, copiar: false },
  ]
}

export type Numeracao = { ambiente: 'Produção' | 'Homologação'; serie: string; proxima: string; daAdesao: boolean }

/**
 * Padrão: produção série 1, homologação série 2, começando do 1. Se a loja já emitia,
 * produção continua da série e última nota informadas (próxima = última + 1).
 */
export function numeracaoSugerida(a: Pick<DadosAdesaoNg, 'nfSerieAnterior' | 'nfUltimoNumero'>): Numeracao[] {
  const serie = digitos(a.nfSerieAnterior)
  const ultima = digitos(a.nfUltimoNumero)
  const daAdesao = !!serie && !!ultima
  return [
    {
      ambiente: 'Produção',
      serie: daAdesao ? String(Number(serie)) : '1',
      proxima: daAdesao ? String(BigInt(ultima) + BigInt(1)) : '1',
      daAdesao,
    },
    { ambiente: 'Homologação', serie: '2', proxima: '1', daAdesao: false },
  ]
}

export type NumeracaoInformada = { serie: string | null; ultima: string | null }

/** Correção da série e da última nota pelo admin_geral (#588): mesma regra da adesão. "Loja não emite" limpa os dois. */
export function lerNumeracaoInformada(e: { naoEmite: boolean; serie: string; ultima: string }):
  { ok: true; valor: NumeracaoInformada } | { ok: false; erro: string } {
  if (e.naoEmite) return { ok: true, valor: { serie: null, ultima: null } }
  const erro = erroNumeracao(e.serie ?? '', e.ultima ?? '')
  if (erro) return { ok: false, erro }
  return { ok: true, valor: { serie: soDigitos(e.serie), ultima: soDigitos(e.ultima) } }
}

/** Campos que o cadastro na NG precisa e a adesão não trouxe. */
export function faltandoParaNg(a: DadosAdesaoNg): string[] {
  const obrigatorios = [...camposLocalizacao(a), ...camposIdentificacao(a)].filter(c =>
    !['Complemento', 'Nome fantasia', 'Inscrição municipal', 'Telefone comercial', 'Código IBGE (informado na adesão)'].includes(c.rotulo))
  return obrigatorios.filter(c => !c.valor).map(c => c.rotulo)
}
