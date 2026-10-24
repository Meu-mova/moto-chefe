import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { AgendarForm } from './agendar-form'

export default async function AgendarPage({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params
  const [loja] = await db.select({ id: lojas.id, nome: lojas.nome, grupoNome: grupos.nome })
    .from(lojas)
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(eq(lojas.id, lojaId)).limit(1)

  if (!loja) notFound()

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div>
            <h1 className="font-bold text-lg">MotoChefe {loja.grupoNome}</h1>
            <p className="text-primary-foreground text-sm">{loja.nome}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
            <h2 className="text-xl font-bold text-foreground mb-1">Agendar serviço</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Preencha seus dados e escolha o melhor horário. Entraremos em contato para confirmar.
            </p>
            <AgendarForm lojaId={loja.id} />
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4">
        MOVA — Sistema de Gestão MotoChefe {loja.grupoNome}
      </footer>
    </div>
  )
}
