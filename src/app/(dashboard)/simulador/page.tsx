import { db } from '@/lib/db'
import { precificacao } from '@/lib/db/schema'
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
    .from(precificacao)
    .where(eq(precificacao.ativo, true))
    .orderBy(asc(precificacao.nome))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador de Preços</h1>
        <p className="text-slate-500 text-sm">Referência de valores e condições de pagamento</p>
      </div>
      <SimuladorClient modelos={modelos.map(m => ({
        id: m.id,
        nome: m.nome,
        valorMinimo: m.valorMinimo,
        taxaPix: m.taxaPix,
        taxasCartao: (m.taxasCartao ?? {}) as Record<string, number>,
        taxasLink: (m.taxasLink ?? {}) as Record<string, number>,
        taxasFinanciamento: (m.taxasFinanciamento ?? {}) as Record<string, number>,
      }))} />
    </div>
  )
}
