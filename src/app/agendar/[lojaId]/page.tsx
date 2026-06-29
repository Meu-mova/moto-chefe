import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { AgendarForm } from './agendar-form'

export default async function AgendarPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params
  const [loja] = await db.select({ id: lojas.id, nome: lojas.nome })
    .from(lojas).where(eq(lojas.id, lojaId)).limit(1)

  if (!loja) notFound()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div>
            <h1 className="font-bold text-lg">Moto Chefe Sul de Minas</h1>
            <p className="text-slate-400 text-sm">{loja.nome}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-1">Agendar serviço</h2>
            <p className="text-slate-500 text-sm mb-6">
              Preencha seus dados e escolha o melhor horário. Entraremos em contato para confirmar.
            </p>
            <AgendarForm lojaId={loja.id} />
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-slate-400 py-4">
        MOVA — Sistema de Gestão Moto Chefe Sul de Minas
      </footer>
    </div>
  )
}
