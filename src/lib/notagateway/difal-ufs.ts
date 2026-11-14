import { UFS, ufValida, type SiglaUf } from '@/lib/sefaz/uf'

/**
 * Números do DIFAL por UF de destino (#904, decisões 1 e 7 da #724): venda de moto
 * importada a consumidor final não contribuinte de outro estado.
 *
 * A tabela padrão do MOVA só traz número conferido em fonte oficial, com a fonte e a
 * data. UF sem fonte fica nula: o grupo preenche com o contador dele (correção do
 * grupo) e, sem número, a #905 trava a NF. Mudar a tabela é PR revisado pelo Luis.
 * Levantamento: esteira/caixa/nf-endereco-entrega-697-904-fontes-ufs.md.
 */

export type { SiglaUf }
export type BaseDifal = 'unica' | 'dupla'

export type PadraoUf = {
  aliquotaInterna: number | null
  fcp: number | null
  base: BaseDifal
  fonte: string | null
  conferidoEm: string | null
  /** O que a fonte não confirma e a tela precisa mostrar junto do número. */
  ressalva: string | null
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

const CONFERIDO_EM = '2026-11-14'
const GERAL = 'Alíquota geral; a de moto elétrica não foi conferida.'
const uf = (aliquotaInterna: number, fcp: number | null, fonte: string, ressalva: string | null = null): Omit<PadraoUf, 'base'> =>
  ({ aliquotaInterna, fcp, fonte, conferidoEm: CONFERIDO_EM, ressalva })

// FCP 0 = a lei da UF foi lida e o adicional não alcança moto; null = não conferido.
// MT, AL, RN e SE (conferência parcial) e MA (fonte oficial não abriu) ficam sem número.
const CONFIRMADAS: Partial<Record<SiglaUf, Omit<PadraoUf, 'base'>>> = {
  AC: uf(19, 0, 'LC 55/1997, art. 18, I: https://sefaz.ac.gov.br/2021/?p=12159'),
  AP: uf(18, 0, 'Lei 400/1997, art. 37, III, i: https://www.al.ap.gov.br/ver_texto_consolidado.php?iddocumento=10488'),
  AM: uf(20, null, 'LC 19/1997, art. 12, I, b: https://sistemas.sefaz.am.gov.br/get/Normas.do?metodo=viewDoc&uuidDoc=ac5497ab-4fbd-4bc8-a51b-32405f61dc30', GERAL),
  BA: uf(12, 0, 'Lei 7.014/1996, art. 16, III, c (moto 8711); art. 16-A: https://mbusca.sefaz.ba.gov.br/DITRI/leis/leis_estaduais/legest_1996_7014_icmscomnotas.pdf'),
  CE: uf(20, 0, 'Lei 18.665/2023, art. 65, I, g: https://belt.al.ce.gov.br/index.php/component/k2/item/download/8359_15b75377d39c8bc32dc0a3cabd2fb0f7',
    'Texto da lei como promulgado em 2023; alterações posteriores não conferidas.'),
  DF: uf(20, null, 'Lei 1.254/1996, art. 18, II, c (Lei 7.326/2023): https://www.sinj.df.gov.br/sinj/Norma/f308fe684e544a29af7a1570ee07ce3f/Lei_7326_20_10_2023.html', GERAL),
  ES: uf(17, null, 'Lei 7.000/2001, art. 20, I, a (8711.60 fora do inciso IV, a): https://www3.al.es.gov.br/Arquivo/Documents/legislacao/html/LO7000.html', GERAL),
  GO: uf(19, null, 'Lei 11.651/1991, art. 27, I (Lei 22.460/2023): https://appasp.economia.go.gov.br/Legislacao/arquivos/Leis/L_22460.htm', GERAL),
  MS: uf(17, 0, 'Lei 1.810/1997, art. 41, III, a; art. 41-A: https://aacpdappls.net.ms.gov.br/appls/legislacao/secoge/govato.nsf/1b758e65922af3e904256b220050342a/037448c46af3acaf04256d410048094b?OpenDocument=', GERAL),
  MG: uf(18, null, 'Lei 6.763/1975, art. 12, I, d: https://www.almg.gov.br/legislacao-mineira/texto/LEI/6763/1975/', GERAL),
  PA: uf(19, null, 'Lei 9.755/2022 (Lei 5.530/1989, art. 12, VII): https://bancodeleis.alepa.pa.gov.br/arquivos/lei9755_2022_29351.pdf', GERAL),
  PB: uf(20, 0, 'Lei 6.379/1996, art. 11, I: https://www.sefaz.pb.gov.br/legislacao/64-leis/icms/13798-lei-n-6-379-de-2-de-dezembro-de-1996-atualizada-em-06-09-2023',
    'Consolidação de 10/2023; alterações posteriores não conferidas.'),
  PE: uf(20.5, 0, 'Lei 15.730/2016, art. 15, VII; art. 18-A: https://www.sefaz.pe.gov.br/Legislacao/Tributaria/Documents/legislacao/Leis_Tributarias/2016/Lei15730_2016.htm',
    'Fora do FECEP por interpretação: a lista alcança moto com motor de pistão acima de 250 cm³.'),
  PI: uf(22.5, 0, 'Lei 8.558/2024 (Lei 4.257/1989, art. 23, I, c): https://sapl.al.pi.leg.br/media/sapl/public/normajuridica/2024/6418/sei_00009.028288_2024_82.pdf'),
  PR: uf(19.5, null, 'Lei 21.850/2023 (Lei 11.580/1996, art. 14, VIII): https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=315768&codItemAto=2001016', GERAL),
  RJ: uf(20, null, 'Lei 2.657/1996, art. 14, I: http://alerjln1.alerj.rj.gov.br/contlei.nsf/c8aa0900025feef6032564ec0060dfff/01cc04eee53b3b30032564fb005c2ddf?OpenDocument=', GERAL),
  RO: uf(19.5, 0, 'Lei 688/1996, art. 27, I, c; art. 27-A: https://legislacao.sefin.ro.gov.br/documentos/3176'),
  RR: uf(12, 0, 'Lei 59/1993, art. 32, I, b, item 18: https://sefaz.rr.gov.br/downloads/legislacao',
    'Alíquota de veículo automotor novo, por equivalência de termo; 20% se a SEFAZ-RR não enquadrar a moto elétrica.'),
  RS: uf(12, 0, 'Lei 8.820/1989, art. 12, II, d, item 37: https://ww3.al.rs.gov.br/filerepository/replegiscomp/Lei%20n%C2%BA%2008.820.pdf',
    'Início dos efeitos do item 37 (Lei 16.357/2025) não consta no texto compilado.'),
  SC: uf(12, null, 'Lei 10.297/1996, art. 19, III, f, e Anexo I, Seção IV, item 06: https://leis.alesc.sc.gov.br/ato-normativo/11810/compilado',
    'Alíquota de moto (8711); condição do RICMS/SC não conferida.'),
  SP: uf(18, null, 'RICMS/SP, art. 52, I (art. 55, VI dá 25% para moto acima de 250 cm³): https://legislacao.fazenda.sp.gov.br/Paginas/art052.aspx', GERAL),
  TO: uf(20, 0, 'Lei 1.287/2001, art. 27, II: https://www.al.to.leg.br/arquivos/lei_1287-2001_68306.PDF'),
}

const SEM_FONTE = { aliquotaInterna: null, fcp: null, fonte: null, conferidoEm: null, ressalva: null }

export const TABELA_DIFAL_PADRAO: Readonly<Record<SiglaUf, PadraoUf>> = Object.fromEntries(
  UFS.map(({ sigla }) => [sigla, { ...(CONFIRMADAS[sigla] ?? SEM_FONTE), base: BASE_PADRAO }]),
) as Record<SiglaUf, PadraoUf>

export function siglaUfValida(uf: string): SiglaUf | null {
  const s = uf.trim().toUpperCase()
  return ufValida(s) ? s : null
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
