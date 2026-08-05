// src/app/(dashboard)/estoque/page.tsx
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { modelos, motos, usuarios } from '@/lib/db/schema'
import { StatusCards } from './components/status-cards'
import { MotoTable } from './components/moto-table'
import { EstoqueFiltros } from './components/filtros'
import { listarMotos } from '@/lib/queries/motos'
import { listarDemandasComSinalAbertas } from '@/lib/queries/demandas'
import { getUsuarioLogado, temPapel } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, podeTransferirEntreGrupos, podeAprovarPagamentoSensivel, listarTodasLojasAtivas } from '@/lib/grupo'

const ADMINS = ['admin_geral', 'admin_socio']

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

// Falha rápido em vez de pendurar até o timeout de 300s da Vercel quando o banco
// está sem conexão livre. O throw cai no error boundary de (dashboard)/error.tsx,
// que mostra "Tentar novamente" — bem melhor que a página rodando sem fim.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms ao carregar o estoque`)), ms)),
  ])
}

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; disponibilidade?: string; loja?: string; modelo?: string; cor?: string; ord?: string; dir?: string; q?: string; transf?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()

  const isAdmin = ADMINS.includes(usuario.papel)

  // Vendidas nunca aparecem no estoque — sempre excluídas
  const dispValues = parseParam(params.disponibilidade)

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const acessoMultiGrupo = isAdmin && podeTransferirEntreGrupos(usuario)
  const podeAprovarSensivel = podeAprovarPagamentoSensivel(usuario)

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

  const [motosList, lojasOpts, lojasTransferencia, modelosOpts, coresOpts, usuariosOpts, mecanicosOpts] = await withTimeout(Promise.all([
    listarMotos({
      status:          parseParam(params.status),
      disponibilidade: dispValues.length ? dispValues : undefined,
      excluirVendidas: true,
      chassiBusca:     params.q,
      lojaId:          lojaValues,
      modeloId:        parseParam(params.modelo),
      cor:             parseParam(params.cor),
      apenasTransferencia: params.transf === '1',
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
  ]), 20000)

  // Demandas abertas com sinal — candidatas a vínculo ao vender/reservar (casadas por modelo no MotoTable)
  const demandasComSinal = await withTimeout(listarDemandasComSinalAbertas(lojaValues), 20000)

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
          demandasComSinal={demandasComSinal}
          papel={usuario.papel}
          isVendedor={temPapel(usuario, 'vendedor')}
          vendedorId={usuario.id}
          vendedorNome={usuario.nome}
          usuarios={usuariosOpts}
          lojas={lojasTransferencia}
          mecanicos={mecanicosOpts}
          lojaUsuarioId={usuario.lojaId ?? null}
          podeAprovarPagamentoSensivel={podeAprovarSensivel}
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
