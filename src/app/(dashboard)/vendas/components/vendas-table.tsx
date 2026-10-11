'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GarantiaButton } from '../../estoque/components/garantia-button'
import { NfSaidaButton } from '../../estoque/components/nf-saida-button'
import { CancelarVendaButton } from './cancelar-venda-button'
import { DetalhesVendaDialog } from './detalhes-venda-dialog'
import { EditarVendaDialog } from './editar-venda-dialog'
import { NfSaidaVendaDialog, type NfDaVenda } from './nf-saida-venda-dialog'
import { podeOperarNfSaida } from '../papeis-nf-saida'
import { CartoesVendas } from './vendas-cartoes'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import type { VendaComDetalhes } from '@/lib/queries/vendas'
import { calcStatusMultiPagamento, type StatusConc } from '@/lib/conciliacao-status'
import { ClipboardCheck, FileSignature, type LucideIcon } from 'lucide-react'
import type { DescontoDaVenda } from '@/lib/queries/descontos'

/**
 * Só o administrativo recebe o mapa — o vendedor veria o desconto dos colegas,
 * já que a listagem é da loja inteira. Sem mapa, a coluna nem existe.
 */
function CelulaDesconto({ d }: { d?: DescontoDaVenda }) {
  if (!d) return <TableCell className="text-slate-300">—</TableCell>
  return (
    <TableCell className="tabular-nums text-rose-700 whitespace-nowrap" title={d.motivo}>
      {formatarValor(String(d.margem))}{d.estimado ? '*' : ''}
      <span className="block text-[10px] text-slate-400">
        {d.preco > 0 ? `preço ${formatarValor(String(d.preco))}` : 'só taxa'}
      </span>
    </TableCell>
  )
}

/**
 * Estado da assinatura na listagem. Verde = assinado; âmbar = enviado e
 * aguardando; cinza = nem enviado. Só o contrato trava a NF — o checklist é
 * conferência de entrega e não bloqueia nada.
 */
function IconeAssinatura({
  status, rotulo, Icone, trava = false, liberada = false,
}: {
  status: string | null
  rotulo: string
  Icone: LucideIcon
  trava?: boolean
  liberada?: boolean
}) {
  const assinado = status === 'assinado'
  const pendente = status === 'pendente' || status === 'visualizado'

  const cor = assinado ? 'text-emerald-600'
    : pendente ? 'text-amber-500'
    : 'text-slate-300'

  const descricao = assinado ? `${rotulo}: assinado`
    : pendente ? `${rotulo}: aguardando assinatura do cliente`
    : `${rotulo}: não enviado`

  const nota = !assinado && trava
    ? (liberada ? ' — NF liberada por exceção' : ' — a NF fica bloqueada até assinar')
    : ''

  return (
    <span title={descricao + nota} className={cor}>
      <Icone size={15} />
    </span>
  )
}

const podeGarantia = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const podeCancelar = new Set(['admin_geral', 'admin_socio'])
const podeEditar   = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const ADMINS       = new Set(['admin_geral', 'admin_socio'])

// Só o que é específico de venda de moto fica aqui: o fallback para
// vendas.status_conciliacao das vendas antigas, anteriores ao array `pagamentos`.
// O resto é a mesma conta de peças, OS e dashboard — ver @/lib/conciliacao-status.
export function calcStatus(
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

const BADGE: Record<StatusConc, { label: string; cls: string } | null> = {
  na:          null,
  pendente:    { label: 'Pendente',   cls: 'bg-red-50 text-red-700 border-red-200' },
  parcial:     { label: 'Parcial',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  conciliada:  { label: '✓ OK',       cls: 'bg-green-50 text-green-700 border-green-200' },
}

function ConcBadge({ status }: { status: StatusConc }) {
  const b = BADGE[status]
  if (!b) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${b.cls}`}>
      {b.label}
    </span>
  )
}

function formatarValor(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR')
}

type Props = {
  vendas: VendaComDetalhes[]
  papel: string
  lojaIdUsuario?: string | null
  vendedores: { id: string; nome: string }[]
  /** Origens ativas do grupo, para corrigir a origem na edição. */
  origens: OrigemParaEscolher[]
  /** Desconto por venda. Ausente = sem permissão pra ver, e a coluna some. */
  descontos?: Map<string, DescontoDaVenda>
}

/** Ações de uma venda: na última coluna da tabela e na gaveta do cartão (celular). */
export function AcoesVenda({ v, papel, lojaIdUsuario, vendedores, origens, descontos, comRotulo }: Omit<Props, 'vendas'> & { v: VendaComDetalhes; comRotulo?: boolean }) {
  const podeFazerGarantia = podeGarantia.has(papel)
  const podeNfSaida       = podeOperarNfSaida(papel)
  const podeEditarVenda   = podeEditar.has(papel)
  const descricaoMoto = `${v.modelo} — ${v.chassi}`
  return (
    <>
                  <DetalhesVendaDialog venda={v} papel={papel} desconto={descontos?.get(v.id)} />
                  {podeEditarVenda && (!lojaIdUsuario || v.lojaId === lojaIdUsuario) && <EditarVendaDialog venda={v} papel={papel} vendedores={vendedores} origens={origens} />}
                  {!v.notaFiscalSaida && podeNfSaida && (
                    <NfSaidaButton
                      motoId={v.motoId}
                      descricao={descricaoMoto}
                    />
                  )}
                  {podeFazerGarantia && (
                    <GarantiaButton
                      showLabel={comRotulo}
                      motoId={v.motoId}
                      descricao={`${v.modelo} — ${v.cor} (${v.lojaNome})`}
                    />
                  )}
                  {podeCancelar.has(papel) && (
                    <CancelarVendaButton
                      vendaId={v.id}
                      descricao={`${v.modelo} — ${v.chassi} — ${v.clienteNome}`}
                      valorRecebido={(Number(v.conciliadoValor) || 0) + (Number(v.pixConciliadoValor) || 0)}
                      notaFiscalSaida={v.notaFiscalSaida}
                    />
                  )}
    </>
  )
}

export function VendasTable(props: Props) {
  const [nfAberta, setNfAberta] = useState<NfDaVenda | null>(null)
  return (
    <>
      <TabelaDeVendas {...props} onAbrirNf={setNfAberta} />
      {/* Fora das linhas: cancelar a NF em produção tira o número da venda, e o
          revalidatePath redesenha a linha sem o botão que abriu o diálogo. */}
      {nfAberta && <NfSaidaVendaDialog nf={nfAberta} onFechar={() => setNfAberta(null)} />}
    </>
  )
}

function TabelaDeVendas({ vendas, papel, lojaIdUsuario, vendedores, origens, descontos, onAbrirNf }: Props & { onAbrirNf: (nf: NfDaVenda) => void }) {
  const podeFazerGarantia  = podeGarantia.has(papel)
  const podeNfSaida        = podeOperarNfSaida(papel)
  const isAdmin            = ADMINS.has(papel)
  const podeConciliacao    = isAdmin || papel === 'aux_adm'
  const colSpan = (podeFazerGarantia ? (podeConciliacao ? 11 : 10) : (podeConciliacao ? 10 : 9)) + (descontos ? 1 : 0)

  const searchParams = useSearchParams()
  const concFiltro = (searchParams.get('conc') ?? '').split(',').filter(Boolean)

  const vendasComStatus = vendas.map(v => ({
    venda: v,
    status: calcStatus(v.pagamentos, v.conciliadoValor as number, v.pixConciliadoValor as number, v.valor, v.statusConciliacao),
  }))
  const vendasFiltradas = concFiltro.length > 0
    ? vendasComStatus.filter(({ status }) => concFiltro.includes(status))
    : vendasComStatus

  return (
    <>
    <div className="lg:hidden">
      <CartoesVendas
        itens={vendasFiltradas}
        acoes={v => <AcoesVenda v={v} papel={papel} lojaIdUsuario={lojaIdUsuario} vendedores={vendedores} origens={origens} descontos={descontos} comRotulo />}
        onAbrirNf={podeNfSaida ? onAbrirNf : undefined}
        podeConciliacao={podeConciliacao}
        descontos={descontos}
      />
    </div>
    <div className="hidden overflow-x-auto rounded-lg border border-border bg-card lg:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Nº</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead className="text-xs text-slate-500 w-36">Chassi</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead className="w-16">Assin.</TableHead>
          <TableHead>NF Saída</TableHead>
          <TableHead>Valor</TableHead>
          {descontos && (
            <TableHead title="Desconto sobre o preço mínimo. Margem = o que faltou pro piso depois das taxas; preço = o que foi cedido na negociação.">
              Desconto
            </TableHead>
          )}
          {podeConciliacao && <TableHead>Conciliação</TableHead>}
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendasFiltradas.map(({ venda: v, status }) => {
          const descricaoMoto = `${v.modelo} — ${v.chassi}`
          return (
            <TableRow key={v.id}>
              <TableCell className="font-mono font-medium text-slate-700">#{v.numero}</TableCell>
              <TableCell className="text-slate-500 text-sm whitespace-nowrap">
                {formatarData(v.dataVenda)}
              </TableCell>
              <TableCell className="font-medium">{v.modelo}</TableCell>
              <TableCell className="font-mono text-xs text-slate-500 max-w-36">
                <span className="block truncate" title={v.chassi}>{v.chassi}</span>
              </TableCell>
              <TableCell>{v.cor}</TableCell>
              <TableCell>{v.lojaNome}</TableCell>
              <TableCell>{v.vendedorNome}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <IconeAssinatura
                    status={v.contratoStatus}
                    rotulo="Contrato"
                    Icone={FileSignature}
                    trava
                    liberada={!!v.nfLiberadaEm}
                  />
                  <IconeAssinatura
                    status={v.checklistStatus}
                    rotulo="Checklist de entrega"
                    Icone={ClipboardCheck}
                  />
                </div>
              </TableCell>
              <TableCell className="text-slate-500">
                {v.notaFiscalSaida && podeNfSaida ? (
                  <button
                    type="button"
                    onClick={() => onAbrirNf({ vendaId: v.id, vendaNumero: v.numero, numeroNf: v.notaFiscalSaida!, descricao: descricaoMoto })}
                    className="font-medium text-blue-600 hover:underline"
                    title="Ver a NF de saída"
                  >
                    {v.notaFiscalSaida}
                  </button>
                ) : (v.notaFiscalSaida ?? '—')}
              </TableCell>
              <TableCell className="font-medium tabular-nums">{formatarValor(v.valor)}</TableCell>
              {descontos && <CelulaDesconto d={descontos.get(v.id)} />}
              {podeConciliacao && (
                <TableCell>
                  <ConcBadge status={status} />
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  <AcoesVenda v={v} papel={papel} lojaIdUsuario={lojaIdUsuario} vendedores={vendedores} origens={origens} descontos={descontos} />
                </div>
              </TableCell>
            </TableRow>
          )
        })}
        {vendasFiltradas.length === 0 && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-slate-400 py-8">
              Nenhuma venda encontrada.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </div>
    </>
  )
}
