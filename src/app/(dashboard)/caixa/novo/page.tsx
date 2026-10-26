import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { categoriasCaixa } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { NovoLancamentoForm } from './components/novo-lancamento-form'

export default async function NovoLancamentoPage() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) redirect('/dashboard')

  const [lojasOpts, cats] = await Promise.all([
    listarLojasDoGrupoAtivo(usuario),
    db.select({ nome: categoriasCaixa.nome, tipo: categoriasCaixa.tipo })
      .from(categoriasCaixa)
      .where(eq(categoriasCaixa.ativo, true))
      .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome)),
  ])

  const categoriasEntrada = cats.filter(c => c.tipo === 'entrada' || c.tipo === 'ambos').map(c => c.nome)
  const categoriasSaida   = cats.filter(c => c.tipo === 'saida'   || c.tipo === 'ambos').map(c => c.nome)

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
