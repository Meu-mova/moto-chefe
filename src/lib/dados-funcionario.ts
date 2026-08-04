// Validação dos dados que o próprio funcionário preenche em /completar-cadastro.
// Tudo puro: sem banco, sem fetch — é o que permite testar as bordas sem subir nada.

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

export function cpfValido(valor: string): boolean {
  const cpf = normalizarCpf(valor)
  if (cpf.length !== 11) return false
  // 111.111.111-11 e afins passam na conta do dígito verificador mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digito = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
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
