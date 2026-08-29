import { getUsuarioLogado, podeCategorizarDespesaBanco } from '@/lib/auth'
import { mesBrt } from '@/lib/data-venda'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, lojas, usuarios, categoriasDespesa, despesasOpenFinance, lancamentosCaixa, categoriasCaixa } from '@/lib/db/schema'
import { eq, ne, desc, and, gte, lte, asc, sql, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { SaidasFiltros } from './components/saidas-filtros'
import { SaidasTable } from './components/saidas-table'
import type { DespesaRow } from './types'
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

  // Todo admin/sócio vê a aba "Importar do Banco" inteira; categorizar é só de
  // quem passa por podeCategorizarDespesaBanco.
  const podeCategorizar = podeCategorizarDespesaBanco(usuario)

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? mesBrt()
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
    usuario.id,
  )

  const [rowsManuais, lojasOpts, categoriasAtivas, categoriasNaoOperacionais, saidasCaixa, categoriasCaixaNaoOperacionais] = await Promise.all([
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
        // Só as lançadas à mão. A que nasceu de uma saída do banco vive na aba
        // "Importar do Banco" — antes aparecia nas duas e dava impressão de dobra.
        sql`NOT EXISTS (SELECT 1 FROM ${despesasOpenFinance} o WHERE o.despesa_id = ${despesas.id})`,
      ))
      .orderBy(desc(despesas.data), desc(despesas.criadoEm)),

    listarLojasDoGrupoAtivo(usuario, { somenteAtivas: false }),

    db
      .select({ nome: categoriasDespesa.nome })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.ativo, true))
      .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome))
      .then(rows => rows.map(r => r.nome)),

    // Saída real, mas não é custo de operar a loja: transferência entre lojas do
    // grupo, compra de moto (mercadoria) e retirada de sócio. Até agora só o
    // /financeiro respeitava essa marcação — aqui o total somava tudo, numa tela
    // chamada "Despesas Operacionais".
    db
      .select({ nome: categoriasDespesa.nome })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.contaComoDespesa, false))
      .then(rows => new Set(rows.map(r => r.nome))),

    // Dinheiro pago da gaveta pelo administrativo da loja. Reprovado fica de fora,
    // igual faz o /caixa.
    db
      .select({
        id:          lancamentosCaixa.id,
        lojaId:      lancamentosCaixa.lojaId,
        lojaNome:    lojas.nome,
        categoria:   lancamentosCaixa.categoria,
        descricao:   lancamentosCaixa.descricao,
        valor:       lancamentosCaixa.valor,
        data:        lancamentosCaixa.data,
        usuarioNome: usuarios.nome,
      })
      .from(lancamentosCaixa)
      .innerJoin(lojas,    eq(lancamentosCaixa.lojaId,    lojas.id))
      .innerJoin(usuarios, eq(lancamentosCaixa.usuarioId, usuarios.id))
      .where(and(
        eq(lancamentosCaixa.tipo, 'saida'),
        inArray(lancamentosCaixa.lojaId, lojaIdsGrupo),
        gte(lancamentosCaixa.data, inicioMes),
        lte(lancamentosCaixa.data, ultimoDia),
        ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
      ))
      .orderBy(desc(lancamentosCaixa.data)),

    db
      .select({ nome: categoriasCaixa.nome })
      .from(categoriasCaixa)
      .where(eq(categoriasCaixa.contaComoDespesa, false))
      .then(rows => new Set(rows.map(r => r.nome))),
  ])

  // A aba Lançamentos passou a ser a soma de duas origens: o que foi lançado à mão
  // aqui e o dinheiro que saiu do caixa das lojas. O que veio do banco fica na aba
  // própria — antes aparecia nas duas.
  const rows: DespesaRow[] = [
    ...rowsManuais.map(r => ({
      id: r.id,
      lojaId: r.lojaId,
      lojaNome: r.lojaNome,
      categoria: r.categoria,
      descricao: r.descricao,
      valor: r.valor,
      data: r.data,
      formaPagamento: r.formaPagamento,
      banco: r.banco,
      usuarioNome: r.usuarioNome,
      origem: 'manual' as const,
    })),
    ...saidasCaixa.map(c => ({
      id: c.id,
      lojaId: c.lojaId,
      lojaNome: c.lojaNome,
      categoria: c.categoria,
      descricao: c.descricao,
      // O caixa guarda o valor positivo; a despesa manual vem negativa do extrato.
      // Aqui normalizo pro sinal que a tabela já espera.
      valor: String(-Math.abs(Number(c.valor))),
      data: c.data,
      formaPagamento: 'Dinheiro',
      banco: 'Caixa da loja',
      usuarioNome: c.usuarioNome,
      origem: 'caixa' as const,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data))

  // Categoria vazia conta como operacional: ainda não se sabe o que é, e assumir
  // que não é despesa esconderia gasto de verdade do fechamento. Cada origem tem
  // seu próprio conjunto de categorias — "Depósito" só existe no caixa.
  const ehOperacional = (r: DespesaRow) => {
    if (!r.categoria) return true
    return r.origem === 'caixa'
      ? !categoriasCaixaNaoOperacionais.has(r.categoria)
      : !categoriasNaoOperacionais.has(r.categoria)
  }

  const rowsOperacionais    = rows.filter(ehOperacional)
  const rowsNaoOperacionais = rows.filter(r => !ehOperacional(r))

  const soma = (lista: DespesaRow[]) => lista.reduce((s, r) => s + Math.abs(Number(r.valor)), 0)
  const totalGeral          = soma(rowsOperacionais)
  const totalLojas          = soma(rowsOperacionais.filter(r => r.lojaId !== null))
  const totalEmpresa        = soma(rowsOperacionais.filter(r => r.lojaId === null))
  const totalNaoOperacional = soma(rowsNaoOperacionais)
  const totalCaixa          = soma(rowsOperacionais.filter(r => r.origem === 'caixa'))

  // Filtro de categoria/loja da aba "Importar do Banco". Saída ainda não lançada
  // não tem categoria nem loja — então ao escolher qualquer um dos dois, as
  // pendentes somem da lista, que é o comportamento pedido pro fechamento.
  const scat = params.scat ?? ''
  const slojaId = params.sloja ?? ''
  const stipo = params.stipo ?? ''

  // A saída do banco usa as categorias de despesa, não as do caixa. Sem categoria
  // conta como operacional: ainda não se sabe o que é.
  const saidaEhOperacional = (categoria: string | null) => !categoria || !categoriasNaoOperacionais.has(categoria)

  const saidasFiltradas = saidas.filter(l =>
    (!scat || l.categoria === scat) &&
    // "__geral" isola o que não tem loja atribuída — a despesa da empresa, que
    // sem isso ficava impossível de separar no fechamento.
    (!slojaId || (slojaId === '__geral' ? l.lojaId === null : l.lojaId === slojaId)) &&
    (!stipo || (stipo === 'operacional' ? saidaEhOperacional(l.categoria) : !saidaEhOperacional(l.categoria))),
  )

  const saidasOperacionais    = saidasFiltradas.filter(l => saidaEhOperacional(l.categoria))
  const saidasNaoOperacionais = saidasFiltradas.filter(l => !saidaEhOperacional(l.categoria))

  const totalSaidas = saidasOperacionais.reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidasLancadas = saidasOperacionais.filter(l => l.despesaId).reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidasPendentes = totalSaidas - totalSaidasLancadas
  const totalSaidasNaoOperacionais = saidasNaoOperacionais.reduce((s, l) => s + Number(l.valor), 0)
  // Sem filtro de propósito: o badge da aba é o aviso de "ainda falta categorizar
  // isso aqui". Se seguisse o filtro, zeraria toda vez que uma categoria fosse
  // escolhida (pendente não tem categoria) e o alerta sumiria bem quando importa.
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
          <p className="text-sm text-slate-500">
            Despesas lançadas à mão + o dinheiro que saiu do caixa das lojas. O que veio do extrato
            está na aba <span className="font-medium">Importar do Banco</span>.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total do Período</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">-{fmt(totalGeral)}</p>
                <p className="text-xs text-slate-400 mt-0.5">só operacional</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Caixa das Lojas</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">-{fmt(totalCaixa)}</p>
                <p className="text-xs text-slate-400 mt-0.5">pago em dinheiro</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Por Loja</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-600">-{fmt(totalLojas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Geral (Empresa)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-600">-{fmt(totalEmpresa)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Não Operacional</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-500">-{fmt(totalNaoOperacional)}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {rowsNaoOperacionais.length > 0
                    ? 'depósito, transferência, compra de moto'
                    : 'nada no período'}
                </p>
              </CardContent>
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
              categorias={categoriasAtivas}
              lojas={lojasOpts}
              categoriaAtual={scat}
              lojaAtual={slojaId}
              tipoAtual={stipo}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total em Saídas</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{fmt(totalSaidas)}</p>
                <p className="text-xs text-slate-400 mt-0.5">só operacional</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Já Lançadas</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-600">{fmt(totalSaidasLancadas)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Pendentes de Categorização</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-amber-600">{fmt(totalSaidasPendentes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Não Operacional</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-500">{fmt(totalSaidasNaoOperacionais)}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {saidasNaoOperacionais.length > 0
                    ? `${saidasNaoOperacionais.length} saída(s), fora do total`
                    : 'nada no período'}
                </p>
              </CardContent>
            </Card>
          </div>

          <SaidasTable
            saidas={saidasFiltradas.map(s => ({
              id: s.id,
              data: s.data.toISOString(),
              banco: s.banco,
              favorecidoNome: s.favorecidoNome,
              descricao: s.descricao,
              valor: s.valor,
              despesaId: s.despesaId,
              categoria: s.categoria,
              lojaId: s.lojaId,
              lojaNome: s.lojaNome,
              lancadoPorNome: s.lancadoPorNome,
              lancadoEm: s.lancadoEm ? s.lancadoEm.toISOString() : null,
            }))}
            lojas={lojasOpts}
            categorias={categoriasAtivas}
            podeCategorizar={podeCategorizar}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
