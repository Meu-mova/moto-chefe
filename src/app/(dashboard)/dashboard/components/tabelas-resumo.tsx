import { percentualDesconto } from '@/lib/desconto'
import { Secao, TabelaPainel, type Coluna } from './painel-secoes'

type Venda = {
  id: string
  clienteNome: string
  valor: string
  dataVenda: Date
  loja: string
  modelo: string
  chassi: string
  vendedor: string
}

type Transferencia = {
  id: string
  chassi: string
  modelo: string
  lojaOrigem: string
  lojaDestino: string
  dataSolicitacao: Date
}

type Garantia = {
  id: string
  chassi: string
  modelo: string
  loja: string
  dataFim: string
  descricao: string
}

type OS = {
  id: string
  chassi: string
  modelo: string
  loja: string
  status: string
  descricao: string
  dataAbertura: Date
}

// `dataFim` da garantia é `date` ("YYYY-MM-DD"): quebrar a string, sem new Date, que
// viraria 21h do dia anterior em Brasília. Os demais são instantes: formatar no fuso de Brasília.
const formatDate = (d: Date | string) => {
  if (typeof d === 'string') {
    const [ano, mes, dia] = d.split('-')
    return `${dia}/${mes}/${ano}`
  }
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const formatCurrency = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const osStatusLabel: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
}

const chassi = (c: string) => <span className="font-mono text-xs text-muted-foreground">{c}</span>

export function TabelaUltimasVendas({ vendas }: { vendas: Venda[] }) {
  const colunas: Coluna<Venda>[] = [
    { titulo: 'Modelo', valor: v => <span className="font-medium text-foreground">{v.modelo}</span> },
    { titulo: 'Chassi', valor: v => chassi(v.chassi), secundaria: true },
    { titulo: 'Loja', valor: v => v.loja, secundaria: true },
    { titulo: 'Vendedor', valor: v => v.vendedor, secundaria: true },
    { titulo: 'Valor', valor: v => <span className="font-semibold">{formatCurrency(v.valor)}</span>, direita: true },
    { titulo: 'Data', valor: v => <span className="text-muted-foreground">{formatDate(v.dataVenda)}</span>, direita: true },
  ]
  return (
    <Secao titulo="Últimas vendas">
      <TabelaPainel linhas={vendas} colunas={colunas} chave={v => v.id} vazio="Nenhuma venda no período"
        detalhe={v => <>{v.vendedor} · {v.loja} · <span className="font-mono">{v.chassi}</span></>} />
    </Secao>
  )
}

export function TabelaTransferenciasPendentes({ transferencias }: { transferencias: Transferencia[] }) {
  const colunas: Coluna<Transferencia>[] = [
    { titulo: 'Modelo', valor: t => <span className="font-medium text-foreground">{t.modelo}</span> },
    { titulo: 'Chassi', valor: t => chassi(t.chassi), secundaria: true },
    { titulo: 'Origem', valor: t => t.lojaOrigem },
    { titulo: 'Destino', valor: t => t.lojaDestino },
    { titulo: 'Data', valor: t => <span className="text-muted-foreground">{formatDate(t.dataSolicitacao)}</span>, direita: true },
  ]
  return (
    <Secao titulo="Transferências pendentes">
      <TabelaPainel linhas={transferencias} colunas={colunas} chave={t => t.id} vazio="Nenhuma pendente"
        detalhe={t => <span className="font-mono">{t.chassi}</span>} />
    </Secao>
  )
}

export function TabelaGarantiasVencendo({ garantias }: { garantias: Garantia[] }) {
  const colunas: Coluna<Garantia>[] = [
    { titulo: 'Modelo', valor: g => <span className="font-medium text-foreground">{g.modelo}</span> },
    { titulo: 'Chassi', valor: g => chassi(g.chassi), secundaria: true },
    { titulo: 'Loja', valor: g => g.loja },
    { titulo: 'Descrição', valor: g => <span className="block max-w-[200px] truncate text-muted-foreground">{g.descricao}</span>, secundaria: true },
    { titulo: 'Vence em', valor: g => <span className="font-semibold text-warning">{formatDate(g.dataFim)}</span>, direita: true },
  ]
  return (
    <Secao titulo="Garantias próximas do vencimento">
      <TabelaPainel linhas={garantias} colunas={colunas} chave={g => g.id} vazio="Nenhuma garantia ativa"
        detalhe={g => <><span className="font-mono">{g.chassi}</span>{g.descricao && <> · {g.descricao}</>}</>} />
    </Secao>
  )
}

type ModeloVendido = {
  modelo: string
  marca: string
  totalVendas: number
  faturamento: string | null
}

export function TabelaModelosMaisVendidos({ modelos }: { modelos: ModeloVendido[] }) {
  const totalUnidades = modelos.reduce((s, m) => s + m.totalVendas, 0)
  const pct = (m: ModeloVendido) => totalUnidades > 0 ? Math.round((m.totalVendas / totalUnidades) * 100) : 0
  const colunas: Coluna<ModeloVendido & { posicao: number }>[] = [
    { titulo: '#', valor: m => <span className="text-muted-foreground">{m.posicao}</span>, classe: 'w-8' },
    { titulo: 'Modelo', valor: m => <span className="font-medium text-foreground">{m.modelo}</span>, principal: true },
    { titulo: 'Vendas', valor: m => m.totalVendas, direita: true },
    {
      titulo: 'Participação', secundaria: true,
      valor: m => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${pct(m)}%` }} /></span>
          <span className="text-xs text-muted-foreground">{pct(m)}%</span>
        </span>
      ),
    },
    { titulo: 'Total de vendas', valor: m => formatCurrency(m.faturamento ?? 0), direita: true },
  ]
  return (
    <Secao titulo="Modelos mais vendidos">
      <TabelaPainel linhas={modelos.map((m, i) => ({ ...m, posicao: i + 1 }))} colunas={colunas} chave={m => m.modelo}
        vazio="Nenhuma venda no período" detalhe={m => `${pct(m)}% das unidades`} />
    </Secao>
  )
}

type RankingVendedor = {
  vendedorId: string
  nome: string
  loja: string | null
  totalVendas: number
  faturamento: string | null
}

/**
 * Descontos por vendedor, indexados por vendedorId. Ausente = sem permissão para
 * ver (o vendedor comum só enxerga a própria linha) ou período sem registro.
 */
export type DescontosRanking = {
  porVendedor: Map<string, { qtd: number; margem: number; preco: number; estimados: number }>
  /** O período começa antes de 10/07/2026, quando o fluxo de aprovação não existia. */
  periodoSemRegistro: boolean
}

type LinhaRanking = RankingVendedor & { posicao: number }

export function TabelaRankingVendedores({ ranking, vendedorAtualId, descontos }: {
  ranking: RankingVendedor[]
  vendedorAtualId?: string
  descontos?: DescontosRanking
}) {
  const temEstimativa = descontos
    ? [...descontos.porVendedor.values()].some(d => d.estimados > 0)
    : false
  const colunas: Coluna<LinhaRanking>[] = [
    { titulo: '#', valor: r => <span className="text-muted-foreground">{r.posicao}</span>, classe: 'w-8' },
    { titulo: 'Vendedor', valor: r => <span className="text-foreground">{r.nome}{r.vendedorId === vendedorAtualId ? ' (você)' : ''}</span>, principal: true },
    { titulo: 'Loja', valor: r => <span className="text-muted-foreground">{r.loja}</span>, secundaria: true },
    { titulo: 'Vendas', valor: r => r.totalVendas, direita: true },
    { titulo: 'Total de vendas', valor: r => formatCurrency(r.faturamento ?? 0), direita: true },
  ]
  if (descontos) {
    colunas.push(
      { titulo: 'Desc. margem', direita: true, secundaria: true, valor: r => <DescontoMargem d={descontos.porVendedor.get(r.vendedorId)} faturamento={Number(r.faturamento ?? 0)} /> },
      { titulo: 'Desc. preço', direita: true, secundaria: true, valor: r => <DescontoPreco d={descontos.porVendedor.get(r.vendedorId)} faturamento={Number(r.faturamento ?? 0)} /> },
    )
  }
  return (
    <Secao titulo="Ranking de vendedores">
      {descontos?.periodoSemRegistro && (
        <p className="mt-2 text-xs text-muted-foreground">
          Desconto só é registrado a partir de 10/07/2026 — antes disso o pedido de aprovação não existia no sistema.
        </p>
      )}
      <TabelaPainel
        linhas={ranking.map((r, i) => ({ ...r, posicao: i + 1 }))} colunas={colunas} chave={r => r.vendedorId}
        vazio="Nenhuma venda no período" destaque={r => r.vendedorId === vendedorAtualId}
        detalhe={r => {
          const d = descontos?.porVendedor.get(r.vendedorId)
          return <>{r.loja}{d && d.qtd > 0 && <> · desconto {formatCurrency(d.margem)}{d.estimados > 0 ? '*' : ''} na margem{d.preco > 0 && <>, {formatCurrency(d.preco)} no preço</>}</>}</>
        }}
      />
      {temEstimativa && (
        <p className="mt-2 text-xs text-muted-foreground">
          * Reconstruído com a tabela de preços atual — as aprovações anteriores a 21/08/2026 não guardavam o preço mínimo da época.
        </p>
      )}
    </Secao>
  )
}

// Duas medidas porque a diferença entre elas é a taxa da maquininha: uma venda
// acima da tabela parcelada em 12x tem desconto de preço zero e margem positiva.
// Cada uma leva o próprio percentual sobre o faturamento do vendedor no período —
// é a taxa que compara quem vendeu 3 motos com quem vendeu 30.
type Desconto = { qtd: number; margem: number; preco: number; estimados: number }

function DescontoMargem({ d, faturamento }: { d?: Desconto; faturamento: number }) {
  if (!d || d.qtd === 0) return <span className="text-muted-foreground">—</span>
  const pctMargem = percentualDesconto(d.margem, faturamento)
  return (
    <span className="text-destructive">
      {formatCurrency(d.margem)}{d.estimados > 0 ? '*' : ''}
      <span className="block text-xs text-muted-foreground">
        {d.qtd} {d.qtd === 1 ? 'venda' : 'vendas'}{pctMargem > 0 ? ` · ${pctMargem}%` : ''}
      </span>
    </span>
  )
}

function DescontoPreco({ d, faturamento }: { d?: Desconto; faturamento: number }) {
  if (!d || d.qtd === 0 || d.preco <= 0) return <span className="text-muted-foreground">—</span>
  const pctPreco = percentualDesconto(d.preco, faturamento)
  return (
    <span className="text-destructive">
      {formatCurrency(d.preco)}
      {pctPreco > 0 && <span className="block text-xs text-muted-foreground">{pctPreco}%</span>}
    </span>
  )
}

type RankingLoja = {
  lojaId: string
  loja: string
  totalVendas: number
  faturamento: string | null
}

export function TabelaRankingLojas({ ranking, lojaAtualId }: { ranking: RankingLoja[]; lojaAtualId?: string | null }) {
  const colunas: Coluna<RankingLoja & { posicao: number }>[] = [
    { titulo: '#', valor: r => <span className="text-muted-foreground">{r.posicao}</span>, classe: 'w-8' },
    { titulo: 'Loja', valor: r => <span className="text-foreground">{r.loja}{r.lojaId === lojaAtualId ? ' (sua loja)' : ''}</span>, principal: true },
    { titulo: 'Vendas', valor: r => r.totalVendas, direita: true },
    { titulo: 'Total de vendas', valor: r => formatCurrency(r.faturamento ?? 0), direita: true },
  ]
  return (
    <Secao titulo="Ranking de lojas">
      <TabelaPainel linhas={ranking.map((r, i) => ({ ...r, posicao: i + 1 }))} colunas={colunas} chave={r => r.lojaId}
        vazio="Nenhuma venda no período" destaque={r => r.lojaId === lojaAtualId} />
    </Secao>
  )
}

export function TabelaOsAbertas({ ordens }: { ordens: OS[] }) {
  const colunas: Coluna<OS>[] = [
    { titulo: 'Modelo', valor: o => <span className="font-medium text-foreground">{o.modelo}</span> },
    { titulo: 'Chassi', valor: o => chassi(o.chassi), secundaria: true },
    { titulo: 'Loja', valor: o => o.loja },
    {
      titulo: 'Status',
      valor: o => (
        <span className={`rounded border border-border px-1.5 py-0.5 text-xs font-medium ${o.status === 'aberta' ? 'text-warning' : 'text-foreground'}`}>
          {osStatusLabel[o.status] ?? o.status}
        </span>
      ),
    },
    { titulo: 'Abertura', valor: o => <span className="text-muted-foreground">{formatDate(o.dataAbertura)}</span>, direita: true },
  ]
  return (
    <Secao titulo="Ordens de serviço abertas">
      <TabelaPainel linhas={ordens} colunas={colunas} chave={o => o.id} vazio="Nenhuma OS aberta"
        detalhe={o => <span className="font-mono">{o.chassi}</span>} />
    </Secao>
  )
}
