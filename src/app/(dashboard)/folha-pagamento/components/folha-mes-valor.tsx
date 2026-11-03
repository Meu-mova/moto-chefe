import { fmtBRL } from '@/lib/preco-minimo'

// Zero não é "—": é R$ 0,00 esmaecido. `negativo` é o desconto (adiantamento), com sinal e cor de aviso.
export function ValorOuZero({ valor, negativo = false }: { valor: number; negativo?: boolean }) {
  if (valor <= 0) return <span className="text-muted-foreground">{fmtBRL(0)}</span>
  return negativo ? <span className="text-warning">-{fmtBRL(valor)}</span> : <span>{fmtBRL(valor)}</span>
}
