// src/app/(dashboard)/estoque/page.tsx
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { modelos, motos, usuarios } from '@/lib/db/schema'
import { StatusCards } from './components/status-cards'
import { MotoTable } from './components/moto-table'
import { EstoqueFiltros } from './components/filtros'
import { listarMotos } from '@/lib/queries/motos'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, podeTransferirEntreGrupos, listarTodasLojasAtivas } from '@/lib/grupo'

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

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const acessoMultiGrupo = isAdmin && podeTransferirEntreGrupos(usuario)

  // params.loja é validado contra as lojas do grupo ativo (nunca vaza loja de
  // outro grupo/CNPJ). Se a seleção for válida, vale tanto pra admin quanto
  // pra não-admin — vendedor/mecânico/aux_adm podem consultar o estoque de
  // outra loja da MESMA rede (filtro "Loja" já é exibido pra todo mundo).
  // Sem seleção válida: admin cai pro grupo inteiro, não-admin cai pra própria loja.
  const lojaParam = parseParam(params.loja)
  const lojaValues = (() => {
    const validos = lojaParam.filter(id => lojaIdsGrupo.includes(id))
    if (validos.length > 0) return validos
    return isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : [])
  })()

  const validOrds = ['modelo', 'cor', 'loja', 'status', 'disponibilidade'] as const
  type Ord = typeof validOrds[number]
  const ord = validOrds.includes(params.ord as Ord) ? (params.ord as Ord) : 'modelo'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'

  const [motosList, lojasOpts, lojasTransferencia, modelosOpts, coresOpts, usuariosOpts, mecanicosOpts] = await Promise.all([
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
    listarLojasDoGrupoAtivo(usuario),
    // Lojas oferecidas como destino no botão "Transferir" — igual a /transferencias,
    // o usuário com a exceção multi-grupo vê lojas de todos os grupos aqui; o filtro
    // "Loja" acima (lojasOpts) continua escopado ao grupo ativo pra todo mundo.
    acessoMultiGrupo ? listarTodasLojasAtivas() : listarLojasDoGrupoAtivo(usuario),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(modelos.modelo),
    db.selectDistinct({ cor: motos.cor }).from(motos).orderBy(motos.cor),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).orderBy(usuarios.nome),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'mecanico')).orderBy(usuarios.nome),
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
        <h1 className="text-2xl font-bold">Showroom</h1>
        <p className="text-slate-500 text-sm">
          {!isAdmin && usuario.lojaId
            ? `Motos da loja ${lojasOpts.find(l => l.id === usuario.lojaId)?.nome ?? ''}`
            : 'Todas as motos do grupo'}
        </p>
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
          vendedorId={usuario.id}
          vendedorNome={usuario.nome}
          usuarios={usuariosOpts}
          lojas={lojasTransferencia}
          mecanicos={mecanicosOpts}
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
