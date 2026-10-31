import type { ConfigNotaGateway } from '@/lib/notagateway/client'

/**
 * Nota já existente se consulta na empresa NG do grupo dela: a chave da Conta pode ter
 * mudado o emissor depois (#552). Sem essa configuração não dá para saber se ela vale,
 * e emitir outra seria a segunda NF da venda.
 */
export async function configDaNotaExistente(
  grupoIdDaNota: string,
  emissor: { grupoId: string; cfg: ConfigNotaGateway },
  configDoGrupo: (grupoId: string) => Promise<ConfigNotaGateway | null>,
): Promise<ConfigNotaGateway> {
  if (grupoIdDaNota === emissor.grupoId) return emissor.cfg
  const cfg = await configDoGrupo(grupoIdDaNota)
  if (!cfg) throw new Error('Esta venda tem uma NF anterior por outro CNPJ da Conta, sem emissão configurada para consultá-la. Veja Admin → Notas fiscais')
  return cfg
}
