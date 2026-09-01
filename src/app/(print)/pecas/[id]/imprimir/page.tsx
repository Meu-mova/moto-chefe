import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { vendasPecas, vendasPecasItens, lojas, usuarios, grupos } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { podeVenderPeca } from '@/app/(dashboard)/pecas/papeis'
import { formatarCpfCnpj } from '@/lib/documento'
import { PrintTrigger } from './print-trigger'

const fmt = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_LABEL: Record<string, string> = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito', cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento', link_pagamento: 'Link de Pagamento',
  bonificacao: 'Bonificação (sem cobrança)', multiplo: 'Múltiplo',
}

type Pgto = { tipo: string; valor: number; parcelas?: number; autorizacao?: string }

export default async function ReciboVendaPecaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await getUsuarioLogado()
  // Rota de impressão sem gate é rota aberta: mesma permissão da tela de Peças.
  if (!podeVenderPeca(usuario.papel)) redirect('/dashboard')

  const [venda] = await db
    .select({
      id: vendasPecas.id,
      numero: vendasPecas.numero,
      clienteNome: vendasPecas.clienteNome,
      clienteDocumento: vendasPecas.clienteDocumento,
      clienteTipoPessoa: vendasPecas.clienteTipoPessoa,
      formaPagamento: vendasPecas.formaPagamento,
      pagamentos: vendasPecas.pagamentos,
      valorTotal: vendasPecas.valorTotal,
      dataVenda: vendasPecas.dataVenda,
      lojaId: vendasPecas.lojaId,
      lojaNome: lojas.nome,
      lojaEndereco: lojas.endereco,
      lojaCidade: lojas.cidade,
      vendedorNome: usuarios.nome,
      grupoNome: grupos.nome,
      grupoRazaoSocial: grupos.razaoSocial,
      grupoCnpj: grupos.cnpj,
    })
    .from(vendasPecas)
    .innerJoin(lojas, eq(vendasPecas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(vendasPecas.vendedorId, usuarios.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(eq(vendasPecas.id, id))
    .limit(1)
  if (!venda) notFound()

  // Escopo de grupo, não de loja: o gestor tira a segunda via de qualquer loja do
  // grupo ativo, e o vendedor só do que a loja dele vendeu.
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const isGestor = ['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)
  const permitido = isGestor
    ? lojaIdsGrupo.includes(venda.lojaId)
    : venda.lojaId === usuario.lojaId
  if (!permitido) notFound()

  const itens = await db
    .select({
      descricao: vendasPecasItens.descricao,
      quantidade: vendasPecasItens.quantidade,
      valorUnitario: vendasPecasItens.valorUnitario,
    })
    .from(vendasPecasItens)
    .where(eq(vendasPecasItens.vendaPecaId, id))
    .orderBy(asc(vendasPecasItens.descricao))

  const pgtos = (venda.pagamentos ?? []) as Pgto[]
  const totalItens = itens.reduce((s, i) => s + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0)
  const valorTotal = parseFloat(venda.valorTotal)
  // Bonificação lança a venda em R$ 0,00 mas os itens guardam o preço de catálogo:
  // a diferença é exatamente o que foi entregue de cortesia, e o recibo mostra.
  const bonificado = totalItens - valorTotal

  const isPJ = venda.clienteTipoPessoa === 'juridica'
  const dataVenda = new Date(venda.dataVenda).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const emitidoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; padding: 28px 32px; }
        .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 14px; margin-bottom: 18px; }
        .num { font-size: 26px; font-weight: 900; }
        .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 14px; }
        .card h2 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 8px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .f { margin-bottom: 5px; }
        .fl { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; display: block; margin-bottom: 1px; }
        .fv { font-size: 12px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th, td { border: 1px solid #e2e8f0; padding: 7px 9px; font-size: 12px; text-align: left; }
        th { background: #f8fafc; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; }
        .tr { text-align: right; }
        .tot td { font-weight: 700; background: #f8fafc; }
        .grand { font-size: 15px; font-weight: 900; color: #166534; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .sig { text-align: center; }
        .sigline { border-top: 1px solid #1e293b; padding-top: 5px; font-size: 10px; color: #64748b; }
        .ftr { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print { body { padding: 0; } @page { margin: 1.5cm; } }
      `}</style>

      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/motochefe-logo.png" alt="MotoChefe" style={{ height: 44, width: 'auto' }} />
          <div>
            <p style={{ fontWeight: 700 }}>{venda.grupoRazaoSocial ?? venda.grupoNome}</p>
            <p style={{ fontSize: 10, color: '#64748b' }}>CNPJ {formatarCpfCnpj(venda.grupoCnpj)}</p>
            <p style={{ fontSize: 10, color: '#64748b' }}>
              {venda.lojaNome} — {venda.lojaEndereco}, {venda.lojaCidade}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Recibo de venda
          </p>
          <p className="num">#{venda.numero}</p>
          <p style={{ fontSize: 10, color: '#64748b' }}>{dataVenda}</p>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>{isPJ ? 'Empresa compradora' : 'Cliente'}</h2>
          <div className="f">
            <span className="fl">{isPJ ? 'Razão social' : 'Nome'}</span>
            <span className="fv">{venda.clienteNome ?? 'Consumidor não identificado'}</span>
          </div>
          <div className="f">
            <span className="fl">{isPJ ? 'CNPJ' : 'CPF'}</span>
            <span className="fv">{venda.clienteDocumento ? formatarCpfCnpj(venda.clienteDocumento) : '—'}</span>
          </div>
        </div>
        <div className="card">
          <h2>Atendimento</h2>
          <div className="f">
            <span className="fl">Vendedor</span>
            <span className="fv">{venda.vendedorNome}</span>
          </div>
          <div className="f">
            <span className="fl">Loja</span>
            <span className="fv">{venda.lojaNome}</span>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th className="tr" style={{ width: 70 }}>Qtd</th>
            <th className="tr" style={{ width: 110 }}>Valor unit.</th>
            <th className="tr" style={{ width: 120 }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, idx) => (
            <tr key={idx}>
              <td>{i.descricao}</td>
              <td className="tr">{parseFloat(i.quantidade).toLocaleString('pt-BR')}</td>
              <td className="tr">{fmt(i.valorUnitario)}</td>
              <td className="tr">{fmt(parseFloat(i.quantidade) * parseFloat(i.valorUnitario))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {bonificado > 0.005 && (
            <>
              <tr className="tot">
                <td colSpan={3}>Valor dos itens</td>
                <td className="tr">{fmt(totalItens)}</td>
              </tr>
              <tr className="tot">
                <td colSpan={3}>Bonificação (sem cobrança)</td>
                <td className="tr">-{fmt(bonificado)}</td>
              </tr>
            </>
          )}
          <tr className="tot">
            <td colSpan={3}>Total pago</td>
            <td className="tr grand">{fmt(valorTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="card">
        <h2>Forma de pagamento</h2>
        {pgtos.length === 0 ? (
          <p>{TIPO_LABEL[venda.formaPagamento] ?? venda.formaPagamento}</p>
        ) : (
          pgtos.map((p, idx) => (
            <div className="f" key={idx}>
              <span className="fv">
                {TIPO_LABEL[p.tipo] ?? p.tipo}
                {p.parcelas ? ` ${p.parcelas}x` : ''} — {fmt(p.valor)}
                {p.autorizacao ? ` (aut. ${p.autorizacao})` : ''}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Peça e acessório não emitem nota fiscal neste fluxo. Dizer isso no papel
          evita que a empresa compradora fique esperando uma NF que não vem. */}
      <p style={{ fontSize: 10, color: '#64748b' }}>
        Documento não fiscal, emitido para comprovação de compra de peças e acessórios.
      </p>

      <div className="sigs">
        <div className="sig"><p className="sigline">{venda.vendedorNome} — vendedor</p></div>
        <div className="sig"><p className="sigline">{venda.clienteNome ?? 'Cliente'}</p></div>
      </div>

      <p className="ftr">Emitido em {emitidoEm} · {venda.grupoRazaoSocial ?? venda.grupoNome}</p>
    </>
  )
}
