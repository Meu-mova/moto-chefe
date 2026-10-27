'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { enviarLogoDanfeAction, previaLogoDanfeAction } from '../actions'

export type LinhaLogo = {
  id: string
  nome: string
  siteDanfe: string | null
  temNg: boolean
  logoEnviadaEm: string | null
  logoEnviadaPor: string | null
  /** Link assinado de vida curta da cópia no bucket privado. */
  logoUrl: string | null
}

type Previa = { dataUrl: string; kb: number; original: { kb: number } }

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
  // Remonta a cada grupo aberto, para o site começar com o valor gravado do grupo.
  return grupo ? <EnviarLogoForm key={grupo.id} grupo={grupo} onFechar={onFechar} /> : <Dialog open={false} />
}

function EnviarLogoForm({ grupo, onFechar }: { grupo: LinhaLogo; onFechar: () => void }) {
  const [site, setSite] = useState(grupo.siteDanfe ?? '')
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
    fd.set('grupoId', grupo.id)
    fd.set('arquivo', f)
    fd.set('site', site)
    return fd
  }

  function escolher(f: File | undefined) {
    if (!f) return
    setArquivo(f); setPrevia(null); setErro(null)
    iniciar(async () => {
      const r = await previaLogoDanfeAction(form(f))
      if (!r.ok) { setErro(r.erro); return }
      setPrevia({ dataUrl: r.dataUrl, kb: r.kb, original: { kb: Math.round(f.size / 1024) } })
    })
  }

  function enviar() {
    if (!arquivo) return
    iniciar(async () => {
      const r = await enviarLogoDanfeAction(form(arquivo))
      if (!r.ok) { setErro(r.erro); return }
      toast.success(`Logo de ${grupo.nome} enviada. Vale para as próximas notas.`)
      fechar()
    })
  }

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) fechar() }} disablePointerDismissal>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enviar logo do DANFE · {grupo.nome}</DialogTitle>
          <DialogDescription>O MOVA monta a imagem do quadro do emitente com a logo e os dados da empresa cadastrados na Nota Gateway. Confira antes de enviar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="site-danfe" className="text-xs">Site (opcional)</Label>
          <Input
            id="site-danfe" value={site} disabled={pendente} placeholder="www.sualoja.com.br"
            onChange={e => setSite(e.target.value)}
            onBlur={() => { if (arquivo) escolher(arquivo) }}
          />
        </div>

        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={pendente}
          onChange={e => escolher(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-foreground"
        />

        {pendente && !previa && <p className="text-sm text-muted-foreground">Ajustando a imagem...</p>}
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {previa && (
          <div className="space-y-4">
            <figure className="space-y-1.5">
              <figcaption className="text-xs text-muted-foreground">Imagem que vai para o quadro do emitente no DANFE</figcaption>
              <div className="overflow-x-auto rounded-md border">
                <img src={previa.dataUrl} alt="Imagem do quadro do emitente" width={488} height={158} />
              </div>
              <p className="text-xs text-muted-foreground">{previa.kb} KB · arquivo enviado com {previa.original.kb} KB</p>
            </figure>
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
