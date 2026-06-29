'use client'
import { useState, useTransition } from 'react'
import { FileCheck, ExternalLink, ClipboardCheck, FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarRascunhoBlingAction, confirmarNFSaidaAction, atualizarRascunhoBlingAction } from '../../vendas/actions'

type Props = {
  motoId: string
  descricao: string
  blingNfeId?: string | null
}

type Etapa = 'inicial' | 'aguardando' | 'manual'

export function NfSaidaButton({ motoId, descricao, blingNfeId }: Props) {
  const urlExistente = blingNfeId ? `https://www.bling.com.br/notas.fiscais.php#edit/${blingNfeId}` : ''

  const [aberto, setAberto] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>('inicial')
  const [blingUrl, setBlingUrl] = useState(urlExistente)
  const [nf, setNf] = useState('')
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()

  function abrir() {
    setErro('')
    setNf('')
    if (blingNfeId) {
      setBlingUrl(urlExistente)
      setEtapa('aguardando')
    } else {
      setBlingUrl('')
      setEtapa('inicial')
    }
    setAberto(true)
  }

  function fechar() {
    if (!pending) setAberto(false)
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
        await confirmarNFSaidaAction(motoId, nf.trim())
        setAberto(false)
      } catch (e: any) {
        setErro(e.message ?? 'Erro ao confirmar NF')
      }
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={abrir}
        className="h-8 gap-1.5 text-xs border-teal-300 text-teal-700 hover:bg-teal-50"
        title="Emitir NF de saída"
      >
        <FileCheck size={14} />
        {blingNfeId ? 'Confirmar NF' : 'NF Saída'}
      </Button>

      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>NF-e de Saída</DialogTitle>
            <p className="text-sm text-slate-500">{descricao}</p>
          </DialogHeader>

          {etapa === 'inicial' && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-slate-600">Como deseja registrar a NF-e?</p>

              <button
                onClick={criarNoBling}
                disabled={pending}
                className="w-full flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                <FileText size={18} className="mt-0.5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    {pending ? 'Criando no Bling…' : 'Gerar rascunho no Bling'}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    MOVA cria a NF no Bling para você revisar e transmitir
                  </p>
                </div>
              </button>

              <button
                onClick={() => setEtapa('manual')}
                disabled={pending}
                className="w-full flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                <ClipboardCheck size={18} className="mt-0.5 text-slate-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-800">Nota já emitida</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    NF gerada fora do MOVA — informe o número para registrar
                  </p>
                </div>
              </button>

              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={fechar} disabled={pending}>Cancelar</Button>
              </DialogFooter>
            </div>
          )}

          {etapa === 'aguardando' && (
            <>
              <div className="space-y-3 py-2">
                {blingNfeId && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                    Rascunho já criado anteriormente. Confirme o número após transmitir no Bling.
                  </div>
                )}
                {!blingNfeId && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                    Rascunho criado! Confira no Bling, transmita a nota e volte aqui para confirmar o número.
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <a href={blingUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                    <ExternalLink size={14} /> Abrir no Bling
                  </a>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={atualizarNoBling}
                    disabled={pending}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    title="Reenviar dados do MOVA para o rascunho no Bling"
                  >
                    <RefreshCw size={13} className={pending ? 'animate-spin' : ''} />
                    {pending ? 'Atualizando…' : 'Atualizar dados no Bling'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nf-bling-input">Número da NF emitida</Label>
                  <Input
                    id="nf-bling-input"
                    value={nf}
                    onChange={e => setNf(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmar()}
                    placeholder="Ex: 001234"
                    autoFocus
                  />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={fechar} disabled={pending}>Cancelar</Button>
                <Button onClick={confirmar} disabled={pending || !nf.trim()}>
                  {pending ? 'Confirmando…' : 'Confirmar NF'}
                </Button>
              </DialogFooter>
            </>
          )}

          {etapa === 'manual' && (
            <>
              <div className="space-y-3 py-2">
                <p className="text-sm text-slate-600">
                  Informe o número da NF já emitida para vincular a esta venda.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="nf-manual-input">Número da NF</Label>
                  <Input
                    id="nf-manual-input"
                    value={nf}
                    onChange={e => setNf(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmar()}
                    placeholder="Ex: 001234"
                    autoFocus
                  />
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEtapa('inicial')} disabled={pending}>Voltar</Button>
                <Button onClick={confirmar} disabled={pending || !nf.trim()}>
                  {pending ? 'Salvando…' : 'Registrar NF'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
