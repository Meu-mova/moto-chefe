import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { fetchAllPix, parseObservation } from '@/lib/validapix'
import { db } from '@/lib/db'
import { vendas, pedidosVenda, lojas, motos, modelos, pixRecebimentos } from '@/lib/db/schema'
import { inArray, eq, sql } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CheckCircle2, AlertCircle, MinusCircle, TrendingUp } from 'lucide-react'
import { PixFiltros } from './components/pix-filtros'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm']

function formatValor(v: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

function formatData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function toInputDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function PixPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) redirect('/dashboard')

  const ocultarValores = usuario.papel === 'aux_adm'

  const params = await searchParams
  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  const fromDate = params.from ? new Date(params.from + 'T00:00:00.000Z') : inicioMes
  const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : hoje

  // ── Buscar PIX ──────────────────────────────────────────────────────────────
  let pixList = await fetchAllPix(fromDate, toDate)

  // Ordenar mais recentes primeiro
  pixList = pixList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // ── Extrair referências das observações ─────────────────────────────────────
  const nfNumeros = new Set<string>()
  const pvNumeros = new Set<number>()

  for (const pix of pixList) {
    const { tipo, numero } = parseObservation(pix.observation)
    if (tipo === 'NF' && numero) nfNumeros.add(String(numero))
    if (tipo === 'PV' && numero) pvNumeros.add(numero)
  }

  // ── Consultar banco em lote ──────────────────────────────────────────────────
  const [vendasDb, pedidosDb] = await Promise.all([
    nfNumeros.size > 0
      ? db
          .select({
            id: vendas.id,
            numero: vendas.numero,
            clienteNome: vendas.clienteNome,
            valor: vendas.valor,
            notaFiscalSaida: vendas.notaFiscalSaida,
            lojaNome: lojas.nome,
          })
          .from(vendas)
          .leftJoin(lojas, eq(vendas.lojaId, lojas.id))
          .where(inArray(vendas.notaFiscalSaida, [...nfNumeros]))
      : Promise.resolve([] as { id: string; numero: number; clienteNome: string; valor: string; notaFiscalSaida: string | null; lojaNome: string | null }[]),

    pvNumeros.size > 0
      ? db
          .select({
            id: pedidosVenda.id,
            numero: pedidosVenda.numero,
            status: pedidosVenda.status,
            modeloNome: modelos.modelo,
            marcaNome: modelos.marca,
            lojaNome: lojas.nome,
          })
          .from(pedidosVenda)
          .leftJoin(motos, eq(pedidosVenda.motoId, motos.id))
          .leftJoin(modelos, eq(motos.modeloId, modelos.id))
          .leftJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
          .where(inArray(pedidosVenda.numero, [...pvNumeros]))
      : Promise.resolve([] as { id: string; numero: number; status: string; modeloNome: string | null; marcaNome: string | null; lojaNome: string | null }[]),
  ])

  const vendaByNF = new Map(vendasDb.map(v => [v.notaFiscalSaida ?? '', v]))
  const pedidoByNum = new Map(pedidosDb.map(p => [p.numero, p]))

  // ── Calcular totais ──────────────────────────────────────────────────────────
  let totalRecebido = 0
  let totalVinculado = 0
  let countVinculado = 0
  let countSemRef = 0

  for (const pix of pixList) {
    const valor = Number(pix.price)
    totalRecebido += valor
    const { tipo, numero } = parseObservation(pix.observation)
    const matched =
      (tipo === 'NF' && numero && vendaByNF.has(String(numero))) ||
      (tipo === 'PV' && numero && pedidoByNum.has(numero))
    if (matched) { totalVinculado += valor; countVinculado++ }
    if (!pix.observation?.trim()) countSemRef++
  }

  // Persiste/atualiza os PIX no banco para cruzamento com vendas
  if (pixList.length > 0) {
    await db.insert(pixRecebimentos)
      .values(pixList.map(pix => {
        const { tipo, numero } = parseObservation(pix.observation)
        return {
          id:               pix.endToEndId,
          dataPagamento:    new Date(pix.date),
          valor:            pix.price,
          pagadorNome:      pix.name || null,
          pagadorDocumento: pix.document || null,
          observacao:       pix.observation || null,
          vendaId:          (tipo === 'NF' && numero ? vendaByNF.get(String(numero))?.id : null) ?? null,
          pedidoId:         (tipo === 'PV' && numero ? pedidoByNum.get(numero)?.id : null) ?? null,
        }
      }))
      .onConflictDoUpdate({
        target: pixRecebimentos.id,
        set: {
          vendaId:  sql`excluded.venda_id`,
          pedidoId: sql`excluded.pedido_id`,
        },
      })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">PIX Recebidos</h1>
          <p className="text-slate-500 text-sm">Conciliação automática com vendas e pedidos</p>
        </div>
        <PixFiltros
          defaultFrom={toInputDate(fromDate)}
          defaultTo={toInputDate(toDate)}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Recebido</p>
            {ocultarValores ? (
              <p className="text-xl font-bold text-slate-900 mt-1">{pixList.length} transações</p>
            ) : (
              <>
                <p className="text-xl font-bold text-slate-900 mt-1">{formatValor(String(totalRecebido))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{pixList.length} transações</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Vinculados</p>
            {ocultarValores ? (
              <p className="text-xl font-bold text-green-700 mt-1">{countVinculado} transações</p>
            ) : (
              <>
                <p className="text-xl font-bold text-green-700 mt-1">{formatValor(String(totalVinculado))}</p>
                <p className="text-xs text-slate-400 mt-0.5">{countVinculado} transações</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Não Vinculados</p>
            {ocultarValores ? (
              <p className="text-xl font-bold text-amber-600 mt-1">{pixList.length - countVinculado} transações</p>
            ) : (
              <>
                <p className="text-xl font-bold text-amber-600 mt-1">
                  {formatValor(String(totalRecebido - totalVinculado))}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{pixList.length - countVinculado} transações</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Sem Referência</p>
            <p className="text-xl font-bold text-slate-400 mt-1">{countSemRef}</p>
            <p className="text-xs text-slate-400 mt-0.5">observação vazia</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Data/Hora</TableHead>
                <TableHead>Pagador</TableHead>
                <TableHead>Observação PIX</TableHead>
                <TableHead>Referência MOVA</TableHead>
                {!ocultarValores && <TableHead className="text-right pr-4">Valor</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pixList.map(pix => {
                const { tipo, numero } = parseObservation(pix.observation)
                const vendaMatch = tipo === 'NF' && numero ? vendaByNF.get(String(numero)) : null
                const pedidoMatch = tipo === 'PV' && numero ? pedidoByNum.get(numero) : null
                const matched = !!(vendaMatch || pedidoMatch)

                return (
                  <TableRow key={pix.endToEndId}>
                    <TableCell className="pl-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatData(pix.date)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{pix.name}</p>
                      <p className="text-xs text-slate-400">{pix.document}</p>
                    </TableCell>
                    <TableCell>
                      {pix.observation ? (
                        <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                          {pix.observation}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {vendaMatch && (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                          <span className="text-sm">
                            <span className="font-medium">Venda NF {vendaMatch.notaFiscalSaida}</span>
                            <span className="text-slate-500"> · {vendaMatch.clienteNome}</span>
                            {vendaMatch.lojaNome && (
                              <span className="text-xs text-slate-400 ml-1">({vendaMatch.lojaNome})</span>
                            )}
                          </span>
                        </div>
                      )}
                      {pedidoMatch && (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                          <span className="text-sm">
                            <span className="font-medium">Pedido #{pedidoMatch.numero}</span>
                            {pedidoMatch.marcaNome && (
                              <span className="text-slate-500"> · {pedidoMatch.marcaNome} {pedidoMatch.modeloNome}</span>
                            )}
                            {pedidoMatch.lojaNome && (
                              <span className="text-xs text-slate-400 ml-1">({pedidoMatch.lojaNome})</span>
                            )}
                            <Badge
                              variant={pedidoMatch.status === 'efetivado' ? 'default' : pedidoMatch.status === 'cancelado' ? 'destructive' : 'outline'}
                              className="ml-1.5 text-xs h-4"
                            >
                              {pedidoMatch.status}
                            </Badge>
                          </span>
                        </div>
                      )}
                      {!matched && tipo && numero && (
                        <div className="flex items-center gap-1.5">
                          <AlertCircle size={14} className="text-amber-500 shrink-0" />
                          <span className="text-sm text-amber-700">
                            {tipo} {numero} não encontrado
                          </span>
                        </div>
                      )}
                      {!matched && !tipo && pix.observation && (
                        <div className="flex items-center gap-1.5">
                          <MinusCircle size={14} className="text-slate-300 shrink-0" />
                          <span className="text-xs text-slate-400">Formato não reconhecido</span>
                        </div>
                      )}
                      {!pix.observation && (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                    {!ocultarValores && (
                      <TableCell className="text-right pr-4 font-medium tabular-nums text-slate-900">
                        {formatValor(pix.price)}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
              {pixList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={ocultarValores ? 4 : 5} className="text-center text-slate-400 py-12">
                    <TrendingUp size={32} className="mx-auto mb-2 opacity-20" />
                    Nenhum PIX recebido no período
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
