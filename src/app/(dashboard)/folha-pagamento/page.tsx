import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios, lojas, funcionariosConfig, premiacaoFaixas, vendas, vendasPecas, ordensServico, conciliacoesCartao } from '@/lib/db/schema'
import { eq, inArray, and, gte, lte, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FuncionariosConfigTable } from './components/funcionarios-config-table'
import { PremiacaoFaixasTable } from './components/premiacao-faixas-table'
import { MesSelectorFolha } from './components/mes-selector-folha'
import { calcularPremiacao } from '@/lib/premiacao'

const ADMINS = ['admin_geral', 'admin_socio']
const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm:     'Auxiliar Adm.',
  vendedor:    'Vendedor',
  mecanico:    'Mecânico',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Valor líquido por venda: parte não paga em cartão fica como está; a parte paga em cartão e já
// conciliada é trocada pelo valor líquido (descontada a taxa da operadora). Comissão e premiação
// OTE de vendedor são calculadas sobre esse valor, não sobre o bruto da venda.
function valorLiquidoExpr() {
  return sql`(
    ${vendas.valor}::numeric
    - COALESCE((SELECT SUM(${conciliacoesCartao.valorBruto}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
    + COALESCE((SELECT SUM(${conciliacoesCartao.valorLiquido}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
  )`
}

export default async function FolhaPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioTs = new Date(Date.UTC(ano, mes - 1, 1))
  const fimTs = new Date(Date.UTC(ano, mes, 1))

  const [funcionariosRaw, configsRaw, faixas, vendasPorVendedor, pecasPorVendedor, osPorMecanico] = await Promise.all([
    db
      .select({ id: usuarios.id, nome: usuarios.nome, papel: usuarios.papel, lojaNome: lojas.nome })
      .from(usuarios)
      .innerJoin(lojas, eq(usuarios.lojaId, lojas.id))
      .where(inArray(usuarios.lojaId, lojaIdsGrupo)),

    db.select().from(funcionariosConfig),

    db.select().from(premiacaoFaixas).where(eq(premiacaoFaixas.grupoId, grupo.id)),

    db
      .select({
        vendedorId: vendas.vendedorId,
        total: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
      })
      .from(vendas)
      .where(and(
        inArray(vendas.lojaId, lojaIdsGrupo),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
      ))
      .groupBy(vendas.vendedorId),

    db
      .select({
        vendedorId: vendasPecas.vendedorId,
        total: sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
      })
      .from(vendasPecas)
      .where(and(
        inArray(vendasPecas.lojaId, lojaIdsGrupo),
        gte(vendasPecas.dataVenda, inicioTs),
        lte(vendasPecas.dataVenda, fimTs),
      ))
      .groupBy(vendasPecas.vendedorId),

    db
      .select({
        mecanicoId: ordensServico.mecanicoId,
        total: sql<string>`COALESCE(SUM(${ordensServico.valorTotal}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIdsGrupo),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
      ))
      .groupBy(ordensServico.mecanicoId),
  ])

  const configPorUsuario = new Map(configsRaw.map(c => [c.usuarioId, c]))
  const vendasPorId = new Map(vendasPorVendedor.map(v => [v.vendedorId, parseFloat(v.total)]))
  const pecasPorId = new Map(pecasPorVendedor.map(v => [v.vendedorId, parseFloat(v.total)]))
  const osPorId = new Map(osPorMecanico.filter(o => o.mecanicoId).map(o => [o.mecanicoId as string, parseFloat(o.total)]))

  const funcionarios = funcionariosRaw.map(f => {
    const config = configPorUsuario.get(f.id)
    const salario = config ? parseFloat(config.salario) : 0
    const comissaoPercentual = config ? parseFloat(config.comissaoPercentual) : 0
    const ajudaCusto = config?.ajudaCusto ? parseFloat(config.ajudaCusto) : 0
    const ativo = config?.ativo ?? true

    const baseComissao =
      f.papel === 'vendedor' ? (vendasPorId.get(f.id) ?? 0) :
      f.papel === 'mecanico' ? (osPorId.get(f.id) ?? 0) :
      f.papel === 'aux_adm'  ? (pecasPorId.get(f.id) ?? 0) :
      0

    const comissao = baseComissao * (comissaoPercentual / 100)
    const premiacao = f.papel === 'vendedor' ? calcularPremiacao(baseComissao, faixas) : 0
    const totalPagar = salario + comissao + premiacao + ajudaCusto

    return {
      id: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario,
      comissaoPercentual,
      ajudaCusto,
      ativo,
      baseComissao,
      comissao,
      premiacao,
      totalPagar,
    }
  })

  const funcionariosAtivos = funcionarios.filter(f => f.ativo)
  const totalSalarios = funcionariosAtivos.reduce((s, f) => s + f.salario, 0)
  const totalComissoes = funcionariosAtivos.reduce((s, f) => s + f.comissao, 0)
  const totalPremiacoes = funcionariosAtivos.reduce((s, f) => s + f.premiacao, 0)
  const totalAjudaCusto = funcionariosAtivos.reduce((s, f) => s + f.ajudaCusto, 0)
  const totalGeral = totalSalarios + totalComissoes + totalPremiacoes + totalAjudaCusto

  const funcionariosParaConfig = funcionariosRaw.map(f => {
    const config = configPorUsuario.get(f.id)
    return {
      usuarioId: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario: config?.salario ?? '0',
      comissaoPercentual: config?.comissaoPercentual ?? '0',
      ajudaCusto: config?.ajudaCusto ?? null,
      ativo: config?.ativo ?? true,
    }
  })

  const faixasParaUI = faixas.map(f => ({ id: f.id, valorMinimoVendas: f.valorMinimoVendas, premiacao: f.premiacao }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Folha de Pagamento</h1>
        <p className="text-slate-500 text-sm">Salários, comissões, premiação e ajuda de custo</p>
      </div>

      <Tabs defaultValue="mes">
        <TabsList>
          <TabsTrigger value="mes">Folha do Mês</TabsTrigger>
          <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
          <TabsTrigger value="premiacao">Premiação (OTE)</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <MesSelectorFolha mesAtual={mesParam} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Salários</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalSalarios)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Comissões</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalComissoes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Premiações</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalPremiacoes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Ajuda de Custo</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(totalAjudaCusto)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total Geral</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-emerald-700">{fmt(totalGeral)}</p></CardContent>
            </Card>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Base Comissão (líquido)</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Salário</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Comissão</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Premiação</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Ajuda de Custo</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Total a Pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {funcionariosAtivos.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <p className="font-medium">{f.nome}</p>
                      <p className="text-xs text-slate-400">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{f.baseComissao > 0 ? fmt(f.baseComissao) : '—'}</td>
                    <td className="px-4 py-2 text-right">{fmt(f.salario)}</td>
                    <td className="px-4 py-2 text-right">{f.comissao > 0 ? fmt(f.comissao) : '—'}</td>
                    <td className="px-4 py-2 text-right">{f.premiacao > 0 ? fmt(f.premiacao) : '—'}</td>
                    <td className="px-4 py-2 text-right">{f.ajudaCusto > 0 ? fmt(f.ajudaCusto) : '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmt(f.totalPagar)}</td>
                  </tr>
                ))}
                {funcionariosAtivos.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-8">Nenhum funcionário ativo configurado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="funcionarios" className="mt-4">
          <FuncionariosConfigTable funcionarios={funcionariosParaConfig} />
        </TabsContent>

        <TabsContent value="premiacao" className="mt-4">
          <PremiacaoFaixasTable faixas={faixasParaUI} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
