// Validação dos dados que o próprio funcionário preenche em /completar-cadastro.
// Tudo puro: sem banco, sem fetch — é o que permite testar as bordas sem subir nada.

import { cpfValido } from './documento'

export type TipoChavePix = 'cpf' | 'celular' | 'email' | 'aleatoria'

export const TIPOS_CHAVE_PIX: { valor: TipoChavePix; rotulo: string }[] = [
  { valor: 'cpf',       rotulo: 'CPF' },
  { valor: 'celular',   rotulo: 'Celular' },
  { valor: 'email',     rotulo: 'E-mail' },
  { valor: 'aleatoria', rotulo: 'Chave aleatória' },
]

/** Abaixo disso é praticamente sempre erro de digitação no ano. */
export const IDADE_MINIMA = 14
const ANO_MINIMO = 1930

export function normalizarCpf(valor: string): string {
  return (valor ?? '').replace(/\D/g, '')
}

function normalizarCelular(valor: string): string {
  let digitos = (valor ?? '').replace(/\D/g, '')
  // Aceita com ou sem o código do país; guardamos sempre com.
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2)
  return digitos
}

export function normalizarChavePix(tipo: TipoChavePix, chave: string): string {
  const bruto = (chave ?? '').trim()
  if (tipo === 'cpf') return normalizarCpf(bruto)
  if (tipo === 'celular') return `+55${normalizarCelular(bruto)}`
  if (tipo === 'email') return bruto.toLowerCase()
  return bruto.replace(/-/g, '').toLowerCase()
}

export function chavePixValida(tipo: TipoChavePix, chave: string): boolean {
  const bruto = (chave ?? '').trim()
  if (!bruto) return false

  if (tipo === 'cpf') return cpfValido(bruto)

  if (tipo === 'celular') {
    const digitos = normalizarCelular(bruto)
    // DDD (2) + 9 + 8 dígitos. Fixo não é aceito como chave de celular.
    return digitos.length === 11 && digitos[2] === '9'
  }

  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(bruto)

  return /^[0-9a-f]{32}$/.test(bruto.replace(/-/g, '').toLowerCase())
}

export const ERRO_CHAVE_PIX = 'Chave PIX não confere com o tipo escolhido.'

/** Erro para mostrar, ou null se tipo e chave conferem. Mesma regra no "Meus dados" e no admin. */
export function validarPix(tipo: string, chave: string): string | null {
  const tipoConhecido = TIPOS_CHAVE_PIX.some(t => t.valor === tipo)
  return tipoConhecido && chavePixValida(tipo as TipoChavePix, chave) ? null : ERRO_CHAVE_PIX
}

/**
 * `iso` no formato "YYYY-MM-DD", como vem do <input type="date">.
 * Comparação feita em número (ano/mês/dia), nunca com `new Date(iso)`, que
 * ancora o instante na meia-noite UTC e vira 21h do dia anterior em Brasília.
 */
export function nascimentoValido(iso: string, hoje: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return false

  const [ano, mes, dia] = iso.split('-').map(Number)
  if (ano < ANO_MINIMO) return false
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false

  const hojeAno = hoje.getUTCFullYear()
  const hojeMes = hoje.getUTCMonth() + 1
  const hojeDia = hoje.getUTCDate()

  const noFuturo = ano > hojeAno
    || (ano === hojeAno && mes > hojeMes)
    || (ano === hojeAno && mes === hojeMes && dia > hojeDia)
  if (noFuturo) return false

  let idade = hojeAno - ano
  if (mes > hojeMes || (mes === hojeMes && dia > hojeDia)) idade--
  return idade >= IDADE_MINIMA
}

export const ERRO_FUNCIONARIO_NAO_ENCONTRADO = 'Funcionário não encontrado.'
export const ERRO_SEM_DADOS = 'Esse funcionário ainda não preencheu os dados.'
const PAPEIS_ACIMA_DO_SOCIO = ['admin_geral', 'admin_rede']

/**
 * Por que o PIX desse funcionário não pode ser corrigido por quem edita, ou null se pode.
 * A Conta já foi filtrada na consulta; aqui fica o resto da regra, para o lápis da tela e o
 * servidor decidirem igual (#576/#600).
 */
export function recusaCorrecaoPix(
  editor: { papel: string },
  alvo: { papel: string; temDados: boolean },
): string | null {
  // admin_rede fica acima do sócio (ADR-0019), e o admin_geral acima de todos: trocar o PIX
  // deles é trocar para onde vai o pagamento. Mesma frase do id inexistente.
  if (editor.papel !== 'admin_geral' && PAPEIS_ACIMA_DO_SOCIO.includes(alvo.papel)) return ERRO_FUNCIONARIO_NAO_ENCONTRADO
  // CPF e nascimento são obrigatórios na linha; sem eles o funcionário ainda
  // não passou pelo primeiro acesso, e é lá que ele preenche tudo.
  if (!alvo.temDados) return ERRO_SEM_DADOS
  return null
}
