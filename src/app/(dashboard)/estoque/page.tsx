import { redirect } from 'next/navigation'
// src/app/(dashboard)/estoque/page.tsx
import Link from 'next/link'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { StatusCards } from './components/status-cards'
import { MotoTable } from './components/moto-table'
import { EstoqueFiltros } from './components/filtros'
import { listarMotos } from '@/lib/queries/motos'
import { listarDemandasComSinalAbertas } from '@/lib/queries/demandas'
import { getUsuarioLogado, temPapel } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojasAtivasDaConta } from '@/lib/conta'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, podeTransferirEntreGrupos, podeAprovarPagamentoSensivelNoGrupoAtivo, getGrupoAtivo, contaDoGrupoAtivo } from '@/lib/grupo'
import { listarUsuariosDoGrupo } from '@/lib/usuarios-do-grupo'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { listarOrigensAtivasDoGrupo } from '@/lib/queries/origens-venda'
import { PrintButton } from '../relatorio-fabrica/print-button'
import { motoVendidaSemVendaPorChassi } from '@/lib/motos-vendidas-sem-venda'
import { filtrosDoShowroom, paramsDoShowroom, type ParamsShowroom } from '@/lib/showroom-filtros'

const ADMINS = ['admin_geral', 'admin_socio']

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
  searchParams: Promise<ParamsShowroom>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/estoque')) redirect('/dashboard')

  const isAdmin = ADMINS.includes(usuario.papel)

  const lojaIdsGrupo = await withTimeout(listarLojaIdsDoGrupoAtivo(usuario), 20000)
  const acessoMultiGrupo = isAdmin && await podeTransferirEntreGrupos(usuario)
  const podeAprovarSensivel = await podeAprovarPagamentoSensivelNoGrupoAtivo(usuario)

  const filtros = filtrosDoShowroom(params, usuario, lojaIdsGrupo)
  const { lojaId: lojaValues, ord, dir } = filtros

  const grupo = await withTimeout(getGrupoAtivo(usuario), 8000)
  const [motosList, lojasOpts, lojasTransferencia, modelosOpts, coresOpts, usuariosOpts, mecanicosOpts] = await withTimeout(Promise.all([
    listarMotos(filtros),
    listarLojasDoGrupoAtivo(usuario),
    // Lojas oferecidas como destino no botão "Transferir" — igual a /transferencias,
    // o usuário com a exceção multi-grupo vê lojas de todos os grupos aqui; o filtro
    // "Loja" acima (lojasOpts) continua escopado ao grupo ativo pra todo mundo.
    acessoMultiGrupo ? listarLojasAtivasDaConta(usuario) : listarLojasDoGrupoAtivo(usuario),
    contaDoGrupoAtivo(usuario).then(c => listarModelosDaConta(c)),
    db.selectDistinct({ cor: motos.cor }).from(motos).orderBy(motos.cor),
    listarUsuariosDoGrupo(grupo.id),
    listarUsuariosDoGrupo(grupo.id, { papeis: ['mecanico'] }),
  ]), 20000)

  // Demandas abertas com sinal — candidatas a vínculo ao vender/reservar (casadas por modelo no MotoTable)
  const demandasComSinal = await withTimeout(listarDemandasComSinalAbertas(lojaValues), 20000)

  // Origem da venda: o catálogo é do grupo, e o /estoque já é escopado por grupo.
  const origens = await withTimeout(listarOrigensAtivasDoGrupo(grupo.id), 8000)

  // Moto marcada como vendida sem venda não volta para a lista; a busca pelo chassi só avisa (#544).
  const vendidaSemVenda = params.q?.trim()
    ? await motoVendidaSemVendaPorChassi(await contaDoGrupoAtivo(usuario), lojaIdsGrupo, params.q)
    : null

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
      <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">Showroom</h1>
        <p className="text-muted-foreground text-sm">
          {!isAdmin && usuario.lojaId
            ? `Motos da loja ${lojasOpts.find(l => l.id === usuario.lojaId)?.nome ?? ''}`
            : 'Todas as motos do grupo'}
        </p>
      </div>
        {/* Imprime o que está filtrado: os mesmos parâmetros da URL (#512). */}
        <PrintButton href={`/estoque/imprimir?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])}`} rotulo="Imprimir" />
      </div>
      <StatusCards counts={counts} />
      <EstoqueFiltros
        lojas={lojasOpts}
        modelos={modelosOpts}
        cores={coresOpts.map(c => c.cor)}
        lojaIdDefault={!isAdmin ? (usuario.lojaId ?? null) : null}
        chassiInicial={params.q ?? ''}
      />
      {vendidaSemVenda && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p className="font-medium">Esta moto está marcada como vendida</p>
          <p>Ela não tem venda registrada. <Link href={`/estoque/${vendidaSemVenda}`} className="underline">Ver moto</Link></p>
        </div>
      )}
      <div className="bg-card rounded-lg border">
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
          origens={origens}
          ord={ord}
          dir={dir}
          baseParams={paramsDoShowroom(params)}
        />
      </div>
    </div>
  )
}
