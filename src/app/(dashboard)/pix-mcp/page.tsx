import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { buscarPixRecebidos } from '@/lib/mcpai'
import { db } from '@/lib/db'
import { pixRecebimentosMcp, vendas, ordensServico } from '@/lib/db/schema'
import { inArray, and, eq, gte, lte, desc } from 'drizzle-orm'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TrendingUp } from 'lucide-react'
import { PixFiltros } from '../pix/components/pix-filtros'
import { CorrespondenciaForm } from './components/correspondencia-form'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

function formatValor(v: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

function formatData(d: Date) {
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function toInputDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default async function PixMcpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)

  const params = await searchParams
  const hoje = new Date()
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)

  const fromDate = params.from ? new Date(params.from + 'T00:00:00.000Z') : new Date(toInputDate(seteDiasAtras) + 'T00:00:00.000Z')
  const toDate = params.to ? new Date(params.to + 'T23:59:59.999Z') : hoje

  const resultado = await buscarPixRecebidos(fromDate, toDate, grupo.cnpj)

  if (!resultado.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">PIX Recebidos (teste — Open Finance)</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center">
          <p className="text-sm text-red-700">Não foi possível buscar os PIX: {resultado.erro}</p>
        </div>
      </div>
    )
  }

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

  const [vendasDb, osDb] = await Promise.all([
    vendaIds.length > 0
      ? db.select({ id: vendas.id, numero: vendas.numero }).from(vendas).where(inArray(vendas.id, vendaIds))
      : Promise.resolve([] as { id: string; numero: number }[]),
    osIds.length > 0
      ? db.select({ id: ordensServico.id, numero: ordensServico.numero }).from(ordensServico).where(inArray(ordensServico.id, osIds))
      : Promise.resolve([] as { id: string; numero: number | null }[]),
  ])
  const vendaNumeroById = new Map(vendasDb.map(v => [v.id, v.numero]))
  const osNumeroById = new Map(osDb.map(o => [o.id, o.numero]))

  const total = linhas.reduce((s, l) => s + Number(l.valor), 0)
  const totalVinculado = linhas.filter(l => l.tipoCorrespondencia).reduce((s, l) => s + Number(l.valor), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">PIX Recebidos (teste — Open Finance)</h1>
          <p className="text-slate-500 text-sm">
            Contas do grupo <strong>{grupo.nome}</strong>, direto via mcp.ai, sem passar pelo ValidaPix. Correspondência lançada manualmente.
          </p>
        </div>
        <PixFiltros defaultFrom={toInputDate(fromDate)} defaultTo={toInputDate(toDate)} />
      </div>

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
                <TableHead className="pl-4">Data/Hora</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Pagador</TableHead>
                <TableHead>Descrição</TableHead>
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
                    <p className="font-medium text-sm">{l.pagadorNome || '—'}</p>
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <p className="text-xs text-slate-400 truncate" title={l.descricao ?? ''}>{l.descricao}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-slate-900">
                    {formatValor(l.valor)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <CorrespondenciaForm
                      id={l.id}
                      correspondencia={{
                        tipo: l.tipoCorrespondencia,
                        vendaNumero: l.vendaId ? vendaNumeroById.get(l.vendaId) ?? null : null,
                        osNumero: l.osId ? osNumeroById.get(l.osId) ?? null : null,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-12">
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
