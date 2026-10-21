import { soDigitosDoc, cpfValido, cnpjValido } from '@/lib/documento'
import { emailValido } from '@/lib/email'
import { parseNumeroBR } from '@/lib/numero-br'
import { camposFaltando, type CampoContrato, type StatusAdesao } from '@/lib/adesao-campos'
import { enderecoSedeVazio, erroEnderecoSede, limparEnderecoSede, montarEnderecoSede, type EnderecoSede } from '@/lib/endereco-sede'

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
  /** Só quando a tela mandou o endereço em campos; senão as colunas ficam como estão. */
  sede?: ColunasSede
}

type ColunasSede = {
  sedeCep: string | null; sedeLogradouro: string | null; sedeNumero: string | null; sedeComplemento: string | null
  sedeBairro: string | null; sedeCidade: string | null; sedeUf: string | null
}

export type EntradaContrato = Partial<Record<CampoContrato, string | null | undefined>> & {
  franqueadoMotochefe?: boolean
  /** Endereço da sede em campos (#292). Ausente ou vazio: vale o texto de `enderecoSede`. */
  sede?: Partial<EnderecoSede>
}

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

  const sede = entrada.sede ? limparEnderecoSede(entrada.sede) : null
  const usaCampos = !!sede && !enderecoSedeVazio(sede)
  const erroSede = usaCampos ? erroEnderecoSede(sede) : null
  if (erroSede) erros.enderecoSede = erroSede

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    dados: {
      razaoSocial: texto('razaoSocial'),
      cnpj,
      enderecoSede: usaCampos ? montarEnderecoSede(sede) : texto('enderecoSede'),
      email,
      responsavelCpf,
      valorMensal: valor === null || valor === 'invalido' ? null : valor,
      taxaImplantacao: taxa === null || taxa === 'invalido' ? null : taxa,
      franqueadoMotochefe: entrada.franqueadoMotochefe === true,
      ...(usaCampos ? { sede: colunasSede(sede) } : {}),
    },
  }
}

const ouNull = (v: string) => v || null

function colunasSede(e: EnderecoSede): ColunasSede {
  return {
    sedeCep: ouNull(e.cep), sedeLogradouro: ouNull(e.logradouro), sedeNumero: ouNull(e.numero),
    sedeComplemento: ouNull(e.complemento), sedeBairro: ouNull(e.bairro), sedeCidade: ouNull(e.cidade), sedeUf: ouNull(e.uf),
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
