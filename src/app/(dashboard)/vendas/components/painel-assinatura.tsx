'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, FileSearch, Mail, MoreHorizontal, Printer, RefreshCw, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
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

type Situacao = 'nada' | 'cancelado' | 'aguardando' | 'abriu' | 'expirado' | 'assinado'

// Uma tabela só para texto, cor e borda de cada situação do documento.
const SITUACAO: Record<Situacao, { rotulo: string; cor: string; borda: string }> = {
  nada:       { rotulo: 'Não enviado',          cor: 'text-muted-foreground', borda: 'border-l-border' },
  cancelado:  { rotulo: 'Envio cancelado',      cor: 'text-muted-foreground', borda: 'border-l-border' },
  aguardando: { rotulo: 'Aguardando o cliente', cor: 'text-warning',          borda: 'border-l-warning' },
  abriu:      { rotulo: 'Cliente abriu o link', cor: 'text-warning',          borda: 'border-l-warning' },
  expirado:   { rotulo: 'Link expirado',        cor: 'text-destructive',      borda: 'border-l-destructive' },
  assinado:   { rotulo: 'Assinado',             cor: 'text-primary-text',     borda: 'border-l-primary' },
}

function situacaoDe(doc: DocumentoResumo | null, expirado: boolean): Situacao {
  if (doc?.status === 'assinado') return 'assinado'
  if (expirado) return 'expirado'
  if (doc?.status === 'visualizado') return 'abriu'
  if (doc?.status === 'pendente') return 'aguardando'
  if (doc?.status === 'cancelado') return 'cancelado'
  return 'nada'
}

const dataHora = (d: string | Date) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

const botaoPrincipal = 'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50'
const botaoSecundario = 'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50'
const itemMenu = 'flex w-full items-start gap-3 border-t border-border px-4 py-3 text-left hover:bg-muted disabled:opacity-50'

function ItemMenu({ icone, titulo, descricao, perigo }: { icone?: React.ReactNode; titulo: string; descricao: string; perigo?: boolean }) {
  return (
    <>
      <span className="mt-0.5 text-muted-foreground">{icone}</span>
      <span>
        <span className={cn('block text-sm font-medium', perigo ? 'text-destructive' : 'text-foreground')}>{titulo}</span>
        <span className="block text-xs text-muted-foreground">{descricao}</span>
      </span>
    </>
  )
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
  const [menu, setMenu] = useState<TipoDocumento | null>(null)

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

  // O mais recente do tipo: assinado manda, senão o vivo, senão o último.
  function docDoTipo(tipo: TipoDocumento) {
    const daVez = (docs ?? []).filter(d => d.tipo === tipo)
    const doc = daVez.find(d => d.status === 'assinado') ?? daVez.find(estaVivo) ?? daVez[0] ?? null
    const expirado = !!doc && estaVivo(doc) && new Date(doc.expiraEm) < new Date()
    return { doc, expirado }
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

  const menuDoc = TIPOS.find(t => t.tipo === menu)

  return (
    <div className="space-y-3">
      {docs === null && <p className="py-6 text-center text-muted-foreground">Carregando documentos…</p>}

      {docs !== null && TIPOS.map(({ tipo, label }) => {
        const { doc, expirado } = docDoTipo(tipo)
        const sit = situacaoDe(doc, expirado)
        const vivo = !!doc && estaVivo(doc) && !expirado
        // Uma ação principal por situação; o resto fica no "Mais opções".
        const principal =
          sit === 'nada' || sit === 'expirado' || sit === 'cancelado'
            ? { texto: sit === 'expirado' ? 'Enviar de novo por e-mail' : 'Enviar por e-mail ao cliente', acao: () => enviarPorEmail(tipo) }
            : null
        return (
          <section key={tipo} className={cn('rounded-lg border border-l-4 border-border bg-card p-4', SITUACAO[sit].borda)}>
            <h3 className="font-semibold">{label}</h3>
            <p className={cn('text-sm font-medium', SITUACAO[sit].cor)}>{SITUACAO[sit].rotulo}</p>
            {doc && (sit === 'aguardando' || sit === 'abriu' || sit === 'expirado') && (
              <p className="text-xs text-muted-foreground">
                {sit === 'expirado' ? 'Expirou em' : 'Expira em'} {dataHora(doc.expiraEm)}
              </p>
            )}

            {/* O Resend avisou por webhook que o e-mail voltou (bounce/spam):
                o cliente NÃO recebeu, mesmo o painel tendo dito "enviado". */}
            {doc?.emailVoltou && sit !== 'assinado' && (
              <p className="mt-3 border-l-2 border-l-destructive pl-3 text-sm text-destructive">
                O e-mail voltou: o cliente não recebeu. Confira o e-mail no cadastro da venda e envie de novo, ou copie o link.
              </p>
            )}

            {/* O link à vista, não só atrás do botão: quando o WhatsApp falha, o
                vendedor precisa enxergar e mandar por outro canal na hora. */}
            {vivo && base && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted py-1 pr-1 pl-3">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground select-all">{base}/assinar/{doc.token}</span>
                <button type="button" onClick={() => copiar(doc.token)} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground hover:bg-background">
                  <Copy className="size-4" /> Copiar
                </button>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              {principal && (
                <button type="button" onClick={principal.acao} disabled={pending} className={botaoPrincipal}>
                  <Mail className="size-4" /> {principal.texto}
                </button>
              )}
              {sit === 'assinado' && podeVerDossie && doc && (
                <a
                  href={`/assinaturas/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(botaoSecundario, 'flex-1')}
                  title="Documento assinado, foto do cliente, hash e trilha de eventos — é o que se leva a uma contestação"
                >
                  <FileSearch className="size-4" /> Ver dossiê
                </a>
              )}
              {(sit !== 'assinado' || doc) && (
                <button type="button" onClick={() => setMenu(tipo)} className={cn(botaoSecundario, !principal && 'flex-1')} aria-label={`Mais opções: ${label}`}>
                  <MoreHorizontal className="size-5" />{!principal && 'Mais opções'}
                </button>
              )}
            </div>
          </section>
        )
      })}

      <Sheet open={!!menuDoc} onOpenChange={o => !o && setMenu(null)}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 pb-6 sm:mx-auto sm:max-w-md">
          {menuDoc && (() => {
            const { tipo, label } = menuDoc
            const { doc, expirado } = docDoTipo(tipo)
            const vivo = !!doc && estaVivo(doc) && !expirado
            const fechar = () => setMenu(null)
            return (
              <>
                <SheetTitle className="px-4 py-4 text-base">{label}</SheetTitle>
                {!vivo && doc?.status !== 'assinado' && (
                  <button type="button" disabled={pending} onClick={() => { fechar(); gerarLink(tipo) }} className={itemMenu}>
                    <ItemMenu icone={<Copy className="size-4" />} titulo="Criar link sem enviar e-mail" descricao="Copia o link para mandar por WhatsApp ou outro canal" />
                  </button>
                )}
                {vivo && (
                  <button type="button" disabled={pending} onClick={() => { fechar(); reenviar(doc.id) }} className={itemMenu}>
                    <ItemMenu icone={<RefreshCw className="size-4" />} titulo="Renovar prazo do link" descricao="Mais 7 dias e copia o link. Não envia nada ao cliente" />
                  </button>
                )}
                {doc && !vivo && doc.status !== 'cancelado' && (
                  <button type="button" onClick={() => { fechar(); copiar(doc.token) }} className={itemMenu}>
                    <ItemMenu icone={<Copy className="size-4" />} titulo="Copiar link do documento" descricao={doc.status === 'assinado' ? 'O cliente vê o documento já assinado' : 'O link expirou: o cliente não consegue mais assinar por ele'} />
                  </button>
                )}
                {/* Cliente sem acesso digital: imprime, assina à caneta na loja,
                    e a via digitalizada volta pelo item de baixo. */}
                {doc?.status !== 'assinado' && (<>
                <a href={`/vendas/${vendaId}/documento/${tipo}`} target="_blank" rel="noopener noreferrer" onClick={fechar} className={itemMenu}>
                  <ItemMenu icone={<Printer className="size-4" />} titulo="Imprimir para assinar à caneta" descricao="Para o cliente sem celular ou sem e-mail" />
                </a>
                <label className={cn(itemMenu, 'cursor-pointer', pending && 'opacity-50')}>
                  <ItemMenu icone={<Upload className="size-4" />} titulo="Anexar via assinada em papel" descricao="Foto ou PDF. O documento passa a constar como assinado" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    disabled={pending}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) { fechar(); registrarPapel(tipo, f) }
                    }}
                  />
                </label>
                </>)}
                {vivo && (
                  <button type="button" disabled={pending} onClick={() => { fechar(); cancelar(doc.id) }} className={itemMenu}>
                    <ItemMenu icone={<X className="size-4 text-destructive" />} titulo="Cancelar envio" descricao="O link para de funcionar" perigo />
                  </button>
                )}
              </>
            )
          })()}
        </SheetContent>
      </Sheet>

      {/* A exceção mora aqui, ao lado do status, e não escondida no dialog de
          emissão da NF: quem autoriza é o gestor, e ele olha esta tela. */}
      {docs !== null && !contratoAssinado && (
        liberacao?.liberadaEm ? (
          <div className="border-l-2 border-l-primary pl-3 text-sm">
            <p className="font-medium">NF liberada sem o contrato assinado</p>
            <p className="text-muted-foreground">
              {liberacao.por ? `${liberacao.por} · ` : ''}{dataHora(liberacao.liberadaEm)}
            </p>
            {liberacao.motivo && <p className="mt-1 text-muted-foreground">“{liberacao.motivo}”</p>}
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4 text-sm">
            <p className="font-medium">A NF de saída só sai depois do contrato assinado</p>
            {!podeAutorizar && <p className="mt-1 text-muted-foreground">Se o cliente não puder assinar, peça a um sócio para liberar.</p>}
            {podeAutorizar && !autorizando && (
              <button type="button" onClick={() => setAutorizando(true)} className={cn(botaoSecundario, 'mt-3 w-full')}>
                Liberar NF sem assinatura
              </button>
            )}
            {podeAutorizar && autorizando && (
              <div className="mt-3 space-y-2">
                <label htmlFor="motivo-liberacao" className="block text-muted-foreground">Por que liberar? Fica registrado com seu nome e a data.</label>
                <textarea
                  id="motivo-liberacao"
                  rows={3}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ex.: cliente sem celular; assinou em papel, arquivado na loja"
                  className="w-full rounded-lg border border-input bg-background p-2 text-base sm:text-sm"
                />
                <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setAutorizando(false); setMotivo('') }} disabled={pending} className={cn(botaoSecundario, 'flex-1')}>
                    Voltar
                  </button>
                  <button type="button" onClick={autorizar} disabled={pending || motivo.trim().length < 10} className={botaoPrincipal}>
                    {pending ? 'Liberando…' : 'Liberar NF'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      <p className="text-xs text-muted-foreground">
        O cliente recebe o link por e-mail (ou você copia e manda por outro canal). Ao abrir, ele recebe
        um código de 6 dígitos por e-mail: é o que garante que foi ele quem assinou.
      </p>
    </div>
  )
}
