'use client'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatarNumeroBR } from '@/lib/numero-br'
import { marcarIsentoAction, conferirPagamentoAction, type GrupoMensalidade } from '../actions'

const dataBR = (d: string) => d.slice(0, 10).split('-').reverse().join('/')

function Situacao({ g, hoje }: { g: GrupoMensalidade; hoje: string }) {
  if (g.isento) return <Badge variant="outline" className="border-border text-muted-foreground">Isento</Badge>
  if (g.bloqueado) return <Badge variant="outline" className="border-destructive text-destructive">Bloqueado</Badge>
  if (g.abertas.some(m => m.vencimento < hoje)) return <Badge variant="outline" className="border-warning text-warning">Vencida</Badge>
  if (g.abertas.length) return <Badge variant="outline" className="border-primary text-primary-text">Em aberto</Badge>
  if (!g.primeiro_acesso_em) return <Badge variant="outline" className="border-border text-muted-foreground">Sem 1º acesso</Badge>
  return <Badge variant="outline" className="border-primary text-primary-text">Em dia</Badge>
}

export function MensalidadesPainel({ grupos, hoje }: { grupos: GrupoMensalidade[]; hoje: string }) {
  const [pendente, iniciar] = useTransition()

  function alternarIsencao(g: GrupoMensalidade) {
    const texto = g.isento
      ? `Voltar a cobrar ${g.nome}? Mensalidades que ficaram em aberto voltam a contar, com multa e juros do atraso, e o grupo pode ser bloqueado na hora.`
      : `Isentar ${g.nome}? Ele deixa de ser cobrado e de bloquear. As mensalidades em aberto continuam abertas e podem ser pagas pelo link.`
    if (!window.confirm(texto)) return
    iniciar(async () => {
      const r = await marcarIsentoAction(g.id, !g.isento)
      if (r.ok) toast.success(g.isento ? 'Cobrança reativada' : 'Grupo isento')
      else toast.error(r.erro)
    })
  }

  function conferir(id: string) {
    iniciar(async () => {
      const r = await conferirPagamentoAction(id)
      if (!r.ok) { toast.error(r.erro); return }
      if (r.paga) toast.success(r.motivo)
      else toast.info(r.motivo)
    })
  }

  const inadimplentes = grupos.filter(g => !g.isento && g.abertas.some(m => m.vencimento < hoje))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mensalidades</h1>
        <p className="text-muted-foreground text-sm">Cobrança do MOVA por grupo (CNPJ)</p>
      </div>

      {inadimplentes.length > 0 && (
        <p className="text-sm text-destructive">
          {inadimplentes.length} grupo(s) com mensalidade vencida: {inadimplentes.map(g => g.nome).join(', ')}
        </p>
      )}

      <div className="space-y-3">
        {grupos.map(g => (
          <section key={g.id} className="bg-card rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{g.nome}</h2>
                <Situacao g={g} hoje={hoje} />
              </div>
              <Button variant="outline" size="sm" disabled={pendente} onClick={() => alternarIsencao(g)}>
                {g.isento ? 'Voltar a cobrar' : 'Isentar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {g.valor_mensal ? `R$ ${formatarNumeroBR(Number(g.valor_mensal))} por mês` : 'Sem valor (ligue a adesão ao grupo)'}
              {' · '}
              {g.primeiro_acesso_em ? `1º acesso em ${dataBR(g.primeiro_acesso_em)}` : 'ainda sem 1º acesso'}
            </p>
            {g.abertas.length > 0 && (
              <ul className="space-y-2">
                {g.abertas.map(m => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <span>
                      {m.competencia} · R$ {formatarNumeroBR(m.total)} · vence {dataBR(m.vencimento)}
                      {!m.temLink && <span className="text-warning"> · sem link (o cron tenta de novo)</span>}
                    </span>
                    <Button variant="outline" size="sm" disabled={pendente} onClick={() => conferir(m.id)}>
                      Conferir agora
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
