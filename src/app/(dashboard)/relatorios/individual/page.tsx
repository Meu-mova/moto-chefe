import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { mesBrt } from '@/lib/data-venda'
import { mesValido, parseMes } from '@/lib/fechamento'
import { dadosIndividual } from '@/lib/queries/individual'
import { IndividualView } from './components/individual-view'

export default async function IndividualPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/relatorios/individual')) redirect('/dashboard')

  const [grupo, lojaIds, params] = await Promise.all([
    getGrupoAtivo(usuario),
    listarLojaIdsDoGrupoAtivo(usuario),
    searchParams,
  ])

  const mesParam = mesValido(params.mes) ? params.mes : mesBrt()
  const { ano, mes } = parseMes(mesParam)
  const dados = await dadosIndividual({ grupoId: grupo.id, lojaIds, ano, mes })

  return <IndividualView dados={dados} grupo={grupo.nome} mes={mesParam} />
}
