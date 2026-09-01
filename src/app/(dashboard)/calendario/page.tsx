import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { listarEventosDoMes, listarUsuariosDoGrupo, listarCategoriasAtivas, hojeBRT } from '@/lib/queries/calendario'
import { CalendarioMes } from './components/calendario-mes'
import { listarContasDoCalendarioAction } from '../contas-pagar/actions'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/calendario')) redirect('/dashboard')
  const params = await searchParams
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : hojeBRT().slice(0, 7)

  // Contas a pagar só para quem tem o módulo: o calendário é de TODOS os papéis,
  // e valor de aluguel e imposto não é informação de balcão.
  const veContas = usuarioPodeAcessar(usuario, '/contas-pagar')

  const [grupo, ocorrencias, categorias, lojas, usuariosGrupo, contas] = await Promise.all([
    getGrupoAtivo(usuario),
    listarEventosDoMes(usuario, mes),
    listarCategoriasAtivas(usuario),
    listarLojasDoGrupoAtivo(usuario),
    listarUsuariosDoGrupo(usuario),
    veContas ? listarContasDoCalendarioAction(mes) : Promise.resolve([]),
  ])

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Calendário</h1>
        <p className="text-slate-500 text-sm">Pagamentos, aniversários, eventos e ausências · {grupo.nome}</p>
      </div>

      <CalendarioMes
        mes={mes}
        ocorrencias={ocorrencias}
        usuarioId={usuario.id}
        isAdmin={ADMIN_PAPEIS.includes(usuario.papel)}
        categorias={categorias}
        lojas={lojas}
        usuariosGrupo={usuariosGrupo}
        lojaIdUsuario={usuario.lojaId ?? null}
        contas={contas}
        hoje={hojeBRT()}
      />
    </div>
  )
}
