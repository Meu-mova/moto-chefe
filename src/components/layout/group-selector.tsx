import { getGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { trocarGrupoAtivoAction } from './group-selector-actions'

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
    <div className="flex items-center gap-1 px-6 pt-2 border-b bg-white">
      {gruposList.map(g => (
        <form key={g.id} action={trocarGrupoAtivoAction}>
          <input type="hidden" name="grupoId" value={g.id} />
          <button
            type="submit"
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
              g.id === grupoAtivo.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {g.nome}
          </button>
        </form>
      ))}
    </div>
  )
}
