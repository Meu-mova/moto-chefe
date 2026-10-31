import type { ConfigNotaGateway } from '@/lib/notagateway/client'

export type DisponibilidadeNf = {
  disponivel: boolean
  ambiente: 'Homologacao' | 'Producao' | null
  /** Por que a emissão pelo MOVA não aparece, quando é um problema a corrigir (#578). */
  aviso: string | null
}

export const SEM_EMISSAO: DisponibilidadeNf = { disponivel: false, ambiente: null, aviso: null }

/**
 * Grupo sem configuração não usa o MOVA para emitir: some calado, como antes. Configuração
 * que não se lê (credencial que não decifra) é problema a corrigir: vira aviso. O texto
 * do erro não vai à tela, porque pode trazer trecho da credencial.
 */
export async function disponibilidadeDoGrupo(
  nomeGrupo: string,
  lerConfig: () => Promise<ConfigNotaGateway | null>,
  /** Só quem configura a nota fiscal tem o item no menu; os outros pedem a quem tem. */
  podeConfigurar: boolean,
): Promise<DisponibilidadeNf> {
  let cfg: ConfigNotaGateway | null
  try {
    cfg = await lerConfig()
  } catch {
    const passo = podeConfigurar ? 'Salve de novo em Configuração → Notas Fiscais.' : 'Peça a um administrador para salvar de novo em Configuração → Notas Fiscais.'
    return { ...SEM_EMISSAO, aviso: `Credencial da Nota Gateway de ${nomeGrupo} com problema. ${passo}` }
  }
  return cfg ? { disponivel: true, ambiente: cfg.ambiente, aviso: null } : SEM_EMISSAO
}
