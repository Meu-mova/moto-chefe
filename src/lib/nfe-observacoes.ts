/**
 * Texto das "informações complementares" da NF-e de venda de moto: o termo de
 * garantia e a ficha do veículo. Nasceu no rascunho do Bling e é o mesmo na
 * emissão própria pela Nota Gateway — um lugar só, para as duas notas não
 * divergirem enquanto convivem.
 */

export type DadosObservacaoMoto = {
  marca: string | null
  modeloNome: string | null
  chassi: string | null
  /** Número do motor da moto; sem ele, cai no tipo de motor do modelo. */
  motor: string | null
  tipoMotor: string | null
  categoria: string | null
  potencia: string | null
  cor: string | null
}

export const TEXTO_GARANTIA =
  'GARANTIA DE 90 DIAS CONFORME CDC + 9 MESES PARA MOTOR, BATERIA E MODULO ' +
  '(TOTALIZANDO 1 ANO) MANTENDO AS REVISÕES EM DIA. AS REVISÕES DEVERÃO SER ' +
  'REALIZADAS NO PERÍODO DE 3 MESES OU 2000KM RODADOS. OS DEMAIS COMPONENTES ' +
  'A GARANTIA É DE 90 DIAS CONFORME CDC. Garantia não cobre danos causados por ' +
  'mau uso da parte do cliente.'

export function observacoesVendaMoto(d: DadosObservacaoMoto): string {
  const ou = (v: string | null | undefined) => (v && v.trim()) || 'N/I'
  const dadosVeiculo = [
    `Marca: ${ou(d.marca)}`,
    `Modelo: ${ou(d.modeloNome)}`,
    `Chassi: ${ou(d.chassi)}`,
    `Motor: ${ou(d.motor || d.tipoMotor)}`,
    `Categoria: ${ou(d.categoria)}`,
    `Potência: ${ou(d.potencia)}`,
    `Cor: ${ou(d.cor)}`,
  ].join('\n')
  return `${TEXTO_GARANTIA}\n\n${dadosVeiculo}`
}

/**
 * O campo infCpl da NF-e aceita 5.000 caracteres, e a Nota Gateway acrescenta
 * nele o "Valor aprox. dos Tributos" (docs/fiscal/ng-informacoes-adicionais.md):
 * a folga é para o texto dela.
 */
export const LIMITE_OBSERVACAO_NF = 4500

/** O texto que sai na nota: o editado na prévia ou, sem ele, o padrão. */
export function observacaoDaNota(
  editada: string | null | undefined,
  padrao: string,
): { ok: true; texto: string } | { ok: false; error: string } {
  const texto = editada?.trim()
  if (!texto) return { ok: true, texto: padrao }
  if (texto.length > LIMITE_OBSERVACAO_NF) {
    return {
      ok: false,
      error: `A observação da nota aceita no máximo ${LIMITE_OBSERVACAO_NF.toLocaleString('pt-BR')} caracteres (tem ${texto.length.toLocaleString('pt-BR')}).`,
    }
  }
  return { ok: true, texto }
}

/** O texto que foi numa tentativa gravada, para o reenvio não perder a edição. */
export function observacaoDoPayload(payload: unknown): string | null {
  const texto = (payload as { informacoesAdicionais?: unknown } | null)?.informacoesAdicionais
  return typeof texto === 'string' ? texto : null
}

/**
 * O texto padrão de hoje não conta como edição: a tela só marca o que alguém mudou.
 * Se um dado da moto mudou depois da recusa, o padrão antigo aparece como editado
 * e o reenvio o leva; o operador vê o texto e usa "Voltar ao texto padrão" (aceito na #849).
 */
export function observacaoEditada(anterior: string | null, padrao: string): string | null {
  return anterior && anterior !== padrao ? anterior : null
}
