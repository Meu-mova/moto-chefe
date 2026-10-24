'use client'
import { CheckCircle2, Printer } from 'lucide-react'

type Props = {
  html: string
  docHash: string | null
  assinadoEm: string | null
  ipAssinatura: string | null
  conferencia: string
}

function dataHora(iso: string | null): string {
  if (!iso) return '—'
  // O servidor da Vercel roda em UTC; sem o fuso a via mostraria a hora errada.
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function ViaAssinada({ html, docHash, assinadoEm, ipAssinatura, conferencia }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <div className="rounded-lg border border-success/50 bg-success/10 px-4 py-3 mb-4 flex items-start gap-2">
        <CheckCircle2 size={18} className="text-success mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-success">Documento assinado eletronicamente</p>
          <p className="text-xs text-success">{dataHora(assinadoEm)}</p>
        </div>
      </div>

      {/*
        dangerouslySetInnerHTML é seguro aqui: `html` é o snapshot que o próprio
        servidor gerou em montarHtmlDocumento(), onde TODO campo vindo do banco
        passa por esc() (teste "dado do cliente com < ou & não quebra o HTML").
        Nada aqui vem do navegador do cliente. Se algum dia o snapshot puder ser
        montado com conteúdo externo, sanitize antes.
      */}
      <div className="bg-card rounded-lg border p-5 mb-4">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <div className="bg-card rounded-lg border p-4 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
          Evidências da assinatura
        </h2>
        <dl className="space-y-1.5 text-xs text-foreground">
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-muted-foreground">Assinado em</dt>
            <dd>{dataHora(assinadoEm)} (horário de Brasília)</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-muted-foreground">Endereço IP</dt>
            <dd>{ipAssinatura || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-muted-foreground">Confirmação</dt>
            <dd>Código enviado ao e-mail cadastrado do signatário</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-muted-foreground">Registro fotográfico</dt>
            <dd>Coletado em {dataHora(assinadoEm)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-40 shrink-0 text-muted-foreground">Código de verificação</dt>
            <dd className="font-mono break-all">{docHash ?? '—'}</dd>
          </div>
        </dl>
        <p className="text-[11px] text-muted-foreground mt-3">
          {conferencia}
        </p>
      </div>

      <button
        onClick={() => window.print()}
        className="no-print w-full flex items-center justify-center gap-2 rounded-lg border bg-card py-2.5 text-sm font-medium text-foreground hover:bg-muted"
      >
        <Printer size={15} /> Imprimir / salvar em PDF
      </button>

      <style>{`@media print { .no-print { display: none } }`}</style>
    </div>
  )
}
