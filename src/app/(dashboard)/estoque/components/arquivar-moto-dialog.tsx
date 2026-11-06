'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/texto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogoPassoAPasso } from '@/components/dialogo-passo-a-passo'
import { motivoDoArquivoValido } from '@/lib/arquivar-moto-regras'
import { estadoDaSelecao, marcarVarias } from '@/lib/selecao'
import { arquivarMotosAction, buscarMotosParaArquivarAction } from '../arquivar-actions'

type Moto = Awaited<ReturnType<typeof buscarMotosParaArquivarAction>>[number]

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
  const [termo, setTermo] = useState('')
  const [achadas, setAchadas] = useState<Moto[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  // Ids marcados: a escolha continua quando a pessoa busca outra NF ou outro chassi.
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  // Toda moto já vista nas buscas, para listar as marcadas no passo 3.
  const [conhecidas, setConhecidas] = useState<ReadonlyMap<string, Moto>>(new Map())
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [arquivadas, setArquivadas] = useState<number | null>(null)
  const ultimaBusca = useRef(0)
  // O state só muda no próximo render: o segundo clique do duplo clique ainda veria enviando = false.
  const enviou = useRef(false)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const vez = ++ultimaBusca.current
    setBuscando(true)
    setErro(null)
    try {
      const lista = await buscarMotosParaArquivarAction(termo)
      if (vez === ultimaBusca.current) {
        setAchadas(lista)
        setConhecidas(antes => new Map([...antes, ...lista.map(m => [m.id, m] as const)]))
        // Escolhida que agora tem pendência sai da escolha: a caixinha travada não teria como desmarcar.
        setMarcadas(antes => marcarVarias(antes, lista.filter(m => m.bloqueio).map(m => m.id), false))
      }
    } catch {
      if (vez === ultimaBusca.current) setErro('Não deu para buscar. Tente de novo.')
    } finally {
      if (vez === ultimaBusca.current) setBuscando(false)
    }
  }

  const alternar = (ids: string[], marcar: boolean) => setMarcadas(antes => marcarVarias(antes, ids, marcar))

  async function arquivar() {
    if (enviou.current) return
    enviou.current = true
    setEnviando(true)
    setErro(null)
    try {
      const r = await arquivarMotosAction([...marcadas], motivo)
      if (r.ok) setArquivadas(r.dados.arquivadas)
      else setErro(r.erro)
    } catch {
      setErro('Sem resposta do servidor. Confira no Showroom se as motos saíram antes de tentar de novo.')
    } finally {
      enviou.current = false
      setEnviando(false)
    }
  }

  // O aviso é do passo em que apareceu: a recusa do envio não fica na tela de escolher.
  const irPara = (p: number) => { setErro(null); setPasso(p) }
  const n = marcadas.size
  const livres = (achadas ?? []).filter(m => !m.bloqueio)
  const idsLivres = livres.map(m => m.id)
  const aviso = erro && <p role="alert" className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>

  if (arquivadas !== null) {
    return (
      <DialogoPassoAPasso aberto={aberto} onFechar={onFechar} titulo="Arquivar moto" passos={PASSOS} atual={null} enviando={false}
        rodape={<Button variant="outline" onClick={onFechar} className="h-12 w-full text-base">Fechar</Button>}>
        <div role="status" className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-10 text-primary-text" />
          <p className="text-base font-semibold">{plural(arquivadas, 'moto arquivada', 'motos arquivadas')}</p>
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
          <form onSubmit={buscar} className="space-y-1.5">
            <Label htmlFor="busca-arquivar">Buscar por chassi ou NF de entrada</Label>
            <div className="flex gap-2">
              <Input id="busca-arquivar" value={termo} onChange={e => setTermo(e.target.value)} autoComplete="off" className="text-base sm:text-sm" />
              <Button type="submit" variant="outline" disabled={buscando || !termo.trim()}>
                {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Buscar
              </Button>
            </div>
          </form>
          {aviso}
          {achadas === null ? (
            <p className="text-sm text-muted-foreground">Digite um chassi ou o número da NF de entrada e aperte Buscar.</p>
          ) : achadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma moto encontrada.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {livres.length > 1 && (
                <li className="bg-muted">
                  <label className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium">
                    <input type="checkbox" className="size-4 accent-primary" checked={estadoDaSelecao(idsLivres, marcadas) === 'todas'} onChange={e => alternar(idsLivres, e.target.checked)} aria-label={`Marcar todas que podem (${livres.length})`} />
                    Marcar todas que podem ({livres.length})
                  </label>
                </li>
              )}
              {achadas.map(m => (
                <li key={m.id}>
                  <label className={cn('flex gap-3 px-3 py-2.5', m.bloqueio && 'opacity-60')}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-primary" disabled={!!m.bloqueio} checked={marcadas.has(m.id)} onChange={e => alternar([m.id], e.target.checked)} aria-label={m.chassi} />
                    <span className="min-w-0 text-sm">
                      <span className="font-mono">{m.chassi}</span> <span className="text-muted-foreground">{m.modelo}</span>
                      <span className="block text-xs text-muted-foreground">{m.loja}{m.nfEntrada && ` · NF de entrada ${m.nfEntrada}`}</span>
                      {m.bloqueio && <span className="block text-xs text-destructive">{m.bloqueio}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
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
              {[...marcadas].flatMap(id => conhecidas.get(id) ?? []).map(m => <li key={m.id}><span className="font-mono">{m.chassi}</span> <span className="text-muted-foreground">{m.modelo}</span></li>)}
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
