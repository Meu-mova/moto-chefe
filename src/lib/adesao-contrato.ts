import { soDigitosDoc, cpfValido, cnpjValido } from '@/lib/documento'
import { emailValido } from '@/lib/email'
import { parseNumeroBR } from '@/lib/numero-br'
import { camposFaltando, type CampoContrato, type StatusAdesao } from '@/lib/adesao-campos'

// Dados do contrato de adesão que o /adesao não coleta (#165): o operador da
// MOVA completa na tela interna, lendo o cartão CNPJ enviado. Salvar parcial é
// permitido; o contrato (PR 2) só sai com todos preenchidos.

export type DadosContrato = {
  razaoSocial: string | null
  cnpj: string | null
  enderecoSede: string | null
  email: string | null
  responsavelCpf: string | null
  /** Decimal com ponto, como o `numeric` do banco recebe. */
  valorMensal: string | null
  taxaImplantacao: string | null
  franqueadoMotochefe: boolean
}

export type EntradaContrato = Partial<Record<CampoContrato, string | null | undefined>> & { franqueadoMotochefe?: boolean }

export function lerDadosContrato(
  entrada: EntradaContrato,
): { ok: true; dados: DadosContrato } | { ok: false; erros: Partial<Record<CampoContrato, string>> } {
  const texto = (k: CampoContrato) => entrada[k]?.trim() || null
  const erros: Partial<Record<CampoContrato, string>> = {}

  const cnpjBruto = texto('cnpj')
  const cnpj = cnpjBruto ? soDigitosDoc(cnpjBruto) : null
  if (cnpj && !cnpjValido(cnpj)) erros.cnpj = 'CNPJ inválido'

  const cpfBruto = texto('responsavelCpf')
  const responsavelCpf = cpfBruto ? soDigitosDoc(cpfBruto) : null
  if (responsavelCpf && !cpfValido(responsavelCpf)) erros.responsavelCpf = 'CPF inválido'

  const email = texto('email')
  if (email && !emailValido(email)) erros.email = 'E-mail inválido'

  const valor = lerValor(texto('valorMensal'))
  if (valor === 'invalido') erros.valorMensal = 'Informe um valor maior que zero'
  const taxa = lerValor(texto('taxaImplantacao'))
  if (taxa === 'invalido') erros.taxaImplantacao = 'Informe um valor maior que zero'

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    dados: {
      razaoSocial: texto('razaoSocial'),
      cnpj,
      enderecoSede: texto('enderecoSede'),
      email,
      responsavelCpf,
      valorMensal: valor === null || valor === 'invalido' ? null : valor,
      taxaImplantacao: taxa === null || taxa === 'invalido' ? null : taxa,
      franqueadoMotochefe: entrada.franqueadoMotochefe === true,
    },
  }
}

/** Valor em reais digitado no formato brasileiro → decimal com ponto. Vazio = null. */
function lerValor(bruto: string | null): string | null | 'invalido' {
  if (!bruto) return null
  const v = parseNumeroBR(bruto)
  return v === null || v <= 0 ? 'invalido' : v.toFixed(2)
}

/** Status depois de salvar os dados. A recusa sai por outro caminho e não passa por aqui. */
export function statusDaAdesao(dados: DadosContrato): Extract<StatusAdesao, 'pendente' | 'dados_completos'> {
  return camposFaltando(dados).length ? 'pendente' : 'dados_completos'
}
