import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { categoriasCaixaDoGrupo } from '@/lib/categorias-do-grupo'
import { serveAoLancamento } from '@/lib/categoria-caixa-tipo'
import { redirect } from 'next/navigation'
import { NovoLancamentoForm } from './components/novo-lancamento-form'

export default async function NovoLancamentoPage() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const [lojasOpts, doGrupo] = await Promise.all([
    listarLojasDoGrupoAtivo(usuario),
    categoriasCaixaDoGrupo(db, grupo.id),
  ])
  const cats = doGrupo.filter(c => c.ativo)

  const categoriasEntrada = cats.filter(c => serveAoLancamento(c.tipo, 'entrada')).map(c => c.nome)
  const categoriasSaida   = cats.filter(c => serveAoLancamento(c.tipo, 'saida')).map(c => c.nome)

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Novo Lançamento</h1>
        <p className="text-muted-foreground text-sm">Registrar entrada ou saída no caixa</p>
      </div>
      <NovoLancamentoForm
        lojas={lojasOpts}
        lojaUsuarioId={usuario.lojaId ?? null}
        isAdmin={['admin_geral', 'admin_socio'].includes(usuario.papel)}
        categoriasEntrada={categoriasEntrada}
        categoriasSaida={categoriasSaida}
      />
    </div>
  )
}
