/**
 * Hoje os grupos usam a chave de uma mesma conta da Nota Gateway, que emite de
 * verdade para os nossos CNPJs. Fora do app publicado em produção (preview,
 * máquina de dev contra o staging), só homologação passa, mesmo que o banco
 * tenha uma configuração em Producao.
 */
export function ambienteLiberado(ambiente: 'Homologacao' | 'Producao', vercelEnv: string | undefined): boolean {
  return ambiente === 'Homologacao' || vercelEnv === 'production'
}

const NOME_AMBIENTE = { Producao: 'produção', Homologacao: 'homologação' } as const

/**
 * Chave e empresa da Nota Gateway vêm do ambiente configurado no grupo: mexer numa
 * nota de outro ambiente iria à conta errada. Devolve a orientação, ou null se bate.
 */
export function divergenciaDeAmbiente(notaAmbiente: string, grupoAmbiente: 'Homologacao' | 'Producao', acao: string): string | null {
  if (notaAmbiente === grupoAmbiente) return null
  const nota = NOME_AMBIENTE[notaAmbiente as keyof typeof NOME_AMBIENTE] ?? notaAmbiente
  return `Esta nota é de ${nota} e o grupo está em ${NOME_AMBIENTE[grupoAmbiente]} — volte o ambiente em Admin → Notas fiscais para ${acao}`
}
