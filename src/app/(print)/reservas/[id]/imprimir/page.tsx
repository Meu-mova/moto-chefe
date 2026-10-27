import { notFound } from 'next/navigation'
import { buscarReserva } from '@/lib/queries/reservas'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'
import { normalizarPagamentos } from '@/lib/pagamentos-entrada'
import { rotuloDocumento } from '@/lib/documento'

const fmtR = (v: string | null) =>
  v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

const meioLabel: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento', transferencia: 'Transferência Bancária',
}

export default async function ImprimirReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [reserva, usuario] = await Promise.all([buscarReserva(id), getUsuarioLogado()])
  if (!reserva) notFound()

  if (!(await podeAgirNaLoja(usuario, reserva.lojaId))) notFound()

  // Reserva anterior à migração 0088 tem `pagamentos` nulo e vira uma linha só.
  const pagamentos = normalizarPagamentos({ ...reserva, valorTotal: reserva.valorReserva })

  const criadoEm = format(new Date(reserva.criadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const dataPrevista = format(new Date(reserva.dataPrevistaFinalizacao + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
  const endereco = [
    reserva.clienteLogradouro,
    reserva.clienteNumero && `nº ${reserva.clienteNumero}`,
    reserva.clienteComplemento,
  ].filter(Boolean).join(', ')
  const cidadeEstado = [reserva.clienteBairro, reserva.clienteCidade, reserva.clienteEstado].filter(Boolean).join(' — ')

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: var(--foreground); background: var(--card); padding: 28px 32px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--foreground); padding-bottom: 14px; margin-bottom: 18px; }
        .os-n { font-size: 26px; font-weight: 900; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .card  { border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 8px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .obs { background: var(--muted); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .obs h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 6px; }
        .obs p  { font-size: 12px; line-height: 1.55; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        td { border: 1px solid var(--border); padding: 7px 9px; font-size: 12px; }
        .tr { text-align: right; }
        .tot td { font-weight: 700; background: var(--muted); }
        .grand { font-size: 15px; font-weight: 900; color: var(--success); }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .sig  { text-align: center; }
        .sigline { border-top: 1px solid var(--foreground); padding-top: 5px; font-size: 10px; color: var(--muted-foreground); }
        .ftr { text-align: center; font-size: 9px; color: var(--muted-foreground); margin-top: 20px; border-top: 1px solid var(--border); padding-top: 10px; }
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
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)' }}>MotoChefe {reserva.grupoNome}</p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>{reserva.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="os-n">Reserva #{reserva.numero}</div>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>Registrada em: {criadoEm}</p>
          <p style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2 }}>Previsão de finalização: {dataPrevista}</p>
        </div>
      </div>

      {reserva.status === 'cancelada' && (
        // O link do comprovante continua funcionando depois do cancelamento (e
        // alguém pode ter guardado a URL). Sem esta tarja, o papel impresso
        // segue valendo como comprovante de uma reserva que não existe mais.
        <div style={{
          border: '2px solid var(--destructive)', background: 'color-mix(in srgb, var(--destructive) 10%, var(--card))', color: 'var(--destructive)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 14,
          fontWeight: 800, fontSize: 14, textAlign: 'center', letterSpacing: '.04em',
        }}>
          RESERVA CANCELADA
          {reserva.canceladaEm && (
            <span style={{ display: 'block', fontWeight: 600, fontSize: 11, marginTop: 3 }}>
              em {format(new Date(reserva.canceladaEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              {reserva.cancelamentoMotivo ? ` — ${reserva.cancelamentoMotivo}` : ''}
            </span>
          )}
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <h2>Cliente</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{reserva.clienteNome}</span></div>
          <div className="f"><span className="fl">{rotuloDocumento(reserva.clienteCpf)}</span><span className="fv">{reserva.clienteCpf}</span></div>
          <div className="f"><span className="fl">Celular</span><span className="fv">{reserva.clienteCelular}</span></div>
          {reserva.clienteEmail && (
            <div className="f"><span className="fl">E-mail</span><span className="fv">{reserva.clienteEmail}</span></div>
          )}
          {endereco && (
            <div className="f"><span className="fl">Endereço</span><span className="fv">{endereco}{cidadeEstado && ` — ${cidadeEstado}`}</span></div>
          )}
        </div>
        <div className="card">
          <h2>Veículo</h2>
          <div className="f"><span className="fl">Marca / Modelo</span><span className="fv">{reserva.marca} {reserva.modelo}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{reserva.cor}</span></div>
          <div className="f">
            <span className="fl">Chassi</span>
            <span className="fv" style={{ fontFamily: 'monospace' }}>{reserva.chassi}</span>
          </div>
        </div>
      </div>

      <table>
        <tbody>
          <tr>
            <td style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Valor da entrada (sinal pago)</td>
            <td className="tr" style={{ fontSize: 11 }}>{fmtR(reserva.valorReserva)}</td>
          </tr>
          <tr className="tot">
            <td><span className="grand">Valor total negociado</span></td>
            <td className="tr"><span className="grand">{fmtR(reserva.valorTotalVenda)}</span></td>
          </tr>
          {pagamentos.map((p, i) => (
            <tr key={i}>
              <td style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                {i === 0 ? (pagamentos.length > 1 ? 'Formas de pagamento da entrada' : 'Forma de pagamento da entrada') : ''}
              </td>
              <td className="tr" style={{ fontSize: 11 }}>
                {meioLabel[p.tipo] ?? p.tipo}
                {p.parcelas && p.parcelas > 1 ? ` — ${p.parcelas}x` : ''}
                {pagamentos.length > 1 ? ` — ${fmtR(String(p.valor))}` : ''}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Vendedor</td>
            <td className="tr" style={{ fontSize: 11 }}>{reserva.vendedorNome}</td>
          </tr>
        </tbody>
      </table>

      <div className="obs">
        <h2>Termos da reserva</h2>
        <p>Este comprovante formaliza a reserva do veículo acima mediante o sinal pago. A reserva é válida até a data prevista de finalização informada, após a qual poderá ser cancelada a critério da loja.</p>
      </div>

      <div className="sigs">
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Vendedor</div>
        </div>
      </div>

      <div className="ftr">
        <p>MOVA — Sistema de Gestão · MotoChefe {reserva.grupoNome}</p>
        <p>Gerado em {geradoEm}</p>
      </div>
    </>
  )
}
