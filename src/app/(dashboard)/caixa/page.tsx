import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { lancamentosCaixa, lojas, usuarios } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, lt, sql, ne, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LancamentosTable } from './components/lancamentos-table'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CaixaFiltros } from './components/caixa-filtros'

export default async function CaixaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) redirect('/dashboard')

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const lojaParam = params.loja ?? ''

  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const fimMes = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]

  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []

  const lojaFiltroPadrao = and(
    lojaParam
      ? eq(lancamentosCaixa.lojaId, lojaParam)
      : (isAdmin ? inArray(lancamentosCaixa.lojaId, lojaIdsGrupo) : eq(lancamentosCaixa.lojaId, usuario.lojaId!)),
    !isAdmin ? eq(lancamentosCaixa.lojaId, usuario.lojaId!) : undefined,
  )

  const filtros = and(
    gte(lancamentosCaixa.data, inicioMes),
    lte(lancamentosCaixa.data, ultimoDia),
    lojaFiltroPadrao,
  )

  const aprovadoresTbl = alias(usuarios, 'aprovadores')

  // Filtro de loja para saldo anterior (sem restrição de data) — mesma proteção de `filtros`
  const filtroLojaSaldoAnterior = and(
    lojaFiltroPadrao,
    ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
  )

  const [lancamentos, lojasOpts, totais, saldoAnteriorRaw, saidasPorCategoria] = await Promise.all([
    db
      .select({
        id: lancamentosCaixa.id,
        tipo: lancamentosCaixa.tipo,
        categoria: lancamentosCaixa.categoria,
        descricao: lancamentosCaixa.descricao,
        valor: lancamentosCaixa.valor,
        data: lancamentosCaixa.data,
        lojaNome: lojas.nome,
        usuarioNome: usuarios.nome,
        comprovanteUrl: lancamentosCaixa.comprovanteUrl,
        statusAprovacao: lancamentosCaixa.statusAprovacao,
        aprovadoPorNome: aprovadoresTbl.nome,
        aprovadoEm: lancamentosCaixa.aprovadoEm,
        criadoEm: lancamentosCaixa.criadoEm,
      })
      .from(lancamentosCaixa)
      .innerJoin(lojas, eq(lancamentosCaixa.lojaId, lojas.id))
      .innerJoin(usuarios, eq(lancamentosCaixa.usuarioId, usuarios.id))
      .leftJoin(aprovadoresTbl, eq(lancamentosCaixa.aprovadoPorId, aprovadoresTbl.id))
      .where(filtros)
      .orderBy(desc(lancamentosCaixa.data), desc(lancamentosCaixa.criadoEm)),

    listarLojasDoGrupoAtivo(usuario),

    db
      .select({
        tipo: lancamentosCaixa.tipo,
        total: sql<string>`SUM(${lancamentosCaixa.valor})`,
      })
      .from(lancamentosCaixa)
      .where(and(filtros, ne(lancamentosCaixa.statusAprovacao, 'reprovado')))
      .groupBy(lancamentosCaixa.tipo),

    // Saldo acumulado de todos os meses anteriores
    db
      .select({
        total: sql<string>`COALESCE(SUM(
          CASE WHEN ${lancamentosCaixa.tipo} = 'entrada'
            THEN ${lancamentosCaixa.valor}::numeric
            ELSE -${lancamentosCaixa.valor}::numeric
          END
        ), 0)`,
      })
      .from(lancamentosCaixa)
      .where(and(lt(lancamentosCaixa.data, inicioMes), filtroLojaSaldoAnterior)),

    // Saídas do período agrupadas por categoria
    db
      .select({
        categoria: lancamentosCaixa.categoria,
        total: sql<string>`COALESCE(SUM(${lancamentosCaixa.valor}), '0')`,
      })
      .from(lancamentosCaixa)
      .where(and(filtros, eq(lancamentosCaixa.tipo, 'saida'), ne(lancamentosCaixa.statusAprovacao, 'reprovado')))
      .groupBy(lancamentosCaixa.categoria)
      .orderBy(sql`SUM(${lancamentosCaixa.valor}) DESC`),
  ])

  const totalEntradas = Number(totais.find(t => t.tipo === 'entrada')?.total ?? 0)
  const totalSaidas = Number(totais.find(t => t.tipo === 'saida')?.total ?? 0)
  const saldoMes = totalEntradas - totalSaidas
  const saldoAnterior = Number(saldoAnteriorRaw[0]?.total ?? 0)
  const saldoTotal = saldoAnterior + saldoMes

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caixa</h1>
        <Link
          href="/caixa/novo"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={16} /> Novo Lançamento
        </Link>
      </div>

      <CaixaFiltros lojas={lojasOpts} mesAtual={mesParam} lojaAtual={lojaParam} isAdmin={isAdmin} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo Anterior</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${saldoAnterior >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{fmt(saldoAnterior)}</p>
            <p className="text-xs text-slate-400 mt-1">acumulado até {new Date(inicioMes + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Entradas do Mês</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(totalEntradas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saídas do Mês</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalSaidas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo Total</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${saldoTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(saldoTotal)}</p>
            <p className="text-xs text-slate-400 mt-1">anterior + mês atual</p>
          </CardContent>
        </Card>
      </div>

      {saidasPorCategoria.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Saídas por Categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {saidasPorCategoria.map(c => (
                <div key={c.categoria} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{c.categoria}</span>
                  <span className="font-mono text-red-600">{fmt(Number(c.total))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold border-t pt-2 mt-2">
                <span className="text-slate-700">Total saídas</span>
                <span className="font-mono text-red-700">{fmt(totalSaidas)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Lançamentos</CardTitle></CardHeader>
        <CardContent>
          <LancamentosTable lancamentos={lancamentos} isAdmin={isAdmin} podeAprovar={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
