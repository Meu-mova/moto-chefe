import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { db } from '@/lib/db'
import { demandas, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, inArray, and, desc, asc } from 'drizzle-orm'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { NovaDemandaForm } from './components/nova-demanda-form'
import { DemandasTable } from './components/demandas-table'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function DemandasPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/demandas')) redirect('/dashboard')
  const isAdmin = ADMINS.includes(usuario.papel)

  const lojasOpts = await listarLojasDoGrupoAtivo(usuario)

  const lojaScope = isAdmin
    ? inArray(demandas.lojaId, await listarLojaIdsDoGrupoAtivo(usuario))
    : (usuario.lojaId ? eq(demandas.lojaId, usuario.lojaId) : undefined)
  // Só demandas abertas — atendidas saem da lista (histórico fica ligado à venda)
  const where = and(eq(demandas.status, 'aberta'), lojaScope)

  const [lista, modelosOpts] = await Promise.all([
    db
      .select({
        id: demandas.id,
        modelo: demandas.modelo,
        cor: demandas.cor,
        lojaNome: lojas.nome,
        solicitanteNome: usuarios.nome,
        criadoEm: demandas.criadoEm,
        sinalRecebido: demandas.sinalRecebido,
        valorSinal: demandas.valorSinal,
      })
      .from(demandas)
      .innerJoin(lojas, eq(demandas.lojaId, lojas.id))
      .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
      .where(where)
      .orderBy(desc(demandas.sinalRecebido), asc(demandas.criadoEm)),
    db
      .select({ id: modelos.id, marca: modelos.marca, modelo: modelos.modelo })
      .from(modelos)
      .orderBy(asc(modelos.marca), asc(modelos.modelo)),
  ])

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
        modelos={modelosOpts}
      />

      <DemandasTable demandas={lista} isAdmin={isAdmin} />
    </div>
  )
}
