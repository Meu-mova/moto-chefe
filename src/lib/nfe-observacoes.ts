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
