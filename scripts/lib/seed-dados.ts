/**
 * Conjunto sintético do staging (D3 do plano: zero dado real fora da produção).
 * Puro e determinístico: mesma entrada, mesmos dados. O seed-staging.ts só
 * grava isto no banco. Nomes de modelo são os do catálogo real (o app liga
 * preço a modelo pelo nome); preço, pessoa, cliente, loja e CNPJ são inventados.
 */

import type { TipoOrigem } from '../../src/lib/origem-venda'

export const DOMINIO_TESTE = 'teste.meumova.com'

// ─── Documentos válidos e fictícios ──────────────────────────────────────────

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function gerarCpf(n: number): string {
  // Prefixo 9 evita cair em sequência de dígitos repetidos (111.111.111-11).
  const base = `9${String(n).padStart(8, '0')}`
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${d2}`
}

export function gerarCnpj(n: number): string {
  const base = `${String(n).padStart(8, '0')}0001`
  const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digitoVerificador(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${d2}`
}

// ─── Estrutura ───────────────────────────────────────────────────────────────

export type ChaveGrupo = 'sul' | 'bh' | 'vale'
export type Papel = 'admin_geral' | 'admin_socio' | 'aux_adm' | 'vendedor' | 'mecanico' | 'motorista'

export const GRUPOS: { chave: ChaveGrupo; nome: string; cnpj: string; cidadeSede: string }[] = [
  { chave: 'sul',  nome: 'Grupo Teste Sul',  cnpj: gerarCnpj(11111111), cidadeSede: 'Cidade Sul' },
  { chave: 'bh',   nome: 'Grupo Teste BH',   cnpj: gerarCnpj(22222222), cidadeSede: 'Cidade BH' },
  { chave: 'vale', nome: 'Grupo Teste Vale', cnpj: gerarCnpj(33333333), cidadeSede: 'Cidade Vale' },
]

// 8 lojas, como a produção: 3 + 3 + 2.
export const LOJAS: { chave: string; grupo: ChaveGrupo; nome: string; cidade: string }[] = [
  { chave: 'sul-1',  grupo: 'sul',  nome: 'Teste Sul Centro', cidade: 'Cidade Sul' },
  { chave: 'sul-2',  grupo: 'sul',  nome: 'Teste Sul Norte',  cidade: 'Cidade Sul Norte' },
  { chave: 'sul-3',  grupo: 'sul',  nome: 'Teste Sul Leste',  cidade: 'Cidade Sul Leste' },
  { chave: 'bh-1',   grupo: 'bh',   nome: 'Teste BH Centro',  cidade: 'Cidade BH' },
  { chave: 'bh-2',   grupo: 'bh',   nome: 'Teste BH Oeste',   cidade: 'Cidade BH Oeste' },
  { chave: 'bh-3',   grupo: 'bh',   nome: 'Teste BH Sul',     cidade: 'Cidade BH Sul' },
  { chave: 'vale-1', grupo: 'vale', nome: 'Teste Vale Centro', cidade: 'Cidade Vale' },
  { chave: 'vale-2', grupo: 'vale', nome: 'Teste Vale Norte',  cidade: 'Cidade Vale Norte' },
]

export const MODELOS: { modelo: string; potenciaW: string; valorMinimo: number }[] = [
  { modelo: 'JETMAX',  potenciaW: '1000 W', valorMinimo: 9990 },
  { modelo: 'X12',     potenciaW: '1000 W', valorMinimo: 11490 },
  { modelo: 'JET',     potenciaW: '1000 W', valorMinimo: 8990 },
  { modelo: 'BOB',     potenciaW: '1000 W', valorMinimo: 7490 },
  { modelo: 'GIGA',    potenciaW: '1000 W', valorMinimo: 13990 },
  { modelo: 'BIG TRI', potenciaW: '—',      valorMinimo: 12990 },
]

// Chave = número de parcelas, como o calcLiquidoRecebido lê.
export const TAXAS = {
  taxasCartao: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), +(0.03 + i * 0.01).toFixed(2)])),
  taxasDebito: { '1': 0.015 },
  taxasLink: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), +(0.04 + i * 0.01).toFixed(2)])),
  taxasFinanciamento: { '12': 0.1, '24': 0.18, '36': 0.25 },
}

// Tipado com TIPOS_ORIGEM: o banco tem um CHECK com a mesma lista.
export const ORIGENS: { nome: string; tipo: TipoOrigem }[] = [
  { nome: 'Instagram', tipo: 'Digital' },
  { nome: 'WhatsApp', tipo: 'Digital' },
  { nome: 'Indicação de cliente', tipo: 'Relacional' },
  { nome: 'Passou na porta', tipo: 'Presencial' },
]

export const CATEGORIAS_CAIXA = [
  { nome: 'Venda', tipo: 'entrada', contaComoDespesa: true },
  { nome: 'Despesa da loja', tipo: 'saida', contaComoDespesa: true },
  { nome: 'Depósito', tipo: 'saida', contaComoDespesa: false },
]

export const CATEGORIAS_DESPESA = [
  { nome: 'Aluguel', contaComoDespesa: true, motivoNaoOperacional: null, exigeBeneficiario: false },
  { nome: 'Energia', contaComoDespesa: true, motivoNaoOperacional: null, exigeBeneficiario: false },
  { nome: 'Retirada de sócio', contaComoDespesa: false, motivoNaoOperacional: 'retirada_socio', exigeBeneficiario: true },
]

// ─── Usuários ────────────────────────────────────────────────────────────────

export type UsuarioSeed = {
  email: string
  nome: string
  papel: Papel
  loja: string | null
  aprovaPagamentoSensivel: boolean
  cpf: string | null
}

const PAPEIS_POR_GRUPO: { papel: Papel; prefixo: string; rotulo: string }[] = [
  { papel: 'admin_socio', prefixo: 'socio', rotulo: 'Sócio' },
  { papel: 'aux_adm', prefixo: 'aux', rotulo: 'Aux Adm' },
  { papel: 'vendedor', prefixo: 'vendedor', rotulo: 'Vendedor' },
  { papel: 'mecanico', prefixo: 'mecanico', rotulo: 'Mecânico' },
  { papel: 'motorista', prefixo: 'motorista', rotulo: 'Motorista' },
]

export function montarUsuarios(): UsuarioSeed[] {
  // admin_geral não tem loja e não passa por /completar-cadastro, então sem CPF.
  const usuarios: UsuarioSeed[] = [{
    email: `geral@${DOMINIO_TESTE}`, nome: 'Admin Geral Teste', papel: 'admin_geral',
    loja: null, aprovaPagamentoSensivel: true, cpf: null,
  }]
  let n = 1
  for (const g of GRUPOS) {
    const lojaPrincipal = LOJAS.find(l => l.grupo === g.chave)!.chave
    for (const p of PAPEIS_POR_GRUPO) {
      usuarios.push({
        email: `${p.prefixo}.${g.chave}@${DOMINIO_TESTE}`,
        nome: `${p.rotulo} Teste ${g.nome.replace('Grupo Teste ', '')}`,
        papel: p.papel,
        loja: lojaPrincipal,
        // Só o sócio aprova transferência: o aux_adm de cada grupo é quem cai no
        // pedido de aprovação, que é o caminho do bug de reserva.
        aprovaPagamentoSensivel: p.papel === 'admin_socio',
        cpf: gerarCpf(n++),
      })
    }
  }
  return usuarios
}

// ─── Estoque, reservas, vendas, OS ───────────────────────────────────────────

export type MotoSeed = {
  chassi: string
  loja: string
  modelo: string
  cor: string
  status: 'caixa' | 'montada' | 'vendida'
  disponibilidade: 'disponivel' | 'reservada' | null
}

const CORES = ['PRETO', 'BRANCO', 'CINZA', 'VERMELHO', 'AZUL']

// Por loja: 1 na caixa, 2 disponíveis, 1 vendida → 32 motos.
const PERFIL_LOJA: Pick<MotoSeed, 'status' | 'disponibilidade'>[] = [
  { status: 'caixa', disponibilidade: null },
  { status: 'montada', disponibilidade: 'disponivel' },
  { status: 'montada', disponibilidade: 'disponivel' },
  { status: 'vendida', disponibilidade: null },
]

export type ReservaSeed = {
  chassi: string
  valorTotalVenda: number
  pagamentos: { tipo: string; valor: number; parcelas?: number }[]
  cliente: number
  /** Para o roteiro do fix: o que esta reserva exercita. */
  cenario: string
}

export function montarMotos(): MotoSeed[] {
  const motos: MotoSeed[] = []
  let n = 1
  LOJAS.forEach((loja, i) => {
    PERFIL_LOJA.forEach((perfil, j) => {
      motos.push({
        chassi: `TST2026${String(n).padStart(6, '0')}`,
        loja: loja.chave,
        modelo: MODELOS[(i + j) % MODELOS.length].modelo,
        cor: CORES[n % CORES.length],
        ...perfil,
      })
      n++
    })
  })
  // A 2ª disponível de 4 lojas vira reservada (ver montarReservas).
  for (const loja of ['sul-1', 'sul-2', 'bh-1', 'vale-1']) {
    motos.filter(m => m.loja === loja && m.disponibilidade === 'disponivel')[1].disponibilidade = 'reservada'
  }
  return motos
}

export function montarReservas(motos: MotoSeed[]): ReservaSeed[] {
  const reservada = (loja: string) => motos.find(m => m.loja === loja && m.disponibilidade === 'reservada')!
  const minimo = (m: MotoSeed) => MODELOS.find(x => x.modelo === m.modelo)!.valorMinimo
  const [r1, r2, r3, r4] = ['sul-1', 'sul-2', 'bh-1', 'vale-1'].map(reservada)
  return [
    { chassi: r1.chassi, valorTotalVenda: minimo(r1) - 500, pagamentos: [{ tipo: 'pix', valor: 3000 }], cliente: 101,
      cenario: 'total abaixo do mínimo, entrada em PIX → pede aprovação de valor mínimo' },
    { chassi: r2.chassi, valorTotalVenda: minimo(r2) + 500, pagamentos: [{ tipo: 'transferencia', valor: 3000 }], cliente: 102,
      cenario: 'entrada por transferência → aux_adm cai na aprovação de pagamento sensível' },
    { chassi: r3.chassi, valorTotalVenda: minimo(r3) + 1000, pagamentos: [{ tipo: 'pix', valor: 4000 }], cliente: 103,
      cenario: 'reserva comum, acima do mínimo → finaliza sem aprovação' },
    { chassi: r4.chassi, valorTotalVenda: minimo(r4) - 300, pagamentos: [{ tipo: 'cartao_credito', valor: 4500, parcelas: 3 }], cliente: 104,
      cenario: 'abaixo do mínimo com cartão (taxa reduz o líquido)' },
  ]
}

export function nomeCliente(n: number): string {
  return `Cliente Teste ${n}`
}
