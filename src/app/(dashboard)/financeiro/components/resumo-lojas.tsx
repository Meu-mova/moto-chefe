import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ResumoResultado } from '@/lib/resultado-por-loja'

/** Sem "R$" na célula: o símbolo repetido 8 vezes por linha só rouba largura. */
function num(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function corDoLucro(v: number) {
  return v < 0 ? 'text-destructive' : 'text-success'
}

function corDaMargem(m: number) {
  if (m < 0) return 'bg-destructive/10 text-destructive'
  if (m < 5) return 'bg-warning/10 text-warning'
  return 'bg-success/10 text-success'
}

export function ResumoLojas({ resultado }: { resultado: ResumoResultado }) {
  const { totais, despesaGeralRateada } = resultado
  const semCusto = resultado.lojas.reduce((a, l) => a + l.qtdSemCusto, 0)

  // Ordenado por resultado, não por nome: num fechamento a pergunta é qual loja
  // puxa e qual pesa, e isso some numa lista alfabética.
  const lojas = [...resultado.lojas].sort((a, b) => b.lucroLiquido - a.lucroLiquido)

  // Referência pra barra de comparação — a loja que mais lucrou define a escala.
  const maiorLucro = Math.max(...lojas.map(l => Math.abs(l.lucroLiquido)), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resultado por Loja</CardTitle>
        <p className="text-xs text-muted-foreground">
          receita líquida − custo das motos − despesas · valores em R$ · da maior para a menor
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 bg-card z-10">Loja</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Custo motos</TableHead>
                <TableHead className="text-right">Lucro bruto</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Lucro líquido</TableHead>
                <TableHead className="text-right w-28">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lojas.map(l => (
                <TableRow key={l.lojaId} className="even:bg-muted/40">
                  <TableCell className="font-medium whitespace-nowrap sticky left-0 bg-inherit z-10">
                    {l.lojaNome}
                    {l.qtdSemCusto > 0 && (
                      <span
                        className="ml-1.5 text-warning text-xs"
                        title={`${l.qtdSemCusto} moto(s) sem preço de compra cadastrado — o custo delas conta como zero`}
                      >
                        ⚠
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{l.qtdVendas}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{num(l.receitaLiquida)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {num(l.custoMotos)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{num(l.lucroBruto)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {num(l.despesaPropria + l.despesaRateada)}
                    {l.despesaRateada > 0 && (
                      <span
                        className="block text-[10px] text-muted-foreground"
                        title="Parte da despesa que não tem loja atribuída no Importar do Banco, rateada pelo faturamento"
                      >
                        rateio {num(l.despesaRateada)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums font-semibold ${corDoLucro(l.lucroLiquido)}`}>
                    {num(l.lucroLiquido)}
                    {/* Barra proporcional: compara as lojas de relance, sem ler número por número */}
                    <span className="block mt-1 h-1 rounded-full bg-muted overflow-hidden">
                      <span
                        className={`block h-full rounded-full ${l.lucroLiquido < 0 ? 'bg-destructive' : 'bg-success'}`}
                        style={{ width: `${Math.min(100, (Math.abs(l.lucroLiquido) / maiorLucro) * 100)}%` }}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {l.margem === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${corDaMargem(l.margem)}`}>
                        {l.margem.toFixed(1)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              <TableRow className="border-t-2 border-input font-semibold bg-muted/70 hover:bg-muted/70">
                <TableCell className="sticky left-0 bg-muted/70 z-10">Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {lojas.reduce((a, l) => a + l.qtdVendas, 0)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{num(totais.receitaLiquida)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{num(totais.custoMotos)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{num(totais.lucroBruto)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{num(totais.despesa)}</TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${corDoLucro(totais.lucroLiquido)}`}>
                  {num(totais.lucroLiquido)}
                </TableCell>
                <TableCell className="text-right">
                  {totais.margem === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${corDaMargem(totais.margem)}`}>
                      {totais.margem.toFixed(1)}%
                    </span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 space-y-1">
          {despesaGeralRateada > 0 && (
            <p className="text-xs text-muted-foreground">
              {fmt(despesaGeralRateada)} em despesas não têm loja atribuída no Importar do Banco e
              foram rateadas entre as lojas na proporção do faturamento.
            </p>
          )}
          {semCusto > 0 && (
            <p className="text-xs text-warning">
              ⚠ {semCusto} moto(s) vendida(s) sem preço de compra cadastrado — o custo delas
              entra como zero, então o lucro dessas lojas está superestimado.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
