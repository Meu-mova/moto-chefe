// Quem cadastra e edita modelos (#321, adendo ao ADR-0018). O catálogo da plataforma
// é do admin_geral; a Conta só acrescenta os próprios, pelo sócio.

type Quem = { papel: string; contaId: string | null }

export function podeEditarModelo(quem: Quem, modelo: { contaId: string | null }): boolean {
  if (quem.papel === 'admin_geral') return true
  return quem.papel === 'admin_socio' && modelo.contaId !== null && modelo.contaId === quem.contaId
}

export function podeCadastrarModelo(quem: Quem): boolean {
  return quem.papel === 'admin_geral' || (quem.papel === 'admin_socio' && !!quem.contaId)
}

export function contaDoModeloNovo(quem: Quem): string | null {
  if (!podeCadastrarModelo(quem)) throw new Error('Sem permissão para cadastrar modelo')
  return quem.papel === 'admin_geral' ? null : quem.contaId
}

// Modelo da plataforma o sócio não edita: ajusta só para a própria Conta (#476). O
// admin_geral edita o original, que vale para todas.
export function podeAjustarModelo(quem: Quem, modelo: { contaId: string | null }): boolean {
  return quem.papel === 'admin_socio' && !!quem.contaId && modelo.contaId === null
}

// Preço de compra padrão do formulário de modelo (#513), no formato do campo de moeda.
export function precoCompraDoForm(valor: string): string | null {
  const t = valor.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Preço de compra inválido')
  return n.toFixed(2)
}

// O preço padrão é do cliente (#288): só o modelo próprio da Conta o guarda. No da
// plataforma ele iria para todas as Contas; lá a Conta grava no ajuste dela.
export function precoNoModelo(contaIdDoModelo: string | null, preco: string | null): { precoCompraPadrao?: string | null } {
  return contaIdDoModelo === null ? {} : { precoCompraPadrao: preco }
}

// Há cadastro com a unidade junto ("1000 W"); a tela põe o W.
export function potenciaNaTela(potencia: string): string {
  const n = potencia.trim().replace(/\s*w$/i, '')
  return n ? `${n}W` : ''
}
