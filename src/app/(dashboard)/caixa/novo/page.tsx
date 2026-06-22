import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { redirect } from 'next/navigation'
import { NovoLancamentoForm } from './components/novo-lancamento-form'

export default async function NovoLancamentoPage() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) redirect('/dashboard')

  const lojasOpts = await db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome)

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold">Novo Lançamento</h1>
        <p className="text-slate-500 text-sm">Registrar entrada ou saída no caixa</p>
      </div>
      <NovoLancamentoForm lojas={lojasOpts} lojaUsuarioId={usuario.lojaId ?? null} />
    </div>
  )
}
