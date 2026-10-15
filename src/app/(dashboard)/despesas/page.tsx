import { rotuloSyncBrt } from '@/lib/rotulo-sync'
import { getUsuarioLogado, podeCategorizarDespesaBanco } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { hojeBrt, mesBrt } from '@/lib/data-venda'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { criarMedidor } from '@/lib/db-diag'
import { despesas, lojas, usuarios, categoriasDespesa, despesasOpenFinance, lancamentosCaixa, categoriasCaixa, beneficiariosDespesa } from '@/lib/db/schema'
import { eq, ne, desc, and, gte, lte, asc, sql, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ResumoFaixa } from '@/components/resumo-faixa'
import { PeriodoAtalhos } from '@/components/periodo-atalhos'
import { BotaoAtualizar } from '@/components/botao-atualizar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DespesasTable } from './components/despesas-table'
import { NovaDespesaButton } from './components/despesa-dialog'
import { MesSelector } from './components/mes-selector'
import { SaidasFiltros } from './components/saidas-filtros'
import { SaidasTable } from './components/saidas-table'
import type { DespesaRow } from './types'
import { sincronizarEBuscarSaidas, type ModoSync } from './open-finance'
import { urlDespesasSemSync } from '@/lib/sync-incremental'
import { Suspense } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const medir = criarMedidor('despesas-pagina-tempo')
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/despesas')) redirect('/dashboard')

  // Todo admin/sócio vê a aba "Importar do Banco" inteira; categorizar é só de
  // quem passa por podeCategorizarDespesaBanco.
  const podeCategorizar = podeCategorizarDespesaBanco(usuario)

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  medir('sessao_e_grupo')

  const params = await searchParams
  const mesParam = params.mes ?? mesBrt()
  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]

  const hojeDate = new Date()
  const inicioMesAtualDate = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1)
  const sfrom = params.sfrom ? new Date(params.sfrom + 'T00:00:00.000Z') : new Date(inicioMesAtualDate.toISOString().split('T')[0] + 'T00:00:00.000Z')
  const sto = params.sto ? new Date(params.sto + 'T23:59:59.999Z') : hojeDate
  // ?sync=completo refaz o histórico inteiro (paginado) e é o sync mais pesado, então só vale para quem
  // pode categorizar; para os demais o parâmetro é ignorado (vale o cache, como numa visita comum).
  const modoSync: ModoSync = params.sync === 'completo' && podeCategorizar ? 'completo'
    : params.sync === '1' ? 'forcado'
    : 'normal'

  const { linhas: saidas, erroSync, contasPuladas, syncStatusAtual } = await sincronizarEBuscarSaidas(
    { id: grupo.id, cnpj: grupo.cnpj },
    sfrom,
    sto,
    modoSync,
    usuario.id,
  )

  // Sync completo concluído sem falha: volta para a URL sem o parâmetro, senão cada F5 refaria o histórico
  // inteiro. Com erro ou conta pulada fica na página, para o aviso aparecer.
  if (modoSync === 'completo' && !erroSync && contasPuladas.length === 0) {
    redirect(urlDespesasSemSync(params))
  }

  medir('sync_de_saidas')
  const tConsultas = performance.now()
  const [
    rowsManuais, lojasOpts, categoriasAtivas, categoriasComBeneficiario, beneficiarios,
    categoriasNaoOperacionais, saidasCaixa, categoriasCaixaNaoOperacionais,
  ] = await Promise.all([
    db
      .select({
        id:             despesas.id,
        lojaId:         despesas.lojaId,
        lojaNome:       lojas.nome,
        categoria:      despesas.categoria,
        beneficiario:   despesas.beneficiario,
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

    // Categorias que pedem "a quem se destinou" (retirada, pró-labore). A marca
    // fica na categoria — ver migração 0081.
    db
      .select({ nome: categoriasDespesa.nome })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.exigeBeneficiario, true))
      .then(rows => rows.map(r => r.nome)),

    // Sócios do grupo ativo. Inativo sai da lista de escolha, mas continua
    // aparecendo nos lançamentos antigos, que guardam o nome.
    db
      .select({ nome: beneficiariosDespesa.nome })
      .from(beneficiariosDespesa)
      .where(and(eq(beneficiariosDespesa.grupoId, grupo.id), eq(beneficiariosDespesa.ativo, true)))
      .orderBy(asc(beneficiariosDespesa.ordem), asc(beneficiariosDespesa.nome))
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
  medir('consultas_em_paralelo', tConsultas)

  // A aba Lançamentos passou a ser a soma de duas origens: o que foi lançado à mão
  // aqui e o dinheiro que saiu do caixa das lojas. O que veio do banco fica na aba
  // própria — antes aparecia nas duas.
  const rows: DespesaRow[] = [
    ...rowsManuais.map(r => ({
      id: r.id,
      lojaId: r.lojaId,
      lojaNome: r.lojaNome,
      categoria: r.categoria,
      beneficiario: r.beneficiario,
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
      // Saída de caixa não tem beneficiário: retirada de sócio não sai da gaveta
      // da loja, e o /caixa não pergunta.
      beneficiario: null,
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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Despesas Operacionais</h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">{mesExibicao}</p>
        </div>
        {/* Celular: mês e botão dividem a linha inteira (mês estica, botão no tamanho do texto). */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:flex md:items-center md:gap-3">
          <Suspense fallback={null}><MesSelector mesAtual={mesParam} /></Suspense>
          <NovaDespesaButton
            lojas={lojasOpts} categorias={categoriasAtivas}
            categoriasComBeneficiario={categoriasComBeneficiario} beneficiarios={beneficiarios}
          />
        </div>
      </div>

      <Tabs defaultValue="lancamentos">
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="banco">
            Importar do Banco
            {qtdSaidasPendentes > 0 && (
              <span className="ml-1.5 text-xs font-medium text-warning">{qtdSaidasPendentes}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lancamentos" className="mt-4 space-y-6">
          {/* Cards de resumo */}
          <p className="text-sm text-muted-foreground">
            Despesas lançadas à mão + o dinheiro que saiu do caixa das lojas. O que veio do extrato
            está na aba <span className="font-medium">Importar do Banco</span>.
          </p>

          {/* Por Loja e Geral (Empresa) saíram do resumo: a lista já filtra por loja e mostra "Geral" em cada linha. */}
          <ResumoFaixa itens={[
            { rotulo: 'Total do período', valor: `-${fmt(totalGeral)}`, nota: 'só operacional', tom: 'text-destructive' },
            { rotulo: 'Caixa das lojas', valor: `-${fmt(totalCaixa)}`, nota: 'pago em dinheiro', tom: 'text-warning' },
            {
              rotulo: 'Não operacional', valor: `-${fmt(totalNaoOperacional)}`, tom: 'text-muted-foreground',
              nota: rowsNaoOperacionais.length > 0 ? 'depósito, transferência, compra de moto' : 'nada no período',
            },
          ]} />

          <DespesasTable
            despesas={rows} lojas={lojasOpts} categorias={categoriasAtivas}
            categoriasComBeneficiario={categoriasComBeneficiario} beneficiarios={beneficiarios}
          />
        </TabsContent>

        <TabsContent value="banco" className="mt-4 space-y-6">
          {erroSync && (
            // Aviso discreto: o motivo técnico fica no tooltip para não poluir a tela.
            <p className="text-xs text-muted-foreground" title={erroSync}>
              Não foi possível sincronizar agora. Mostrando os dados já salvos.
            </p>
          )}

          {contasPuladas.length > 0 && (
            <div className="border-l-2 border-destructive py-1 pl-3 text-sm text-destructive">
              O mcp.ai não respondeu para: {contasPuladas.join(', ')}. As saídas recentes dessas contas podem estar faltando.
              O sistema mantém a data do último sync e tenta de novo nas próximas visitas.
            </div>
          )}

          <ResumoFaixa itens={[
            { rotulo: 'Total em saídas', valor: fmt(totalSaidas), nota: 'só operacional', tom: 'text-destructive' },
            { rotulo: 'Pendentes de categorização', valor: fmt(totalSaidasPendentes), nota: `${fmt(totalSaidasLancadas)} já lançadas`, tom: 'text-warning' },
            {
              rotulo: 'Não operacional', valor: fmt(totalSaidasNaoOperacionais), tom: 'text-muted-foreground',
              nota: saidasNaoOperacionais.length > 0 ? `${saidasNaoOperacionais.length} saída(s), fora do total` : 'nada no período',
            },
          ]} acaoMobile={<BotaoAtualizar href={hrefAtualizarSaidas} />} />

          <PeriodoAtalhos
            from={params.sfrom ?? `${hojeBrt().slice(0, 8)}01`}
            to={params.sto ?? hojeBrt()}
            hoje={hojeBrt()}
            chaveDe="sfrom"
            chaveAte="sto"
            direita={
              <p className="flex items-center gap-x-3 text-xs text-muted-foreground">
                {syncStatusAtual
                  ? rotuloSyncBrt(syncStatusAtual.ultimaSincronizacao)
                  : 'Ainda não sincronizado'}
                <Link href={hrefAtualizarSaidas} className="inline-flex h-11 items-center gap-1 underline hover:text-foreground md:h-8">
                  <RefreshCw size={11} /> Atualizar agora
                </Link>
              </p>
            }
          />

          <SaidasFiltros
            categorias={categoriasAtivas}
            lojas={lojasOpts}
            categoriaAtual={scat}
            lojaAtual={slojaId}
            tipoAtual={stipo}
          />

          <SaidasTable
            categoriasComBeneficiario={categoriasComBeneficiario}
            beneficiarios={beneficiarios}
            saidas={saidasFiltradas.map(s => ({
              id: s.id,
              data: s.data.toISOString(),
              banco: s.banco,
              favorecidoNome: s.favorecidoNome,
              descricao: s.descricao,
              valor: s.valor,
              despesaId: s.despesaId,
              categoria: s.categoria,
              beneficiario: s.beneficiario,
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
