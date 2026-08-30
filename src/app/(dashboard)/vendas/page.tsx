import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojaIdsDoGrupoAtivo, listarLojasDoGrupoAtivo, podeAprovarVendaBaixoValor, podeAprovarPagamentoSensivelNoGrupoAtivo, getGrupoAtivo } from '@/lib/grupo'
import { listarOrigensAtivasDoGrupo } from '@/lib/queries/origens-venda'
import { listarPedidosPorLoja, listarTodosPedidos, listarVendas } from '@/lib/queries/vendas'
import { listarAprovacoesPendentes } from '@/lib/queries/motos'
import { db } from '@/lib/db'
import { motos, modelos, lojas, usuarios } from '@/lib/db/schema'
import { eq, asc, inArray, and } from 'drizzle-orm'
import { PedidoCard } from './components/pedido-card'
import { CriarPedidoDialog } from './components/criar-pedido-dialog'
import { VendasFiltros } from './components/vendas-filtros'
import { VendasTable } from './components/vendas-table'
import { AprovacoesPendentesPanel } from './components/aprovacoes-pendentes-panel'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import { valorConciliadoManual } from '@/lib/conciliacao-status'
import { descontosDasVendas } from '@/lib/queries/descontos'
import { percentualDesconto, periodoAnteriorAoRegistro } from '@/lib/desconto'

const ADMINS = ['admin_geral', 'admin_socio']
const TIPOS_CARTAO_CONC = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

function dataDefault30Dias() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function calcConcStats(vendas: VendaComDetalhes[]) {
  return vendas.reduce(
    (acc, v) => {
      const pgtos = (v.pagamentos ?? []) as { tipo: string; valor: number }[]
      const totalCartao  = pgtos.filter(p => TIPOS_CARTAO_CONC.has(p.tipo)).reduce((a, p) => a + (Number(p.valor) || 0), 0)
      const totalPix     = pgtos.filter(p => p.tipo === 'pix').reduce((a, p) => a + (Number(p.valor) || 0), 0)
      const totalLancado = pgtos.reduce((a, p) => a + (Number(p.valor) || 0), 0)
      const totalNecessa = totalCartao + totalPix
      const valorVenda   = Number(v.valor) || 0

      if (totalLancado < 0.01) return acc

      // pagamentos lançados não cobrem o valor total da venda → parcial
      if (totalLancado < valorVenda - 0.05) {
        acc.parcial++
        acc.valorParcial += (valorVenda - totalLancado)
        return acc
      }

      if (totalNecessa < 0.01) {
        acc.conciliada++
        return acc
      }

      // Inclui o que foi conciliado na mão, senão o KPI contradiz o badge da linha.
      const conciliado = (Number(v.conciliadoValor) || 0)
        + (Number(v.pixConciliadoValor) || 0)
        + valorConciliadoManual(v.pagamentos)
      if (conciliado < 0.01) {
        acc.pendente++
        acc.valorPendente += totalNecessa
      } else if (conciliado >= totalNecessa - 0.05) {
        acc.conciliada++
      } else {
        acc.parcial++
        acc.valorParcial += (totalNecessa - conciliado)
      }
      return acc
    },
    { pendente: 0, parcial: 0, conciliada: 0, valorPendente: 0, valorParcial: 0 }
  )
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAPEIS_VENDE = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; modelo?: string; vendedor?: string; q?: string; nf?: string; de?: string; ate?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/vendas')) redirect('/dashboard')
  const isAdmin = ADMINS.includes(usuario.papel)
  const podeConciliacao = isAdmin || usuario.papel === 'aux_adm'

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []

  // Origem da venda, para efetivar pedido: catálogo do grupo ativo.
  const grupoAtivo = await getGrupoAtivo(usuario)
  const origens = await listarOrigensAtivasDoGrupo(grupoAtivo.id)
  const lojaIdsPermitidos = isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : [])
  const lojaParamBruto = params.loja !== undefined ? parseParam(params.loja) : []
  const lojaValues     = lojaParamBruto.length && lojaParamBruto.every(id => lojaIdsPermitidos.includes(id))
    ? lojaParamBruto
    : lojaIdsPermitidos
  const vendedorValues = parseParam(params.vendedor)

  const dataInicio = params.de  ?? dataDefault30Dias()
  const dataFim    = params.ate ?? undefined

  const [pedidos, vendasList, motosDisponiveis, lojasOpts, modelosOpts, vendedoresOpts, aprovacoesPendentes, podeAprovarValorMinimo] = await Promise.all([
    isAdmin ? listarTodosPedidos(lojaIdsGrupo) : listarPedidosPorLoja(usuario.lojaId!),
    listarVendas({
      lojaId:      lojaValues,
      modeloId:    parseParam(params.modelo),
      vendedorId:  vendedorValues,
      chassiBusca: params.q,
      notaFiscal:  params.nf,
      dataInicio,
      dataFim,
    }),
    db
      .select({
        id:       motos.id,
        chassi:   motos.chassi,
        cor:      motos.cor,
        marca:    modelos.marca,
        modelo:   modelos.modelo,
        lojaNome: lojas.nome,
        lojaId:   motos.lojaId,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .innerJoin(lojas,   eq(motos.lojaId,   lojas.id))
      .where(and(eq(motos.disponibilidade, 'disponivel'), inArray(motos.lojaId, lojaIdsGrupo.length ? lojaIdsGrupo : lojaValues.length ? lojaValues : [usuario.lojaId ?? '']))),
    listarLojasDoGrupoAtivo(usuario),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(asc(modelos.modelo)),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.papel, PAPEIS_VENDE as any[]))
      .orderBy(asc(usuarios.nome)),
    isAdmin ? listarAprovacoesPendentes(lojaIdsGrupo) : Promise.resolve([]),
    // Todas as linhas de aprovacoesPendentes pertencem ao mesmo grupo ativo (lojaIdsGrupo),
    // então uma checagem com qualquer loja do grupo já vale pra todas — ver podeAprovarVendaBaixoValor.
    isAdmin && lojaIdsGrupo.length > 0 ? podeAprovarVendaBaixoValor(usuario, lojaIdsGrupo[0]) : Promise.resolve(false),
  ])
  // Mesma lógica do podeAprovarValorMinimo acima: a lista já vem filtrada pelo
  // grupo ativo, então uma checagem no grupo ativo vale pra todas as linhas.
  const podeAprovarSensivel = await podeAprovarPagamentoSensivelNoGrupoAtivo(usuario)

  const pendentes   = pedidos.filter(p => p.status === 'pendente')
  const concStats   = podeConciliacao ? calcConcStats(vendasList) : null
  const semNfSaida  = vendasList.filter(v => !v.notaFiscalSaida).length

  // Desconto é dado do administrativo: a listagem é da loja inteira, então dar a
  // coluna ao vendedor mostraria o desconto dos colegas dele.
  const podeVerDescontos = podeConciliacao
  const descontos = podeVerDescontos
    ? await descontosDasVendas(vendasList.map(v => v.id))
    : undefined
  const resumoDesconto = descontos
    ? [...descontos.values()].reduce(
        (a, d) => ({ qtd: a.qtd + 1, margem: a.margem + d.margem, preco: a.preco + d.preco, estimados: a.estimados + (d.estimado ? 1 : 0) }),
        { qtd: 0, margem: 0, preco: 0, estimados: 0 },
      )
    : null
  // Denominador do % de desconto: o valor das vendas listadas, não a contagem
  // delas — desconto é dinheiro e só compara contra dinheiro.
  const faturamentoLista = vendasList.reduce((a, v) => a + (Number(v.valor) || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-slate-500 text-sm">Pedidos e histórico de vendas</p>
        </div>
        <CriarPedidoDialog motos={motosDisponiveis} papel={usuario.papel} />
      </div>

      <AprovacoesPendentesPanel
        aprovacoes={aprovacoesPendentes}
        podeAprovarValorMinimo={podeAprovarValorMinimo}
        podeAprovarSensivel={podeAprovarSensivel}
      />

      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">
            Pedidos Pendentes ({pendentes.length})
          </h2>
          {pendentes.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              papel={usuario.papel}
              usuarioId={usuario.id}
              lojaIdUsuario={usuario.lojaId ?? null}
              origens={origens}
            />
          ))}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-semibold text-sm text-slate-700">
          Vendas Realizadas ({vendasList.length})
        </h2>

        {(concStats || semNfSaida > 0 || (resumoDesconto && resumoDesconto.qtd > 0)) && (
          <div className={`grid gap-3 ${concStats ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 max-w-md'}`}>
            {/* NF Saída pendente — sempre visível quando há pendências */}
            {semNfSaida > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-orange-500 uppercase tracking-wide">Sem NF Saída</p>
                <p className="text-2xl font-bold text-orange-700 mt-0.5">{semNfSaida}</p>
                <p className="text-xs text-orange-500 mt-0.5">venda{semNfSaida !== 1 ? 's' : ''} sem nota fiscal</p>
              </div>
            )}

            {/* Desconto concedido no recorte filtrado. Filtrando por um vendedor,
                este card é o total dele no período. */}
            {resumoDesconto && resumoDesconto.qtd > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-rose-500 uppercase tracking-wide">Descontos</p>
                <p className="text-2xl font-bold text-rose-700 mt-0.5">
                  {fmt(resumoDesconto.margem)}{resumoDesconto.estimados > 0 ? '*' : ''}
                </p>
                <p className="text-xs text-rose-500 mt-0.5">
                  {resumoDesconto.qtd} de {vendasList.length} vendas
                  {faturamentoLista > 0 && ` · ${percentualDesconto(resumoDesconto.margem, faturamentoLista)}% do faturamento`}
                  {resumoDesconto.preco > 0 && ` · ${fmt(resumoDesconto.preco)} de preço`}
                </p>
              </div>
            )}

            {/* Conciliação — apenas para admin/aux_adm */}
            {concStats && (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Conc. Pendentes</p>
                  <p className="text-2xl font-bold text-red-700 mt-0.5">{concStats.pendente}</p>
                  {concStats.valorPendente > 0 && (
                    <p className="text-xs text-red-500 mt-0.5">{fmt(concStats.valorPendente)} em aberto</p>
                  )}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-amber-500 uppercase tracking-wide">Conc. Parciais</p>
                  <p className="text-2xl font-bold text-amber-700 mt-0.5">{concStats.parcial}</p>
                  {concStats.valorParcial > 0 && (
                    <p className="text-xs text-amber-500 mt-0.5">{fmt(concStats.valorParcial)} restante</p>
                  )}
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Conciliadas</p>
                  <p className="text-2xl font-bold text-green-700 mt-0.5">{concStats.conciliada}</p>
                  <p className="text-xs text-green-500 mt-0.5">sem pendências</p>
                </div>
              </>
            )}
          </div>
        )}

        <VendasFiltros
          lojas={isAdmin || usuario.papel === 'aux_adm' ? lojasOpts : []}
          modelos={modelosOpts}
          vendedores={vendedoresOpts}
          lojaIdDefault={!isAdmin ? (usuario.lojaId ?? null) : null}
          chassiInicial={params.q ?? ''}
          nfInicial={params.nf ?? ''}
          dataInicioInicial={dataInicio}
          dataFimInicial={params.ate ?? ''}
          podeConciliacao={podeConciliacao}
        />
        <div className="bg-white rounded-lg border overflow-x-auto">
          <VendasTable vendas={vendasList} papel={usuario.papel} lojaIdUsuario={usuario.lojaId} vendedores={vendedoresOpts} origens={origens} descontos={descontos} />
        </div>
        {resumoDesconto && resumoDesconto.estimados > 0 && (
          <p className="text-[11px] text-slate-400">
            * {resumoDesconto.estimados} desconto{resumoDesconto.estimados === 1 ? '' : 's'} reconstruído{resumoDesconto.estimados === 1 ? '' : 's'} com a
            tabela de preços atual — as aprovações anteriores a 21/08/2026 não guardavam o preço mínimo da época.
          </p>
        )}
        {podeVerDescontos && periodoAnteriorAoRegistro(dataInicio) && (
          <p className="text-[11px] text-slate-400">
            Desconto só é registrado a partir de 10/07/2026 — antes disso o pedido de aprovação não existia no sistema.
          </p>
        )}
      </section>
    </div>
  )
}
