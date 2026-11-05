'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN, MAX_NUMEROS_POR_INUTILIZACAO, normalizarJustificativa, validarFaixaInutilizacao, type ConflitosDaFaixa } from '@/lib/notagateway/inutilizacao'
import { conferirFaixaAction, contextoDaFaixaAction, pedirFaixaAction } from '../actions'

type Contexto = { ambiente: string; serie: string; uf: string; permiteInutilizar: boolean }
type Passo = 'faixa' | 'confirmar' | 'resultado'

const ERRO_INESPERADO = 'Não deu para concluir. Tente de novo; se continuar, fale com o suporte.'
const SEM_CONFIRMACAO = 'Não deu para confirmar a resposta. Confira o histórico antes de pedir de novo.'
const MAX_NUMEROS_LISTADOS = 12

const numeros = (lista: number[]) => lista.length <= MAX_NUMEROS_LISTADOS ? lista.join(', ') : `${lista.slice(0, MAX_NUMEROS_LISTADOS).join(', ')} e mais ${lista.length - MAX_NUMEROS_LISTADOS}`

/**
 * Pedido de inutilização de uma faixa contínua (#655, opção A do protótipo): faixa, conferência dos
 * conflitos locais e confirmação. Série, UF e ambiente vêm do servidor; a tela só manda a faixa e a
 * justificativa. Aviso de conflito não bloqueia. Como no pedido por nota, o resultado fica dentro do
 * diálogo e a lista só atualiza no Fechar.
 */
export function InutilizarFaixaDialogo({ ambiente }: { ambiente: 'Producao' | 'Homologacao' }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [passo, setPasso] = useState<Passo>('faixa')
  const [ocupado, setOcupado] = useState(false)
  const [contexto, setContexto] = useState<Contexto | null>(null)
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [conflitos, setConflitos] = useState<ConflitosDaFaixa | null>(null)
  const [conferi, setConferi] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Uma chave por abertura: o servidor trata o duplo clique da mesma tentativa como um pedido só.
  const [chave, setChave] = useState('')
  // O estado só muda no próximo render: dois cliques seguidos passariam por ele, a ref barra o segundo.
  const emVoo = useRef(false)

  const validacao = validarFaixaInutilizacao({ serie: contexto?.serie ?? '', numeroInicial: inicio, numeroFinal: fim, justificativa })
  const producao = contexto?.ambiente === 'Producao'
  const entrada = { ambiente, numeroInicial: inicio, numeroFinal: fim, justificativa }

  async function rodar(fn: () => Promise<void>) {
    if (emVoo.current) return
    emVoo.current = true
    setOcupado(true)
    setErro(null)
    try { await fn() } catch { setErro(ERRO_INESPERADO) } finally { emVoo.current = false; setOcupado(false) }
  }

  const abrir = () => {
    setAberto(true)
    setChave(crypto.randomUUID())
    void rodar(async () => {
      const r = await contextoDaFaixaAction(ambiente)
      if (r.ok) setContexto(r.dados)
      else setErro(r.erro)
    })
  }

  function fechar() {
    if (ocupado) return
    if (passo === 'resultado') router.refresh()
    setAberto(false)
    setPasso('faixa'); setContexto(null); setInicio(''); setFim(''); setJustificativa('')
    setConflitos(null); setConferi(false); setMensagem(null); setErro(null)
  }

  const continuar = () => rodar(async () => {
    const r = await conferirFaixaAction(entrada)
    if (!r.ok) return setErro(r.erro)
    setConflitos(r.dados.conflitos)
    setConferi(false)
    setPasso('confirmar')
  })

  const confirmar = () => rodar(async () => {
    try {
      const r = await pedirFaixaAction({ ...entrada, chave })
      if (!r.ok) {
        // Recusa: a linha ficou gravada com esta chave, e repetir a chave só devolveria "já registrada".
        // Sem resposta (catch abaixo) a chave fica, para a tentativa não duplicar o pedido.
        setChave(crypto.randomUUID())
        return setErro(r.erro)
      }
      setMensagem(r.dados.aviso ?? 'Pedido enviado. O resultado da SEFAZ aparece no histórico de faixas.')
    } catch {
      setMensagem(SEM_CONFIRMACAO)
    }
    setPasso('resultado')
  })

  const campo = { disabled: ocupado || passo !== 'faixa' }
  return (
    <>
      <Button variant="outline" onClick={abrir}>Inutilizar faixa</Button>
      <Dialog open={aberto} onOpenChange={novo => { if (!novo) fechar() }} disablePointerDismissal>
        <DialogContent className="sm:max-w-lg" showCloseButton={!ocupado}>
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>Inutilizar faixa de numeração</DialogTitle>
              {contexto && <Badge className={producao ? 'bg-muted text-muted-foreground' : 'bg-warning/10 text-warning'}>{producao ? 'Produção' : 'Teste (homologação)'}</Badge>}
            </div>
            <DialogDescription>Informe uma única faixa contínua de números que não será mais usada.</DialogDescription>
          </DialogHeader>

          {erro && <p role="alert" className="text-destructive">{erro}</p>}
          {!contexto && ocupado && <p role="status" className="text-muted-foreground">Lendo a configuração da Nota Gateway...</p>}

          {contexto && passo !== 'resultado' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="serie-faixa">Série</Label>
                  <Input id="serie-faixa" value={contexto.serie} readOnly />
                  <p className="text-xs text-muted-foreground">É a série configurada na Nota Gateway para este ambiente.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="justificativa-faixa">Justificativa</Label>
                  <Textarea id="justificativa-faixa" rows={3} value={justificativa} {...campo} onChange={e => setJustificativa(e.target.value)} />
                  <p className="text-xs text-muted-foreground">De {JUSTIFICATIVA_MIN} a {JUSTIFICATIVA_MAX} caracteres, hoje {normalizarJustificativa(justificativa).length}. Os acentos saem sozinhos.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="inicio-faixa">Do número</Label>
                  <Input id="inicio-faixa" inputMode="numeric" value={inicio} {...campo} onChange={e => setInicio(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fim-faixa">Ao número</Label>
                  <Input id="fim-faixa" inputMode="numeric" value={fim} {...campo} onChange={e => setFim(e.target.value)} />
                </div>
              </div>
              <p className={`text-xs ${inicio && fim && !validacao.ok ? 'text-destructive' : 'text-muted-foreground'}`}>
                {inicio && fim && !validacao.ok ? validacao.erro : `Um pedido por faixa, com no máximo ${MAX_NUMEROS_POR_INUTILIZACAO.toLocaleString('pt-BR')} números. Duas lacunas são dois pedidos.`}
              </p>
              {!contexto.permiteInutilizar && (
                <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  A inutilização não está disponível para empresas do Acre, Bahia e São Paulo (UF da empresa: {contexto.uf}).
                </p>
              )}
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="flex items-start gap-2 font-medium"><TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />A SEFAZ pode recusar a faixa inteira se algum número já tiver sido usado ou inutilizado.</p>
                {producao && <p className="mt-1 font-medium text-destructive">Em produção, a faixa autorizada não poderá ser usada de novo.</p>}
              </div>
            </div>
          )}

          {passo === 'confirmar' && validacao.ok && conflitos && (
            <div className="space-y-3 text-sm" role="status">
              <p className="rounded-md bg-muted p-3">
                Série {validacao.faixa.serie}, números {validacao.faixa.numeroInicial} a {validacao.faixa.numeroFinal} ({validacao.faixa.numeroFinal - validacao.faixa.numeroInicial + 1}).
              </p>
              {conflitos.numerosDeNotas.length > 0 && <p>Notas do MOVA que usam números desta faixa: {numeros(conflitos.numerosDeNotas)}.</p>}
              {conflitos.pedidos.map((p, i) => <p key={i}>Pedido de inutilização {p.situacao === 'autorizada' ? 'autorizado' : 'pendente'} de {p.numeroInicial} a {p.numeroFinal}.</p>)}
              <p className="text-muted-foreground">
                {conflitos.numerosDeNotas.length + conflitos.pedidos.length === 0 ? 'O MOVA não achou conflito.' : 'Você pode continuar mesmo assim.'}{' '}
                Emissões feitas fora do MOVA não são verificadas.
              </p>
              <label className="flex min-h-11 items-start gap-2">
                <input className="mt-1 size-4 accent-primary" type="checkbox" checked={conferi} disabled={ocupado} onChange={e => setConferi(e.target.checked)} />
                <span>Conferi a série e a faixa e sei que a inutilização autorizada é definitiva.</span>
              </label>
            </div>
          )}

          {passo === 'resultado' && <p role="status" className="text-primary-text">{mensagem}</p>}

          <DialogFooter>
            {passo === 'confirmar' && <Button variant="outline" disabled={ocupado} onClick={() => { setPasso('faixa'); setErro(null) }}>Voltar</Button>}
            <Button variant="outline" disabled={ocupado} onClick={fechar}>{passo === 'resultado' ? 'Fechar' : 'Cancelar'}</Button>
            {passo === 'faixa' && contexto && <Button disabled={ocupado || !validacao.ok || !contexto.permiteInutilizar} onClick={continuar}>
              {ocupado && <Loader2 className="animate-spin" />}Continuar
            </Button>}
            {passo === 'confirmar' && <Button variant="destructive" disabled={ocupado || !conferi} onClick={confirmar}>
              {ocupado && <Loader2 className="animate-spin" />}Confirmar inutilização
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
