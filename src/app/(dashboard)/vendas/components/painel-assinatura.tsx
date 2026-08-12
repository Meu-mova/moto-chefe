'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, FileSearch, FileSignature, Mail, Printer, RefreshCw, ShieldAlert, Upload, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  listarDocumentosDaVendaAction, enviarDocumentoAssinaturaAction,
  reenviarDocumentoAction, cancelarDocumentoAction, registrarAssinaturaPapelAction,
  liberarNfSemContratoAction, type DocumentoResumo, type LiberacaoNf,
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

export function PainelAssinatura(
  { vendaId, aberto, papel }: { vendaId: string; aberto: boolean; papel: string },
) {
  // O dossiê traz a foto do cliente — só admin geral e sócio abrem.
  const podeVerDossie = ['admin_geral', 'admin_socio'].includes(papel)
  // Autorizar NF sem contrato assinado é decisão de gestor.
  const podeAutorizar = ['admin_geral', 'admin_socio'].includes(papel)
  const router = useRouter()
  const [docs, setDocs] = useState<DocumentoResumo[] | null>(null)
  const [base, setBase] = useState('')
  const [liberacao, setLiberacao] = useState<LiberacaoNf | null>(null)
  const [autorizando, setAutorizando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!aberto) return
    listarDocumentosDaVendaAction(vendaId)
      .then(r => { setDocs(r.documentos); setBase(r.baseUrl); setLiberacao(r.liberacao) })
  }, [aberto, vendaId])

  function recarregar() {
    listarDocumentosDaVendaAction(vendaId)
      .then(r => { setDocs(r.documentos); setBase(r.baseUrl); setLiberacao(r.liberacao) })
    router.refresh()
  }

  function autorizar() {
    startTransition(async () => {
      const r = await liberarNfSemContratoAction(vendaId, motivo)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Emissão de NF autorizada — o motivo ficou registrado')
      setAutorizando(false)
      setMotivo('')
      recarregar()
    })
  }

  // Contrato assinado (por qualquer caminho) dispensa autorização.
  const contratoAssinado = (docs ?? []).some(
    d => d.tipo === 'contrato_venda' && d.status === 'assinado',
  )

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

  // Cria o documento e manda o convite (com o link) por e-mail para o cliente.
  // O código de 6 dígitos vai por e-mail depois, quando ele abrir e pedir.
  function enviarPorEmail(tipo: TipoDocumento) {
    startTransition(async () => {
      const r = await enviarDocumentoAssinaturaAction(vendaId, tipo)
      if (r.ok) toast.success('Enviado por e-mail ao cliente')
      else {
        toast.error(r.error)
        // Convite falhou mas o documento existe: o link volta para mandar à mão.
        if (r.url) toast.info(r.url, { duration: 20000 })
      }
      recarregar()
    })
  }

  // Alternativa: cria o documento sem enviar e-mail e copia o link, para o adm
  // mandar por outro canal (cliente sem e-mail, e-mail errado, etc.).
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

  function registrarPapel(tipo: TipoDocumento, arquivo: File) {
    startTransition(async () => {
      const form = new FormData()
      form.append('via', arquivo)
      const r = await registrarAssinaturaPapelAction(vendaId, tipo, form)
      if (r.ok) toast.success('Assinatura em papel registrada — documento consta como assinado')
      else toast.error(r.error)
      recarregar()
    })
  }

  function reenviar(id: string) {
    startTransition(async () => {
      const r = await reenviarDocumentoAction(id)
      if (!r.ok) { toast.error(r.error); recarregar(); return }
      try {
        await navigator.clipboard.writeText(r.url)
        toast.success('Link reativado e copiado — envie ao cliente')
      } catch {
        toast.info(r.url, { duration: 20000 })
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
                    onClick={() => enviarPorEmail(tipo)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    title="Cria o documento e envia o link por e-mail ao cliente"
                  >
                    <Mail size={12} /> Enviar por e-mail
                  </button>
                  <button
                    onClick={() => gerarLink(tipo)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    title="Cria o documento e copia o link, sem enviar e-mail — para mandar por outro canal"
                  >
                    <Copy size={12} /> Copiar link
                  </button>
                </>
              )}

              {doc && estaVivo(doc) && !expirado && (
                <>
                  <button
                    onClick={() => reenviar(doc.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    title="Renova o prazo do link (+7 dias) e copia — não envia nada"
                  >
                    <RefreshCw size={12} /> Renovar link
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

              {/* Cliente sem acesso digital: imprime, assina à caneta na loja,
                  e a via digitalizada volta pelo botão ao lado. */}
              {doc?.status !== 'assinado' && (
                <>
                  <a
                    href={`/vendas/${vendaId}/documento/${tipo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    title="Via em papel, para o cliente assinar à caneta na loja"
                  >
                    <Printer size={12} /> Imprimir
                  </a>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 ${pending ? 'opacity-50' : ''}`}
                    title="Anexar a foto ou o PDF do documento já assinado no papel"
                  >
                    <Upload size={12} /> Registrar assinatura em papel
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      disabled={pending}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) registrarPapel(tipo, f)
                      }}
                    />
                  </label>
                </>
              )}

              {doc?.status === 'assinado' && podeVerDossie && (
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

      {/* A exceção mora aqui, ao lado do status, e não escondida no dialog de
          emissão da NF: quem autoriza é o gestor, e ele olha esta tela. */}
      {docs !== null && (
        contratoAssinado ? null : liberacao?.liberadaEm ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <p className="text-xs font-medium text-sky-800">
              NF autorizada sem assinatura do contrato
            </p>
            <p className="text-[11px] text-sky-700 mt-0.5">
              {liberacao.por ? `${liberacao.por} · ` : ''}
              {new Date(liberacao.liberadaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
            {liberacao.motivo && (
              <p className="text-[11px] text-sky-900 mt-1 italic">“{liberacao.motivo}”</p>
            )}
          </div>
        ) : podeAutorizar ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-600">
              A emissão da NF está bloqueada até o contrato ser assinado.
            </p>
            {!autorizando ? (
              <button
                onClick={() => setAutorizando(true)}
                className="mt-1.5 inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
              >
                <ShieldAlert size={12} /> Autorizar emissão sem assinatura
              </button>
            ) : (
              <div className="mt-2 space-y-1.5">
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ex: cliente sem celular; contrato assinado em papel e arquivado na loja"
                  className="w-full rounded-md border px-2 py-1.5 text-xs"
                />
                <p className="text-[11px] text-slate-400">
                  Fica registrado com o seu nome e a data. Mínimo de 10 caracteres.
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setAutorizando(false); setMotivo('') }}
                    disabled={pending}
                    className="rounded border px-2 py-1 text-xs text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={autorizar}
                    disabled={pending || motivo.trim().length < 10}
                    className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:bg-slate-300"
                  >
                    {pending ? 'Autorizando…' : 'Confirmar autorização'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null
      )}

      <p className="text-[11px] text-slate-400">
        O link vai por e-mail ao cliente (ou copie e mande por outro canal). O código de 6
        dígitos também vai por e-mail quando ele abrir — é o que garante que foi ele quem assinou.
      </p>
    </div>
  )
}
