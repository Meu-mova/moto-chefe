// src/app/(dashboard)/estoque/page.tsx
import { db } from '@/lib/db'
import { lojas, modelos, motos } from '@/lib/db/schema'
import { StatusCards } from './components/status-cards'
import { MotoTable } from './components/moto-table'
import { EstoqueFiltros } from './components/filtros'
import { listarMotos } from '@/lib/queries/motos'
import { getUsuarioLogado } from '@/lib/auth'

const ADMINS = ['admin_geral', 'admin_socio']

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; disponibilidade?: string; loja?: string; modelo?: string; cor?: string; ord?: string; dir?: string; q?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()

  const isAdmin = ADMINS.includes(usuario.papel)

  // Vendidas nunca aparecem no estoque — sempre excluídas
  const dispValues = parseParam(params.disponibilidade)

  const lojaValues = params.loja !== undefined
    ? parseParam(params.loja)
    : (!isAdmin && usuario.lojaId ? [usuario.lojaId] : [])

  const validOrds = ['modelo', 'cor', 'loja', 'status', 'disponibilidade'] as const
  type Ord = typeof validOrds[number]
  const ord = validOrds.includes(params.ord as Ord) ? (params.ord as Ord) : 'modelo'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'

  const [motosList, lojasOpts, modelosOpts, coresOpts] = await Promise.all([
    listarMotos({
      status:          parseParam(params.status),
      disponibilidade: dispValues.length ? dispValues : undefined,
      excluirVendidas: true,
      chassiBusca:     params.q,
      lojaId:          lojaValues,
      modeloId:        parseParam(params.modelo),
      cor:             parseParam(params.cor),
      ord,
      dir,
    }),
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
    db.selectDistinct({ cor: motos.cor }).from(motos).orderBy(motos.cor),
  ])

  const counts = {
    total:         motosList.length,
    caixa:         motosList.filter(m => m.status === 'caixa').length,
    montada:       motosList.filter(m => m.status === 'montada').length,
    disponivel:    motosList.filter(m => m.disponibilidade === 'disponivel').length,
    reservada:     motosList.filter(m => m.disponibilidade === 'reservada').length,
    em_garantia:   motosList.filter(m => m.status === 'em_garantia').length,
    aguardando_nf: motosList.filter(m => m.status === 'vendida').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estoque</h1>
        <p className="text-slate-500 text-sm">Todas as motos do grupo</p>
      </div>
      <StatusCards counts={counts} />
      <EstoqueFiltros
        lojas={lojasOpts}
        modelos={modelosOpts}
        cores={coresOpts.map(c => c.cor)}
        lojaIdDefault={!isAdmin ? (usuario.lojaId ?? null) : null}
        chassiInicial={params.q ?? ''}
      />
      <div className="bg-white rounded-lg border">
        <MotoTable
          motos={motosList}
          papel={usuario.papel}
          vendedorNome={usuario.nome}
          lojas={lojasOpts}
          lojaUsuarioId={usuario.lojaId ?? null}
          ord={ord}
          dir={dir}
          baseParams={(() => {
            const p = new URLSearchParams()
            if (params.q)               p.set('q', params.q)
            if (params.status)          p.set('status', params.status)
            if (params.disponibilidade) p.set('disponibilidade', params.disponibilidade)
            if (params.loja)            p.set('loja', params.loja)
            if (params.modelo)          p.set('modelo', params.modelo)
            if (params.cor)             p.set('cor', params.cor)
            return p.toString()
          })()}
        />
      </div>
    </div>
  )
}
