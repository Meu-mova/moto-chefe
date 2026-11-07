import { listarGruposVisiveis, type Grupo } from '@/lib/grupo'
import { podePagarMensalidade } from './regras'

type Usuario = Parameters<typeof listarGruposVisiveis>[0]

/**
 * Grupos cujas mensalidades a /mensalidade lista; o "Pagar" só aceita mensalidade destes (#773).
 * Quem paga vê os grupos da própria Conta (sem os liberados de outra, #517). admin_geral enxerga
 * todos os grupos: fica só o ativo, senão o total somaria a mensalidade de todos os clientes (a
 * visão geral é /admin/mensalidades). Quem não paga vê só o aviso do grupo ativo.
 */
export async function gruposDaMensalidade(usuario: Usuario, ativo: Grupo | null): Promise<Grupo[]> {
  if (podePagarMensalidade(usuario.papel) && usuario.papel !== 'admin_geral') {
    return listarGruposVisiveis(usuario).catch(() => [])
  }
  return ativo ? [ativo] : []
}
