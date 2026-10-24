import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { listarOrigensDoGrupo } from '@/lib/queries/origens-venda'
import { OrigensTable } from './components/origens-table'

export default async function OrigensPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/origens')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const origens = await listarOrigensDoGrupo(grupo.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Origens da venda — {grupo.nome}</h1>
        <p className="text-muted-foreground text-sm">
          Por onde o cliente chegou. O vendedor escolhe uma delas ao fechar a venda, e é o que
          alimenta o relatório de Marketing. Cada grupo tem o seu catálogo.
        </p>
      </div>
      <OrigensTable origens={origens} />
    </div>
  )
}
