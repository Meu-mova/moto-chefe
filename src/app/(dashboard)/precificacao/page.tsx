import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { asc, eq } from 'drizzle-orm'
import { PrecificacaoClient } from './components/precificacao-client'
import { redirect } from 'next/navigation'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function PrecificacaoPage() {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const [taxasRow, modelos] = await Promise.all([
    db.select().from(configuracaoTaxas).where(eq(configuracaoTaxas.id, 1)),
    db.select().from(precificacao).orderBy(asc(precificacao.nome)),
  ])

  const taxas = taxasRow[0] ?? {
    taxasCartao: {} as Record<string, number>,
    taxasDebito: {} as Record<string, number>,
    taxasLink: {} as Record<string, number>,
    taxasFinanciamento: {} as Record<string, number>,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precificação</h1>
        <p className="text-slate-500 text-sm">
          Configure as taxas globais e os valores mínimos por modelo
        </p>
      </div>
      <PrecificacaoClient
        taxas={{
          taxasCartao: (taxas.taxasCartao ?? {}) as Record<string, number>,
          taxasDebito: (taxas.taxasDebito ?? {}) as Record<string, number>,
          taxasLink: (taxas.taxasLink ?? {}) as Record<string, number>,
          taxasFinanciamento: (taxas.taxasFinanciamento ?? {}) as Record<string, number>,
        }}
        modelos={modelos.map(m => ({
          id: m.id,
          nome: m.nome,
          valorMinimo: m.valorMinimo,
          custo: m.custo,
          ativo: m.ativo,
        }))}
      />
    </div>
  )
}
