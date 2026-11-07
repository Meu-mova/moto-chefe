'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { plural } from '@/lib/texto'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogoPassoAPasso, useEnvioDoLote } from '@/components/dialogo-passo-a-passo'
import { motivoDoArquivoValido } from '@/lib/arquivar-moto-regras'
import { EscolherMotos, SEM_RESPOSTA, useEscolhaDeMotos } from './escolher-motos'
import { arquivarMotosAction, buscarMotosParaArquivarAction } from '../arquivar-actions'

const PASSOS = ['Escolher', 'Conferir', 'Confirmar']
const AO_ARQUIVAR = [
  'Some do Showroom, das listas, contagens, transferências e buscas de OS e garantia.',
  'Só o RADAR acha, com o selo "Arquivada".',
  'Nada é apagado. Volta pelo Desarquivar, no RADAR.',
]
const motos = (n: number) => plural(n, 'moto', 'motos')

/** Arquivar moto (#688, variante B): 1 Escolher, 2 Conferir, 3 Confirmar. O servidor decide as recusas. */
export function ArquivarMotoDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [passo, setPasso] = useState(0)
  const escolha = useEscolhaDeMotos(buscarMotosParaArquivarAction)
  const [motivo, setMotivo] = useState('')
  const { enviando, erro, setErro, feito, enviar } = useEnvioDoLote<{ arquivadas: number }>(SEM_RESPOSTA)
  const arquivar = () => enviar(() => arquivarMotosAction([...escolha.marcadas], motivo))

  // O aviso é do passo em que apareceu: a recusa do envio não fica na tela de escolher.
  const irPara = (p: number) => { setErro(null); setPasso(p) }
  const n = escolha.marcadas.size
  const aviso = erro && <p role="alert" className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>

  if (feito !== null) {
    return (
      <DialogoPassoAPasso aberto={aberto} onFechar={onFechar} titulo="Arquivar moto" passos={PASSOS} atual={null} enviando={false}
        rodape={<Button variant="outline" onClick={onFechar} className="h-12 w-full text-base">Fechar</Button>}>
        <div role="status" className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-10 text-primary-text" />
          <p className="text-base font-semibold">{plural(feito.arquivadas, 'moto arquivada', 'motos arquivadas')}</p>
          <p className="text-sm text-muted-foreground">Ficou registrado no log com seu nome, a data e o motivo.</p>
        </div>
      </DialogoPassoAPasso>
    )
  }

  const rodapes = [
    <>
      <Button onClick={() => irPara(1)} disabled={n === 0} className="h-12 w-full text-base">Continuar com {motos(n)}</Button>
      <Button variant="ghost" onClick={onFechar} className="h-10 w-full text-muted-foreground">Cancelar</Button>
    </>,
    <>
      <Button onClick={() => irPara(2)} className="h-12 w-full text-base">Continuar</Button>
      <Button variant="ghost" onClick={() => irPara(0)} className="h-10 w-full text-muted-foreground">Voltar e mudar as motos</Button>
    </>,
    <>
      <Button onClick={arquivar} disabled={enviando || !motivoDoArquivoValido(motivo)} className="h-12 w-full text-base">
        {enviando ? <><Loader2 className="size-4 animate-spin" />Arquivando...</> : `Arquivar ${motos(n)}`}
      </Button>
      <Button variant="ghost" onClick={() => irPara(1)} disabled={enviando} className="h-10 w-full text-muted-foreground">Voltar</Button>
      <Button variant="ghost" onClick={onFechar} disabled={enviando} className="h-10 w-full text-muted-foreground">Cancelar</Button>
    </>,
  ]

  return (
    <DialogoPassoAPasso aberto={aberto} onFechar={onFechar} titulo="Arquivar moto" passos={PASSOS} atual={passo} enviando={enviando}
      descricao={n > 0 ? plural(n, 'escolhida', 'escolhidas') : 'Esconde de todas as telas, sem apagar'} rodape={rodapes[passo]}>
      {passo === 0 && (
        <>
          <p className="text-sm text-muted-foreground">Para moto que deixou de ser da loja sem ter sido vendida. Ela some de todas as telas e só o RADAR a acha. Volta pelo Desarquivar, no RADAR.</p>
          <EscolherMotos escolha={escolha} idDaBusca="busca-arquivar" />
        </>
      )}
      {passo === 1 && (
        <div className="border-l-2 border-l-primary pl-3">
          <p className="font-medium">Ao arquivar</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {AO_ARQUIVAR.map(t => <li key={t} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />{t}</li>)}
          </ul>
        </div>
      )}
      {passo === 2 && (
        <>
          <div>
            <p className="font-medium">{motos(n)}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {escolha.escolhidas.map(m => <li key={m.id}><span className="font-mono">{m.chassi}</span> <span className="text-muted-foreground">{m.modelo}</span></li>)}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-arquivo">Motivo</Label>
            <Textarea id="motivo-arquivo" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={enviando} rows={3} placeholder="Ex.: moto do golpe do link de pagamento" className="text-base sm:text-sm" />
            <p className="text-xs text-muted-foreground">Fica no registro com seu nome e a data.</p>
          </div>
          {aviso}
        </>
      )}
    </DialogoPassoAPasso>
  )
}
