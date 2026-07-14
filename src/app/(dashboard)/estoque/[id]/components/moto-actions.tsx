'use client'
import { VenderButton } from '../../components/vender-button'
import { GarantiaButton } from '../../components/garantia-button'
import { LogisticaButton } from '../../components/logistica-button'
import { NfSaidaButton } from '../../components/nf-saida-button'
import { MontarButton } from '../../components/montar-button'
import { ResolverGarantiaButton } from './resolver-garantia-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeftRight } from 'lucide-react'
import { podeVendedorReservarForaDaLoja } from '@/lib/loja-galpao'

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
  vendedorId: string
  vendedorNome: string
  usuarios: Usuario[]
  mecanicos: Mecanico[]
  lojas: Loja[]
  lojaUsuarioId: string | null
  precoMinimoPix: number | null
  taxasVenda: TaxasVenda | null
}

const podeVender    = new Set(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'])
const podeGarantia  = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const podeLogistica = new Set(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'])
const podeMontar    = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const ADMINS        = new Set(['admin_geral', 'admin_socio'])

export function MotoActions({ moto, papel, vendedorId, vendedorNome, usuarios, mecanicos, lojas, lojaUsuarioId, precoMinimoPix, taxasVenda }: Props) {
  const isAdmin = ADMINS.has(papel)
  const podeAlterar = isAdmin || moto.lojaId === lojaUsuarioId
  const podeVenderAqui = podeAlterar || (papel === 'vendedor' && podeVendedorReservarForaDaLoja(moto.lojaId))
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
            key="vender"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
          />
        )
      }
      if (moto.disponibilidade === 'reservada' && moto.reservaValorEntrada) {
        acoes.push(
          <VenderButton
            key="vender-reserva"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
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
        )
      }
      if (moto.status === 'caixa' && moto.disponibilidade == null) {
        acoes.push(
          <VenderButton
            key="reserva-caixa"
            motoId={moto.id}
            descricao={descricao}
            vendedorId={vendedorId}
            vendedorNome={vendedorNome}
            papel={papel}
            usuarios={usuarios}
            soReserva
            showLabel
            precoMinimoPix={precoMinimoPix}
            taxasVenda={taxasVenda}
          />
        )
      }
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
            title="Transferência pendente"
            className="h-8 flex items-center gap-1.5 text-xs text-purple-400 cursor-default"
          >
            <ArrowLeftRight size={14} />
            Transf. Pendente
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
