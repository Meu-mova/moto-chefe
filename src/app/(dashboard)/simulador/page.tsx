import { db } from '@/lib/db'
import { simuladorPrecos } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { asc, eq } from 'drizzle-orm'
import { SimuladorClient } from './components/simulador-client'
import { redirect } from 'next/navigation'

const BLOQUEADOS = ['mecanico']

export default async function SimuladorPage() {
  const usuario = await getUsuarioLogado()
  if (BLOQUEADOS.includes(usuario.papel)) redirect('/dashboard')

  const modelos = await db
    .select()
    .from(simuladorPrecos)
    .where(eq(simuladorPrecos.ativo, true))
    .orderBy(asc(simuladorPrecos.nome))

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador de Preços</h1>
        <p className="text-slate-500 text-sm">
          Referência de valores e simulação de formas de pagamento
        </p>
      </div>

      <SimuladorClient
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          precoAvista: m.precoAvista,
          precoPix: m.precoPix,
          taxaCartaoFisico: m.taxaCartaoFisico,
          taxaLinkPagamento: m.taxaLinkPagamento,
        }))}
        isAdmin={isAdmin}
      />
    </div>
  )
}
