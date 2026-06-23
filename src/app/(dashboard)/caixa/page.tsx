import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { lancamentosCaixa, lojas, usuarios } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, ne } from 'drizzle-orm'
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

  const filtros = and(
    gte(lancamentosCaixa.data, inicioMes),
    lte(lancamentosCaixa.data, ultimoDia),
    lojaParam ? eq(lancamentosCaixa.lojaId, lojaParam) : (isAdmin ? undefined : eq(lancamentosCaixa.lojaId, usuario.lojaId!)),
    !isAdmin ? eq(lancamentosCaixa.lojaId, usuario.lojaId!) : undefined,
  )

  const aprovadoresTbl = alias(usuarios, 'aprovadores')

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

    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),

    db
      .select({
        tipo: lancamentosCaixa.tipo,
        total: sql<string>`SUM(${lancamentosCaixa.valor})`,
      })
      .from(lancamentosCaixa)
      .where(and(filtros, ne(lancamentosCaixa.statusAprovacao, 'reprovado')))
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
        <Link
          href="/caixa/novo"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={16} /> Novo Lançamento
        </Link>
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
          <LancamentosTable lancamentos={lancamentos} isAdmin={isAdmin} podeAprovar={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
