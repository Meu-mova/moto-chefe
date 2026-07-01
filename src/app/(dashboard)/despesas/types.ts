export type Loja = { id: string; nome: string }

export type DespesaRow = {
  id: string
  lojaId: string | null
  lojaNome: string | null
  categoria: string
  descricao: string | null
  valor: string
  data: string
  formaPagamento: string
  banco: string
  usuarioNome: string
}
