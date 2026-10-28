import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { garantias, motos, modelos, lojas, grupos, usuarios, ordensServico, vendas } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { formatarCpfCnpj, soDigitosDoc } from '@/lib/documento'
import { PrintTrigger } from './print-trigger'

/** 'YYYY-MM-DD' formatado sem passar por new Date(): a data vem como texto do
 *  Postgres e o construtor a leria como meia-noite UTC, virando o dia anterior
 *  no fuso de Brasília. */
function fmtData(d: string | null | undefined) {
  if (!d) return '—'
  const [ano, mes, dia] = String(d).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export default async function ComprovanteGarantiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await getUsuarioLogado()
  // Rota de impressão sem gate é rota aberta: mesma permissão da tela de Garantias.
  if (!usuarioPodeAcessar(usuario, '/garantias')) redirect('/dashboard')

  const encerradaPor = alias(usuarios, 'encerrada_por_usuario')

  const [g] = await db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataEncerramento: garantias.dataEncerramento,
      observacaoEncerramento: garantias.observacaoEncerramento,
      encerradaEm: garantias.encerradaEm,
      encerradaPorNome: encerradaPor.nome,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      statusFabrica: garantias.statusFabrica,
      lojaId: garantias.lojaId,
      lojaNome: lojas.nome,
      lojaEndereco: lojas.endereco,
      lojaCidade: lojas.cidade,
      grupoNome: grupos.nome,
      grupoRazaoSocial: grupos.razaoSocial,
      grupoCnpj: grupos.cnpj,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: nomeDoModeloNaLoja(garantias.lojaId),
      osNumero: ordensServico.numero,
      clienteNome: vendas.clienteNome,
      clienteDoc: vendas.clienteCpf,
    })
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .leftJoin(encerradaPor, eq(garantias.encerradaPor, encerradaPor.id))
    .leftJoin(ordensServico, eq(garantias.osId, ordensServico.id))
    // O dono da moto sai da venda, não da garantia: garantia é da moto, e é a venda
    // que sabe para quem ela foi. Nome e CPF ficam na própria venda (colunas NOT
    // NULL), então não depende de o cliente ter ficha cadastrada.
    .leftJoin(vendas, eq(vendas.motoId, garantias.motoId))
    .where(eq(garantias.id, id))
    // Moto revendida tem mais de uma venda: vale a última, que é de quem a moto é hoje.
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
  if (!g) notFound()

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const isGestor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const permitido = isGestor ? lojaIdsGrupo.includes(g.lojaId) : g.lojaId === usuario.lojaId
  if (!permitido) notFound()

  // Comprovante é de garantia ENCERRADA. Emitir para uma garantia ainda ativa daria
  // ao cliente um papel dizendo que o atendimento acabou quando ele não acabou.
  if (g.status !== 'encerrada') notFound()

  // A venda guarda um campo só de documento; 14 dígitos é CNPJ, o resto é CPF.
  const ehPJ = soDigitosDoc(g.clienteDoc).length === 14
  const emitidoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .tema-claro { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: var(--foreground); background: var(--card); padding: 28px 32px; }
        .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--foreground); padding-bottom: 14px; margin-bottom: 18px; }
        .card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted-foreground); margin-bottom: 8px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .f { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-foreground); display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        .selo { display: inline-block; border: 2px solid var(--success); color: var(--success); border-radius: 6px;
                padding: 4px 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
        .texto { line-height: 1.6; margin-bottom: 14px; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; }
        .sig { text-align: center; }
        .sigline { border-top: 1px solid var(--foreground); padding-top: 5px; font-size: 10px; color: var(--muted-foreground); }
        .ftr { text-align: center; font-size: 9px; color: var(--muted-foreground); margin-top: 20px; border-top: 1px solid var(--border); padding-top: 10px; }
        @media print { .tema-claro { padding: 0; } @page { margin: 1.5cm; } }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 44, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700 }}>{g.grupoRazaoSocial ?? g.grupoNome}</p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>CNPJ {formatarCpfCnpj(g.grupoCnpj)}</p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
              {g.lojaNome} — {g.lojaEndereco}, {g.lojaCidade}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Comprovante
          </p>
          <p style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>Garantia encerrada</p>
          <span className="selo">Concluída em {fmtData(g.dataEncerramento)}</span>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Veículo</h2>
          <div className="f"><span className="fl">Modelo</span><span className="fv">{g.marca} {g.modelo}</span></div>
          <div className="f"><span className="fl">Chassi</span><span className="fv" style={{ fontFamily: 'monospace' }}>{g.chassi}</span></div>
          <div className="f"><span className="fl">Cor</span><span className="fv">{g.cor ?? '—'}</span></div>
        </div>
        <div className="card">
          <h2>Proprietário</h2>
          <div className="f">
            <span className="fl">{ehPJ ? 'Razão social' : 'Nome'}</span>
            <span className="fv">{g.clienteNome ?? 'Não identificado'}</span>
          </div>
          <div className="f">
            <span className="fl">{ehPJ ? 'CNPJ' : 'CPF'}</span>
            <span className="fv">{g.clienteDoc ? formatarCpfCnpj(g.clienteDoc) : '—'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Atendimento de garantia</h2>
        <div className="f"><span className="fl">Reclamação</span><span className="fv">{g.descricao}</span></div>
        <div className="grid2" style={{ marginTop: 10, marginBottom: 0 }}>
          <div>
            <div className="f"><span className="fl">Abertura</span><span className="fv">{fmtData(g.dataInicio)}</span></div>
            <div className="f"><span className="fl">Prazo</span><span className="fv">{fmtData(g.dataFim)}</span></div>
            {g.osNumero != null && (
              <div className="f"><span className="fl">Ordem de serviço</span><span className="fv">#{g.osNumero}</span></div>
            )}
          </div>
          <div>
            <div className="f"><span className="fl">Encerramento</span><span className="fv">{fmtData(g.dataEncerramento)}</span></div>
            <div className="f"><span className="fl">Encerrada por</span><span className="fv">{g.encerradaPorNome ?? '—'}</span></div>
            {g.numeroPedidoFabrica && (
              <div className="f">
                <span className="fl">Pedido na fábrica</span>
                <span className="fv">#{g.numeroPedidoFabrica}{g.statusFabrica ? ` · ${g.statusFabrica}` : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {g.observacaoEncerramento && (
        <div className="card">
          <h2>Observações do encerramento</h2>
          <p className="texto" style={{ marginBottom: 0 }}>{g.observacaoEncerramento}</p>
        </div>
      )}

      {/* Garantias encerradas antes da migração 0074 não têm observação nem autor
          gravados — o comprovante sai sem esses campos em vez de mentir um valor. */}
      <p className="texto">
        Declaramos que o atendimento em garantia do veículo acima foi <strong>concluído</strong> em
        {' '}{fmtData(g.dataEncerramento)}, encerrando a solicitação aberta em {fmtData(g.dataInicio)}.
        Este comprovante não prorroga nem substitui a garantia de fábrica do veículo.
      </p>

      <div className="sigs">
        <div className="sig"><p className="sigline">{g.lojaNome} — responsável técnico</p></div>
        <div className="sig"><p className="sigline">{g.clienteNome ?? 'Cliente'}</p></div>
      </div>

      <p className="ftr">Emitido em {emitidoEm} · {g.grupoRazaoSocial ?? g.grupoNome}</p>
    </>
  )
}
