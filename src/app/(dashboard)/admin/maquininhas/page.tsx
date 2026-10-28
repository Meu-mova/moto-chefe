import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { listarMaquininhasDoCadastro } from '@/lib/maquininhas-admin'
import { MaquininhasTable } from './components/maquininhas-table'

export default async function MaquininhasPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/maquininhas')) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const maquininhas = await listarMaquininhasDoCadastro(db, grupo.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maquininhas de cartão: {grupo.nome}</h1>
        <p className="text-muted-foreground text-sm">
          As maquininhas que as lojas do grupo usam. Só as ativas aparecem na venda, na OS e na
          venda de peças. Cada grupo tem as suas.
        </p>
      </div>
      <MaquininhasTable maquininhas={maquininhas} />
    </div>
  )
}
