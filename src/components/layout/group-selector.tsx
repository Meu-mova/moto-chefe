import { getGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { GroupSwitcher } from './group-switcher'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

type Props = { usuario: { papel: string; lojaId: string | null } }

export async function GroupSelector({ usuario }: Props) {
  if (!ADMIN_PAPEIS.includes(usuario.papel)) return null

  const [gruposList, grupoAtivo] = await Promise.all([
    listarGruposAtivos(),
    getGrupoAtivo(usuario),
  ])

  if (gruposList.length <= 1) return null

  return (
    <GroupSwitcher
      grupos={gruposList.map(g => ({ id: g.id, nome: g.nome, cor: g.cor }))}
      ativoId={grupoAtivo.id}
    />
  )
}
