import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarPixRecebidos } from '@/lib/mcpai'
import { db } from '@/lib/db'
import { pixRecebimentosMcp, pixMcpSyncStatus, vendas, ordensServico, usuarios, pedidosVenda, vendasPecas } from '@/lib/db/schema'
import { inArray, and, eq, gte, lte, desc } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { PixFiltros } from '../pix/components/pix-filtros'
import { CorrespondenciaForm } from './components/correspondencia-form'
import Link from 'next/link'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

// Enquanto a última sincronização com o mcp.ai for mais recente que isso, a
// página lê só do nosso banco — evita bater no mcp.ai (lento, baixa o
// histórico inteiro da conta) a cada carregamento.
const JANELA_CACHE_MS = 10 * 60 * 1000

function formatValor(v: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

function formatData(d: Date) {
  // O Sicoob não informa horário real via Open Finance (sempre 00:00) —
  // mostrar só a data evita passar uma precisão que os dados não têm.
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatAtras(d: Date) {
  const minutos = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutos < 1) return 'agora mesmo'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  return `há ${horas}h`
}

function toInputDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function PixMcpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sync?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)

  const params = await searchParams
  const hoje = new Date()
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)

  const fromDate = params.from ? new Date(params.from + 'T00:00:00.000Z') : new Date(toInputDate(seteDiasAtras) + 'T00:00:00.000Z')
  const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : hoje
  const forcarSync = params.sync === '1'

  const [syncStatus] = await db.select().from(pixMcpSyncStatus).where(eq(pixMcpSyncStatus.grupoId, grupo.id)).limit(1)
  const cacheValido = !forcarSync && syncStatus && (Date.now() - syncStatus.ultimaSincronizacao.getTime()) < JANELA_CACHE_MS

  let erroSync: string | null = null

  if (!cacheValido) {
    // Sincroniza o histórico inteiro (não dá pra pedir só um período ao
    // mcp.ai — ver nota em buscarPixRecebidos), então usamos uma janela bem
    // ampla aqui pra não perder PIX antigos na primeira sincronização.
    const desde = new Date('2025-01-01T00:00:00.000Z')
    const resultado = await buscarPixRecebidos(desde, hoje, grupo.cnpj)

    if (!resultado.ok) {
      erroSync = resultado.erro
    } else {
      if (resultado.transacoes.length > 0) {
        await db.insert(pixRecebimentosMcp)
          .values(resultado.transacoes.map(tx => ({
            grupoId: grupo.id,
            contaId: tx.contaId,
            banco: tx.banco,
            transacaoId: tx.transacaoId,
            data: new Date(tx.data),
            valor: tx.valor,
            pagadorNome: tx.pagadorNome,
            descricao: tx.descricao,
          })))
          .onConflictDoNothing({ target: pixRecebimentosMcp.transacaoId })
      }
      await db.insert(pixMcpSyncStatus)
        .values({ grupoId: grupo.id, ultimaSincronizacao: new Date() })
        .onConflictDoUpdate({ target: pixMcpSyncStatus.grupoId, set: { ultimaSincronizacao: new Date() } })
    }
  }

  const [syncStatusAtual] = await db.select().from(pixMcpSyncStatus).where(eq(pixMcpSyncStatus.grupoId, grupo.id)).limit(1)

  const linhas = await db
    .select()
    .from(pixRecebimentosMcp)
    .where(and(
      eq(pixRecebimentosMcp.grupoId, grupo.id),
      gte(pixRecebimentosMcp.data, fromDate),
      lte(pixRecebimentosMcp.data, toDate),
    ))
    .orderBy(desc(pixRecebimentosMcp.data))

  const vendaIds = linhas.map(l => l.vendaId).filter((id): id is string => !!id)
  const osIds = linhas.map(l => l.osId).filter((id): id is string => !!id)
  const pedidoIds = linhas.map(l => l.pedidoId).filter((id): id is string => !!id)
  const pecaVendaIds = linhas.map(l => l.pecaVendaId).filter((id): id is string => !!id)
  const lancadoPorIds = linhas.map(l => l.lancadoPorId).filter((id): id is string => !!id)

  const [vendasDb, osDb, pedidosDb, pecasVendaDb, usuariosDb] = await Promise.all([
    vendaIds.length > 0
      ? db.select({ id: vendas.id, notaFiscalSaida: vendas.notaFiscalSaida }).from(vendas).where(inArray(vendas.id, vendaIds))
      : Promise.resolve([] as { id: string; notaFiscalSaida: string | null }[]),
    osIds.length > 0
      ? db.select({ id: ordensServico.id, numero: ordensServico.numero }).from(ordensServico).where(inArray(ordensServico.id, osIds))
      : Promise.resolve([] as { id: string; numero: number | null }[]),
    pedidoIds.length > 0
      ? db.select({ id: pedidosVenda.id, numero: pedidosVenda.numero }).from(pedidosVenda).where(inArray(pedidosVenda.id, pedidoIds))
      : Promise.resolve([] as { id: string; numero: number }[]),
    pecaVendaIds.length > 0
      ? db.select({ id: vendasPecas.id, numero: vendasPecas.numero }).from(vendasPecas).where(inArray(vendasPecas.id, pecaVendaIds))
      : Promise.resolve([] as { id: string; numero: number }[]),
    lancadoPorIds.length > 0
      ? db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(inArray(usuarios.id, lancadoPorIds))
      : Promise.resolve([] as { id: string; nome: string }[]),
  ])
  const vendaNfById = new Map(vendasDb.map(v => [v.id, v.notaFiscalSaida]))
  const osNumeroById = new Map(osDb.map(o => [o.id, o.numero]))
  const pedidoNumeroById = new Map(pedidosDb.map(p => [p.id, p.numero]))
  const pecaNumeroById = new Map(pecasVendaDb.map(p => [p.id, p.numero]))
  const usuarioNomeById = new Map(usuariosDb.map(u => [u.id, u.nome]))

  const total = linhas.reduce((s, l) => s + Number(l.valor), 0)
  const totalVinculado = linhas.filter(l => l.tipoCorrespondencia).reduce((s, l) => s + Number(l.valor), 0)

  const hrefAtualizar = `/pix-mcp?from=${toInputDate(fromDate)}&to=${toInputDate(toDate)}&sync=1`

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">PIX Recebidos (teste — Open Finance)</h1>
          <p className="text-slate-500 text-sm">
            Contas do grupo <strong>{grupo.nome}</strong>, direto via mcp.ai, sem passar pelo ValidaPix. Correspondência lançada manualmente.
          </p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            {syncStatusAtual
              ? <>Sincronizado {formatAtras(syncStatusAtual.ultimaSincronizacao)}</>
              : 'Ainda não sincronizado'}
            <Link href={hrefAtualizar} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 underline">
              <RefreshCw size={11} /> Atualizar agora
            </Link>
          </p>
        </div>
        <PixFiltros defaultFrom={toInputDate(fromDate)} defaultTo={toInputDate(toDate)} />
      </div>

      {erroSync && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não foi possível sincronizar com o mcp.ai agora ({erroSync}) — mostrando os dados já salvos.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Recebido</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{formatValor(String(total))}</p>
            <p className="text-xs text-slate-400 mt-0.5">{linhas.length} transações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Vinculados</p>
            <p className="text-xl font-bold text-green-700 mt-1">{formatValor(String(totalVinculado))}</p>
            <p className="text-xs text-slate-400 mt-0.5">{linhas.filter(l => l.tipoCorrespondencia).length} transações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Sem Correspondência</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{formatValor(String(total - totalVinculado))}</p>
            <p className="text-xs text-slate-400 mt-0.5">{linhas.filter(l => !l.tipoCorrespondencia).length} transações</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Data</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Pagador</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="pr-4">Correspondência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="pl-4 text-sm text-slate-500 whitespace-nowrap">
                    {formatData(l.data)}
                  </TableCell>
                  <TableCell className="text-sm">{l.banco}</TableCell>
                  <TableCell>
                    <p className="font-medium text-sm" title={l.descricao ?? ''}>{l.pagadorNome || '—'}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-slate-900">
                    {formatValor(l.valor)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <CorrespondenciaForm
                      id={l.id}
                      correspondencia={{
                        tipo: l.tipoCorrespondencia,
                        vendaNf: l.vendaId ? vendaNfById.get(l.vendaId) ?? null : null,
                        osNumero: l.osId ? osNumeroById.get(l.osId) ?? null : null,
                        pedidoNumero: l.pedidoId ? pedidoNumeroById.get(l.pedidoId) ?? null : null,
                        pecaNumero: l.pecaVendaId ? pecaNumeroById.get(l.pecaVendaId) ?? null : null,
                        lancadoPorNome: l.lancadoPorId ? usuarioNomeById.get(l.lancadoPorId) ?? null : null,
                        lancadoEm: l.lancadoEm ? l.lancadoEm.toISOString() : null,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-12">
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
