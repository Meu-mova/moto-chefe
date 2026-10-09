'use client'
import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, FileDown, Loader2, RefreshCw, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ehFinal, ehRecusada, emCancelamento, podeDescartarTentativa } from '@/lib/notagateway/status'
import { NfSaidaCard } from './nf-saida-card'
import {
  previsualizarNfePropriaAction, transmitirNfePropriaAction, consultarNfePropriaAction, salvarFichaMotoAction,
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

type Props = { motoId: string; onVoltar: () => void }

type Previa = Extract<PreviaNfe, { ok: true }>

/**
 * Emissão da NF-e pelo próprio MOVA: pré-visualiza → confere → transmite.
 *
 * Em PRODUÇÃO a autorização fatura a venda, e o revalidate desmonta este
 * painel (o botão só existe para venda sem NF). Por isso o DANFE, o checklist
 * e o certificado abrem logo que a action volta — antes do desmonte.
 */
export function NfePropriaPainel({ motoId, onVoltar }: Props) {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ nota: NotaResumo; erro?: string } | null>(null)
  const [conferido, setConferido] = useState(false)
  const [ficha, setFicha] = useState<FichaMoto | null>(null)
  const [pending, startTransition] = useTransition()
  const [transmitindo, setTransmitindo] = useState(false)

  function carregar() {
    setErro('')
    startTransition(async () => {
      const r = await previsualizarNfePropriaAction(motoId)
      if (!r.ok) { setErro(r.error); return }
      setPrevia(r)
      setFicha(r.ficha ? null : r.sugestao)
    })
  }

  useEffect(carregar, [motoId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    carregar()
  }

  if (!previa) {
    return (
      <div className="space-y-3 py-2">
        {erro ? (
          <>
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
            <div className="flex justify-end"><Button variant="outline" onClick={onVoltar}>Voltar</Button></div>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Montando a nota…
          </p>
        )}
      </div>
    )
  }

  const teste = previa.ambiente === 'Homologacao'

  if (transmitindo) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Loader2 size={24} className="animate-spin text-teal-600" />
        <p className="text-sm font-medium text-slate-700">Enviando à SEFAZ…</p>
        <p className="text-xs text-slate-500">Costuma levar poucos segundos. Não feche esta janela.</p>
      </div>
    )
  }

  if (resultado) return <Resultado r={resultado} teste={teste} pending={pending} onReconsultar={reconsultar} onAtualizada={nota => setResultado({ nota })} onTentarDeNovo={tentarDeNovo} onVoltar={onVoltar} />

  const r = previa.resumo
  const bloqueadaProducao = !teste && !!previa.jaFaturada

  return (
    <div className="space-y-3 py-1">
      {teste && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            <b>Ambiente de teste (homologação).</b> A nota vai para a SEFAZ de teste, sai sem valor fiscal e a
            venda <b>não</b> é faturada. Para valer, troque o ambiente em Admin → Notas fiscais.
          </span>
        </div>
      )}

      {bloqueadaProducao && (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Esta venda já tem a NF <b>{previa.jaFaturada}</b>.
        </p>
      )}

      {previa.pendencias.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-sm font-medium text-red-800">Corrija antes de emitir:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-700">
            {previa.pendencias.map(p => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {ficha && (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
          <div>
            <p className="text-sm font-medium text-amber-900">Esta moto está sem ficha fiscal</p>
            <p className="text-xs text-amber-800">
              A nota de entrada dela não foi importada. Preencha com os dados da nota do fornecedor — ficam
              gravados na moto.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Descrição fiscal (como na nota de entrada)</Label>
              <Input value={ficha.xProd} onChange={e => setFicha({ ...ficha, xProd: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">NCM</Label>
              <Input value={ficha.ncm} onChange={e => setFicha({ ...ficha, ncm: e.target.value })} placeholder="87116000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CEST</Label>
              <Input value={ficha.cest} onChange={e => setFicha({ ...ficha, cest: e.target.value })} placeholder="2600100" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidade</Label>
              <Input value={ficha.unidade} onChange={e => setFicha({ ...ficha, unidade: e.target.value })} placeholder="UN" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Origem na nota de entrada</Label>
              <select
                value={ficha.origem}
                onChange={e => setFicha({ ...ficha, origem: e.target.value })}
                className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                {ORIGENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={salvarFicha} disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar ficha e continuar'}
            </Button>
          </div>
        </div>
      )}

      {r && (
        <div className="divide-y rounded-md border text-sm">
          <Linha titulo="Destinatário">
            <p className="font-medium">{r.cliente.nome}</p>
            <p className="text-slate-600">{r.cliente.documento}</p>
            <p className="text-slate-600">{r.cliente.endereco}</p>
            {r.cliente.email && !teste && <p className="text-slate-500">DANFE por e-mail para {r.cliente.email}</p>}
          </Linha>
          <Linha titulo="Produto">
            <p className="font-medium">{r.produto.descricao}</p>
            <p className="text-slate-600">
              NCM {r.produto.ncm} · CEST {r.produto.cest} · CFOP {r.produto.cfop} · CST {r.produto.cst}
            </p>
            <p className="text-slate-600">
              Origem {r.produto.origemSaida}
              {r.produto.origemEntrada !== r.produto.origemSaida && ` (entrou como ${r.produto.origemEntrada})`}
              {r.interestadual && ' · venda para fora do estado'}
            </p>
          </Linha>
          <Linha titulo="Valor">
            <p className="font-semibold">{brl(r.valor)}</p>
            {r.pagamentos.map((p, i) => (
              <p key={i} className="text-slate-600">{ROTULO_PAGAMENTO[p.tipo] ?? p.tipo}: {brl(p.valor)}</p>
            ))}
          </Linha>
          <Linha titulo="Tributos">
            <p className="text-slate-600">PIS {r.tributos.pis} · COFINS {r.tributos.cofins}</p>
            {r.tributos.aproximado != null && (
              <p className="text-slate-600">Aprox. (IBPT): {brl(r.tributos.aproximado)}</p>
            )}
          </Linha>
          <Linha titulo="Observação">
            <p className="whitespace-pre-line text-xs text-slate-600">{r.observacao}</p>
          </Linha>
        </div>
      )}

      {previa.notas.length > 0 && <Historico notas={previa.notas} onAtualizada={atualizarNota} />}

      {erro && <p className="whitespace-pre-line text-sm text-red-600">{erro}</p>}

      {r && !bloqueadaProducao && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={conferido} onChange={e => setConferido(e.target.checked)} />
          Conferi cliente, produto, valor e pagamentos.
        </label>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onVoltar} disabled={pending}>Voltar</Button>
        {r && !bloqueadaProducao && (
          <Button onClick={transmitir} disabled={pending || !conferido} className="gap-1.5">
            <Send size={14} /> {teste ? 'Transmitir teste' : 'Transmitir NF-e'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Linha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 p-3 sm:grid-cols-[110px_1fr]">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{titulo}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Links({ nota }: { nota: NotaResumo }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {nota.linkDanfe && (
        <a href={nota.linkDanfe} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
          <ExternalLink size={13} /> DANFE
        </a>
      )}
      {nota.linkXml && (
        <a href={nota.linkXml} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
          <FileDown size={13} /> XML
        </a>
      )}
    </div>
  )
}

function Historico({ notas, onAtualizada }: { notas: NotaResumo[]; onAtualizada: (nota: NotaResumo) => void }) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Tentativas anteriores</p>
      <div className="space-y-2">
        {notas.map(n => <NfSaidaCard key={n.id} nota={n} onAtualizada={onAtualizada} />)}
      </div>
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
      <div className="space-y-3 py-2">
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600" />
          <div className="text-sm text-green-800">
            <p className="font-medium">NF-e {nota.numero} (série {nota.serie}) autorizada pela SEFAZ</p>
            <p>{teste ? 'Nota de teste — sem valor fiscal, a venda não foi faturada.' : 'A venda foi faturada e a moto marcada como vendida.'}</p>
          </div>
        </div>
        <Links nota={nota} />
        <div className="flex justify-end"><Button variant="outline" onClick={onVoltar}>Fechar</Button></div>
      </div>
    )
  }

  if (!ehFinal(nota.status) && !emCancelamento(nota.status) && !podeDescartarTentativa(nota, new Date())) {
    return (
      <div className="space-y-3 py-2">
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          A SEFAZ ainda não respondeu. A nota está em processamento — consulte de novo em instantes.
          Não transmita outra: a nota pode já ter sido recebida.
        </p>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onVoltar}>Fechar</Button>
          <Button onClick={() => onReconsultar(nota.id)} disabled={pending} className="gap-1.5">
            <RefreshCw size={14} className={pending ? 'animate-spin' : ''} /> Consultar agora
          </Button>
        </div>
      </div>
    )
  }

  if (!ehRecusada(nota.status)) {
    // Cancelada, com cancelamento recusado ou em andamento, ou parada em Enviando: o card mostra o que dá para fazer.
    return (
      <div className="space-y-3 py-2">
        <NfSaidaCard nota={nota} onAtualizada={onAtualizada} />
        <div className="flex justify-end"><Button variant="outline" onClick={onVoltar}>Fechar</Button></div>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
        <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
        <div className="text-sm text-red-800">
          <p className="font-medium">A nota não foi autorizada</p>
          <p className="whitespace-pre-line">{nota.motivoStatus ?? r.erro ?? 'Sem motivo informado.'}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Corrija o que a SEFAZ apontou (em geral, dados do cliente na venda) e tente de novo — a nova
        tentativa usa um número de controle novo.
      </p>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onVoltar}>Fechar</Button>
        <Button onClick={onTentarDeNovo}>Tentar de novo</Button>
      </div>
    </div>
  )
}
