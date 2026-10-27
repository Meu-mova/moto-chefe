import { notFound } from 'next/navigation'
import { buscarOS, listarItensOS } from '@/lib/queries/ordens-servico'
import { pagamentosEfetivosOS } from '@/lib/conciliacao-status'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'
import { formatarCpfCnpj } from '@/lib/documento'

const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const statusLabel: Record<string, string> = {
  aberta: 'Aberta', oficina: 'Oficina', em_andamento: 'Em Andamento',
  finalizada: 'Finalizada', pendente_pagamento: 'Pendente de Pagamento', concluida: 'Concluída',
  cancelada: 'Cancelada',
}
const statusBadgeClass: Record<string, string> = {
  aberta: 'bs-a', oficina: 'bs-o', em_andamento: 'bs-e',
  finalizada: 'bs-f', pendente_pagamento: 'bs-p', concluida: 'bs-c', cancelada: 'bs-x',
}

export default async function ImprimirOSPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [os, itens, usuario] = await Promise.all([buscarOS(id), listarItensOS(id), getUsuarioLogado()])
  if (!os) notFound()

  if (!(await podeAgirNaLoja(usuario, os.lojaId))) notFound()

  const servicos     = itens.filter(i => i.tipo === 'servico')
  const pecas        = itens.filter(i => i.tipo === 'peca')
  const totServ      = servicos.reduce((a, i) => a + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0)
  const totPecas     = pecas.reduce((a, i)    => a + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0)
  const totalGeral   = os.valorTotal ? parseFloat(os.valorTotal) : totServ + totPecas

  const motoDesc     = os.chassi ? `${os.marca ?? ''} ${os.modelo ?? ''}` : `${os.marcaExterna ?? ''} ${os.modeloExterno ?? ''}`
  const clienteDesc  = os.clienteNome ?? os.clienteNomeExterno ?? 'Não informado'
  const clienteFone  = os.clienteTelefone ?? os.clienteFoneExterno ?? null
  // Cliente do cadastro tem tipo e documento na ficha; quem foi digitado direto na
  // OS traz os campos "externos". OS para empresa sai com CNPJ no papel.
  const clienteDoc   = os.clienteDoc ?? os.clienteDocExterno ?? null
  const clienteTipo  = os.clienteTipo ?? os.clienteTipoExterno ?? 'fisica'
  const abertura     = format(new Date(os.dataAbertura), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const geradoEm     = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const pagamentosOS = pagamentosEfetivosOS(os.formaPagamento, os.pagamentos, os.valorTotal)
  const TIPO_LABEL: Record<string, string> = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito', transferencia: 'Transferência',
    cortesia: 'Cortesia / Garantia', gratuita: 'Gratuita',
    cupom_revisao: 'Cupom de revisão gratuita',
  }

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .tema-claro { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: var(--foreground); background: var(--card); padding: 28px 32px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--foreground); padding-bottom: 14px; margin-bottom: 18px; }
        .os-n { font-size: 26px; font-weight: 900; }
        .badges { display: flex; gap: 6px; margin-top: 4px; }
        .badge { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
        .bt  { background: var(--muted); color: var(--muted-foreground); }
        .bs-a { background: color-mix(in srgb, var(--warning) 12%, var(--card)); color: var(--warning); }
        .bs-o { background: color-mix(in srgb, var(--info) 15%, var(--card)); color: var(--info); }
        .bs-e { background: color-mix(in srgb, var(--info) 15%, var(--card)); color: var(--info); }
        .bs-f { background: color-mix(in srgb, var(--info) 15%, var(--card)); color: var(--info); }
        .bs-p { background: color-mix(in srgb, var(--warning) 12%, var(--card)); color: var(--warning); }
        .bs-c { background: color-mix(in srgb, var(--success) 15%, var(--card)); color: var(--success); }
        .bs-x { background: var(--muted); color: var(--muted-foreground); }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .card  { border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 8px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .obs { background: var(--muted); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .obs h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 6px; }
        .obs p  { font-size: 12px; line-height: 1.55; white-space: pre-wrap; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th { background: var(--muted); border: 1px solid var(--border); padding: 7px 9px; text-align: left; font-size: 10px; text-transform: uppercase; color: var(--muted-foreground); }
        td { border: 1px solid var(--border); padding: 7px 9px; font-size: 12px; }
        .tr { text-align: right; }
        .tot td { font-weight: 700; background: var(--muted); }
        .grand { font-size: 15px; font-weight: 900; color: var(--success); }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .sig  { text-align: center; }
        .sigline { border-top: 1px solid var(--foreground); padding-top: 5px; font-size: 10px; color: var(--muted-foreground); }
        .ftr { text-align: center; font-size: 9px; color: var(--muted-foreground); margin-top: 20px; border-top: 1px solid var(--border); padding-top: 10px; }
        .tbl-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 6px; margin-top: 14px; }
        @media print {
          .tema-claro { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      {/* Cabeçalho */}
      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 44, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)' }}>MotoChefe {os.grupoNome}</p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>{os.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="os-n">OS #{os.numero}</div>
          <div className="badges">
            <span className={`badge ${statusBadgeClass[os.status] ?? 'bs-a'}`}>
              {statusLabel[os.status] ?? os.status}
            </span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>Abertura: {abertura}</p>
          {os.dataPrevisao && (
            <p style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2 }}>
              Previsão: {format(new Date(os.dataPrevisao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      </div>

      {/* Veículo e Cliente */}
      <div className="grid2">
        <div className="card">
          <h2>Veículo</h2>
          <div className="f"><span className="fl">Marca / Modelo</span><span className="fv">{motoDesc.trim() || '—'}</span></div>
          {(os.chassi ?? os.chassiOs) && (
            <div className="f">
              <span className="fl">Chassi</span>
              <span className="fv" style={{ fontFamily: 'monospace' }}>{os.chassi ?? os.chassiOs}</span>
            </div>
          )}
          {os.km && (
            <div className="f"><span className="fl">KM</span><span className="fv">{os.km.toLocaleString('pt-BR')}</span></div>
          )}
          {os.cor && (
            <div className="f"><span className="fl">Cor</span><span className="fv">{os.cor}</span></div>
          )}
        </div>
        <div className="card">
          <h2>Cliente</h2>
          <div className="f">
            <span className="fl">{clienteTipo === 'juridica' ? 'Razão social' : 'Nome'}</span>
            <span className="fv">{clienteDesc}</span>
          </div>
          {clienteDoc && (
            <div className="f">
              <span className="fl">{clienteTipo === 'juridica' ? 'CNPJ' : 'CPF'}</span>
              <span className="fv">{formatarCpfCnpj(clienteDoc)}</span>
            </div>
          )}
          {clienteFone && (
            <div className="f"><span className="fl">Telefone</span><span className="fv">{clienteFone}</span></div>
          )}
          {os.mecanicoNome && (
            <div className="f"><span className="fl">Mecânico</span><span className="fv">{os.mecanicoNome}</span></div>
          )}
          <div className="f"><span className="fl">Aberto por</span><span className="fv">{os.abertaPorNome}</span></div>
        </div>
      </div>

      {/* Reclamação */}
      <div className="obs">
        <h2>Reclamação / Solicitação do cliente</h2>
        <p>{os.descricao}</p>
      </div>

      {/* Diagnóstico */}
      {os.diagnostico && (
        <div className="obs">
          <h2>Diagnóstico técnico</h2>
          <p>{os.diagnostico}</p>
        </div>
      )}

      {/* Serviços */}
      {servicos.length > 0 && (
        <>
          <p className="tbl-title">Mão de obra / Serviços</p>
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th className="tr" style={{ width: 70 }}>Qtd</th>
                <th className="tr" style={{ width: 95 }}>Valor unit.</th>
                <th className="tr" style={{ width: 95 }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map(i => (
                <tr key={i.id}>
                  <td>{i.descricao}</td>
                  <td className="tr">{parseFloat(i.quantidade).toLocaleString('pt-BR')}</td>
                  <td className="tr">{fmtR(parseFloat(i.valorUnitario))}</td>
                  <td className="tr">{fmtR(parseFloat(i.quantidade) * parseFloat(i.valorUnitario))}</td>
                </tr>
              ))}
              <tr className="tot">
                <td colSpan={3}>Total mão de obra</td>
                <td className="tr">{fmtR(totServ)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Peças */}
      {pecas.length > 0 && (
        <>
          <p className="tbl-title">Peças utilizadas</p>
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th className="tr" style={{ width: 70 }}>Qtd</th>
                <th className="tr" style={{ width: 95 }}>Valor unit.</th>
                <th className="tr" style={{ width: 95 }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pecas.map(i => (
                <tr key={i.id}>
                  <td>{i.descricao}</td>
                  <td className="tr">{parseFloat(i.quantidade).toLocaleString('pt-BR')}</td>
                  <td className="tr">{fmtR(parseFloat(i.valorUnitario))}</td>
                  <td className="tr">{fmtR(parseFloat(i.quantidade) * parseFloat(i.valorUnitario))}</td>
                </tr>
              ))}
              <tr className="tot">
                <td colSpan={3}>Total peças</td>
                <td className="tr">{fmtR(totPecas)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Total geral */}
      <table>
        <tbody>
          <tr className="tot">
            <td><span className="grand">TOTAL GERAL</span></td>
            <td className="tr"><span className="grand">{fmtR(totalGeral)}</span></td>
          </tr>
          {pagamentosOS.map((p, i) => (
            <tr key={i}>
              <td style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                {pagamentosOS.length > 1 ? `Pagamento ${i + 1}` : 'Forma de pagamento'}
              </td>
              <td className="tr" style={{ fontSize: 11 }}>
                {TIPO_LABEL[p.tipo] ?? p.tipo} — {fmtR(p.valor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Observações finais */}
      {os.observacoesFinais && (
        <div className="obs">
          <h2>Observações / Recomendações</h2>
          <p>{os.observacoesFinais}</p>
        </div>
      )}

      {/* Assinaturas */}
      <div className="sigs">
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 50 }} />
          <div className="sigline">Assinatura do Responsável Técnico</div>
        </div>
      </div>

      <div className="ftr">
        <p>MOVA — Sistema de Gestão · MotoChefe {os.grupoNome}</p>
        <p>Gerado em {geradoEm}</p>
      </div>
    </>
  )
}
