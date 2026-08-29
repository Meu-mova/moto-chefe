import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TotalDespesas } from '@/lib/despesas-operacionais'

type Props = {
  resumo: TotalDespesas
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ROTULO_FORA: Record<keyof TotalDespesas['foraDoCalculo'], string> = {
  compra_moto:           'Compra de moto',
  retirada_socio:        'Retirada de sócio',
  transferencia_interna: 'Transferência entre empresas do grupo',
  categoria_marcada:     'Categoria fora do cálculo',
  caixa_nao_despesa:     'Depósito do caixa no banco',
  estorno_cliente:       'Estorno ao cliente',
  ja_lancada_manual:     'Já lançada manualmente',
}

export function ResumoDespesas({ resumo }: Props) {
  const fora = (Object.keys(ROTULO_FORA) as (keyof typeof ROTULO_FORA)[])
    .map(k => ({ chave: k, valor: resumo.foraDoCalculo[k] }))
    .filter(f => f.valor > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-500">Despesas Operacionais</CardTitle>
        <p className="text-2xl font-bold text-red-600">{fmt(resumo.total)}</p>
        <p className="text-xs text-slate-400">saídas do banco + contas pagas fora dele</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {resumo.porCategoria.map(c => (
            <div key={c.categoria} className="flex justify-between text-sm">
              <span className="text-slate-600">{c.categoria}</span>
              <span className="font-mono text-slate-700">{fmt(c.total)}</span>
            </div>
          ))}
          {resumo.porCategoria.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Sem despesas no período</p>
          )}
        </div>

        {/* Sem isso o número parece pequeno demais pra quem acabou de ver o extrato:
            estas saídas existem, só não são custo de operar a loja. */}
        {fora.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
            <p className="text-xs text-slate-400">Saiu da conta, mas não conta como despesa:</p>
            {fora.map(f => (
              <div key={f.chave} className="flex justify-between text-xs">
                <span className="text-slate-400">{ROTULO_FORA[f.chave]}</span>
                <span className="font-mono text-slate-400">{fmt(f.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
