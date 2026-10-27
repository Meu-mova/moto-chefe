import { notFound } from 'next/navigation'
import { buscarVenda } from '@/lib/queries/vendas'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'

// Fonte única: a mesma lista alimenta o checklist assinável em
// @/lib/assinatura/documento. Duas cópias divergiriam com o tempo.
import { ITENS_CHECKLIST as ITENS } from '@/lib/assinatura/documento'
import { rotuloDocumento } from '@/lib/documento'

export default async function ChecklistEntregaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [venda, usuario] = await Promise.all([buscarVenda(id), getUsuarioLogado()])
  if (!venda) notFound()

  if (!(await podeAgirNaLoja(usuario, venda.lojaId))) notFound()

  const data = format(new Date(venda.dataVenda), 'dd/MM/yyyy', { locale: ptBR })
  const endereco = [
    venda.clienteLogradouro,
    venda.clienteNumero && `nº ${venda.clienteNumero}`,
    venda.clienteComplemento,
    venda.clienteBairro,
  ].filter(Boolean).join(', ')
  const cidadeEstado = [venda.clienteCidade, venda.clienteEstado].filter(Boolean).join('/')

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 20px 28px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 8px; margin-bottom: 8px; }
        .titulo { font-size: 18px; font-weight: 900; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
        .card  { border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 8px; }
        .card h2 { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 4px; }
        .f  { margin-bottom: 3px; }
        .fl { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 0; }
        .fv { font-size: 11px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; }
        td { border: 1px solid #e2e8f0; padding: 2px 8px; font-size: 10px; }
        .chk { text-align: center; width: 40px; }
        .box { display: inline-block; width: 10px; height: 10px; border: 1px solid #64748b; }
        .obs { margin: 4px 0 8px; font-size: 10px; }
        .obsline { display: inline-block; border-bottom: 1px solid #94a3b8; width: 100%; min-height: 12px; }
        .sig  { text-align: center; margin-top: 4px; }
        .sigline { border-top: 1px solid #1e293b; padding-top: 3px; font-size: 9px; color: #64748b; margin-top: 16px; }
        .sigs2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 14px; }
        .localdata { margin: 6px 0; font-size: 10px; text-align: right; }
        @media print {
          body { padding: 0; }
          @page { margin: 1cm; }
        }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 40, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)' }}>MotoChefe {venda.grupoNome}</p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>{venda.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="titulo">CHECKLIST DE ENTREGA</div>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>Cliente: {venda.clienteNome}</p>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Data: {data}</p>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Veículo</h2>
          <div className="f"><span className="fl">Marca / Modelo</span><span className="fv">{venda.marca} {venda.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{venda.chassi}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{venda.cor}</span></div>
        </div>
        <div className="card">
          <h2>Cliente</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">{rotuloDocumento(venda.clienteCpf)}</span><span className="fv">{venda.clienteCpf}</span></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>Nº</th>
            <th>Itens, equipamento e funcionalidades</th>
            <th className="chk">OK</th>
            <th className="chk">Não</th>
          </tr>
        </thead>
        <tbody>
          {ITENS.map((item, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{item}</td>
              <td className="chk"><span className="box" /></td>
              <td className="chk"><span className="box" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="obs">
        Observações complementares:
        <div className="obsline" />
      </div>

      <div className="sig">
        <div style={{ height: 32 }} />
        <div className="sigline" style={{ marginTop: 0 }}>(Nome do Cliente)</div>
      </div>

      <div className="grid2" style={{ marginTop: 8 }}>
        <div className="card">
          <h2>Dados do Proprietário</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">{rotuloDocumento(venda.clienteCpf)}</span><span className="fv">{venda.clienteCpf}</span></div>
          <div className="f"><span className="fl">Endereço</span><span className="fv">{endereco || '—'}{cidadeEstado && ` — ${cidadeEstado}`}</span></div>
        </div>
        <div className="card">
          <h2>Dados MotoChefe</h2>
          <div className="f"><span className="fl">Modelo</span><span className="fv">{venda.marca} {venda.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{venda.chassi}</span></div>
          <div className="f"><span className="fl">Motor</span><span className="fv">{venda.motor}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{venda.cor}</span></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <h2>Dados da Loja</h2>
        <div className="grid2">
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.lojaNome}</span></div>
          <div className="f"><span className="fl">Nº Nota Fiscal</span><span className="fv">{venda.notaFiscalSaida ?? '—'}</span></div>
          <div className="f"><span className="fl">Data Emissão</span><span className="fv">{data}</span></div>
        </div>
      </div>

      <div className="localdata">{venda.lojaCidade}, {data}</div>

      <div className="sigs2">
        <div className="sig">
          <div style={{ height: 22 }} />
          <div className="sigline" style={{ marginTop: 0 }}>Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 22 }} />
          <div className="sigline" style={{ marginTop: 0 }}>Assinatura da Loja</div>
        </div>
      </div>
    </>
  )
}
