import { getUsuarioLogado } from '@/lib/auth'

export default async function DashboardPage() {
  const usuario = await getUsuarioLogado()
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-500 mt-2">Olá, {usuario.nome}</p>
      <p className="text-slate-400 text-sm mt-1">Dados em breve...</p>
    </div>
  )
}
