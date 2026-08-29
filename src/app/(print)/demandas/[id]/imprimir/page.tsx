import { notFound } from 'next/navigation'
import { buscarDemandaParaRecibo } from '@/lib/queries/demandas'
import { getUsuarioLogado } from '@/lib/auth'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'

const fmtR = (v: string | null) =>
  v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

const meioLabel: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento', transferencia: 'Transferência Bancária',
}

export default async function ImprimirDemandaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [demanda, usuario] = await Promise.all([buscarDemandaParaRecibo(id), getUsuarioLogado()])
  if (!demanda || !demanda.sinalRecebido) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && demanda.lojaId !== usuario.lojaId) notFound()

  const recebidoEm = format(new Date(demanda.sinalRecebidoEm ?? demanda.criadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const endereco = [
    demanda.clienteLogradouro,
    demanda.clienteNumero && `nº ${demanda.clienteNumero}`,
    demanda.clienteComplemento,
  ].filter(Boolean).join(', ')
  const cidadeEstado = [demanda.clienteBairro, demanda.clienteCidade, demanda.clienteEstado].filter(Boolean).join(' — ')

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 28px 32px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 14px; margin-bottom: 18px; }
        .os-n { font-size: 26px; font-weight: 900; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .card  { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 8px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .obs { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .obs h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 6px; }
        .obs p  { font-size: 12px; line-height: 1.55; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        td { border: 1px solid #e2e8f0; padding: 7px 9px; font-size: 12px; }
        .tr { text-align: right; }
        .tot td { font-weight: 700; background: #f8fafc; }
        .grand { font-size: 15px; font-weight: 900; color: #166534; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .sig  { text-align: center; }
        .sigline { border-top: 1px solid #1e293b; padding-top: 5px; font-size: 10px; color: #64748b; }
        .ftr { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print {
          body { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 44, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>MotoChefe {demanda.grupoNome}</p>
            <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{demanda.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="os-n">Recibo de Sinal{demanda.numero ? ` #${demanda.numero}` : ''}</div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Recebido em: {recebidoEm}</p>
          <p style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>Encomenda — veículo a ser disponibilizado</p>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Cliente</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{demanda.clienteNome}</span></div>
          <div className="f"><span className="fl">CPF</span><span className="fv">{demanda.clienteCpf}</span></div>
          <div className="f"><span className="fl">Celular</span><span className="fv">{demanda.clienteCelular}</span></div>
          {demanda.clienteEmail && (
            <div className="f"><span className="fl">E-mail</span><span className="fv">{demanda.clienteEmail}</span></div>
          )}
          {endereco && (
            <div className="f"><span className="fl">Endereço</span><span className="fv">{endereco}{cidadeEstado && ` — ${cidadeEstado}`}</span></div>
          )}
        </div>
        <div className="card">
          <h2>Veículo pretendido</h2>
          <div className="f"><span className="fl">Modelo</span><span className="fv">{demanda.modelo}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{demanda.cor}</span></div>
          <div className="f"><span className="fl">Situação</span><span className="fv">Encomenda — veículo a ser localizado</span></div>
        </div>
      </div>

      <table>
        <tbody>
          <tr className="tot">
            <td><span className="grand">Valor do sinal recebido</span></td>
            <td className="tr"><span className="grand">{fmtR(demanda.valorSinal)}</span></td>
          </tr>
          <tr>
            <td style={{ fontSize: 11, color: '#64748b' }}>Meio de pagamento</td>
            <td className="tr" style={{ fontSize: 11 }}>
              {demanda.meioPagamento ? (meioLabel[demanda.meioPagamento] ?? demanda.meioPagamento) : '—'}
            </td>
          </tr>
          <tr>
            <td style={{ fontSize: 11, color: '#64748b' }}>Atendente</td>
            <td className="tr" style={{ fontSize: 11 }}>{demanda.solicitanteNome}</td>
          </tr>
        </tbody>
      </table>

      <div className="obs">
        <h2>Termos</h2>
        <p>Sinal referente à encomenda de veículo a ser disponibilizado (modelo e cor acima). Este comprovante formaliza o recebimento do sinal; o valor será considerado na negociação quando o veículo estiver disponível no estoque. A não disponibilização do veículo enseja a devolução do sinal, a critério da loja.</p>
      </div>

      <div className="sigs">
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Atendente</div>
        </div>
      </div>

      <div className="ftr">
        <p>MOVA — Sistema de Gestão · MotoChefe {demanda.grupoNome}</p>
        <p>Gerado em {geradoEm}</p>
      </div>
    </>
  )
}
