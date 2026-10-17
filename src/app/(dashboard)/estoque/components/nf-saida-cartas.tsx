'use client'
import { useEffect, useState, useTransition } from 'react'
import { FileDown, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { diaEHoraBrt } from '@/lib/data-venda'
import { MAX_CARTAS, TEXTO_MAX, TEXTO_MIN, podeDescartarCarta, proximoNumeroCarta, validarTextoCarta } from '@/lib/notagateway/carta-correcao'
import {
  cartasDaNotaAction, descartarCartaAction, emitirCartaCorrecaoAction, reconsultarCartasAction,
  type CartaResumo, type ResultadoCartas,
} from '../../vendas/cartas-correcao-actions'
import type { NotaResumo } from '../../vendas/nfe-propria-actions'

type Props = {
  nota: NotaResumo
  /** O link "Carta de correção" fica na linha do DANFE, no card; o formulário abre aqui. */
  formAberto: boolean
  onFecharForm: () => void
}

const ROTULO: Record<CartaResumo['situacao'], [string, string]> = {
  autorizada: ['Autorizada', 'border-primary text-primary-text'],
  pendente: ['Aguardando SEFAZ', 'border-warning text-warning'],
  recusada: ['Recusada', 'border-destructive text-destructive'],
}

export function NfSaidaCartas({ nota, formAberto, onFecharForm }: Props) {
  const [cartas, setCartas] = useState<CartaResumo[]>([])
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [andamento, setAndamento] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // Sem a lista, não dá para saber o número nem o texto que vale hoje: o formulário espera.
  const [carga, setCarga] = useState<{ estado: 'carregando' | 'ok' } | { estado: 'erro'; erro: string }>({ estado: 'carregando' })
  const [agora, setAgora] = useState(() => new Date())

  function carregar() {
    setCarga({ estado: 'carregando' })
    cartasDaNotaAction(nota.id)
      .then(r => {
        if (r.ok) { setCartas(r.cartas); setCarga({ estado: 'ok' }) }
        else setCarga({ estado: 'erro', erro: r.error })
      })
      .catch((err: Error) => setCarga({ estado: 'erro', erro: err.message }))
  }

  useEffect(carregar, [nota.id])

  const temPendente = cartas.some(c => c.situacao === 'pendente')
  // O botão Descartar depende do tempo: sem relógio, ele só apareceria depois de outra ação.
  useEffect(() => {
    if (!temPendente) return
    const id = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [temPendente])

  const ultimaAutorizada = [...cartas].reverse().find(c => c.situacao === 'autorizada')
  const proximo = proximoNumeroCarta(cartas)
  const validacao = validarTextoCarta(texto)

  // Cada carta substitui a anterior na SEFAZ: o campo já abre com o que vale hoje.
  // Roda de novo quando a lista chega, para o caso de o formulário abrir antes dela.
  const listaPronta = carga.estado === 'ok'
  useEffect(() => {
    if (formAberto && listaPronta) { setTexto(ultimaAutorizada?.correcao ?? ''); setErro('') }
  }, [formAberto, listaPronta])

  function executar(mensagem: string, chamada: () => Promise<ResultadoCartas>, fecharForm = false) {
    setErro('')
    setAndamento(mensagem)
    startTransition(async () => {
      const r = await chamada()
      setAndamento(null)
      if (r.cartas) setCartas(r.cartas)
      if (!r.ok) setErro(r.error)
      else if (fecharForm) onFecharForm()
    })
  }

  return (
    <>
      {andamento && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3">
          <Loader2 size={16} className="animate-spin text-primary" />
          <div>
            <p className="font-medium">{andamento}</p>
            <p className="text-xs text-muted-foreground">Costuma levar poucos segundos. Não feche esta janela.</p>
          </div>
        </div>
      )}

      {formAberto && !andamento && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {carga.estado === 'carregando' ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando as cartas desta nota…</p>
          ) : carga.estado === 'erro' ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-destructive">Não deu para carregar as cartas ({carga.erro}).</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button>
                <Button variant="outline" size="sm" onClick={onFecharForm}>Voltar</Button>
              </div>
            </div>
          ) : proximo.ok ? (
            <>
              <Label htmlFor={`carta-${nota.id}`}>Carta de correção nº {proximo.numero}</Label>
              {ultimaAutorizada && (
                <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                  <b className="text-foreground">Esta carta substitui a nº {ultimaAutorizada.numero}.</b> A SEFAZ considera só a
                  última: o texto abaixo já traz a correção anterior. Mantenha o que ainda vale e acrescente a nova.
                </p>
              )}
              <Textarea
                id={`carta-${nota.id}`}
                value={texto}
                onChange={e => setTexto(e.target.value)}
                rows={5}
                placeholder="Ex.: Onde se lê chassi 9C2KC1680PR000123, leia-se chassi 9C2KC1680PR000132."
              />
              <div className="flex justify-between text-xs">
                <span className={validacao.ok ? 'text-muted-foreground' : 'text-destructive'}>{texto.trim().length} caracteres</span>
                <span className="text-muted-foreground">{TEXTO_MIN} a {TEXTO_MAX} caracteres</span>
              </div>
              <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                A carta de correção <b>não</b> pode alterar: valores e impostos (base, alíquota, quantidade, valor), dados que
                mudem quem é o remetente ou o destinatário, nem a data de emissão ou saída. A nota não muda; a carta fica
                vinculada a ela{nota.ambiente === 'Producao' ? '' : ' (homologação: sem valor fiscal)'}.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { onFecharForm(); setErro('') }}>Voltar</Button>
                <Button
                  size="sm"
                  disabled={!validacao.ok}
                  onClick={() => executar('Enviando a carta de correção à SEFAZ…', () => emitirCartaCorrecaoAction(nota.id, texto), true)}
                >
                  Enviar à SEFAZ
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{proximo.erro}</p>
              <Button variant="outline" size="sm" onClick={onFecharForm}>Voltar</Button>
            </div>
          )}
        </div>
      )}

      {cartas.length > 0 && (
        <div className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-medium">Cartas de correção</span>
            <span className="text-xs text-muted-foreground">{cartas.filter(c => c.situacao === 'autorizada').length} de {MAX_CARTAS}</span>
          </div>
          {[...cartas].reverse().map(c => {
            const [rotulo, cor] = ROTULO[c.situacao]
            return (
              <div key={c.id} className="space-y-1 border-b border-border px-3 py-2 text-xs last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>Carta nº {c.numero}</b> · {diaEHoraBrt(c.criadoEm)} · {c.por ?? '—'}</span>
                  <span className={`inline-flex h-5 items-center rounded-full border px-2 font-medium ${cor}`}>{rotulo}</span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">{c.correcao}</p>
                {c.situacao === 'autorizada' && (
                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                    {c.protocolo && <span>Protocolo {c.protocolo}</span>}
                    <a href={`/api/nf-saida/cartas/${c.id}/xml`} className="flex items-center gap-1 text-primary-text hover:underline">
                      <FileDown size={12} /> XML da carta
                    </a>
                  </div>
                )}
                {c.situacao === 'recusada' && c.motivoStatus && (
                  <p className="text-destructive">{c.motivoStatus}. O número {c.numero} fica livre para a próxima carta.</p>
                )}
                {c.situacao === 'pendente' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
                    <span>A SEFAZ ainda não respondeu.</span>
                    <div className="flex gap-2">
                      {podeDescartarCarta(c, agora) && (
                        <Button variant="outline" size="sm" className="gap-1" disabled={!!andamento}
                          onClick={() => executar('Conferindo com a Nota Gateway…', () => descartarCartaAction(nota.id, c.id))}>
                          <Trash2 size={13} /> Descartar
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="gap-1" disabled={!!andamento}
                        onClick={() => executar('Consultando a Nota Gateway…', () => reconsultarCartasAction(nota.id))}>
                        <RefreshCw size={13} /> Reconsultar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {erro && <p className="whitespace-pre-line text-xs text-destructive">{erro}</p>}
    </>
  )
}
