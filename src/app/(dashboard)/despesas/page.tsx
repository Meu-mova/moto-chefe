import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, lojas, usuarios, categoriasDespesa } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { Suspense } from 'react'

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

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const mesExibicao = new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

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
    </div>
  )
}
