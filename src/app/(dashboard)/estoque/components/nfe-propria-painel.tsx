'use client'
import { useEffect, useState, useTransition } from 'react'
import { ChevronDown, ExternalLink, FileDown, Loader2, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { codigoRecusa, ehDenegada, ehFinal, recusaParaAbrir, ehRecusada, emCancelamento, podeDescartarTentativa } from '@/lib/notagateway/status'
import { NfSaidaCard } from './nf-saida-card'
import {
  previsualizarNfePropriaAction, transmitirNfePropriaAction, consultarNfePropriaAction, salvarFichaMotoAction, salvarCestMotoAction,
  type PreviaNfe, type NotaResumo, type FichaMoto,
} from '../../vendas/nfe-propria-actions'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ROTULO_PAGAMENTO: Record<string, string> = {
  Dinheiro: 'Dinheiro',
  PagamentoInstantaneoPix: 'PIX',
  TransferenciaBancariaCarteiraDigital: 'Transferência',
  CartaoDeCredito: 'Cartão de crédito',
  CartaoDeDebito: 'Cartão de débito',
}

const ORIGENS: [string, string][] = [
  ['0', '0 — Nacional'],
  ['1', '1 — Estrangeira, importação direta'],
  ['2', '2 — Estrangeira, adquirida no mercado interno'],
  ['3', '3 — Nacional, conteúdo importado 40–70%'],
  ['4', '4 — Nacional, processo produtivo básico'],
  ['5', '5 — Nacional, conteúdo importado até 40%'],
  ['6', '6 — Estrangeira direta, sem similar'],
  ['7', '7 — Estrangeira interna, sem similar'],
  ['8', '8 — Nacional, conteúdo importado acima de 70%'],
]

type Props = {
  motoId: string
  onVoltar: () => void
  /** Outros caminhos (Bling, nota já emitida), mostrados abaixo da conferência. */
  outrasFormas?: React.ReactNode
}

type Previa = Extract<PreviaNfe, { ok: true }>

/**
 * Emissão da NF-e pelo próprio MOVA: pré-visualiza → confere → transmite.
 *
 * Em PRODUÇÃO a autorização fatura a venda, e o revalidate desmonta este
 * painel (o botão só existe para venda sem NF). Por isso o DANFE, o checklist
 * e o certificado abrem logo que a action volta — antes do desmonte.
 */
export function NfePropriaPainel({ motoId, onVoltar, outrasFormas }: Props) {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ nota: NotaResumo; erro?: string } | null>(null)
  const [conferido, setConferido] = useState(false)
  const [ficha, setFicha] = useState<FichaMoto | null>(null)
  const [cestEdicao, setCestEdicao] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [transmitindo, setTransmitindo] = useState(false)

  function carregar(abrirRecusa: boolean) {
    setErro('')
    startTransition(async () => {
      const r = await previsualizarNfePropriaAction(motoId)
      if (!r.ok) { setErro(r.error); return }
      setPrevia(r)
      setFicha(r.ficha ? null : r.sugestao)
      // "Reenviar" volta à conferência: ali não reabre a recusa.
      const recusa = abrirRecusa ? recusaParaAbrir(r.notas, r.ambiente) : null
      if (recusa) setResultado({ nota: recusa })
    })
  }

  useEffect(() => carregar(true), [motoId]) // eslint-disable-line react-hooks/exhaustive-deps

  function salvarFicha() {
    if (!ficha) return
    setErro('')
    startTransition(async () => {
      const r = await salvarFichaMotoAction(motoId, ficha)
      if (!r.ok) { setErro(r.error); return }
      const p = await previsualizarNfePropriaAction(motoId)
      if (!p.ok) { setErro(p.error); return }
      setPrevia(p)
      setFicha(p.ficha ? null : p.sugestao)
    })
  }

  function salvarCest() {
    if (cestEdicao == null) return
    setErro('')
    startTransition(async () => {
      const r = await salvarCestMotoAction(motoId, cestEdicao)
      if (!r.ok) { setErro(r.error); return }
      const p = await previsualizarNfePropriaAction(motoId)
      if (!p.ok) { setErro(p.error); return }
      setPrevia(p)
      setCestEdicao(null)
    })
  }

  function transmitir() {
    setErro('')
    setTransmitindo(true)
    startTransition(async () => {
      const r = await transmitirNfePropriaAction(motoId)
      setTransmitindo(false)
      if (r.nota) {
        if (r.nota.status === 'Autorizada' && r.nota.ambiente === 'Producao') {
          if (r.nota.linkDanfe) window.open(r.nota.linkDanfe, '_blank')
          if (previa) {
            window.open(`/vendas/${previa.vendaId}/checklist-entrega`, '_blank')
            window.open(`/vendas/${previa.vendaId}/certificado-bateria`, '_blank')
          }
        }
        setResultado({ nota: r.nota, erro: r.ok ? undefined : r.error })
      } else if (!r.ok) {
        setErro(r.error)
      }
    })
  }

  function reconsultar(notaId: string) {
    setErro('')
    startTransition(async () => {
      const r = await consultarNfePropriaAction(notaId)
      if (!r.ok) { setErro(r.error); return }
      setResultado({ nota: r.nota })
    })
  }

  function atualizarNota(nota: NotaResumo) {
    setPrevia(p => p && { ...p, notas: p.notas.map(n => (n.id === nota.id ? nota : n)) })
  }

  function tentarDeNovo() {
    setResultado(null)
    setConferido(false)
    carregar(false)
  }

  if (!previa) {
    return erro ? (
      <div className="space-y-4 py-2">
        <p className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>
        {/* A emissão pelo MOVA falhou: o Bling e a nota já emitida continuam à mão. */}
        {outrasFormas}
        <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Voltar</Button>
      </div>
    ) : (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Montando a nota…
      </p>
    )
  }

  const teste = previa.ambiente === 'Homologacao'

  if (transmitindo) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Loader2 className="size-6 animate-spin text-primary-text" />
        <p className="font-medium">Enviando à SEFAZ…</p>
        <p className="text-sm text-muted-foreground">Costuma levar poucos segundos. Não feche esta tela.</p>
      </div>
    )
  }

  if (resultado) return <Resultado r={resultado} teste={teste} pending={pending} onReconsultar={reconsultar} onAtualizada={nota => setResultado({ nota })} onTentarDeNovo={tentarDeNovo} onVoltar={onVoltar} />

  const r = previa.resumo
  const bloqueadaProducao = !teste && !!previa.jaFaturada

  return (
    <div className="space-y-4">
      {teste && (
        <div className="border-l-2 border-l-warning pl-3 text-sm">
          <p className="font-medium">Ambiente de teste (homologação)</p>
          <p className="text-muted-foreground">
            A nota vai para a SEFAZ de teste, sai sem valor fiscal e a venda <b>não</b> é faturada. Para valer,
            troque o ambiente em Admin → Notas fiscais.
          </p>
        </div>
      )}

      {bloqueadaProducao && (
        <p className="border-l-2 border-l-border pl-3 text-sm">Esta venda já tem a NF <b>{previa.jaFaturada}</b>.</p>
      )}

      {previa.pendencias.length > 0 && (
        <div className="border-l-2 border-l-destructive pl-3 text-sm">
          <p className="font-medium text-destructive">Corrija antes de emitir</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {previa.pendencias.map(p => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {ficha && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <p className="font-medium">Esta moto está sem ficha fiscal</p>
            <p className="text-sm text-muted-foreground">
              A nota de entrada dela não foi importada. Preencha com os dados da nota do fornecedor — ficam
              gravados na moto.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ficha-xprod">Descrição fiscal (como na nota de entrada)</Label>
              <Input id="ficha-xprod" value={ficha.xProd} onChange={e => setFicha({ ...ficha, xProd: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ficha-ncm">NCM</Label>
              <Input id="ficha-ncm" inputMode="numeric" value={ficha.ncm} onChange={e => setFicha({ ...ficha, ncm: e.target.value })} placeholder="87116000" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ficha-cest">CEST</Label>
              <Input id="ficha-cest" inputMode="numeric" value={ficha.cest} onChange={e => setFicha({ ...ficha, cest: e.target.value })} placeholder="2600100" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ficha-un">Unidade</Label>
              <Input id="ficha-un" value={ficha.unidade} onChange={e => setFicha({ ...ficha, unidade: e.target.value })} placeholder="UN" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ficha-origem">Origem na nota de entrada</Label>
              <select
                id="ficha-origem"
                value={ficha.origem}
                onChange={e => setFicha({ ...ficha, origem: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              >
                {ORIGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <Button onClick={salvarFicha} disabled={pending} className="h-11 w-full">
            {pending ? 'Salvando…' : 'Salvar ficha e continuar'}
          </Button>
        </div>
      )}

      {r && (
        <div>
          <p className="text-sm text-muted-foreground">Confira antes de enviar. Toque num bloco para ver tudo.</p>
          <Bloco titulo="Cliente" resumo={r.cliente.nome}>
            <p>{r.cliente.nome}</p>
            <p className="text-muted-foreground">{r.cliente.documento}</p>
            <p className="text-muted-foreground">{r.cliente.endereco}</p>
            {r.cliente.email && !teste && <p className="text-muted-foreground">DANFE vai para {r.cliente.email}</p>}
          </Bloco>
          <Bloco titulo="Moto" resumo={r.produto.descricao}>
            <p>{r.produto.descricao}</p>
            <p className="text-muted-foreground">
              NCM {r.produto.ncm} · CEST {r.produto.cest} · CFOP {r.produto.cfop} · CST {r.produto.cst}
            </p>
            <p className="text-muted-foreground">
              Origem {r.produto.origemSaida}
              {r.produto.origemEntrada !== r.produto.origemSaida && ` (entrou como ${r.produto.origemEntrada})`}
              {r.interestadual && ' · venda para fora do estado'}
            </p>
            {previa.ficha && cestEdicao == null && (
              <Button type="button" size="sm" variant="outline" className="mt-2 h-11" onClick={() => setCestEdicao(previa.ficha?.cest ?? '')}>
                Editar CEST
              </Button>
            )}
            {cestEdicao != null && (
              <div className="flex items-end gap-2 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="cest-edicao" className="text-xs">CEST (7 dígitos)</Label>
                  <Input id="cest-edicao" inputMode="numeric" className="w-36" value={cestEdicao} onChange={e => setCestEdicao(e.target.value)} placeholder="2600100" />
                </div>
                <Button size="sm" className="h-11" onClick={salvarCest} disabled={pending}>{pending ? 'Salvando…' : 'Salvar CEST'}</Button>
                <Button size="sm" variant="outline" className="h-11" onClick={() => { setCestEdicao(null); setErro('') }} disabled={pending}>Cancelar</Button>
              </div>
            )}
            {cestEdicao != null && !cestEdicao.trim() && (
              <p className="text-xs text-muted-foreground">
                CEST vazio: venda com ICMS-ST (CST 60) é recusada pela SEFAZ (erro 806). Dá para salvar assim mesmo.
              </p>
            )}
            {cestEdicao != null && erro && <p className="text-sm text-destructive">{erro}</p>}
          </Bloco>
          <Bloco titulo="Valor" resumo={brl(r.valor)}>
            {r.pagamentos.map((p, i) => (
              <p key={i} className="flex justify-between text-muted-foreground">
                <span>{ROTULO_PAGAMENTO[p.tipo] ?? p.tipo}</span><span className="tabular-nums">{brl(p.valor)}</span>
              </p>
            ))}
          </Bloco>
          <Bloco titulo="Tributos" resumo="e observação da nota">
            <p className="text-muted-foreground">PIS {r.tributos.pis} · COFINS {r.tributos.cofins}</p>
            {r.tributos.aproximado != null && <p className="text-muted-foreground">Aprox. (IBPT): {brl(r.tributos.aproximado)}</p>}
            <p className="whitespace-pre-line pt-1 text-xs text-muted-foreground">{r.observacao}</p>
          </Bloco>
        </div>
      )}

      {erro && cestEdicao == null && <p className="whitespace-pre-line border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erro}</p>}

      {r && !bloqueadaProducao && (
        <label className="flex cursor-pointer items-start gap-3 py-1">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={conferido} onChange={e => setConferido(e.target.checked)} />
          Conferi cliente, moto, valor e pagamentos.
        </label>
      )}

      {outrasFormas}

      {previa.notas.length > 0 && <Historico notas={previa.notas} onAtualizada={atualizarNota} />}

      {/* Fica preso no rodapé: com os blocos abertos a conferência passa da tela no celular. */}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background px-4 py-3">
        {!r || bloqueadaProducao ? (
          <Button variant="outline" onClick={onVoltar} disabled={pending} className="h-11 flex-1">Voltar</Button>
        ) : (
          <Button onClick={transmitir} disabled={pending || !conferido} className="h-12 flex-1 gap-2 text-base">
            <Send className="size-4" /> {teste ? 'Transmitir teste' : 'Emitir pelo MOVA'} · {brl(r.valor)}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Bloco da conferência: fechado mostra só o resumo, para a nota caber na tela. */
function Bloco({ titulo, resumo, children }: { titulo: string; resumo?: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="border-b border-border">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="w-20 shrink-0 font-medium">{titulo}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{aberto ? '' : resumo}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !aberto && '-rotate-90')} />
      </button>
      {aberto && <div className="space-y-0.5 pb-3 text-sm">{children}</div>}
    </div>
  )
}

function Links({ nota }: { nota: NotaResumo }) {
  return (
    <div className="space-y-2">
      {nota.linkDanfe && (
        <a href={nota.linkDanfe} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), 'h-11 w-full gap-2')}>
          <ExternalLink className="size-4" /> Abrir DANFE
        </a>
      )}
      {nota.linkXml && (
        <a href={nota.linkXml} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full gap-2')}>
          <FileDown className="size-4" /> Baixar XML
        </a>
      )}
    </div>
  )
}

/** Recolhido: a conferência da nota nova vem antes das tentativas antigas. */
function Historico({ notas, onAtualizada }: { notas: NotaResumo[]; onAtualizada: (nota: NotaResumo) => void }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="border-t border-border">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex w-full items-center justify-between py-3 text-sm text-muted-foreground">
        Tentativas anteriores ({notas.length})
        <ChevronDown className={cn('size-4 transition-transform', !aberto && '-rotate-90')} />
      </button>
      {aberto && <div className="space-y-2 pb-3">{notas.map(n => <NfSaidaCard key={n.id} nota={n} onAtualizada={onAtualizada} />)}</div>}
    </div>
  )
}

function Resultado({ r, teste, pending, onReconsultar, onAtualizada, onTentarDeNovo, onVoltar }: {
  r: { nota: NotaResumo; erro?: string }
  teste: boolean
  pending: boolean
  onReconsultar: (id: string) => void
  onAtualizada: (nota: NotaResumo) => void
  onTentarDeNovo: () => void
  onVoltar: () => void
}) {
  const { nota } = r
  if (nota.status === 'Autorizada') {
    return (
      <div className="space-y-4 py-2">
        <div className="border-l-4 border-l-primary pl-3">
          <p className="text-lg font-semibold">NF-e {nota.numero} (série {nota.serie}) autorizada</p>
          <p className="text-sm text-muted-foreground">
            {teste ? 'Nota de teste — sem valor fiscal, a venda não foi faturada.' : 'A venda foi faturada e a moto marcada como vendida.'}
          </p>
        </div>
        <Links nota={nota} />
        <Button variant="ghost" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
      </div>
    )
  }

  if (!ehFinal(nota.status) && !emCancelamento(nota.status) && !podeDescartarTentativa(nota, new Date())) {
    return (
      <div className="space-y-4 py-2">
        <div className="border-l-4 border-l-warning pl-3">
          <p className="text-lg font-semibold">A SEFAZ ainda não respondeu</p>
          <p className="text-sm text-muted-foreground">
            A nota está em processamento — consulte de novo em instantes. Não transmita outra: a nota pode já
            ter sido recebida.
          </p>
        </div>
        <Button onClick={() => onReconsultar(nota.id)} disabled={pending} className="h-11 w-full gap-2">
          <RefreshCw className={cn('size-4', pending && 'animate-spin')} /> Consultar agora
        </Button>
        <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
      </div>
    )
  }

  if (!ehRecusada(nota.status)) {
    // Cancelada, com cancelamento recusado ou em andamento, parada em Enviando ou já
    // descartada: o card mostra o que dá para fazer.
    return (
      <div className="space-y-4 py-2">
        <NfSaidaCard nota={nota} onAtualizada={onAtualizada} />
        {nota.status === 'Descartada' && <Button onClick={onTentarDeNovo} className="h-11 w-full">Tentar de novo</Button>}
        <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
      </div>
    )
  }

  const numero = nota.numero ? ` nº ${nota.numero}` : ''
  const motivo = nota.motivoStatus ?? r.erro ?? 'Sem motivo informado.'

  if (ehDenegada(nota)) {
    // O número fica registrado na SEFAZ: não se reenvia nem se cancela (#347).
    const doEmitente = codigoRecusa(nota.motivoStatus) === 301
    return (
      <div className="space-y-4 py-2">
        <div className="border-l-4 border-l-destructive pl-3">
          <p className="text-lg font-semibold">A SEFAZ denegou a nota{numero}</p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{motivo}</p>
        </div>
        <p className="text-sm">
          {doEmitente
            ? 'A Inscrição Estadual da empresa está irregular na SEFAZ (suspensa, baixada, cancelada…). Consulte no SINTEGRA ou no Cadastro Centralizado de Contribuintes e regularize com a SEFAZ.'
            : 'A Inscrição Estadual do comprador está irregular na SEFAZ (suspensa, baixada, cancelada…). Consulte no SINTEGRA ou no Cadastro Centralizado de Contribuintes e peça ao comprador que regularize com a SEFAZ.'}
          {' '}Esta nota fica registrada como denegada e a próxima sai com número novo.
        </p>
        <Button onClick={onTentarDeNovo} className="h-11 w-full">Emitir com número novo</Button>
        <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      <div className="border-l-4 border-l-destructive pl-3">
        <p className="text-lg font-semibold">A SEFAZ recusou a nota{numero}</p>
        <p className="whitespace-pre-line text-sm text-muted-foreground">{motivo}</p>
      </div>
      <p className="text-sm">
        Nada foi faturado. Corrija o que a SEFAZ apontou (em geral, dados do cliente na venda) e reenvie: a nota
        sai de novo com o mesmo número.
      </p>
      <Button onClick={onTentarDeNovo} className="h-11 w-full">Reenviar{numero}</Button>
      <Button variant="outline" onClick={onVoltar} className="h-11 w-full">Fechar</Button>
    </div>
  )
}
