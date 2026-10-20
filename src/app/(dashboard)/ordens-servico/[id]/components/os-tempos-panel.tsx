import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  dataAbertura: Date
  oficinaEm: Date | null
  emAndamentoEm: Date | null
  finalizadaEm: Date | null
  pendentePagamentoEm: Date | null
  dataConclusao: Date | null
}

function formatarDuracao(ms: number): string {
  const minutos = Math.floor(ms / 60000)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const minRestantes = minutos % 60
  if (horas < 24) return minRestantes > 0 ? `${horas}h ${minRestantes}min` : `${horas}h`
  const dias = Math.floor(horas / 24)
  const horasRestantes = horas % 24
  return horasRestantes > 0 ? `${dias}d ${horasRestantes}h` : `${dias}d`
}

function Etapa({ label, de, ate }: { label: string; de: Date | null; ate: Date | null }) {
  if (!de) {
    return (
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">—</span>
      </div>
    )
  }
  const emAndamento = !ate
  const duracao = formatarDuracao((emAndamento ? new Date() : ate)!.getTime() - de.getTime())
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={emAndamento ? 'text-warning font-medium' : 'text-foreground'}>
        {duracao}{emAndamento ? ' (em andamento)' : ''}
      </span>
    </div>
  )
}

export function OSTemposPanel({ dataAbertura, oficinaEm, emAndamentoEm, finalizadaEm, pendentePagamentoEm, dataConclusao }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Tempos por etapa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <Etapa label="Aberta → Oficina"                    de={dataAbertura}         ate={oficinaEm} />
        <Etapa label="Oficina → Em Andamento"               de={oficinaEm}            ate={emAndamentoEm} />
        <Etapa label="Em Andamento → Finalizada"            de={emAndamentoEm}        ate={finalizadaEm} />
        <Etapa label="Finalizada → Pendente de Pagamento"   de={finalizadaEm}         ate={pendentePagamentoEm} />
        <Etapa label="Pendente de Pagamento → Concluída"    de={pendentePagamentoEm}  ate={dataConclusao} />
        <div className="h-px bg-border my-1" />
        <div className="flex justify-between text-sm font-semibold">
          <span className="text-muted-foreground">Total</span>
          <span className="text-foreground">
            {formatarDuracao((dataConclusao ?? new Date()).getTime() - dataAbertura.getTime())}
            {!dataConclusao ? ' (em andamento)' : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
