'use client'
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import type { StatusConc } from '@/lib/conciliacao-status'
import type { DescontoDaVenda } from '@/lib/queries/descontos'
import type { NfDaVenda } from './nf-saida-venda-dialog'

export type ItemVenda = { venda: VendaComDetalhes; status: StatusConc }
type Estado = 'ok' | 'andamento' | 'nada'

export function moeda(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function data(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR')
}

function estadoAssinatura(s: string | null): Estado {
  return s === 'assinado' ? 'ok' : s === 'pendente' || s === 'visualizado' ? 'andamento' : 'nada'
}

const TEXTO_ASSINATURA: Record<Estado, string> = { ok: 'Assinado', andamento: 'Aguardando o cliente', nada: 'Não enviado' }
const textoAssinatura = (s: string | null) => TEXTO_ASSINATURA[estadoAssinatura(s)]

// Uma fonte só para cor e texto de cada estado: bolinha grande, miniatura e leitor de tela.
const BOLINHA: Record<Estado, string> = {
  ok:        'bg-primary text-primary-foreground',
  andamento: 'bg-warning/10 text-warning ring-1 ring-warning',
  nada:      'bg-muted text-muted-foreground ring-1 ring-border',
}
const TEXTO_ETAPA: Record<Estado, string> = { ok: 'text-primary-text', andamento: 'text-warning', nada: 'text-muted-foreground' }
const LEITURA: Record<Estado, string> = { ok: 'feito', andamento: 'em andamento', nada: 'pendente' }

/** Descrição da moto usada nos diálogos (NF, cancelamento). */
export const descricaoMoto = (v: VendaComDetalhes) => `${v.modelo} — ${v.chassi}`

const CONC: Record<StatusConc, { estado: Estado; texto: string }> = {
  conciliada: { estado: 'ok', texto: 'Conciliada' },
  parcial:    { estado: 'andamento', texto: 'Parcial' },
  pendente:   { estado: 'nada', texto: 'Pendente' },
  na:         { estado: 'nada', texto: '—' },
}

/** Onde a venda parou: Contrato → NF saída → Conciliação (esta só para quem concilia). */
function etapas(v: VendaComDetalhes, status: StatusConc, podeConciliacao: boolean) {
  const lista: { nome: string; estado: Estado }[] = [
    { nome: 'Contrato', estado: estadoAssinatura(v.contratoStatus) },
    { nome: 'NF saída', estado: v.notaFiscalSaida ? 'ok' : 'nada' },
  ]
  if (podeConciliacao) lista.push({ nome: 'Conciliação', estado: CONC[status].estado })
  return lista
}

function Etapas({ itens }: { itens: { nome: string; estado: Estado }[] }) {
  return (
    <span role="list" className="mt-3 flex items-start" aria-label="Etapas da venda">
      {itens.map((e, i) => (
        <span role="listitem" key={e.nome} className="flex flex-1 items-start last:flex-none">
          <span className="flex flex-col items-center gap-1">
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full text-[10px] font-bold',
                BOLINHA[e.estado],
              )}
            >
              {e.estado === 'ok' ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('text-[11px] whitespace-nowrap', TEXTO_ETAPA[e.estado])}>
              {e.nome}
              <span className="sr-only">: {LEITURA[e.estado]}</span>
            </span>
          </span>
          {i < itens.length - 1 && (
            <span className={cn('mx-1 mt-2.5 h-0.5 flex-1 rounded', e.estado === 'ok' ? 'bg-primary' : 'bg-border')} />
          )}
        </span>
      ))}
    </span>
  )
}

/** Etapas em miniatura, para caber na linha da tabela do desktop. */
export function EtapasMini({ v, status, podeConciliacao }: { v: VendaComDetalhes; status: StatusConc; podeConciliacao: boolean }) {
  const itens = etapas(v, status, podeConciliacao)
  const descricao = itens.map(e => `${e.nome}: ${LEITURA[e.estado]}`).join(' · ')
  return (
    <span className="flex items-center gap-1" title={descricao} aria-label={descricao}>
      {itens.map((e, i) => (
        <span key={e.nome} className="flex items-center gap-1">
          <span
            className={cn(
              'grid size-4 place-items-center rounded-full text-[9px] font-bold',
              BOLINHA[e.estado],
            )}
          >
            {e.estado === 'ok' ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
          </span>
          {i < itens.length - 1 && <span className={cn('h-0.5 w-3 rounded', e.estado === 'ok' ? 'bg-primary' : 'bg-border')} />}
        </span>
      ))}
    </span>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  )
}

type PainelProps = {
  item: ItemVenda
  /** Ações da venda, já no layout do painel. */
  acoes: React.ReactNode
  /** Ausente = sem permissão de operar NF: o número aparece como texto. */
  onAbrirNf?: (nf: NfDaVenda) => void
  podeConciliacao: boolean
  desconto?: DescontoDaVenda
  /** Título acessível vem de fora: SheetTitle na gaveta, h2 no painel do desktop. */
  titulo: React.ReactNode
  onFechar?: () => void
}

/** Detalhe da venda: na gaveta do celular e no painel lateral do desktop. */
export function PainelVenda({ item, acoes, onAbrirNf, podeConciliacao, desconto: d, titulo, onFechar }: PainelProps) {
  const { venda: v, status } = item
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Venda #{v.numero} · {data(v.dataVenda)}</p>
          {titulo}
          <p className="text-2xl font-bold tabular-nums">{moeda(v.valor)}</p>
        </div>
        {onFechar && (
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-5" />
          </button>
        )}
      </div>
      <Etapas itens={etapas(v, status, podeConciliacao)} />
      <div className="text-sm">
        <Linha rotulo="Cliente">{v.clienteNome}</Linha>
        <Linha rotulo="Vendedor">{v.vendedorNome} · {v.lojaNome}</Linha>
        <Linha rotulo="Chassi"><span className="font-mono text-xs">{v.chassi}</span></Linha>
        {d && <Linha rotulo="Desconto"><span className="tabular-nums text-destructive" title={d.motivo}>{moeda(d.margem)}{d.estimado ? '*' : ''}</span></Linha>}
        <Linha rotulo="Contrato">
          {textoAssinatura(v.contratoStatus)}
          {v.contratoStatus !== 'assinado' && v.nfLiberadaEm ? ' · NF liberada por exceção' : ''}
        </Linha>
        <Linha rotulo="Checklist">{textoAssinatura(v.checklistStatus)}</Linha>
        <Linha rotulo="NF saída">
          {v.notaFiscalSaida && onAbrirNf ? (
            <button
              type="button"
              onClick={() => onAbrirNf({ vendaId: v.id, vendaNumero: v.numero, numeroNf: v.notaFiscalSaida!, descricao: descricaoMoto(v) })}
              className="font-medium text-primary-text underline-offset-2 hover:underline"
            >
              {v.notaFiscalSaida}
            </button>
          ) : (v.notaFiscalSaida ?? 'Sem NF')}
        </Linha>
        {podeConciliacao && <Linha rotulo="Conciliação">{CONC[status].texto}</Linha>}
      </div>
      <div className="border-t border-border pt-4">{acoes}</div>
    </div>
  )
}

type Props = {
  itens: ItemVenda[]
  acoes: (v: VendaComDetalhes) => React.ReactNode
  onAbrirNf?: (nf: NfDaVenda) => void
  podeConciliacao: boolean
  descontos?: Map<string, DescontoDaVenda>
}

/** Vendas no celular/tablet: cartão com as etapas; o toque abre a gaveta com o painel da venda. */
export function CartoesVendas({ itens, acoes, onAbrirNf, podeConciliacao, descontos }: Props) {
  // Guarda só o id: depois de uma action, o revalidatePath traz a venda nova e a gaveta mostra ela.
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const aberta = itens.find(i => i.venda.id === abertaId)

  if (itens.length === 0) {
    return <p className="rounded-lg border border-border bg-card py-8 text-center text-sm text-muted-foreground">Nenhuma venda encontrada.</p>
  }

  return (
    <>
      <div className="space-y-3">
        {itens.map(({ venda: v, status }) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setAbertaId(v.id)}
            className="block w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-muted"
          >
            <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>#{v.numero} · {data(v.dataVenda)}</span>
              <span className="truncate">{v.lojaNome}</span>
            </span>
            <span className="mt-1 flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{v.modelo}</span>
                <span className="block truncate text-sm text-muted-foreground">{v.clienteNome}</span>
              </span>
              <span className="text-lg font-bold whitespace-nowrap tabular-nums">{moeda(v.valor)}</span>
            </span>
            <Etapas itens={etapas(v, status, podeConciliacao)} />
          </button>
        ))}
      </div>

      <Sheet open={!!aberta} onOpenChange={o => !o && setAbertaId(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          {aberta && (
            <PainelVenda
              item={aberta}
              acoes={acoes(aberta.venda)}
              onAbrirNf={onAbrirNf}
              podeConciliacao={podeConciliacao}
              desconto={descontos?.get(aberta.venda.id)}
              titulo={<SheetTitle className="text-lg">{aberta.venda.modelo} <span className="font-normal text-muted-foreground">· {aberta.venda.cor}</span></SheetTitle>}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
