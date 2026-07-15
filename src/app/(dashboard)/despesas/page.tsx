import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, lojas, usuarios, categoriasDespesa } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { SaidasFiltros } from './components/saidas-filtros'
import { LancarDespesaForm } from './components/lancar-despesa-form'
import { sincronizarEBuscarSaidas } from './open-finance'
import { Suspense } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

const ADMINS = ['admin_geral', 'admin_socio']

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) redirect('/dashboard')

  const grupo = await getGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]

  const hojeDate = new Date()
  const inicioMesAtualDate = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1)
  const sfrom = params.sfrom ? new Date(params.sfrom + 'T00:00:00.000Z') : new Date(inicioMesAtualDate.toISOString().split('T')[0] + 'T00:00:00.000Z')
  const sto = params.sto ? new Date(params.sto + 'T23:59:59.999Z') : hojeDate
  const forcarSyncSaidas = params.sync === '1'

  const { linhas: saidas, erroSync, syncStatusAtual } = await sincronizarEBuscarSaidas(
    { id: grupo.id, cnpj: grupo.cnpj },
    sfrom,
    sto,
    forcarSyncSaidas,
  )

  const [rows, lojasOpts, totaisPorLoja, categoriasAtivas] = await Promise.all([
    db
      .select({
        id:             despesas.id,
        lojaId:         despesas.lojaId,
        lojaNome:       lojas.nome,
        categoria:      despesas.categoria,
        descricao:      despesas.descricao,
        valor:          despesas.valor,
        data:           despesas.data,
        formaPagamento: despesas.formaPagamento,
        banco:          despesas.banco,
        usuarioNome:    usuarios.nome,
      })
      .from(despesas)
      .leftJoin(lojas,    eq(despesas.lojaId,    lojas.id))
      .innerJoin(usuarios, eq(despesas.usuarioId, usuarios.id))
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
      ))
      .orderBy(desc(despesas.data), desc(despesas.criadoEm)),

    listarLojasDoGrupoAtivo(usuario, { somenteAtivas: false }),

    db
      .select({
        lojaId:   despesas.lojaId,
        lojaNome: lojas.nome,
        total:    sql<string>`COALESCE(SUM(${despesas.valor}), '0')`,
      })
      .from(despesas)
      .leftJoin(lojas, eq(despesas.lojaId, lojas.id))
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
      ))
      .groupBy(despesas.lojaId, lojas.nome),

    db
      .select({ nome: categoriasDespesa.nome })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.ativo, true))
      .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
      .then(rows => rows.map(r => r.nome)),
  ])

  const totalGeral   = rows.reduce((s, r) => s + Number(r.valor), 0)
  const totalLojas   = totaisPorLoja.filter(t => t.lojaId !== null).reduce((s, t) => s + Number(t.total), 0)
  const totalEmpresa = totaisPorLoja.filter(t => t.lojaId === null).reduce((s, t) => s + Number(t.total), 0)

  const totalSaidas = saidas.reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidasLancadas = saidas.filter(l => l.despesaId).reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidasPendentes = totalSaidas - totalSaidasLancadas
  const qtdSaidasPendentes = saidas.filter(l => !l.despesaId).length

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const mesExibicao = new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const hrefAtualizarSaidas = `/despesas?sfrom=${sfrom.toISOString().split('T')[0]}&sto=${sto.toISOString().split('T')[0]}&sync=1`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Despesas Operacionais</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{mesExibicao}</p>
        </div>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}><MesSelector mesAtual={mesParam} /></Suspense>
          <NovaDespesaButton lojas={lojasOpts} categorias={categoriasAtivas} />
        </div>
      </div>

      <Tabs defaultValue="lancamentos">
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="banco">
            Importar do Banco
            {qtdSaidasPendentes > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{qtdSaidasPendentes}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="mt-4 space-y-6">
          {/* Cards de resumo */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total do Período</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalGeral)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Por Loja</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-600">{fmt(totalLojas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Geral (Empresa)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-600">{fmt(totalEmpresa)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Lançamentos</CardTitle></CardHeader>
            <CardContent>
              <DespesasTable despesas={rows} lojas={lojasOpts} categorias={categoriasAtivas} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banco" className="mt-4 space-y-6">
          {erroSync && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Não foi possível sincronizar com o mcp.ai agora ({erroSync}) — mostrando os dados já salvos.
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <p className="text-xs text-slate-400 flex items-center gap-2">
              {syncStatusAtual
                ? `Sincronizado com o banco em ${syncStatusAtual.ultimaSincronizacao.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : 'Ainda não sincronizado'}
              <Link href={hrefAtualizarSaidas} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 underline">
                <RefreshCw size={11} /> Atualizar agora
              </Link>
            </p>
            <SaidasFiltros
              defaultFrom={sfrom.toISOString().split('T')[0]}
              defaultTo={sto.toISOString().split('T')[0]}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total em Saídas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalSaidas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Já Lançadas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-600">{fmt(totalSaidasLancadas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Pendentes de Categorização</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-amber-600">{fmt(totalSaidasPendentes)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Data</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Favorecido / Descrição</th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 font-medium">Valor</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-medium">Categoria / Loja</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {saidas.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {s.data.toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-medium">{s.favorecidoNome || '—'}</p>
                        {s.descricao && <p className="text-xs text-slate-400 truncate max-w-xs" title={s.descricao}>{s.descricao}</p>}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">{fmt(Number(s.valor))}</td>
                      <td className="px-4 py-2">
                        <LancarDespesaForm
                          id={s.id}
                          lojas={lojasOpts}
                          categorias={categoriasAtivas}
                          jaLancado={s.despesaId ? {
                            lojaNome: s.lojaNome,
                            lancadoPorNome: s.lancadoPorNome,
                            lancadoEm: s.lancadoEm ? s.lancadoEm.toISOString() : null,
                          } : null}
                        />
                      </td>
                    </tr>
                  ))}
                  {saidas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-400 py-8">
                        Nenhuma saída no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
