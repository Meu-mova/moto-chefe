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
  /**
   * 'manual' = lançada à mão em /despesas, editável aqui.
   * 'caixa'  = saída de dinheiro registrada em /caixa pelo administrativo da loja;
   *            aparece aqui só pra compor o resultado, e se edita no /caixa.
   */
  origem: 'manual' | 'caixa'
}
