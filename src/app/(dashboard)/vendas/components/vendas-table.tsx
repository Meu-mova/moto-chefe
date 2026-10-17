'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronRight, Eye, FileText, Pencil, ShieldAlert, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GarantiaButton } from '../../estoque/components/garantia-button'
import { NfSaidaButton } from '../../estoque/components/nf-saida-button'
import { CancelarVendaButton } from './cancelar-venda-button'
import { DetalhesVendaDialog } from './detalhes-venda-dialog'
import { EditarVendaDialog } from './editar-venda-dialog'
import { NfSaidaVendaDialog, type NfDaVenda } from './nf-saida-venda-dialog'
import { podeOperarNfSaida } from '../papeis-nf-saida'
import { CartoesVendas, EtapasMini, PainelVenda, data, descricaoMoto, moeda, type ItemVenda } from './vendas-cartoes'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import { calcStatusMultiPagamento, type StatusConc } from '@/lib/conciliacao-status'
import type { DescontoDaVenda } from '@/lib/queries/descontos'
import { PAPEIS_QUE_CANCELAM_VENDA } from '@/lib/cancelar-venda'

const podeGarantia = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const podeEditar   = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const ADMINS       = new Set(['admin_geral', 'admin_socio'])

// Só o que é específico de venda de moto fica aqui: o fallback para
// vendas.status_conciliacao das vendas antigas, anteriores ao array `pagamentos`.
// O resto é a mesma conta de peças, OS e dashboard — ver @/lib/conciliacao-status.
function calcStatus(
  pagamentos: unknown,
  conciliadoValor: number,
  pixConciliadoValor: number,
  valorVenda: string,
  statusConciliacao: string,
): StatusConc {
  const pgtos = (pagamentos ?? []) as { tipo: string; valor: number }[]
  const totalLancado = pgtos.reduce((a, p) => a + (Number(p.valor) || 0), 0)

  if (totalLancado < 0.01) {
    if (statusConciliacao === 'pendente')   return 'pendente'
    if (statusConciliacao === 'parcial')    return 'parcial'
    if (statusConciliacao === 'aprovado')   return 'conciliada'
    return 'na'
  }

  return calcStatusMultiPagamento(pagamentos, conciliadoValor, pixConciliadoValor, valorVenda)
}

type Props = {
  vendas: VendaComDetalhes[]
  papel: string
  lojaIdUsuario?: string | null
  vendedores: { id: string; nome: string }[]
  /** Origens ativas do grupo, para corrigir a origem na edição. */
  origens: OrigemParaEscolher[]
  /** Desconto por venda. Ausente = sem permissão pra ver, e o desconto não aparece. */
  descontos?: Map<string, DescontoDaVenda>
}

const botaoGrade = 'flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50'

/**
 * Ações da venda no painel (gaveta do celular e painel do desktop): a principal (emitir NF)
 * larga no topo e as outras numa grade igual, com o cancelar em vermelho no fim. Permissões
 * iguais às da antiga coluna de ações da tabela.
 */
function AcoesVenda({ v, papel, lojaIdUsuario, vendedores, origens, descontos }: Omit<Props, 'vendas'> & { v: VendaComDetalhes }) {
  const podeEditarVenda = podeEditar.has(papel) && (!lojaIdUsuario || v.lojaId === lojaIdUsuario)
  const podeEmitirNf    = !v.notaFiscalSaida && podeOperarNfSaida(papel)
  const blocos = 1 + (podeEditarVenda ? 1 : 0) + (podeGarantia.has(papel) ? 1 : 0) + (PAPEIS_QUE_CANCELAM_VENDA.has(papel) ? 1 : 0)
  return (
    <div className="space-y-2">
      {podeEmitirNf && (
        <NfSaidaButton
          motoId={v.motoId}
          descricao={descricaoMoto(v)}
          gatilho={abrir => (
            <button type="button" onClick={abrir} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover">
              <FileText className="size-4" /> Emitir NF de saída
            </button>
          )}
        />
      )}
      <div className={cn('grid gap-2', ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][blocos - 1])}>
        <DetalhesVendaDialog
          venda={v}
          papel={papel}
          desconto={descontos?.get(v.id)}
          gatilho={abrir => <button type="button" onClick={abrir} className={botaoGrade}><Eye className="size-4 text-muted-foreground" /> Detalhes</button>}
        />
        {podeEditarVenda && (
          <EditarVendaDialog
            venda={v}
            papel={papel}
            vendedores={vendedores}
            origens={origens}
            gatilho={abrir => <button type="button" onClick={abrir} className={botaoGrade}><Pencil className="size-4 text-muted-foreground" /> Editar</button>}
          />
        )}
        {podeGarantia.has(papel) && (
          <GarantiaButton
            motoId={v.motoId}
            descricao={`${v.modelo} — ${v.cor} (${v.lojaNome})`}
            gatilho={abrir => <button type="button" onClick={abrir} className={botaoGrade}><ShieldAlert className="size-4 text-muted-foreground" /> Garantia</button>}
          />
        )}
        {PAPEIS_QUE_CANCELAM_VENDA.has(papel) && (
          <CancelarVendaButton
            vendaId={v.id}
            descricao={`${descricaoMoto(v)} — ${v.clienteNome}`}
            valorRecebido={(Number(v.conciliadoValor) || 0) + (Number(v.pixConciliadoValor) || 0)}
            notaFiscalSaida={v.notaFiscalSaida}
            gatilho={abrir => (
              <button type="button" onClick={abrir} className={cn(botaoGrade, 'border-destructive/30 text-destructive hover:bg-destructive/10')}>
                <XCircle className="size-4" /> Cancelar
              </button>
            )}
          />
        )}
      </div>
    </div>
  )
}

export function VendasTable(props: Props) {
  const { vendas, papel, descontos } = props
  const [nfAberta, setNfAberta] = useState<NfDaVenda | null>(null)
  // Guarda só o id: depois de uma action, o revalidatePath traz a venda nova e o painel mostra ela.
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const podeConciliacao = ADMINS.has(papel) || papel === 'aux_adm'
  const onAbrirNf = podeOperarNfSaida(papel) ? setNfAberta : undefined

  const searchParams = useSearchParams()
  const concFiltro = (searchParams.get('conc') ?? '').split(',').filter(Boolean)
  const itens: ItemVenda[] = vendas
    .map(v => ({
      venda: v,
      status: calcStatus(v.pagamentos, v.conciliadoValor as number, v.pixConciliadoValor as number, v.valor, v.statusConciliacao),
    }))
    .filter(({ status }) => concFiltro.length === 0 || concFiltro.includes(status))
  const selecionada = itens.find(i => i.venda.id === selecionadaId)
  const acoes = (v: VendaComDetalhes) => <AcoesVenda {...props} v={v} />

  return (
    <>
      <div className="lg:hidden">
        <CartoesVendas itens={itens} acoes={acoes} onAbrirNf={onAbrirNf} podeConciliacao={podeConciliacao} descontos={descontos} />
      </div>

      {/* Desktop: tabela enxuta; clicar na linha abre o painel à direita. */}
      <div className="hidden items-start gap-4 lg:flex">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Moto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Etapas</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-8"><span className="sr-only">Abrir</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map(({ venda: v, status }) => (
                <TableRow
                  key={v.id}
                  onClick={() => setSelecionadaId(v.id)}
                  className={cn('cursor-pointer hover:bg-muted', v.id === selecionadaId && 'bg-primary-soft hover:bg-primary-soft')}
                >
                  <TableCell className="font-mono text-muted-foreground">#{v.numero}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{data(v.dataVenda)}</TableCell>
                  <TableCell>
                    <span className="block font-medium">{v.modelo} <span className="font-normal text-muted-foreground">· {v.cor}</span></span>
                    <span className="block max-w-48 truncate font-mono text-[11px] text-muted-foreground" title={v.chassi}>{v.chassi}</span>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{v.clienteNome}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{v.vendedorNome}</TableCell>
                  <TableCell><EtapasMini v={v} status={status} podeConciliacao={podeConciliacao} /></TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{moeda(v.valor)}</TableCell>
                  <TableCell>
                    <button type="button" aria-label={`Abrir venda #${v.numero}`} onClick={e => { e.stopPropagation(); setSelecionadaId(v.id) }} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma venda encontrada.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {selecionada && (
          <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] w-96 shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg" aria-label={`Venda #${selecionada.venda.numero}`}>
            <PainelVenda
              item={selecionada}
              acoes={acoes(selecionada.venda)}
              onAbrirNf={onAbrirNf}
              podeConciliacao={podeConciliacao}
              desconto={descontos?.get(selecionada.venda.id)}
              titulo={<h2 className="text-lg font-semibold">{selecionada.venda.modelo} <span className="font-normal text-muted-foreground">· {selecionada.venda.cor}</span></h2>}
              onFechar={() => setSelecionadaId(null)}
            />
          </aside>
        )}
      </div>

      {/* Fora das linhas: cancelar a NF em produção tira o número da venda, e o
          revalidatePath redesenha a linha sem o botão que abriu o diálogo. */}
      {nfAberta && <NfSaidaVendaDialog nf={nfAberta} onFechar={() => setNfAberta(null)} />}
    </>
  )
}
