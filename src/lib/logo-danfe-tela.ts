// Regras da tela da logo do DANFE (#428): pura, sem banco, para testar sem Postgres.

export type DadosEmitente = {
  nome: string
  razaoSocial: string | null
  enderecoSede: string | null
  cidadeSede: string | null
  cnpj: string
}

const cnpjFormatado = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

/** Quadro do emitente da simulação: o DANFE real usa o cadastro da empresa na NG. */
export function emitenteDaSimulacao(g: DadosEmitente): { nome: string; linhas: string[] } {
  const linhas = [g.enderecoSede, g.cidadeSede].map((l) => l?.trim()).filter((l): l is string => !!l)
  return { nome: g.razaoSocial?.trim() || g.nome, linhas: [...linhas, `CNPJ ${cnpjFormatado(g.cnpj)}`] }
}
