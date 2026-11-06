'use client'

import { useRef, useState } from 'react'
import { ArchiveRestore, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogoTelaCheia } from '@/components/dialogo-tela-cheia'
import { motivoDoArquivoValido } from '@/lib/arquivar-moto-regras'
import { desarquivarMotoAction } from '../../estoque/arquivar-actions'

/** Botão "Desarquivar" do RADAR (#691) e o diálogo com o motivo. A página só o mostra para quem o servidor deixa. */
export function DesarquivarMoto({ motoId, chassi, larguraTotal = false }: { motoId: string; chassi: string; larguraTotal?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // O state só muda no próximo render: o segundo clique do duplo clique ainda veria enviando = false.
  const enviou = useRef(false)

  const abrir = () => { setMotivo(''); setErro(null); setAberto(true) }
  const fechar = () => { if (!enviando) setAberto(false) }

  async function desarquivar() {
    if (enviou.current) return
    enviou.current = true
    setEnviando(true)
    setErro(null)
    try {
      const r = await desarquivarMotoAction(motoId, motivo)
      if (r.ok) {
        toast.success('Moto desarquivada')
        setAberto(false)
      } else setErro(r.erro)
    } catch {
      setErro('Sem resposta do servidor. Busque a moto de novo para ver se ela voltou antes de tentar outra vez.')
    } finally {
      enviou.current = false
      setEnviando(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={larguraTotal ? 'lg' : 'sm'} onClick={abrir} className={cn(larguraTotal && 'h-12 w-full text-base')}>
        <ArchiveRestore aria-hidden />Desarquivar
      </Button>
      <DialogoTelaCheia aberto={aberto} onFechar={fechar} travado={enviando} titulo="Desarquivar moto"
        descricao={<span className="font-mono">{chassi}</span>} className="sm:max-w-md">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">A moto volta às listas e às buscas do MOVA.</p>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-desarquivar">Motivo</Label>
            <Textarea id="motivo-desarquivar" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={enviando} rows={3}
              placeholder="Ex.: a moto voltou para a loja" className="text-base sm:text-sm" />
            <p className="text-xs text-muted-foreground">Fica no registro com seu nome e a data.</p>
          </div>
          {erro && <p role="alert" className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>}
        </div>
        <div className="space-y-2 border-t border-border p-4">
          <Button onClick={desarquivar} disabled={enviando || !motivoDoArquivoValido(motivo)} className="h-12 w-full text-base">
            {enviando ? <><Loader2 className="size-4 animate-spin" aria-hidden />Desarquivando...</> : 'Desarquivar'}
          </Button>
          <Button variant="ghost" onClick={fechar} disabled={enviando} className="h-10 w-full text-muted-foreground">Cancelar</Button>
        </div>
      </DialogoTelaCheia>
    </>
  )
}
