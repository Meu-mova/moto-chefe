import { UFS } from '@/lib/sefaz/uf'

/**
 * Números do DIFAL por UF de destino (#904, decisões 1 e 7 da #724): venda de moto
 * importada a consumidor final não contribuinte de outro estado.
 *
 * A tabela padrão do MOVA só traz número conferido em fonte oficial, com a fonte e a
 * data. UF sem fonte fica nula: o grupo preenche com o contador dele (correção do
 * grupo) e, sem número, a #905 trava a NF. Mudar a tabela é PR revisado pelo Luis.
 * Levantamento: esteira/caixa/nf-endereco-entrega-697-904-fontes-ufs.md.
 */

export type SiglaUf = (typeof UFS)[number]['sigla']
export type BaseDifal = 'unica' | 'dupla'

export type PadraoUf = {
  aliquotaInterna: number | null
  fcp: number | null
  base: BaseDifal
  fonte: string | null
  conferidoEm: string | null
}

export type CorrecaoUf = { uf: string; aliquotaInterna: number; fcp: number; base: BaseDifal }

export type NumerosDifal = {
  uf: SiglaUf
  aliquotaInterna: number | null
  fcp: number | null
  base: BaseDifal
  origem: 'padrao' | 'corrigido'
  padrao: PadraoUf
}

/**
 * Base única para não contribuinte: LC 87/96, art. 13, X, e § 7º (redação da LC 190/2022),
 * https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm; Convênio ICMS 236/2021, cl. 2ª,
 * § 1º, https://www.confaz.fazenda.gov.br/legislacao/convenios/2021/CV236_21. A base dupla da
 * LC 190 é a do comprador contribuinte (art. 13, IX), fora deste caso.
 */
export const BASE_PADRAO: BaseDifal = 'unica'

const CONFIRMADAS: Partial<Record<SiglaUf, Omit<PadraoUf, 'base'>>> = {
  SP: {
    aliquotaInterna: 18,
    fcp: null,
    fonte: 'RICMS/SP, art. 52, I: https://legislacao.fazenda.sp.gov.br/Paginas/art052.aspx',
    conferidoEm: '2026-11-14',
  },
  MG: {
    aliquotaInterna: 18,
    fcp: null,
    fonte: 'Lei 6.763/1975, art. 12, I, d: https://www.almg.gov.br/legislacao-mineira/texto/LEI/6763/1975/',
    conferidoEm: '2026-11-14',
  },
}

const SEM_FONTE = { aliquotaInterna: null, fcp: null, fonte: null, conferidoEm: null }

export const TABELA_DIFAL_PADRAO: Readonly<Record<SiglaUf, PadraoUf>> = Object.fromEntries(
  UFS.map(({ sigla }) => [sigla, { ...(CONFIRMADAS[sigla] ?? SEM_FONTE), base: BASE_PADRAO }]),
) as Record<SiglaUf, PadraoUf>

export function siglaUfValida(uf: string): SiglaUf | null {
  const s = uf.trim().toUpperCase()
  return s in TABELA_DIFAL_PADRAO ? (s as SiglaUf) : null
}

/** Os números valendo para o grupo na UF: a correção do grupo, se houver; senão o padrão. */
export function numerosDifalDaUf(uf: string, correcoesDoGrupo: readonly CorrecaoUf[]): NumerosDifal | null {
  const sigla = siglaUfValida(uf)
  if (!sigla) return null
  const padrao = TABELA_DIFAL_PADRAO[sigla]
  const correcao = correcoesDoGrupo.find(c => siglaUfValida(c.uf) === sigla)
  return correcao
    ? { uf: sigla, aliquotaInterna: correcao.aliquotaInterna, fcp: correcao.fcp, base: correcao.base, origem: 'corrigido', padrao }
    : { uf: sigla, aliquotaInterna: padrao.aliquotaInterna, fcp: padrao.fcp, base: padrao.base, origem: 'padrao', padrao }
}

/** Percentual de 0 a 100 com até 2 casas, como as colunas numeric(5,2). */
export function percentualValido(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 100 && Math.abs(Math.round(v * 100) - v * 100) < 1e-9
}

/**
 * Campo "Alíquota ICMS para moto importada" do formulário: undefined = não mexe na coluna;
 * vazio = limpa (null); número com vírgula ou ponto de 0 a 100, até 2 casas.
 */
export function aliquotaImportadoDoForm(v: string | undefined): { ok: true; valor: string | null | undefined } | { ok: false; erro: string } {
  if (v === undefined) return { ok: true, valor: undefined }
  const t = v.trim().replace(',', '.')
  if (t === '') return { ok: true, valor: null }
  return /^\d+(\.\d+)?$/.test(t) && percentualValido(Number(t))
    ? { ok: true, valor: t }
    : { ok: false, erro: 'Alíquota da moto importada: use um número de 0 a 100, com até 2 casas' }
}
