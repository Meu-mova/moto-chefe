import { db } from '@/lib/db'
import { conciliacoesCartao, vendas } from '@/lib/db/schema'
import { eq, desc, and, isNull, isNotNull } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { UploadRelatorio } from './components/upload-relatorio'
import { VincularVendaButton } from './components/vincular-venda-button'

const fmt = (v: string | number) =>
  parseFloat(String(v)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const OPERADORA_LABEL: Record<string, string> = {
  infinitypay: 'InfinityPay',
  stone:       'Stone',
  pagueveloz:  'PaguéVeloz',
}

export default async function ConciliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) redirect('/dashboard')

  const { filtro = 'pendentes' } = await searchParams
  const grupo = await getGrupoAtivo(usuario)

  const filtroStatus =
    filtro === 'conciliadas' ? eq(conciliacoesCartao.conciliado, true) :
    filtro === 'todas'       ? undefined :
    eq(conciliacoesCartao.conciliado, false)

  const whereClause = and(
    eq(conciliacoesCartao.grupoId, grupo.id),
    filtroStatus,
  )

  const transacoes = await db
    .select({
      id:            conciliacoesCartao.id,
      operadora:     conciliacoesCartao.operadora,
      dataTransacao: conciliacoesCartao.dataTransacao,
      tipo:          conciliacoesCartao.tipo,
      parcelas:      conciliacoesCartao.parcelas,
      valorBruto:    conciliacoesCartao.valorBruto,
      valorLiquido:  conciliacoesCartao.valorLiquido,
      nsu:           conciliacoesCartao.nsu,
      conciliado:    conciliacoesCartao.conciliado,
      vendaId:       conciliacoesCartao.vendaId,
      rawData:       conciliacoesCartao.rawData,
    })
    .from(conciliacoesCartao)
    .where(whereClause)
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(200)

  // Carrega dados das vendas vinculadas
  const vendaIds = [...new Set(transacoes.flatMap(t => t.vendaId ? [t.vendaId] : []))]
  const vendasMap = new Map<string, { id: string; numero: number; clienteNome: string; valor: string }>()
  if (vendaIds.length > 0) {
    const rows = await db
      .select({ id: vendas.id, numero: vendas.numero, clienteNome: vendas.clienteNome, valor: vendas.valor })
      .from(vendas)
    rows.forEach(v => vendasMap.set(v.id, v))
  }

  const [totalPendentes, totalConciliadas] = await Promise.all([
    db.$count(conciliacoesCartao, and(eq(conciliacoesCartao.grupoId, grupo.id), eq(conciliacoesCartao.conciliado, false))),
    db.$count(conciliacoesCartao, and(eq(conciliacoesCartao.grupoId, grupo.id), eq(conciliacoesCartao.conciliado, true))),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conciliação de Cartão</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalPendentes} pendente{totalPendentes !== 1 ? 's' : ''} · {totalConciliadas} conciliada{totalConciliadas !== 1 ? 's' : ''}
          </p>
        </div>
        <UploadRelatorio />
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['pendentes', 'conciliadas', 'todas'] as const).map(f => (
          <a
            key={f}
            href={`/conciliacao?filtro=${f}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filtro === f
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'pendentes' ? 'Pendentes' : f === 'conciliadas' ? 'Conciliadas' : 'Todas'}
          </a>
        ))}
      </div>

      {/* Tabela */}
      {transacoes.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-sm">
            {filtro === 'pendentes'
              ? 'Nenhuma transação pendente. Importe um relatório acima.'
              : 'Nenhuma transação encontrada.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Operadora</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Portador</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Bruto</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Líquido</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">NSU</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transacoes.map(t => {
                const raw = t.rawData as Record<string, string> | null
                const bandeira = raw?.bandeira ?? ''
                const portador = raw?.portador ?? ''
                const vendaVinculada = t.vendaId ? (vendasMap.get(t.vendaId) ?? null) : null

                return (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {new Date(t.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {OPERADORA_LABEL[t.operadora] ?? t.operadora}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={t.tipo === 'credito' ? 'default' : 'secondary'} className="text-xs">
                          {t.tipo === 'credito' ? `Cré ${t.parcelas}x` : 'Déb'}
                        </Badge>
                        {bandeira && <span className="text-xs text-slate-400 capitalize">{bandeira}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[140px] truncate" title={portador}>
                      {portador || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                      {fmt(t.valorBruto)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                      {t.valorLiquido ? fmt(t.valorLiquido) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono max-w-[120px] truncate" title={t.nsu ?? ''}>
                      {t.nsu ? t.nsu.slice(-8) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <VincularVendaButton
                        conciliacaoId={t.id}
                        dataRef={t.dataTransacao}
                        valorRef={parseFloat(t.valorBruto)}
                        vendaVinculada={vendaVinculada}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
