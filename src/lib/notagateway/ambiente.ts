/**
 * Hoje os grupos usam a chave de uma mesma conta da Nota Gateway, que emite de
 * verdade para os nossos CNPJs. Fora do app publicado em produção (preview,
 * máquina de dev contra o staging), só homologação passa, mesmo que o banco
 * tenha uma configuração em Producao.
 */
export function ambienteLiberado(ambiente: 'Homologacao' | 'Producao', vercelEnv: string | undefined): boolean {
  return ambiente === 'Homologacao' || vercelEnv === 'production'
}
