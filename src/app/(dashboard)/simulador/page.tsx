import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { asc, eq, and } from 'drizzle-orm'
import { SimuladorClient } from './components/simulador-client'
import { redirect } from 'next/navigation'

const BLOQUEADOS = ['mecanico']

export default async function SimuladorPage() {
  const usuario = await getUsuarioLogado()
  if (BLOQUEADOS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)

  const [taxasRow, modelos] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.grupoId, grupo.id)),
    db.select().from(precificacao).where(and(eq(precificacao.grupoId, grupo.id), eq(precificacao.ativo, true))).orderBy(asc(precificacao.nome)),
  ])

  const taxas = taxasRow[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Simulador de Preços</h1>
        <p className="text-slate-500 text-sm">Referência de valores e condições de pagamento</p>
      </div>
      <SimuladorClient
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          valorMinimo: m.valorMinimo,
          imagemUrl: m.imagemUrl ?? null,
        }))}
        taxas={{
          taxasCartao: (taxas?.taxasCartao ?? {}) as Record<string, number>,
          taxasDebito: (taxas?.taxasDebito ?? {}) as Record<string, number>,
          taxasLink: (taxas?.taxasLink ?? {}) as Record<string, number>,
          taxasFinanciamento: (taxas?.taxasFinanciamento ?? {}) as Record<string, number>,
        }}
      />
    </div>
  )
}
