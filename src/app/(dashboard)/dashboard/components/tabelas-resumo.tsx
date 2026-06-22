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

const formatDate = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d)
  return date.toLocaleDateString('pt-BR')
}

const formatCurrency = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const osStatusLabel: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
}

export function TabelaUltimasVendas({ vendas }: { vendas: Venda[] }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Últimas vendas</h3>
      </div>
      {vendas.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma venda no período</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-left px-4 py-2 font-medium">Chassi</th>
              <th className="text-left px-4 py-2 font-medium">Loja</th>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
              <th className="text-right px-4 py-2 font-medium">Valor</th>
              <th className="text-right px-4 py-2 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {vendas.map(v => (
              <tr key={v.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{v.modelo}</td>
                <td className="px-4 py-2 text-slate-500 font-mono text-xs">{v.chassi}</td>
                <td className="px-4 py-2">{v.loja}</td>
                <td className="px-4 py-2">{v.vendedor}</td>
                <td className="px-4 py-2 text-right font-medium text-green-700">{formatCurrency(v.valor)}</td>
                <td className="px-4 py-2 text-right text-slate-500">{formatDate(v.dataVenda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function TabelaTransferenciasPendentes({ transferencias }: { transferencias: Transferencia[] }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Transferências pendentes</h3>
      </div>
      {transferencias.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma pendente</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-left px-4 py-2 font-medium">Chassi</th>
              <th className="text-left px-4 py-2 font-medium">Origem</th>
              <th className="text-left px-4 py-2 font-medium">Destino</th>
              <th className="text-right px-4 py-2 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {transferencias.map(t => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{t.modelo}</td>
                <td className="px-4 py-2 text-slate-500 font-mono text-xs">{t.chassi}</td>
                <td className="px-4 py-2">{t.lojaOrigem}</td>
                <td className="px-4 py-2">{t.lojaDestino}</td>
                <td className="px-4 py-2 text-right text-slate-500">{formatDate(t.dataSolicitacao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function TabelaGarantiasVencendo({ garantias }: { garantias: Garantia[] }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Garantias próximas do vencimento</h3>
      </div>
      {garantias.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma garantia ativa</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-left px-4 py-2 font-medium">Chassi</th>
              <th className="text-left px-4 py-2 font-medium">Loja</th>
              <th className="text-left px-4 py-2 font-medium">Descrição</th>
              <th className="text-right px-4 py-2 font-medium">Vence em</th>
            </tr>
          </thead>
          <tbody>
            {garantias.map(g => (
              <tr key={g.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{g.modelo}</td>
                <td className="px-4 py-2 text-slate-500 font-mono text-xs">{g.chassi}</td>
                <td className="px-4 py-2">{g.loja}</td>
                <td className="px-4 py-2 text-slate-500 truncate max-w-[200px]">{g.descricao}</td>
                <td className="px-4 py-2 text-right text-orange-600 font-medium">{formatDate(g.dataFim)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Modelos mais vendidos</h3>
      </div>
      {modelos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma venda no período</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-center px-4 py-2 font-medium w-10">#</th>
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-right px-4 py-2 font-medium">Vendas</th>
              <th className="text-right px-4 py-2 font-medium">%</th>
              <th className="text-right px-4 py-2 font-medium">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {modelos.map((m, i) => {
              const pct = totalUnidades > 0 ? Math.round((m.totalVendas / totalUnidades) * 100) : 0
              return (
                <tr key={m.modelo} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                  </td>
                  <td className="px-4 py-2 font-medium">{m.modelo}</td>
                  <td className="px-4 py-2 text-right">{m.totalVendas}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-16 bg-slate-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-slate-500 text-xs w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-green-700">{formatCurrency(m.faturamento ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

type RankingVendedor = {
  vendedorId: string
  nome: string
  loja: string
  totalVendas: number
  faturamento: string | null
}

export function TabelaRankingVendedores({ ranking, vendedorAtualId }: { ranking: RankingVendedor[]; vendedorAtualId?: string }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Ranking de vendedores</h3>
      </div>
      {ranking.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma venda no período</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-center px-4 py-2 font-medium w-10">#</th>
              <th className="text-left px-4 py-2 font-medium">Vendedor</th>
              <th className="text-left px-4 py-2 font-medium">Loja</th>
              <th className="text-right px-4 py-2 font-medium">Vendas</th>
              <th className="text-right px-4 py-2 font-medium">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => {
              const isMe = r.vendedorId === vendedorAtualId
              return (
                <tr key={r.vendedorId} className={`border-b last:border-0 ${isMe ? 'bg-blue-50 font-medium' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-2 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                  </td>
                  <td className="px-4 py-2">{r.nome}{isMe ? ' (você)' : ''}</td>
                  <td className="px-4 py-2 text-slate-500">{r.loja}</td>
                  <td className="px-4 py-2 text-right">{r.totalVendas}</td>
                  <td className="px-4 py-2 text-right text-green-700">{formatCurrency(r.faturamento ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

type RankingLoja = {
  lojaId: string
  loja: string
  totalVendas: number
  faturamento: string | null
}

export function TabelaRankingLojas({ ranking, lojaAtualId }: { ranking: RankingLoja[]; lojaAtualId?: string | null }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Ranking de lojas</h3>
      </div>
      {ranking.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma venda no período</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-center px-4 py-2 font-medium w-10">#</th>
              <th className="text-left px-4 py-2 font-medium">Loja</th>
              <th className="text-right px-4 py-2 font-medium">Vendas</th>
              <th className="text-right px-4 py-2 font-medium">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => {
              const isMyStore = r.lojaId === lojaAtualId
              return (
                <tr key={r.lojaId} className={`border-b last:border-0 ${isMyStore ? 'bg-blue-50 font-medium' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-2 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}
                  </td>
                  <td className="px-4 py-2">{r.loja}{isMyStore ? ' (sua loja)' : ''}</td>
                  <td className="px-4 py-2 text-right">{r.totalVendas}</td>
                  <td className="px-4 py-2 text-right text-green-700">{formatCurrency(r.faturamento ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function TabelaOsAbertas({ ordens }: { ordens: OS[] }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-slate-700">Ordens de serviço abertas</h3>
      </div>
      {ordens.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma OS aberta</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-left px-4 py-2 font-medium">Chassi</th>
              <th className="text-left px-4 py-2 font-medium">Loja</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Abertura</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map(o => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">{o.modelo}</td>
                <td className="px-4 py-2 text-slate-500 font-mono text-xs">{o.chassi}</td>
                <td className="px-4 py-2">{o.loja}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    o.status === 'aberta' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {osStatusLabel[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-slate-500">{formatDate(o.dataAbertura)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
