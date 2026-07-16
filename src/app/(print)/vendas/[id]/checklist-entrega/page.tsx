import { notFound } from 'next/navigation'
import { buscarVenda } from '@/lib/queries/vendas'
import { getUsuarioLogado } from '@/lib/auth'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PrintTrigger } from './print-trigger'

const ITENS = [
  'Chave de ignição',
  'Ignição pelo painel / controle / cartão',
  'Acelerador',
  'Freios em funcionamento',
  'Comandos 1, 2 e 3',
  'Ré',
  'Sensor de freio',
  'Lanterna',
  'Farol (baixo e alto)',
  'Buzina',
  'Setas dianteiras e traseiras',
  'Alarmes e travas',
  'Carenagens em perfeito estado',
  'Carregador em funcionamento',
  'Abertura do banco / compartimento da bateria',
]

export default async function ChecklistEntregaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [venda, usuario] = await Promise.all([buscarVenda(id), getUsuarioLogado()])
  if (!venda) notFound()

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && venda.lojaId !== usuario.lojaId) notFound()

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
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 28px 32px; }
        .hdr  { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 14px; margin-bottom: 14px; }
        .titulo { font-size: 20px; font-weight: 900; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .card  { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 8px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 9px; text-align: left; font-size: 10px; text-transform: uppercase; color: #64748b; }
        td { border: 1px solid #e2e8f0; padding: 5px 9px; font-size: 11px; }
        .chk { text-align: center; width: 46px; }
        .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #64748b; }
        .obs { margin: 10px 0 18px; font-size: 11px; }
        .obsline { display: inline-block; border-bottom: 1px solid #94a3b8; width: 100%; min-height: 16px; }
        .sig  { text-align: center; margin-top: 10px; }
        .sigline { border-top: 1px solid #1e293b; padding-top: 5px; font-size: 10px; color: #64748b; margin-top: 34px; }
        .sigs2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
        .localdata { margin: 14px 0; font-size: 11px; text-align: right; }
        @media print {
          body { padding: 0; }
          @page { margin: 1.3cm; }
        }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 40, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>MotoChefe Sul de Minas</p>
            <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{venda.lojaNome}</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="titulo">CHECKLIST DE ENTREGA</div>
          <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Cliente: {venda.clienteNome}</p>
          <p style={{ fontSize: 10, color: '#94a3b8' }}>Data: {data}</p>
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
          <div className="f"><span className="fl">CPF</span><span className="fv">{venda.clienteCpf}</span></div>
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
        <div className="sigline">(Nome do Cliente)</div>
      </div>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Dados do Proprietário</h2>
          <div className="f"><span className="fl">Nome</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">CPF</span><span className="fv">{venda.clienteCpf}</span></div>
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

      <div className="card" style={{ marginTop: 14 }}>
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
          <div style={{ height: 40 }} />
          <div className="sigline" style={{ marginTop: 0 }}>Assinatura do Cliente</div>
        </div>
        <div className="sig">
          <div style={{ height: 40 }} />
          <div className="sigline" style={{ marginTop: 0 }}>Assinatura da Loja</div>
        </div>
      </div>
    </>
  )
}
