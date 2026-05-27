// src/app/(dashboard)/estoque/page.tsx
import { Suspense } from 'react'
import { StatusCards } from './components/status-cards'
import { MotoTable } from './components/moto-table'
import { listarMotos } from '@/lib/queries/motos'

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; loja?: string; categoria?: string }>
}) {
  const params = await searchParams
  const motosList = await listarMotos({
    status: params.status,
    lojaId: params.loja,
    categoria: params.categoria,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estoque</h1>
        <p className="text-slate-500 text-sm">Todas as motos do grupo</p>
      </div>
      <Suspense fallback={<div>Carregando...</div>}>
        <StatusCards />
      </Suspense>
      <div className="bg-white rounded-lg border">
        <MotoTable motos={motosList} />
      </div>
    </div>
  )
}
