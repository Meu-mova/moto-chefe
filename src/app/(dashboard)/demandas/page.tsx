import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { demandas, lojas, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NovaDemandaForm } from './components/nova-demanda-form'
import { DemandasTable } from './components/demandas-table'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function DemandasPage() {
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const lojasOpts = await db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(eq(lojas.ativa, true))
    .orderBy(lojas.nome)

  const where = isAdmin || !usuario.lojaId
    ? undefined
    : eq(demandas.lojaId, usuario.lojaId)

  const lista = await db
    .select({
      id: demandas.id,
      modelo: demandas.modelo,
      cor: demandas.cor,
      lojaNome: lojas.nome,
      solicitanteNome: usuarios.nome,
      criadoEm: demandas.criadoEm,
    })
    .from(demandas)
    .innerJoin(lojas, eq(demandas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
    .where(where)
    .orderBy(demandas.criadoEm)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Demandas</h1>
        <p className="text-slate-500 text-sm">
          Pedidos de motos que não estão no estoque
        </p>
      </div>

      <NovaDemandaForm
        lojas={lojasOpts}
        lojaIdFixa={isAdmin ? null : (usuario.lojaId ?? null)}
      />

      <DemandasTable demandas={lista} isAdmin={isAdmin} />
    </div>
  )
}
