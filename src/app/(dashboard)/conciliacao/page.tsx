import { maquininhasDoGrupo } from '@/lib/maquininhas'
import { db } from '@/lib/db'
import { conciliacoesCartao, vendas, vendasPecas, ordensServico, clientes } from '@/lib/db/schema'
import { eq, desc, and, isNull, isNotNull, inArray, gte, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { INICIO_CONCILIACAO } from '@/lib/conciliacao-periodo'
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
  if (!usuarioPodeAcessar(usuario, '/conciliacao')) redirect('/dashboard')

  const { filtro = 'pendentes' } = await searchParams
  const grupo = await getGrupoAtivo(usuario)

  const filtroStatus =
    filtro === 'conciliadas' ? eq(conciliacoesCartao.conciliado, true) :
    filtro === 'todas'       ? undefined :
    eq(conciliacoesCartao.conciliado, false)

  // Nada de antes do início do período de conciliação — ver INICIO_CONCILIACAO.
  const doPeriodo = and(
    eq(conciliacoesCartao.grupoId, grupo.id),
    gte(conciliacoesCartao.dataTransacao, INICIO_CONCILIACAO),
  )

  const whereClause = and(doPeriodo, filtroStatus)

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
      pecaVendaId:   conciliacoesCartao.pecaVendaId,
      osId:          conciliacoesCartao.osId,
      rawData:       conciliacoesCartao.rawData,
    })
    .from(conciliacoesCartao)
    .where(whereClause)
    .orderBy(desc(conciliacoesCartao.dataTransacao))
    .limit(200)

  // Carrega dados das vendas (motos e peças) vinculadas
  const vendaIds = [...new Set(transacoes.flatMap(t => t.vendaId ? [t.vendaId] : []))]
  const pecaVendaIds = [...new Set(transacoes.flatMap(t => t.pecaVendaId ? [t.pecaVendaId] : []))]
  const vendasMap = new Map<string, { id: string; numero: number; clienteNome: string; valor: string }>()
  const pecasVendaMap = new Map<string, { id: string; numero: number; clienteNome: string; valor: string }>()
  if (vendaIds.length > 0) {
    const rows = await db
      .select({ id: vendas.id, numero: vendas.numero, clienteNome: vendas.clienteNome, valor: vendas.valor })
      .from(vendas)
      .where(inArray(vendas.id, vendaIds))
    rows.forEach(v => vendasMap.set(v.id, v))
  }
  if (pecaVendaIds.length > 0) {
    const rows = await db
      .select({ id: vendasPecas.id, numero: vendasPecas.numero, clienteNome: vendasPecas.clienteNome, valor: vendasPecas.valorTotal })
      .from(vendasPecas)
      .where(inArray(vendasPecas.id, pecaVendaIds))
    rows.forEach(v => pecasVendaMap.set(v.id, { ...v, clienteNome: v.clienteNome ?? 'Cliente não identificado' }))
  }

  const osIds = [...new Set(transacoes.flatMap(t => t.osId ? [t.osId] : []))]
  const osMap = new Map<string, { id: string; numero: number; clienteNome: string; valor: string }>()
  if (osIds.length > 0) {
    const rows = await db
      .select({
        id:          ordensServico.id,
        numero:      ordensServico.numero,
        clienteNome: sql<string>`COALESCE(${clientes.nome}, ${ordensServico.clienteNomeExterno}, 'Cliente não identificado')`,
        valor:       ordensServico.valorTotal,
      })
      .from(ordensServico)
      .leftJoin(clientes, eq(ordensServico.clienteId, clientes.id))
      .where(inArray(ordensServico.id, osIds))
    rows.forEach(o => osMap.set(o.id, { ...o, numero: o.numero ?? 0, valor: o.valor ?? '0' }))
  }

  const [totalPendentes, totalConciliadas] = await Promise.all([
    db.$count(conciliacoesCartao, and(doPeriodo, eq(conciliacoesCartao.conciliado, false))),
    db.$count(conciliacoesCartao, and(doPeriodo, eq(conciliacoesCartao.conciliado, true))),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conciliação de Cartão</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalPendentes} pendente{totalPendentes !== 1 ? 's' : ''} · {totalConciliadas} conciliada{totalConciliadas !== 1 ? 's' : ''}
          </p>
        </div>
        <UploadRelatorio maquininhas={await maquininhasDoGrupo(db, grupo.id)} />
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['pendentes', 'conciliadas', 'todas'] as const).map(f => (
          <a
            key={f}
            href={`/conciliacao?filtro=${f}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filtro === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {f === 'pendentes' ? 'Pendentes' : f === 'conciliadas' ? 'Conciliadas' : 'Todas'}
          </a>
        ))}
      </div>

      {/* Tabela */}
      {transacoes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">
            {filtro === 'pendentes'
              ? 'Nenhuma transação pendente. Importe um relatório acima.'
              : 'Nenhuma transação encontrada.'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Operadora</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Portador</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bruto</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Líquido</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">NSU</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transacoes.map(t => {
                const raw = t.rawData as Record<string, string> | null
                const bandeira = raw?.bandeira ?? ''
                const portador = raw?.portador ?? ''
                const vendaVinculada = t.vendaId
                  ? (vendasMap.get(t.vendaId) ?? null)
                  : t.pecaVendaId
                    ? (pecasVendaMap.get(t.pecaVendaId) ?? null)
                    : t.osId
                      ? (osMap.get(t.osId) ?? null)
                      : null
                const tipoVinculado: 'moto' | 'peca' | 'os' | undefined =
                  t.vendaId ? 'moto' : t.pecaVendaId ? 'peca' : t.osId ? 'os' : undefined

                return (
                  <tr key={t.id} className="hover:bg-muted transition-colors">
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {new Date(t.dataTransacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {OPERADORA_LABEL[t.operadora] ?? t.operadora}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={t.tipo === 'credito' ? 'default' : 'secondary'} className="text-xs">
                          {t.tipo === 'credito' ? `Cré ${t.parcelas}x` : 'Déb'}
                        </Badge>
                        {bandeira && <span className="text-xs text-muted-foreground capitalize">{bandeira}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate" title={portador}>
                      {portador || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                      {fmt(t.valorBruto)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                      {t.valorLiquido ? fmt(t.valorLiquido) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[120px] truncate" title={t.nsu ?? ''}>
                      {t.nsu ? t.nsu.slice(-8) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <VincularVendaButton
                        conciliacaoId={t.id}
                        dataRef={t.dataTransacao}
                        valorRef={parseFloat(t.valorBruto)}
                        vendaVinculada={vendaVinculada}
                        tipoVinculado={tipoVinculado}
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
