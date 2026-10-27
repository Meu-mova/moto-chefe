import { notFound } from 'next/navigation'
import { buscarVenda } from '@/lib/queries/vendas'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { PrintTrigger } from './print-trigger'
import { rotuloDocumento } from '@/lib/documento'

export default async function CertificadoBateriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [venda, usuario] = await Promise.all([buscarVenda(id), getUsuarioLogado()])
  if (!venda) notFound()

  if (!(await podeAgirNaLoja(usuario, venda.lojaId))) notFound()

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .tema-claro { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: var(--foreground); background: var(--card); padding: 32px 40px; }
        .hdr { text-align: center; margin-bottom: 18px; }
        .titulo { font-size: 22px; font-weight: 900; margin-top: 10px; }
        .subtitulo { font-size: 12px; font-weight: 700; color: var(--muted-foreground); letter-spacing: .04em; }
        .destaque { text-align: center; margin: 16px 0; }
        .destaque .a { font-size: 15px; font-weight: 900; color: var(--success); }
        .destaque .b { font-size: 11px; color: var(--muted-foreground); }
        .par { font-size: 11px; line-height: 1.6; text-align: justify; margin-bottom: 12px; }
        .card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 8px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .f  { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .selo { border: 1px dashed var(--muted-foreground); border-radius: 8px; height: 90px; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 14px; }
        .ftr { text-align: center; font-size: 10px; color: var(--muted-foreground); margin-top: 18px; border-top: 1px solid var(--border); padding-top: 10px; }
        @media print {
          .tema-claro { padding: 0; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="hdr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 48, width: 'auto', margin: '0 auto' }} />
        <div className="titulo">CERTIFICADO</div>
        <div className="subtitulo">SEGURO EXCLUSIVO BATERIAS</div>
      </div>

      <div className="destaque">
        <div className="a">PRIMEIRO SEGURO DE BATERIA</div>
        <div className="b">GARANTIA QUE VAI ALÉM!</div>
      </div>

      <p className="par">
        A MOTOCHEFE OFERECE GARANTIA PARA SUAS BATERIAS, COM COBERTURA PARA INDENIZAÇÃO POR EVENTUAIS DANOS, OBSERVADOS OS LIMITES E CONDIÇÕES ESTABELECIDOS NO TERMO DE COBERTURA.
      </p>
      <p className="par">
        ESTA COBERTURA É GARANTIDA PELA YELUM SEGURADORA, INTEGRANTE DO GRUPO HDI SEGUROS, POR MEIO DA APÓLICE Nº 51.38.2025.0000324, VÁLIDA EM TERRITÓRIO NACIONAL, CONFORME OS TERMOS E CONDIÇÕES ESTABELECIDOS NO CONTRATO DE SEGURO.
      </p>

      <div className="card">
        <h2>Dados do Assegurado</h2>
        <div className="grid3">
          <div className="f"><span className="fl">Nome completo</span><span className="fv">{venda.clienteNome}</span></div>
          <div className="f"><span className="fl">{rotuloDocumento(venda.clienteCpf)}</span><span className="fv">{venda.clienteCpf}</span></div>
          <div className="f"><span className="fl">Nº da Nota Fiscal</span><span className="fv">{venda.notaFiscalSaida ?? '—'}</span></div>
          <div className="f"><span className="fl">Modelo do Veículo</span><span className="fv">{venda.marca} {venda.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{venda.chassi}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{venda.cor}</span></div>
          <div className="f"><span className="fl">Loja</span><span className="fv">{venda.lojaNome}</span></div>
        </div>
      </div>

      <div className="selo">Selo da Bateria</div>

      <p className="par">
        ESTE CERTIFICADO ASSEGURA AO CONSUMIDOR A COBERTURA PARA INDENIZAÇÃO POR EVENTUAIS DANOS OCASIONADOS POR DEFEITO/VÍCIO DE FABRICAÇÃO DEVIDAMENTE CONSTATADO, CONFORME OS LIMITES E CONDIÇÕES PREVISTOS NO TERMO DE COBERTURA. A REIVINDICAÇÃO DOS TERMOS DESTE CERTIFICADO DE GARANTIA PELO CONSUMIDOR SERÁ CONDICIONADA MEDIANTE APRESENTAÇÃO DA NOTA FISCAL, DESTE CERTIFICADO, E COMPROVADAS AS RAZÕES DE SUA APLICAÇÃO EM OBEDIÊNCIA AS CONDIÇÕES PREVISTAS.
      </p>
      <p className="par">
        A MOTOCHEFE RESERVA-SE O DIREITO DE RESCINDIR A COBERTURA A QUALQUER MOMENTO, EM CONFORMIDADE COM CONDIÇÕES PREVISTAS NO TERMO. O ENCERRAMENTO PODERÁ OCORRER MEDIANTE COMUNICAÇÃO POR AVISO PUBLICADO NO SITE OFICIAL DA EMPRESA.
      </p>

      <div className="ftr">
        <p>SAC (21) 96679-0202</p>
        <p>MOTOCHEFEBRASIL.COM.BR · @MOTOCHEFEBRASIL</p>
      </div>
    </>
  )
}
