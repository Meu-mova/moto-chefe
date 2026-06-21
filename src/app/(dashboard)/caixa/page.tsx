import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { lancamentosCaixa, lojas, usuarios } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NovoLancamentoDialog } from './components/novo-lancamento-dialog'
import { LancamentosTable } from './components/lancamentos-table'
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

  const filtros = and(
    gte(lancamentosCaixa.data, inicioMes),
    lte(lancamentosCaixa.data, ultimoDia),
    lojaParam ? eq(lancamentosCaixa.lojaId, lojaParam) : (isAdmin ? undefined : eq(lancamentosCaixa.lojaId, usuario.lojaId!)),
    !isAdmin ? eq(lancamentosCaixa.lojaId, usuario.lojaId!) : undefined,
  )

  const [lancamentos, lojasOpts, totais] = await Promise.all([
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
        criadoEm: lancamentosCaixa.criadoEm,
      })
      .from(lancamentosCaixa)
      .innerJoin(lojas, eq(lancamentosCaixa.lojaId, lojas.id))
      .innerJoin(usuarios, eq(lancamentosCaixa.usuarioId, usuarios.id))
      .where(filtros)
      .orderBy(desc(lancamentosCaixa.data), desc(lancamentosCaixa.criadoEm)),

    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),

    db
      .select({
        tipo: lancamentosCaixa.tipo,
        total: sql<string>`SUM(${lancamentosCaixa.valor})`,
      })
      .from(lancamentosCaixa)
      .where(filtros)
      .groupBy(lancamentosCaixa.tipo),
  ])

  const totalEntradas = Number(totais.find(t => t.tipo === 'entrada')?.total ?? 0)
  const totalSaidas = Number(totais.find(t => t.tipo === 'saida')?.total ?? 0)
  const saldo = totalEntradas - totalSaidas

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Caixa</h1>
        <NovoLancamentoDialog lojas={lojasOpts} lojaUsuarioId={usuario.lojaId ?? null} />
      </div>

      <CaixaFiltros lojas={lojasOpts} mesAtual={mesParam} lojaAtual={lojaParam} isAdmin={isAdmin} />

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Entradas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(totalEntradas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saídas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalSaidas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(saldo)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lançamentos</CardTitle></CardHeader>
        <CardContent>
          <LancamentosTable lancamentos={lancamentos} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
