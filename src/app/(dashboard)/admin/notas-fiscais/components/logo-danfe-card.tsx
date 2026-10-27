'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { emitenteDaSimulacao, type DadosEmitente } from '@/lib/logo-danfe-tela'
import { enviarLogoDanfeAction, previaLogoDanfeAction } from '../actions'

export type LinhaLogo = DadosEmitente & {
  id: string
  temNg: boolean
  logoEnviadaEm: string | null
  logoEnviadaPor: string | null
  /** Link assinado de vida curta da cópia no bucket privado. */
  logoUrl: string | null
}

type Previa = { dataUrl: string; kb: number; original: { url: string; kb: number } }

const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function LogoDanfeCard({ grupos }: { grupos: LinhaLogo[] }) {
  // O diálogo vive aqui, fora das linhas: o revalidatePath do envio não o desmonta.
  const [grupoAberto, setGrupoAberto] = useState<LinhaLogo | null>(null)
  if (grupos.length === 0) return null

  return (
    <div className="bg-card rounded-xl border shadow-sm p-5 space-y-3">
      <div>
        <h2 className="font-semibold">Logo no DANFE</h2>
        <p className="text-sm text-muted-foreground">Sai no quadro do emitente das notas emitidas depois do envio.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 font-medium">Grupo</th>
            <th className="font-medium">Logo atual</th>
            <th className="font-medium">Enviada em</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => (
            <tr key={g.id} className="border-t">
              <td className="py-2.5">{g.nome}</td>
              <td>
                {g.logoUrl
                  ? <img src={g.logoUrl} alt={`Logo de ${g.nome}`} className="h-8 w-auto" />
                  : <span className="text-muted-foreground">Nenhuma</span>}
              </td>
              <td className="text-muted-foreground">
                {g.logoEnviadaEm ? `${fmtData(g.logoEnviadaEm)}${g.logoEnviadaPor ? ` por ${g.logoEnviadaPor}` : ''}` : '-'}
              </td>
              <td className="text-right">
                {g.temNg
                  ? <Button size="sm" variant={g.logoUrl ? 'secondary' : 'default'} onClick={() => setGrupoAberto(g)}>
                      {g.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                    </Button>
                  : <span className="text-xs text-muted-foreground">Configure a Nota Gateway antes</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <EnviarLogoDialog grupo={grupoAberto} onFechar={() => setGrupoAberto(null)} />
    </div>
  )
}

function EnviarLogoDialog({ grupo, onFechar }: { grupo: LinhaLogo | null; onFechar: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function fechar() {
    setArquivo(null); setPrevia(null); setErro(null)
    onFechar()
  }

  function form(f: File) {
    const fd = new FormData()
    fd.set('grupoId', grupo!.id)
    fd.set('arquivo', f)
    return fd
  }

  function escolher(f: File | undefined) {
    if (!f || !grupo) return
    setArquivo(f); setPrevia(null); setErro(null)
    iniciar(async () => {
      const r = await previaLogoDanfeAction(form(f))
      if (!r.ok) { setErro(r.erro); return }
      setPrevia({ dataUrl: r.dataUrl, kb: r.kb, original: { url: URL.createObjectURL(f), kb: Math.round(f.size / 1024) } })
    })
  }

  function enviar() {
    if (!arquivo || !grupo) return
    iniciar(async () => {
      const r = await enviarLogoDanfeAction(form(arquivo))
      if (!r.ok) { setErro(r.erro); return }
      toast.success(`Logo de ${grupo.nome} enviada. Vale para as próximas notas.`)
      fechar()
    })
  }

  const emitente = grupo ? emitenteDaSimulacao(grupo) : null

  return (
    <Dialog open={!!grupo} onOpenChange={aberto => { if (!aberto) fechar() }} disablePointerDismissal>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enviar logo do DANFE{grupo ? ` · ${grupo.nome}` : ''}</DialogTitle>
          <DialogDescription>O MOVA tira a margem e encaixa no espaço da nota. Confira antes de enviar.</DialogDescription>
        </DialogHeader>

        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={pendente}
          onChange={e => escolher(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-foreground"
        />

        {pendente && !previa && <p className="text-sm text-muted-foreground">Ajustando a imagem...</p>}
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {previa && emitente && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-5">
              <figure className="space-y-1.5">
                <figcaption className="text-xs text-muted-foreground">Arquivo enviado</figcaption>
                <div className="flex size-36 items-center justify-center rounded-md border bg-muted">
                  <img src={previa.original.url} alt="Arquivo enviado" className="max-h-32 max-w-32" />
                </div>
                <p className="text-xs text-muted-foreground">{previa.original.kb} KB</p>
              </figure>
              <span className="text-xl text-muted-foreground">→</span>
              <figure className="space-y-1.5">
                <figcaption className="text-xs text-muted-foreground">Logo ajustada</figcaption>
                <div className="rounded-md border border-dashed bg-muted">
                  <img src={previa.dataUrl} alt="Logo ajustada" width={340} height={120} />
                </div>
                <p className="text-xs text-muted-foreground">340 x 120 · {previa.kb} KB</p>
              </figure>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Como fica no topo da nota (simulação; a nota real é gerada pela Nota Gateway)</p>
              <SimulacaoDanfe logo={previa.dataUrl} emitente={emitente} />
            </div>

            <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
              Vale para notas emitidas depois do envio. Não dá para apagar; para trocar, envie outra.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={fechar} disabled={pendente}>Cancelar</Button>
          <Button onClick={enviar} disabled={!previa || pendente}>Enviar para a nota fiscal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Topo do DANFE no padrão do Sul de Minas: logo à esquerda do quadro do emitente. */
function SimulacaoDanfe({ logo, emitente }: { logo: string; emitente: { nome: string; linhas: string[] } }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[680px] border border-foreground bg-card text-[9px] leading-snug text-foreground">
        <div className="w-[320px] border-r border-foreground px-2 pt-1.5 pb-2">
          <p className="mb-1.5 text-center text-[8px] font-bold italic">IDENTIFICAÇÃO DO EMITENTE</p>
          <div className="flex items-center gap-3">
            <img src={logo} alt="" className="w-[110px] flex-none" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold">{emitente.nome}</p>
              {emitente.linhas.map(l => <p key={l}>{l}</p>)}
            </div>
          </div>
        </div>
        <div className="w-[110px] border-r border-foreground p-1.5 text-center">
          <p className="text-sm font-bold">DANFE</p>
          <p className="text-[7px] font-bold">Documento Auxiliar da NOTA FISCAL ELETRÔNICA</p>
          <p className="text-[7px]">0 - ENTRADA · 1 - SAÍDA</p>
          <p className="text-xs">Nº 000.000.000</p>
          <p className="text-xs">SÉRIE: 1</p>
        </div>
        <div className="flex-1 p-1.5">
          <p className="text-[7px] font-bold italic">CHAVE DE ACESSO</p>
          <p className="font-bold">0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000</p>
          <p className="mt-3 text-center text-[8px] font-bold">Consulta de autenticidade no portal nacional da NF-e</p>
        </div>
      </div>
    </div>
  )
}
