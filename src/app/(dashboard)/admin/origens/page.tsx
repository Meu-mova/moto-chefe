import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { listarOrigensDoGrupo } from '@/lib/queries/origens-venda'
import { OrigensTable } from './components/origens-table'

// aux_adm entra junto: é quem opera a loja e cadastra a origem de uma ação local.
const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']

export default async function OrigensPage() {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) redirect('/estoque')

  const grupo = await getGrupoAtivo(usuario)
  const origens = await listarOrigensDoGrupo(grupo.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Origens da venda — {grupo.nome}</h1>
        <p className="text-slate-500 text-sm">
          Por onde o cliente chegou. O vendedor escolhe uma delas ao fechar a venda, e é o que
          alimenta o relatório de Marketing. Cada grupo tem o seu catálogo.
        </p>
      </div>
      <OrigensTable origens={origens} />
    </div>
  )
}
