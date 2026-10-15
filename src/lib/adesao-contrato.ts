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
  diaVencimento: number | null
}

export type EntradaContrato = Partial<Record<CampoContrato, string | null | undefined>>

// Até 28 para todo mês ter o dia: vencimento no 31 cairia em data inexistente.
const DIA_MAXIMO = 28

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

  const valorBruto = texto('valorMensal')
  const valor = valorBruto ? parseNumeroBR(valorBruto) : null
  if (valorBruto && (valor === null || valor <= 0)) erros.valorMensal = 'Informe um valor maior que zero'

  const diaBruto = texto('diaVencimento')
  const dia = diaBruto ? Number(diaBruto) : null
  if (diaBruto && (!Number.isInteger(dia) || dia! < 1 || dia! > DIA_MAXIMO)) {
    erros.diaVencimento = `Dia de 1 a ${DIA_MAXIMO}`
  }

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    dados: {
      razaoSocial: texto('razaoSocial'),
      cnpj,
      enderecoSede: texto('enderecoSede'),
      email,
      responsavelCpf,
      valorMensal: valor === null ? null : valor.toFixed(2),
      diaVencimento: dia,
    },
  }
}

/** Status depois de salvar os dados. A recusa sai por outro caminho e não passa por aqui. */
export function statusDaAdesao(dados: DadosContrato): Extract<StatusAdesao, 'pendente' | 'dados_completos'> {
  return camposFaltando(dados).length ? 'pendente' : 'dados_completos'
}

export function mensagemRecusa(loja: string, motivo: string): string {
  return [
    `Olá! Aqui é da equipe MOVA, sobre a adesão da ${loja}.`,
    '',
    `Neste momento não conseguimos seguir com a adesão. Motivo: ${motivo}`,
    '',
    'Se quiser conversar ou corrigir algo, é só responder esta mensagem.',
  ].join('\n')
}
