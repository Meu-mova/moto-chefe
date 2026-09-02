import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { mesBrt } from '@/lib/data-venda'
import { mesValido, parseMes } from '@/lib/fechamento'
import { dadosColetiva } from '@/lib/queries/coletiva'
import { ColetivaView } from './components/coletiva-view'

export default async function ColetivaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/relatorios/coletiva')) redirect('/dashboard')

  const [grupo, lojaIds, params] = await Promise.all([
    getGrupoAtivo(usuario),
    listarLojaIdsDoGrupoAtivo(usuario),
    searchParams,
  ])

  const mesParam = mesValido(params.mes) ? params.mes : mesBrt()
  const { ano, mes } = parseMes(mesParam)
  const dados = await dadosColetiva({ grupoId: grupo.id, lojaIds, ano, mes })

  return <ColetivaView dados={dados} grupo={grupo.nome} mes={mesParam} />
}
