import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ResumoResultado } from '@/lib/resultado-por-loja'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function corDoLucro(v: number) {
  return v < 0 ? 'text-red-600' : 'text-emerald-700'
}

export function ResumoLojas({ resultado }: { resultado: ResumoResultado }) {
  const { lojas, totais, despesaGeralRateada } = resultado
  const semCusto = lojas.reduce((a, l) => a + l.qtdSemCusto, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resultado por Loja</CardTitle>
        <p className="text-xs text-slate-400">
          receita líquida − custo das motos − despesas − imposto
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Custo motos</TableHead>
                <TableHead className="text-right">Lucro bruto</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Imposto</TableHead>
                <TableHead className="text-right">Lucro líquido</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lojas.map(l => (
                <TableRow key={l.lojaId}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {l.lojaNome}
                    {l.qtdSemCusto > 0 && (
                      <span
                        className="ml-1.5 text-amber-600 text-xs"
                        title={`${l.qtdSemCusto} moto(s) sem preço de compra cadastrado — o custo delas conta como zero`}
                      >
                        ⚠
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{l.qtdVendas}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(l.receitaLiquida)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-500">{fmt(l.custoMotos)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(l.lucroBruto)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-500">
                    {fmt(l.despesaPropria + l.despesaRateada)}
                    {l.despesaRateada > 0 && (
                      <span
                        className="block text-[10px] text-slate-400"
                        title="Parte da despesa que não tem loja atribuída no Importar do Banco, rateada pelo faturamento"
                      >
                        rateio {fmt(l.despesaRateada)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-slate-500">{fmt(l.imposto)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${corDoLucro(l.lucroLiquido)}`}>
                    {fmt(l.lucroLiquido)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${l.margem === null ? 'text-slate-400' : corDoLucro(l.margem)}`}>
                    {l.margem === null ? '—' : `${l.margem.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}

              <TableRow className="border-t-2 border-slate-200 font-semibold bg-slate-50/60">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{lojas.reduce((a, l) => a + l.qtdVendas, 0)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(totais.receitaLiquida)}</TableCell>
                <TableCell className="text-right font-mono text-slate-500">{fmt(totais.custoMotos)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(totais.lucroBruto)}</TableCell>
                <TableCell className="text-right font-mono text-slate-500">{fmt(totais.despesa)}</TableCell>
                <TableCell className="text-right font-mono text-slate-500">{fmt(totais.imposto)}</TableCell>
                <TableCell className={`text-right font-mono ${corDoLucro(totais.lucroLiquido)}`}>
                  {fmt(totais.lucroLiquido)}
                </TableCell>
                <TableCell className={`text-right font-mono ${totais.margem === null ? 'text-slate-400' : corDoLucro(totais.margem)}`}>
                  {totais.margem === null ? '—' : `${totais.margem.toFixed(1)}%`}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 space-y-1">
          {despesaGeralRateada > 0 && (
            <p className="text-xs text-slate-400">
              {fmt(despesaGeralRateada)} em despesas não têm loja atribuída no Importar do Banco e
              foram rateadas entre as lojas na proporção do faturamento.
            </p>
          )}
          {semCusto > 0 && (
            <p className="text-xs text-amber-600">
              ⚠ {semCusto} moto(s) vendida(s) sem preço de compra cadastrado — o custo delas
              entra como zero, então o lucro dessas lojas está superestimado.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
