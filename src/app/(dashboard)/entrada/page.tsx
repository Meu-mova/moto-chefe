import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { modelos, lojas } from '@/lib/db/schema'
import { redirect } from 'next/navigation'
import { EntradaForm } from './components/entrada-form'

export default async function EntradaPage() {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) redirect('/dashboard')

  const [modelosOpts, lojasOpts] = await Promise.all([
    db
      .select({ id: modelos.id, modelo: modelos.modelo, marca: modelos.marca, precoCompraPadrao: modelos.precoCompraPadrao })
      .from(modelos)
      .orderBy(modelos.marca, modelos.modelo),
    db
      .select({ id: lojas.id, nome: lojas.nome })
      .from(lojas)
      .orderBy(lojas.nome),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Entrada de Motos</h1>
        <p className="text-slate-500 text-sm">Registrar motos recebidas da fábrica</p>
      </div>
      <EntradaForm modelos={modelosOpts} lojas={lojasOpts} />
    </div>
  )
}
