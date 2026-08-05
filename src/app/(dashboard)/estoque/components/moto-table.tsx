import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Eye, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeftRight, Printer } from 'lucide-react'
import { MotoStatusIcon } from '@/components/moto-status-icon'
import { VenderButton } from './vender-button'
import { GarantiaButton } from './garantia-button'
import { LogisticaButton } from './logistica-button'
import { NfSaidaButton } from './nf-saida-button'
import { MontarButton } from './montar-button'
import { podeVendedorReservarForaDaLoja } from '@/lib/loja-galpao'
import type { MotoComDetalhes } from '@/lib/queries/motos'
import type { DemandaCompativel } from '@/lib/queries/demandas'

const dispBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  disponivel: { label: 'Disponível', variant: 'default' },
  reservada:  { label: 'Reservada',  variant: 'outline' },
  vendida:    { label: 'Vendida',    variant: 'secondary' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', variant: 'destructive' },
}

const podeVender    = new Set(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'])
const podeGarantia  = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const podeLogistica = new Set(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'])
const podeMontar    = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const ADMINS        = new Set(['admin_geral', 'admin_socio'])

type Campo = 'modelo' | 'cor' | 'loja' | 'status' | 'disponibilidade'
type Loja  = { id: string; nome: string }

type Usuario = { id: string; nome: string }
type Mecanico = { id: string; nome: string }

type Props = {
  motos: MotoComDetalhes[]
  demandasComSinal: DemandaCompativel[]
  papel: string
  isVendedor?: boolean
  vendedorId: string
  vendedorNome: string
  usuarios: Usuario[]
  mecanicos: Mecanico[]
  lojas: Loja[]
  lojaUsuarioId: string | null
  podeAprovarPagamentoSensivel: boolean
  ord: string
  dir: string
  baseParams: string
}

function SortIcon({ campo, ord, dir }: { campo: Campo; ord: string; dir: string }) {
  if (ord !== campo) return <ArrowUpDown size={13} className="ml-1 text-slate-400 inline" />
  return dir === 'asc'
    ? <ArrowUp   size={13} className="ml-1 text-slate-600 inline" />
    : <ArrowDown size={13} className="ml-1 text-slate-600 inline" />
}

function sortHref(campo: Campo, ord: string, dir: string, baseParams: string): string {
  const p = new URLSearchParams(baseParams)
  p.set('ord', campo)
  p.set('dir', ord === campo && dir === 'asc' ? 'desc' : 'asc')
  return `/estoque?${p.toString()}`
}

export function MotoTable({ motos, demandasComSinal, papel, isVendedor, vendedorId, vendedorNome, usuarios, mecanicos, lojas, lojaUsuarioId, podeAprovarPagamentoSensivel, ord, dir, baseParams }: Props) {
  const isAdmin = ADMINS.has(papel)

  function th(campo: Campo, label: string) {
    return (
      <TableHead>
        <Link
          href={sortHref(campo, ord, dir, baseParams)}
          className="inline-flex items-center hover:text-slate-900 whitespace-nowrap select-none"
        >
          {label}
          <SortIcon campo={campo} ord={ord} dir={dir} />
        </Link>
      </TableHead>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {th('modelo',         'Modelo')}
          <TableHead className="text-slate-500 font-mono text-xs">Chassi</TableHead>
          {th('cor',            'Cor')}
          {th('loja',           'Loja')}
          {th('status',         'Status')}
          {th('disponibilidade','Disponibilidade')}
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {motos.map(moto => (
          <TableRow key={moto.id}>
            <TableCell className="font-medium">{moto.modelo}</TableCell>
            <TableCell className="font-mono text-xs text-slate-500">{moto.chassi}</TableCell>
            <TableCell>{moto.cor}</TableCell>
            <TableCell>{moto.lojaNome}</TableCell>
            <TableCell>
              <MotoStatusIcon status={moto.status} />
            </TableCell>
            <TableCell>
              {moto.status === 'vendida' && moto.disponibilidade === null
                ? <Badge variant="outline" className="border-teal-300 text-teal-700 bg-teal-50">Ag. NF Saída</Badge>
                : moto.disponibilidade
                  ? <Badge variant={dispBadge[moto.disponibilidade]?.variant ?? 'secondary'}>
                      {dispBadge[moto.disponibilidade]?.label ?? moto.disponibilidade}
                    </Badge>
                  : null
              }
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1 justify-end">
                {(() => {
                  const podeAlterar = isAdmin || moto.lojaId === lojaUsuarioId
                  // isVendedor cobre quem vende sem ter 'vendedor' como papel principal.
                  const podeVenderAqui = podeAlterar || ((isVendedor ?? papel === 'vendedor') && podeVendedorReservarForaDaLoja(moto.lojaId))
                  return (
                    <>
                      {moto.status === 'vendida' && moto.disponibilidade === null
                        ? (
                          /* Vendida aguardando NF: NF Saída + Garantia */
                          podeAlterar && podeGarantia.has(papel) && (
                            <>
                              <GarantiaButton
                                motoId={moto.id}
                                descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                              />
                              <NfSaidaButton
                                motoId={moto.id}
                                descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                blingNfeId={moto.blingNfeId}
                              />
                            </>
                          )
                        )
                        : (
                          <>
                            {podeAlterar && podeGarantia.has(papel) && (
                              <GarantiaButton
                                motoId={moto.id}
                                descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                disabled={moto.status === 'caixa'}
                              />
                            )}

                            {podeVenderAqui && podeVender.has(papel) && (
                              <>
                                {/* Montada/Garantia disponível: venda + reserva */}
                                {moto.status !== 'caixa' && moto.disponibilidade !== 'reservada' && moto.disponibilidade !== 'aguardando_aprovacao' && (moto.disponibilidade === 'disponivel' || moto.status === 'em_garantia') && (
                                  <VenderButton
                                    key={`vender-acao-${moto.id}`}
                                    motoId={moto.id}
                                    descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                    vendedorId={vendedorId}
                                    vendedorNome={vendedorNome}
                                    papel={papel}
                                    usuarios={usuarios}
                                    podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
                                    demandasCompativeis={demandasComSinal.filter(d => d.modeloId === moto.modeloId && d.lojaId === moto.lojaId)}
                                  />
                                )}
                                {/* Reservada: só finalizar venda */}
                                {moto.disponibilidade === 'reservada' && moto.reservaValorEntrada && (
                                  <VenderButton
                                    key={`vender-acao-${moto.id}`}
                                    motoId={moto.id}
                                    descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                    vendedorId={vendedorId}
                                    vendedorNome={vendedorNome}
                                    papel={papel}
                                    usuarios={usuarios}
                                    podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
                                    reservaAtiva={{
                                      valorEntrada: moto.reservaValorEntrada,
                                      valorTotal: moto.reservaValorTotal ?? '0',
                                      clienteNome: moto.reservaClienteNome ?? '',
                                      clienteCpf: moto.reservaClienteCpf ?? '',
                                      clienteCelular: moto.reservaClienteCelular ?? '',
                                      clienteEmail: moto.reservaClienteEmail ?? '',
                                      clienteCep: moto.reservaClienteCep ?? '',
                                      clienteLogradouro: moto.reservaClienteLogradouro ?? '',
                                      clienteNumero: moto.reservaClienteNumero ?? '',
                                      clienteComplemento: moto.reservaClienteComplemento ?? '',
                                      clienteBairro: moto.reservaClienteBairro ?? '',
                                      clienteCidade: moto.reservaClienteCidade ?? '',
                                      clienteEstado: moto.reservaClienteEstado ?? '',
                                      vendedorId: moto.reservaVendedorId ?? vendedorId,
                                      meioPagamento: moto.reservaMeioPagamento ?? 'pix',
                                      cartaoOperadora: moto.reservaCartaoOperadora,
                                      cartaoParcelas: moto.reservaCartaoParcelas,
                                    }}
                                  />
                                )}
                                {moto.disponibilidade === 'reservada' && moto.reservaId && (
                                  <a
                                    href={`/reservas/${moto.reservaId}/imprimir`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Imprimir comprovante da reserva"
                                    className={buttonVariants({ variant: 'ghost', size: 'icon' }) + ' h-8 w-8 text-slate-500 hover:text-slate-700'}
                                  >
                                    <Printer size={16} />
                                  </a>
                                )}
                                {/* Caixa ainda não reservada: só reserva */}
                                {moto.status === 'caixa' && moto.disponibilidade == null && (
                                  <VenderButton
                                    key={`vender-acao-${moto.id}`}
                                    motoId={moto.id}
                                    descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                    vendedorId={vendedorId}
                                    vendedorNome={vendedorNome}
                                    papel={papel}
                                    usuarios={usuarios}
                                    podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
                                    demandasCompativeis={demandasComSinal.filter(d => d.modeloId === moto.modeloId && d.lojaId === moto.lojaId)}
                                    soReserva
                                  />
                                )}
                              </>
                            )}

                            {podeAlterar && podeMontar.has(papel) && moto.status === 'caixa' && (
                              <MontarButton
                                motoId={moto.id}
                                descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                mecanicos={mecanicos}
                              />
                            )}

                            {podeAlterar && podeLogistica.has(papel) && moto.disponibilidade !== 'vendida' && (
                              moto.transferenciaPendente
                                ? (
                                  <span
                                    title={moto.transferenciaDestino ?? 'Transferência pendente'}
                                    className="h-8 w-8 flex items-center justify-center text-purple-400 cursor-default"
                                  >
                                    <ArrowLeftRight size={16} />
                                  </span>
                                )
                                : (
                                  <LogisticaButton
                                    motoId={moto.id}
                                    descricao={`${moto.modelo} — ${moto.cor} (${moto.lojaNome})`}
                                    lojaAtualId={moto.lojaId}
                                    lojas={lojas}
                                  />
                                )
                            )}
                          </>
                        )
                      }
                    </>
                  )
                })()}

                <Link
                  href={`/estoque/${moto.id}`}
                  prefetch={false}
                  title="Ver detalhes"
                  className={buttonVariants({ variant: 'ghost', size: 'icon' }) + ' h-8 w-8 text-slate-500 hover:text-slate-700'}
                >
                  <Eye size={16} />
                </Link>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {motos.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-slate-400 py-8">
              Nenhuma moto encontrada.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
