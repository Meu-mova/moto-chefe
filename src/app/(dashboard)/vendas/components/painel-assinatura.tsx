'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, FileSearch, FileSignature, Send, RefreshCw, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  listarDocumentosDaVendaAction, enviarDocumentoAssinaturaAction,
  reenviarDocumentoAction, cancelarDocumentoAction, type DocumentoResumo,
} from '../assinatura-actions'
import type { TipoDocumento } from '@/lib/assinatura/documento'

const TIPOS: { tipo: TipoDocumento; label: string }[] = [
  { tipo: 'contrato_venda', label: 'Contrato de venda' },
  { tipo: 'checklist_entrega', label: 'Checklist de entrega' },
]

function estaVivo(d: DocumentoResumo): boolean {
  return d.status === 'pendente' || d.status === 'visualizado'
}

function Badge({ status, expirado }: { status: string; expirado: boolean }) {
  if (status === 'assinado') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><Check size={11} /> Assinado</span>
  }
  if (expirado) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Expirado</span>
  }
  if (status === 'pendente' || status === 'visualizado') {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      {status === 'visualizado' ? 'Cliente abriu o link' : 'Aguardando assinatura'}
    </span>
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Não enviado</span>
}

export function PainelAssinatura({ vendaId, aberto }: { vendaId: string; aberto: boolean }) {
  const router = useRouter()
  const [docs, setDocs] = useState<DocumentoResumo[] | null>(null)
  const [base, setBase] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!aberto) return
    listarDocumentosDaVendaAction(vendaId).then(r => { setDocs(r.documentos); setBase(r.baseUrl) })
  }, [aberto, vendaId])

  function recarregar() {
    listarDocumentosDaVendaAction(vendaId).then(r => { setDocs(r.documentos); setBase(r.baseUrl) })
    router.refresh()
  }

  async function copiar(token: string) {
    const url = `${base}/assinar/${token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado — pode enviar por qualquer canal')
    } catch {
      // clipboard exige contexto seguro; no fallback o vendedor copia da tela.
      toast.info(url, { duration: 15000 })
    }
  }

  function enviar(tipo: TipoDocumento) {
    startTransition(async () => {
      const r = await enviarDocumentoAssinaturaAction(vendaId, tipo)
      if (r.ok) toast.success('Documento enviado no WhatsApp do cliente')
      else {
        toast.error(r.error)
        // Envio falhou mas o documento existe: o link volta para mandar à mão.
        if (r.url) toast.info(r.url, { duration: 20000 })
      }
      recarregar()
    })
  }

  // Gera o documento sem disparar o WhatsApp e já entrega o link. Serve para
  // mandar por outro canal ou entregar o celular ao cliente no balcão.
  function gerarLink(tipo: TipoDocumento) {
    startTransition(async () => {
      const r = await enviarDocumentoAssinaturaAction(vendaId, tipo, false)
      if (!r.ok) { toast.error(r.error); recarregar(); return }
      try {
        await navigator.clipboard.writeText(r.url)
        toast.success('Link criado e copiado — envie por onde preferir')
      } catch {
        toast.info(r.url, { duration: 20000 })
      }
      recarregar()
    })
  }

  function reenviar(id: string) {
    startTransition(async () => {
      const r = await reenviarDocumentoAction(id)
      if (r.ok) toast.success('Link reenviado')
      else {
        toast.error(r.error)
        if (r.url) toast.info(r.url, { duration: 20000 })
      }
      recarregar()
    })
  }

  function cancelar(id: string) {
    startTransition(async () => {
      const r = await cancelarDocumentoAction(id)
      if (r.ok) toast.success('Documento cancelado')
      else toast.error(r.error)
      recarregar()
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
        <FileSignature size={13} /> Assinatura digital
      </p>

      {docs === null && <p className="text-xs text-slate-400">Carregando…</p>}

      {docs !== null && TIPOS.map(({ tipo, label }) => {
        // O mais recente do tipo: assinado manda, senão o vivo, senão o último.
        const daVez = docs.filter(d => d.tipo === tipo)
        const doc = daVez.find(d => d.status === 'assinado') ?? daVez.find(estaVivo) ?? daVez[0] ?? null
        const expirado = !!doc && estaVivo(doc) && new Date(doc.expiraEm) < new Date()

        return (
          <div key={tipo} className="rounded-lg border bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-700">{label}</span>
              <Badge status={doc?.status ?? 'nao_enviado'} expirado={expirado} />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {(!doc || doc.status === 'cancelado' || expirado) && doc?.status !== 'assinado' && (
                <>
                  <button
                    onClick={() => enviar(tipo)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Send size={12} /> Enviar para assinatura
                  </button>
                  {/* Sem documento ainda não existe token, então o link precisa
                      ser criado na hora. Gera sem disparar o WhatsApp. */}
                  <button
                    onClick={() => gerarLink(tipo)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    title="Cria o documento e copia o link, sem mandar no WhatsApp"
                  >
                    <Copy size={12} /> Gerar e copiar link
                  </button>
                </>
              )}

              {doc && estaVivo(doc) && !expirado && (
                <>
                  <button
                    onClick={() => reenviar(doc.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw size={12} /> Reenviar
                  </button>
                  <button
                    onClick={() => cancelar(doc.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <X size={12} /> Cancelar
                  </button>
                </>
              )}

              {doc && (
                <button
                  onClick={() => copiar(doc.token)}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  title="Copiar o link para enviar por outro canal"
                >
                  <Copy size={12} /> Copiar link
                </button>
              )}

              {doc?.status === 'assinado' && (
                <a
                  href={`/assinaturas/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                  title="Documento assinado, foto do cliente, hash e trilha de eventos — é o que se leva a uma contestação"
                >
                  <FileSearch size={12} /> Ver dossiê
                </a>
              )}
            </div>

            {/* O link à vista, não só atrás do botão: quando o WhatsApp falha, o
                vendedor precisa enxergar e mandar por outro canal na hora. */}
            {doc && doc.status !== 'cancelado' && base && (
              <p className="mt-2 select-all break-all rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
                {base}/assinar/{doc.token}
              </p>
            )}
          </div>
        )
      })}

      <p className="text-[11px] text-slate-400">
        O link pode ser enviado por qualquer canal, mas o código de 6 dígitos sempre vai pelo
        WhatsApp cadastrado do cliente.
      </p>
    </div>
  )
}
