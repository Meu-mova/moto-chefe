'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { plural } from '@/lib/texto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogoPassoAPasso, useEnvioDoLote } from '@/components/dialogo-passo-a-passo'
import { motivoDoArquivoValido } from '@/lib/arquivar-moto-regras'
import { avisoDasPecas, confirmacaoValida, nfsDoLote, oQueSaiJunto, PALAVRA_DE_CONFIRMACAO } from '@/lib/remover-moto-regras'
import { EscolherMotos, SEM_RESPOSTA, useEscolhaDeMotos } from './escolher-motos'
import { buscarMotosParaRemoverAction, removerMotosAction } from '../arquivar-actions'

const PASSOS = ['Escolher', 'Conferir', 'Confirmar']
const motos = (n: number) => plural(n, 'moto', 'motos')
const Aviso = ({ children }: { children: React.ReactNode }) => <p className="border-l-2 border-l-warning pl-3 text-sm">{children}</p>

/** Remover moto (#692, variante B): 1 Escolher, 2 Conferir, 3 Confirmar. O servidor decide as recusas. */
export function RemoverMotoDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [passo, setPasso] = useState(0)
  const escolha = useEscolhaDeMotos(buscarMotosParaRemoverAction)
  const [motivo, setMotivo] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const { enviando, erro, setErro, feito, enviar } = useEnvioDoLote<{ removidas: number }>(SEM_RESPOSTA)
  const remover = () => enviar(() => removerMotosAction([...escolha.marcadas], motivo, confirmacao))

  // O aviso é do passo em que apareceu: a recusa do envio não fica na tela de escolher.
  const irPara = (p: number) => { setErro(null); setPasso(p) }
  const n = escolha.marcadas.size
  const pronto = motivoDoArquivoValido(motivo) && confirmacaoValida(confirmacao)
  const nfs = nfsDoLote(escolha.escolhidas)

  if (feito !== null) {
    return (
      <DialogoPassoAPasso aberto={aberto} onFechar={onFechar} titulo="Remover moto" passos={PASSOS} atual={null} enviando={false}
        rodape={<Button variant="outline" onClick={onFechar} className="h-12 w-full text-base">Fechar</Button>}>
        <div role="status" className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-10 text-primary-text" />
          <p className="text-base font-semibold">{plural(feito.removidas, 'moto removida', 'motos removidas')}</p>
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
      <Button variant="destructive" onClick={remover} disabled={enviando || !pronto} className="h-12 w-full text-base">
        {enviando ? <><Loader2 className="size-4 animate-spin" />Removendo...</> : `Remover ${motos(n)}`}
      </Button>
      <Button variant="ghost" onClick={() => irPara(1)} disabled={enviando} className="h-10 w-full text-muted-foreground">Voltar</Button>
      <Button variant="ghost" onClick={onFechar} disabled={enviando} className="h-10 w-full text-muted-foreground">Cancelar</Button>
    </>,
  ]

  return (
    <DialogoPassoAPasso aberto={aberto} onFechar={onFechar} titulo="Remover moto" passos={PASSOS} atual={passo} enviando={enviando}
      descricao={n > 0 ? plural(n, 'escolhida', 'escolhidas') : 'Apaga de vez, com tudo o que depende dela'} rodape={rodapes[passo]}>
      {passo === 0 && (
        <>
          <p className="text-sm text-muted-foreground">Para moto que não devia ter entrado no MOVA (ex.: importada por engano). Apaga a moto e tudo o que depende dela. Não tem volta. Moto vendida sai antes pelo Cancelar venda.</p>
          <EscolherMotos escolha={escolha} idDaBusca="busca-remover" />
        </>
      )}
      {passo === 1 && (
        <>
          <div className="border-l-2 border-l-destructive pl-3">
            <p className="font-medium">Sai junto, moto por moto</p>
            <p className="text-xs text-muted-foreground">Não dá para desfazer.</p>
          </div>
          {escolha.escolhidas.map(m => {
            const pecas = avisoDasPecas(m.pecasEmOs)
            return (
              <div key={m.id} className="space-y-2 rounded-md border border-border p-3">
                <p className="text-sm"><span className="font-mono">{m.chassi}</span> <span className="text-muted-foreground">{m.modelo} · {m.loja}</span></p>
                <ul className="space-y-1 text-sm">
                  {['A moto, com a ficha fiscal e a RENAVE', ...oQueSaiJunto(m.saiJunto)].map(t => <li key={t} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />{t}</li>)}
                </ul>
                {pecas && <Aviso>{pecas}</Aviso>}
              </div>
            )
          })}
          {nfs.voltam.map(nf => <Aviso key={nf}>A NF de entrada {nf} volta a &quot;pendente&quot; em Notas recebidas e pode ser importada de novo.</Aviso>)}
          {nfs.ficam.map(nf => <p key={nf} className="text-sm text-muted-foreground">A NF de entrada {nf} continua lançada em Notas recebidas: outras motos dela ficam no MOVA.</p>)}
        </>
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
            <Label htmlFor="motivo-remocao">Motivo</Label>
            <Textarea id="motivo-remocao" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={enviando} rows={3} placeholder="Ex.: NF importada no grupo errado" className="text-base sm:text-sm" />
            <p className="text-xs text-muted-foreground">Fica no registro com seu nome e a data.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmar-remocao">Digite {PALAVRA_DE_CONFIRMACAO} para remover</Label>
            <Input id="confirmar-remocao" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} disabled={enviando} autoComplete="off" className="text-base sm:text-sm" />
          </div>
          {erro && <p role="alert" className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>}
        </>
      )}
    </DialogoPassoAPasso>
  )
}
