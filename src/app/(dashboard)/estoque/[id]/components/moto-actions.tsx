'use client'
import { VenderButton } from '../../components/vender-button'
import { GarantiaButton } from '../../components/garantia-button'
import { LogisticaButton } from '../../components/logistica-button'
import { NfSaidaButton } from '../../components/nf-saida-button'
import { MontarButton } from '../../components/montar-button'
import { CancelarReservaButton } from '../../components/cancelar-reserva-button'
import { ResolverGarantiaButton } from './resolver-garantia-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeftRight, Printer } from 'lucide-react'
import { podeVendedorReservarForaDaLoja } from '@/lib/loja-galpao'
import type { DemandaCompativel } from '@/lib/queries/demandas'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'
import type { PagamentoReserva } from '@/lib/reserva-pagamentos'

type Usuario = { id: string; nome: string }
type Mecanico = { id: string; nome: string }
type Loja = { id: string; nome: string }

type Moto = {
  id: string
  status: string
  disponibilidade: string | null
  lojaId: string
  lojaNome: string
  marca: string
  modelo: string
  cor: string
  transferenciaPendente: boolean
  transferenciaDestino: string | null
  reservaId: string | null
  reservaValorEntrada: string | null
  reservaValorTotal: string | null
  reservaClienteNome: string | null
  reservaClienteCpf: string | null
  reservaClienteCelular: string | null
  reservaClienteEmail: string | null
  reservaClienteCep: string | null
  reservaClienteLogradouro: string | null
  reservaClienteNumero: string | null
  reservaClienteComplemento: string | null
  reservaClienteBairro: string | null
  reservaClienteCidade: string | null
  reservaClienteEstado: string | null
  reservaVendedorId: string | null
  reservaMeioPagamento: string | null
  reservaCartaoOperadora: string | null
  reservaCartaoParcelas: string | null
  reservaPagamentos: PagamentoReserva[] | null
}

type TaxasVenda = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

type Props = {
  moto: Moto
  papel: string
  isVendedor?: boolean
  vendedorId: string
  vendedorNome: string
  usuarios: Usuario[]
  mecanicos: Mecanico[]
  lojas: Loja[]
  lojaUsuarioId: string | null
  precoMinimoPix: number | null
  taxasVenda: TaxasVenda | null
  podeAprovarPagamentoSensivel: boolean
  demandasCompativeis?: DemandaCompativel[]
  /** Origens ativas do grupo da loja da moto, para o dialog de venda. */
  origens: OrigemParaEscolher[]
}

const podeVender    = new Set(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'])
const podeGarantia  = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const podeLogistica = new Set(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'])
const podeMontar    = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
// Cancelar reserva mexe em sinal já recebido — fica com o administrativo, não
// com quem vende.
const podeCancelarReserva = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const ADMINS        = new Set(['admin_geral', 'admin_socio'])

export function MotoActions({ moto, papel, isVendedor, vendedorId, vendedorNome, usuarios, mecanicos, lojas, lojaUsuarioId, precoMinimoPix, taxasVenda, podeAprovarPagamentoSensivel, demandasCompativeis, origens }: Props) {
  const isAdmin = ADMINS.has(papel)
  const podeAlterar = isAdmin || moto.lojaId === lojaUsuarioId
  // isVendedor cobre quem vende sem ter 'vendedor' como papel principal.
  const podeVenderAqui = podeAlterar || ((isVendedor ?? papel === 'vendedor') && podeVendedorReservarForaDaLoja(moto.lojaId))
  const descricao = `${moto.modelo} — ${moto.cor} (${moto.lojaNome})`

  const acoes: React.ReactNode[] = []

  if (moto.status === 'vendida' && moto.disponibilidade === null) {
    if (podeAlterar && podeGarantia.has(papel)) {
      acoes.push(
        <GarantiaButton key="garantia" motoId={moto.id} descricao={descricao} showLabel />,
        <NfSaidaButton key="nf" motoId={moto.id} descricao={descricao} />,
      )
    }
  } else {
    if (podeAlterar && podeGarantia.has(papel)) {
      acoes.push(
        <GarantiaButton key="garantia" motoId={moto.id} descricao={descricao} showLabel />
      )
    }

    if (podeAlterar && podeGarantia.has(papel) && moto.status === 'em_garantia') {
      acoes.push(
        <ResolverGarantiaButton key="resolver-garantia" motoId={moto.id} descricao={descricao} />
      )
    }

    if (podeVenderAqui && podeVender.has(papel)) {
      const podeVenderMoto = moto.status !== 'caixa' &&
        moto.disponibilidade !== 'reservada' &&
        moto.disponibilidade !== 'aguardando_aprovacao' && (
          moto.disponibilidade === 'disponivel' ||
          moto.status === 'em_garantia'
        )
      if (podeVenderMoto) {
        acoes.push(
          <VenderButton
            key="vender-acao"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            origens={origens}
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
            podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
            demandasCompativeis={demandasCompativeis}
          />
        )
      }
      if (moto.disponibilidade === 'reservada' && moto.reservaValorEntrada) {
        acoes.push(
          <VenderButton
            key="vender-acao"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            origens={origens}
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
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
              pagamentos: moto.reservaPagamentos,
            }}
          />
        )
        if (moto.reservaId) {
          acoes.push(
            <a
              key="imprimir-reserva"
              href={`/reservas/${moto.reservaId}/imprimir`}
              target="_blank"
              rel="noopener noreferrer"
              title="Imprimir comprovante da reserva"
              className="h-8 gap-1.5 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md px-3 inline-flex items-center"
            >
              <Printer size={14} />
              Comprovante
            </a>
          )
        }
      }
      if (moto.status === 'caixa' && moto.disponibilidade == null) {
        acoes.push(
          <VenderButton
            key="vender-acao"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            origens={origens}
            soReserva
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
            podeAprovarPagamentoSensivel={podeAprovarPagamentoSensivel}
            demandasCompativeis={demandasCompativeis}
          />
        )
      }
    }

    if (podeAlterar && podeCancelarReserva.has(papel) && moto.disponibilidade === 'reservada' && moto.reservaId) {
      acoes.push(
        <CancelarReservaButton
          key="cancelar-reserva"
          reservaId={moto.reservaId}
          descricao={descricao}
          clienteNome={moto.reservaClienteNome}
          valorEntrada={moto.reservaValorEntrada}
          showLabel
        />
      )
    }

    if (podeAlterar && podeMontar.has(papel) && moto.status === 'caixa') {
      acoes.push(
        <MontarButton key="montar" motoId={moto.id} descricao={descricao} mecanicos={mecanicos} showLabel />
      )
    }

    if (podeAlterar && podeLogistica.has(papel) && moto.disponibilidade !== 'vendida') {
      if (moto.transferenciaPendente) {
        acoes.push(
          <span
            key="transf-pendente"
            title={moto.transferenciaDestino ?? 'Transferência pendente'}
            className="h-8 flex items-center gap-1.5 text-xs text-purple-400 cursor-default"
          >
            <ArrowLeftRight size={14} />
            {moto.transferenciaDestino ?? 'Transf. pendente'}
          </span>
        )
      } else {
        acoes.push(
          <LogisticaButton
            key="logistica"
            motoId={moto.id}
            descricao={descricao}
            lojaAtualId={moto.lojaId}
            lojas={lojas}
            showLabel
          />
        )
      }
    }
  }

  if (acoes.length === 0) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Ações</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 flex-wrap">
          {acoes}
        </div>
      </CardContent>
    </Card>
  )
}
