import { db } from '@/lib/db'
import { precificacao } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { asc } from 'drizzle-orm'
import { PrecificacaoClient } from './components/precificacao-client'
import { redirect } from 'next/navigation'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function PrecificacaoPage() {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const modelos = await db
    .select()
    .from(precificacao)
    .orderBy(asc(precificacao.nome))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precificação</h1>
        <p className="text-slate-500 text-sm">
          Gerencie taxas e preços por modalidade e parcelamento
        </p>
      </div>
      <PrecificacaoClient modelos={modelos.map(m => ({
        id: m.id,
        nome: m.nome,
        valorMinimo: m.valorMinimo,
        taxaPix: m.taxaPix,
        taxasCartao: (m.taxasCartao ?? {}) as Record<string, number>,
        taxasLink: (m.taxasLink ?? {}) as Record<string, number>,
        taxasFinanciamento: (m.taxasFinanciamento ?? {}) as Record<string, number>,
        ativo: m.ativo,
      }))} />
    </div>
  )
}
