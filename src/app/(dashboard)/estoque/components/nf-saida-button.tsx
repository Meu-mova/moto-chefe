'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, FileCheck, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarRascunhoBlingAction, confirmarNFSaidaAction, atualizarRascunhoBlingAction } from '../../vendas/actions'
import { verificarBloqueioNfAction, liberarNfSemContratoAction } from '../../vendas/assinatura-actions'
import { nfePropriaDisponivelAction } from '../../vendas/nfe-propria-actions'
import { NfePropriaPainel } from './nfe-propria-painel'

type Props = {
  motoId: string
  descricao: string
  blingNfeId?: string | null
  /** Troca o botão padrão por outro (ex.: os botões do painel da venda). */
  gatilho?: (abrir: () => void) => React.ReactNode
  /**
   * Abre assim que monta e avisa quando fecha. O Showroom usa isto para manter o
   * diálogo fora da linha: na produção a nota autorizada fatura a venda, o
   * revalidatePath tira a moto vendida da lista, e o diálogo precisa continuar.
   */
  abrirAoMontar?: boolean
  onFechado?: () => void
}

/** O botão da linha que abre a NF de saída. */
export function NfSaidaGatilho({ blingNfeId, onClick }: { blingNfeId?: string | null; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      className="h-8 gap-1.5 text-xs border-info/50 text-info hover:bg-info/10"
      title="Emitir NF de saída"
    >
      <FileCheck size={14} />
      {blingNfeId ? 'Confirmar NF' : 'NF Saída'}
    </Button>
  )
}

type Etapa = 'verificando' | 'inicial' | 'aguardando' | 'manual' | 'bloqueado' | 'propria'

export function NfSaidaButton({ motoId, descricao, blingNfeId, gatilho, abrirAoMontar, onFechado }: Props) {
  const urlExistente = blingNfeId ? `https://www.bling.com.br/notas.fiscais.php#edit/${blingNfeId}` : ''

  const [aberto, setAberto] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>('inicial')
  const [blingUrl, setBlingUrl] = useState(urlExistente)
  const [nf, setNf] = useState('')
  const [erro, setErro] = useState('')
  const [bloqueio, setBloqueio] = useState<string | null>(null)
  const [vendaId, setVendaId] = useState<string | null>(null)
  const [podeLiberar, setPodeLiberar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [propria, setPropria] = useState<{ disponivel: boolean; ambiente: 'Homologacao' | 'Producao' | null }>({ disponivel: false, ambiente: null })
  const [outras, setOutras] = useState(false)
  const [pending, startTransition] = useTransition()
  // A transmissão roda no painel; enquanto ela corre, nem Esc fecha o diálogo.
  const [ocupado, setOcupado] = useState(false)

  // A trava é consultada ao abrir, não na listagem: seria uma consulta por
  // linha da tabela de estoque. A action de emissão recusa de qualquer forma —
  // isto é o que faz o vendedor saber ANTES de tentar.
  function abrir() {
    setErro('')
    setNf('')
    setOutras(false)
    setAberto(true)
    // 'verificando' até saber da trava — senão o vendedor veria por um instante
    // a tela normal e clicaria num caminho que a action vai recusar.
    setEtapa('verificando')
    startTransition(async () => {
      const [r, np] = await Promise.all([verificarBloqueioNfAction(motoId), nfePropriaDisponivelAction(motoId)])
      setPropria(np)
      setVendaId(r.vendaId)
      setPodeLiberar(r.podeLiberar)
      if (r.bloqueio) {
        setBloqueio(r.bloqueio)
        setEtapa('bloqueado')
        return
      }
      setBloqueio(null)
      if (blingNfeId) {
        setBlingUrl(urlExistente)
        setEtapa('aguardando')
      } else {
        setBlingUrl('')
        // Quase toda nota sai pelo MOVA: abre direto na conferência; Bling e nota
        // já emitida ficam em "Emitir de outro jeito".
        setEtapa(np.disponivel ? 'propria' : 'inicial')
      }
    })
  }

  function liberar() {
    if (!vendaId) return
    setErro('')
    startTransition(async () => {
      const r = await liberarNfSemContratoAction(vendaId, motivo)
      if (!r.ok) { setErro(r.error); return }
      setBloqueio(null)
      setMotivo('')
      setEtapa(blingNfeId ? 'aguardando' : propria.disponivel ? 'propria' : 'inicial')
      if (blingNfeId) setBlingUrl(urlExistente)
    })
  }

  function fechar() {
    if (!pending && !ocupado) setAberto(false)
  }

  function criarNoBling() {
    setErro('')
    startTransition(async () => {
      const resultado = await criarRascunhoBlingAction(motoId)
      if (!resultado.ok) {
        setErro(resultado.error)
        return
      }
      setBlingUrl(resultado.url)
      setEtapa('aguardando')
      window.open(resultado.url, '_blank')
    })
  }

  function atualizarNoBling() {
    setErro('')
    startTransition(async () => {
      const resultado = await atualizarRascunhoBlingAction(motoId)
      if (!resultado.ok) {
        setErro(resultado.error)
        return
      }
      setBlingUrl(resultado.url)
      window.open(resultado.url, '_blank')
    })
  }

  function confirmar() {
    if (!nf.trim()) { setErro('Informe o número da NF'); return }
    setErro('')
    startTransition(async () => {
      try {
        const r = await confirmarNFSaidaAction(motoId, nf.trim())
        if (!r.ok) { setErro(r.erro); return }
        window.open(`/vendas/${r.dados.vendaId}/checklist-entrega`, '_blank')
        window.open(`/vendas/${r.dados.vendaId}/certificado-bateria`, '_blank')
        setAberto(false)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao confirmar NF')
      }
    })
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (abrirAoMontar) abrir() }, [])
  const abriu = useRef(false)
  useEffect(() => {
    if (aberto) abriu.current = true
    else if (abriu.current) onFechado?.()
  }, [aberto, onFechado])

  return (
    <>
      {gatilho ? gatilho(abrir) : <NfSaidaGatilho blingNfeId={blingNfeId} onClick={abrir} />}

      <Dialog open={aberto} onOpenChange={fechar} disablePointerDismissal>
        <DialogContent
          showCloseButton={false}
          // Emissão pelo MOVA: altura fixa, para as etapas do ciclomotor não mudarem o tamanho a cada passo.
          className={cn(
            'flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0',
            etapa === 'propria' && 'sm:h-[90vh] sm:max-w-2xl',
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-2 py-2 sm:px-4">
            <button type="button" onClick={fechar} aria-label="Voltar" className="rounded-md p-2 text-foreground hover:bg-muted sm:hidden">
              <ArrowLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold">NF de saída</DialogTitle>
              <DialogDescription className="truncate text-xs">{descricao}</DialogDescription>
            </div>
            <button type="button" onClick={fechar} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted sm:block">
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-4">
          {etapa === 'verificando' && (
            <p className="py-10 text-center text-sm text-muted-foreground">Verificando o contrato desta venda…</p>
          )}

          {etapa === 'bloqueado' && (
            <div className="space-y-4 pb-4">
              <p className="border-l-2 border-l-warning pl-3">{bloqueio}</p>

              {podeLiberar ? (
                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="motivo-liberacao">Liberar sem assinatura: por que?</Label>
                  <textarea
                    id="motivo-liberacao"
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    rows={3}
                    placeholder="Ex.: cliente sem WhatsApp, contrato assinado em papel e arquivado na loja"
                    className="w-full rounded-lg border border-input bg-background p-2 text-base sm:text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Fica registrado com seu nome e a data. Mínimo de 10 caracteres.</p>
                  {erro && <p className="text-sm text-destructive">{erro}</p>}
                  <Button onClick={liberar} disabled={pending || motivo.trim().length < 10} className="h-11 w-full">
                    {pending ? 'Liberando…' : 'Liberar e continuar'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Se o cliente não puder assinar, peça a um sócio para liberar.</p>
              )}
            </div>
          )}

          {etapa === 'inicial' && (
            <div className="space-y-2 pb-4">
              <p className="mb-3 font-medium">Como registrar esta nota?</p>
              {propria.disponivel && (
                <Opcao titulo={`Emitir pelo MOVA${propria.ambiente === 'Homologacao' ? ' (teste)' : ''}`} descricao="Confere a nota aqui e transmite direto para a SEFAZ" onClick={() => { setErro(''); setEtapa('propria') }} disabled={pending} />
              )}
              <Opcao titulo={pending ? 'Criando no Bling…' : 'Gerar rascunho no Bling'} descricao="O MOVA cria a NF no Bling para você revisar e transmitir" onClick={criarNoBling} disabled={pending} />
              <Opcao titulo="Nota já emitida" descricao="NF gerada fora do MOVA: informe o número para registrar" onClick={() => setEtapa('manual')} disabled={pending} />
              {erro && <p className="text-sm text-destructive">{erro}</p>}
            </div>
          )}

          {etapa === 'aguardando' && (
            <div className="space-y-4 pb-4">
              <p className="border-l-2 border-l-warning pl-3 text-sm">
                {blingNfeId
                  ? 'Rascunho já criado antes. Confirme o número depois de transmitir no Bling.'
                  : 'Rascunho criado. Confira no Bling, transmita a nota e volte aqui com o número.'}
              </p>
              <a href={blingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full gap-2')}>
                <ExternalLink className="size-4" /> Abrir no Bling
              </a>
              <button
                type="button"
                onClick={atualizarNoBling}
                disabled={pending}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                title="Reenviar dados do MOVA para o rascunho no Bling"
              >
                <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} />
                {pending ? 'Atualizando…' : 'Mandar os dados do MOVA de novo ao rascunho'}
              </button>
              <div className="space-y-1.5">
                <Label htmlFor="nf-bling-input">Número da NF emitida no Bling</Label>
                <Input
                  id="nf-bling-input"
                  inputMode="numeric"
                  value={nf}
                  onChange={e => setNf(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmar()}
                  placeholder="Ex: 001234"
                  className="h-11"
                />
              </div>
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              <Button onClick={confirmar} disabled={pending || !nf.trim()} className="h-11 w-full">
                {pending ? 'Confirmando…' : 'Confirmar NF'}
              </Button>
              {/* Venda que ficou com rascunho no Bling antes da virada também
                  pode sair pelo MOVA — desde que o rascunho NÃO tenha sido
                  transmitido, senão são duas notas para a mesma moto. */}
              {propria.disponivel && (
                <Opcao
                  titulo={`Emitir pelo MOVA em vez do Bling${propria.ambiente === 'Homologacao' ? ' (teste)' : ''}`}
                  descricao="Só se o rascunho do Bling NÃO foi transmitido — senão a moto fica com duas notas"
                  onClick={() => { setErro(''); setEtapa('propria') }}
                  disabled={pending}
                />
              )}
            </div>
          )}

          {etapa === 'propria' && (
            <NfePropriaPainel
              motoId={motoId}
              onOcupado={setOcupado}
              onVoltar={() => (blingUrl ? setEtapa('aguardando') : fechar())}
              outrasFormas={!blingUrl && (
                <div className="border-t border-border">
                  <button type="button" onClick={() => setOutras(!outras)} aria-expanded={outras} className="flex w-full items-center justify-between py-3 text-sm text-muted-foreground">
                    Emitir de outro jeito (Bling ou nota já emitida)
                    <ChevronDown className={cn('size-4 transition-transform', !outras && '-rotate-90')} />
                  </button>
                  {outras && (
                    <div className="grid grid-cols-2 gap-2 pb-3">
                      <Button variant="outline" onClick={criarNoBling} disabled={pending} className="h-11">
                        {pending ? 'Criando…' : 'Rascunho no Bling'}
                      </Button>
                      <Button variant="outline" onClick={() => setEtapa('manual')} disabled={pending} className="h-11">Nota já emitida</Button>
                    </div>
                  )}
                  {erro && <p className="pb-3 text-sm text-destructive">{erro}</p>}
                </div>
              )}
            />
          )}

          {etapa === 'manual' && (
            <div className="space-y-4 pb-4">
              <p className="text-sm text-muted-foreground">
                Para nota emitida fora do MOVA. Ela fica só registrada: o MOVA não acompanha o status nem cancela.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="nf-manual-input">Número da NF</Label>
                <Input
                  id="nf-manual-input"
                  inputMode="numeric"
                  value={nf}
                  onChange={e => setNf(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmar()}
                  placeholder="Ex: 001234"
                  className="h-11"
                  autoFocus
                />
              </div>
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              <Button onClick={confirmar} disabled={pending || !nf.trim()} className="h-11 w-full">
                {pending ? 'Salvando…' : 'Registrar NF'}
              </Button>
              <Button variant="outline" onClick={() => setEtapa(propria.disponivel ? 'propria' : 'inicial')} disabled={pending} className="h-11 w-full">
                Voltar
              </Button>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Opcao({ titulo, descricao, onClick, disabled }: { titulo: string; descricao: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-border p-4 text-left hover:bg-muted disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{titulo}</span>
        <span className="block text-sm text-muted-foreground">{descricao}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  )
}
