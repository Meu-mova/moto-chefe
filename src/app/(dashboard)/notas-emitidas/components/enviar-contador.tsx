'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ResumoEnvio = {
  grupo: string
  de: string
  ate: string
  /** Período em texto ("01/10/2026 a 26/10/2026"). */
  periodo: string
  autorizadas: number
  canceladas: number
  tamanho: { texto: string; porLink: boolean }
  emailSalvo: string | null
  ultimoEnvio: string | null
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

/** "Enviar ao contador" (#402, variante C): resumo do que vai, e-mail editável que fica salvo no grupo. */
export function EnviarContador({ resumo }: { resumo: ResumoEnvio }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState(resumo.emailSalvo ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<string | null>(null)
  const total = resumo.autorizadas + resumo.canceladas

  function abrir(o: boolean) {
    if (enviando) return
    setAberto(o)
    if (o) { setErro(null); setEnviado(null) }
  }

  // Route Handler e não Server Action: o envio leva minutos (ver a rota).
  async function enviar() {
    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch('/api/notas-emitidas/contador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, de: resumo.de, ate: resumo.ate }),
      })
      const corpo = await r.json().catch(() => null)
      if (!r.ok) {
        setErro(corpo?.error ?? 'O envio falhou. Tente de novo.')
        return
      }
      const faltaram = corpo?.faltaram > 0 ? ` ${plural(corpo.faltaram, 'arquivo não estava disponível', 'arquivos não estavam disponíveis')}; a lista foi no zip.` : ''
      setEnviado(`${plural(corpo?.notas ?? total, 'nota enviada', 'notas enviadas')} para ${email}${corpo?.modo === 'link' ? ', por link' : ''}.${faltaram}`)
      router.refresh()
    } catch {
      setErro('O envio falhou. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => abrir(true)}><Mail /> Enviar ao contador</Button>
      <Dialog open={aberto} onOpenChange={abrir}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar ao contador</DialogTitle>
            <DialogDescription>
              XML e PDF de cada nota de produção, num arquivo zip{resumo.tamanho.porLink ? '. Grande para anexo: vai por link, válido por 7 dias.' : ' anexo.'}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Período</dt><dd>{resumo.periodo}</dd>
            <dt className="text-muted-foreground">Notas</dt>
            <dd>{plural(resumo.autorizadas, 'autorizada', 'autorizadas')} e {plural(resumo.canceladas, 'cancelada', 'canceladas')}</dd>
            <dt className="text-muted-foreground">Tamanho</dt><dd>{resumo.tamanho.texto}</dd>
            <dt className="text-muted-foreground">Último envio</dt><dd>{resumo.ultimoEnvio ?? 'nenhum ainda'}</dd>
          </dl>

          <div className="space-y-1.5">
            <Label htmlFor="email-contador">E-mail do contador</Label>
            <Input id="email-contador" type="email" value={email} disabled={enviando} onChange={e => setEmail(e.target.value)} placeholder="contador@escritorio.com.br" />
            <p className="text-xs text-muted-foreground">Fica salvo para o grupo {resumo.grupo}.</p>
          </div>

          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          {enviado && <p role="status" className="text-sm text-primary-text">{enviado}</p>}

          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => abrir(false)}>{enviado ? 'Fechar' : 'Cancelar'}</Button>
            {!enviado && (
              <Button disabled={enviando || total === 0 || !email.trim()} onClick={enviar}>
                {enviando && <Loader2 className="animate-spin" />}
                {total === 0 ? 'Nenhuma nota no período' : `Enviar ${plural(total, 'nota', 'notas')}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
