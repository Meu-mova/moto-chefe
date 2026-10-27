import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendas, lojas, grupos } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { buscarVenda } from '@/lib/queries/vendas'
import { formatarCpfCnpj, rotuloDocumento } from '@/lib/documento'
import {
  montarHtmlDocumento, dadosVendedoraCompletos, LABEL_TIPO,
  type TipoDocumento, type PagamentoVenda,
} from '@/lib/assinatura/documento'
import { PrintTrigger } from '../../../../vendas/[id]/checklist-entrega/print-trigger'

/**
 * Via em papel do contrato e do checklist.
 *
 * Para cliente sem acesso digital: imprime, o cliente assina à caneta na loja,
 * e o vendedor registra a via assinada no sistema (botão "Registrar assinatura
 * em papel" no painel da venda).
 *
 * O corpo do documento é o MESMO de montarHtmlDocumento — uma segunda versão do
 * texto divergiria da digital com o tempo. O que muda é só o rodapé, que aqui
 * tem linha para assinar à mão em vez da cláusula eletrônica.
 */
export default async function DocumentoImpressoPage({
  params,
}: {
  params: Promise<{ id: string; tipo: string }>
}) {
  const { id, tipo } = await params
  if (tipo !== 'contrato_venda' && tipo !== 'checklist_entrega') notFound()

  const usuario = await getUsuarioLogado()
  const venda = await buscarVenda(id)
  if (!venda) notFound()

  if (!(await podeAgirNaLoja(usuario, venda.lojaId))) notFound()

  const [extra] = await db
    .select({
      email: vendas.clienteEmail,
      cep: vendas.clienteCep,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos: vendas.pagamentos,
      razaoSocial: grupos.razaoSocial,
      cnpj: grupos.cnpj,
      enderecoSede: grupos.enderecoSede,
      cidadeSede: grupos.cidadeSede,
      comarcaForo: grupos.comarcaForo,
    })
    .from(vendas)
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(eq(vendas.id, id))
    .limit(1)
  if (!extra) notFound()

  const dados = {
    vendaId: id,
    clienteNome: venda.clienteNome ?? '',
    clienteCpf: venda.clienteCpf ?? '',
    representanteNome: venda.representanteNome,
    representanteCpf: venda.representanteCpf,
    clienteEmail: extra.email ?? 'não informado',
    clienteEndereco: [
      venda.clienteLogradouro,
      venda.clienteNumero && `nº ${venda.clienteNumero}`,
      venda.clienteComplemento,
      venda.clienteBairro,
      venda.clienteCidade && venda.clienteEstado
        ? `${venda.clienteCidade}/${venda.clienteEstado}`
        : venda.clienteCidade,
      extra.cep && `CEP ${extra.cep}`,
    ].filter(Boolean).join(', '),
    vendedoraRazaoSocial: extra.razaoSocial ?? '',
    vendedoraCnpj: extra.cnpj ?? '',
    vendedoraEndereco: extra.enderecoSede ?? '',
    cidadeSede: extra.cidadeSede ?? '',
    comarcaForo: extra.comarcaForo ?? '',
    lojaNome: venda.lojaNome ?? '',
    lojaCidade: venda.lojaCidade ?? '',
    marca: venda.marca ?? '',
    modelo: venda.modelo ?? '',
    chassi: venda.chassi ?? '',
    cor: venda.cor ?? '',
    motor: venda.motor ?? '',
    valor: Number(extra.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    formaPagamento: extra.formaPagamento ?? '',
    pagamentos: (extra.pagamentos ?? []) as PagamentoVenda[],
    dataVenda: new Date(venda.dataVenda).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  }

  // Contrato com a empresa em branco sairia com o CNPJ vazio — a mesma recusa
  // do envio digital vale aqui.
  const faltaCadastro = tipo === 'contrato_venda' && !dadosVendedoraCompletos(dados)

  return (
    <>
      <PrintTrigger />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; background: var(--card); padding: 22px 26px; color: var(--foreground); }
        .assina { margin-top: 30px; page-break-inside: avoid; }
        .linha { border-top: 1px solid var(--foreground); margin-top: 46px; padding-top: 4px; font-size: 11px; }
        .cols { display: flex; gap: 34px; }
        .cols > div { flex: 1; }
        .aviso { border: 1px solid var(--warning); background: color-mix(in srgb, var(--warning) 12%, var(--card)); color: var(--warning); padding: 10px; font-size: 12px; margin-bottom: 12px; }
        @media print { .no-print { display: none } }
      `}</style>

      {faltaCadastro && (
        <p className="aviso no-print">
          Este grupo ainda não tem razão social, endereço da sede, cidade e comarca cadastrados
          em Admin → Grupos. O contrato vai sair com esses campos em branco.
        </p>
      )}

      {/* Mesmo corpo do documento digital — o texto é fonte única. Seguro:
          montarHtmlDocumento escapa todo campo vindo do banco (ver o teste
          "dado do cliente com < ou & não quebra o HTML"). */}
      <div dangerouslySetInnerHTML={{ __html: montarHtmlDocumento(tipo as TipoDocumento, dados) }} />

      <div className="assina">
        <p style={{ fontSize: 11, marginBottom: 6 }}>
          {tipo === 'contrato_venda'
            ? 'Por estarem justas e contratadas, as partes assinam o presente instrumento.'
            : 'O comprador declara ter conferido os itens acima no ato da entrega.'}
        </p>
        <div className="cols">
          <div>
            <div className="linha">
              {dados.clienteNome || 'Comprador(a)'}<br />
              {rotuloDocumento(dados.clienteCpf)}: {formatarCpfCnpj(dados.clienteCpf) || '________________'}
            </div>
          </div>
          <div>
            <div className="linha">
              {dados.vendedoraRazaoSocial || dados.lojaNome}<br />
              Vendedora
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11, marginTop: 24 }}>
          {dados.cidadeSede || dados.lojaCidade}, ______ de ____________________ de 20____.
        </p>
      </div>

      <p className="no-print" style={{ marginTop: 20, fontSize: 12, color: 'var(--muted-foreground)' }}>
        Depois de assinado, fotografe ou digitalize a via e registre em Vendas → detalhes da venda
        → “Registrar assinatura em papel”. É esse registro que libera a emissão da NF.
      </p>
    </>
  )
}
