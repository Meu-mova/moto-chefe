import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { mesBrt } from '@/lib/data-venda'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FuncionariosConfigTable } from './components/funcionarios-config-table'
import { PremiacaoFaixasTable } from './components/premiacao-faixas-table'
import { MesSelectorFolha } from './components/mes-selector-folha'
import { LojaSelectorFolha } from './components/loja-selector-folha'
import { AjustesBaseTable } from './components/ajustes-base-table'
import { AdiantamentosTable } from './components/adiantamentos-table'
import { RegrasComissaoTable } from './components/regras-comissao-table'
import { HoleritesTable } from './components/holerites-table'
import { ValorRealInput } from './components/valor-real-input'
import { listarHoleritesAction } from './holerites-actions'
import { labelDaBase } from '@/lib/folha'
import { PrintButton } from '../relatorio-fabrica/print-button'
import { buscarDadosFolha, agregarFolha } from '@/lib/queries/folha'

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

// A folha é a página mais pesada (buscarDadosFolha dispara ~13 consultas). Se o
// banco engasgar (instância do Fluid com conexões presas), sem timeout ela
// pendura até os 300s da Vercel. O throw cai no error boundary de
// (dashboard)/error.tsx, que mostra "Tentar novamente".
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms ao carregar a folha`)), ms)),
  ])
}

export default async function FolhaPagamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/folha-pagamento')) redirect('/dashboard')

  const [grupo, lojaIdsGrupo] = await withTimeout(
    Promise.all([getGrupoAtivo(usuario), listarLojaIdsDoGrupoAtivo(usuario)]),
    15000,
  )

  const params = await searchParams
  const mesParam = params.mes ?? mesBrt()

  // O filtro entra ANTES das consultas. Filtrar a lista já calculada daria o
  // valor certo por pessoa e o total errado, porque a base de comissão de vários
  // aux_adm incide sobre o total da LOJA (ver BASES_COMISSAO em @/lib/folha).
  //
  // A checagem contra lojaIdsGrupo não é decorativa: sem ela, um id de loja de
  // outro grupo na URL traria dados de fora do grupo ativo.
  const lojaParam = params.loja ?? ''
  const lojaIds = lojaParam && lojaIdsGrupo.includes(lojaParam) ? [lojaParam] : lojaIdsGrupo

  const dados = await withTimeout(
    buscarDadosFolha({ mes: mesParam, lojaIds, lojaIdsGrupo, grupoId: grupo.id }),
    25000,
  )
  const folha = agregarFolha(dados)

  // Depois de buscarDadosFolha, e não dentro dela: os holerites não entram em
  // nenhuma conta e a versão imprimível não precisa deles.
  const holeritesDoMes = await withTimeout(listarHoleritesAction(mesParam), 15000)

  const configPorUsuario = new Map(dados.configs.map(c => [c.usuarioId, c]))
  // As regras aparecem na aba Funcionários só como resumo; o cadastro é na aba
  // Comissões, onde cabe a vigência.
  const regrasPorUsuario = new Map<string, typeof dados.regras>()
  for (const r of dados.regras) {
    const lista = regrasPorUsuario.get(r.usuarioId)
    if (lista) lista.push(r)
    else regrasPorUsuario.set(r.usuarioId, [r])
  }

  const funcionariosParaConfig = dados.funcionarios.map(f => {
    const config = configPorUsuario.get(f.id)
    return {
      usuarioId: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario: config?.salario ?? '0',
      ajudaCusto: config?.ajudaCusto ?? null,
      adiantamentoFixo: config?.adiantamentoFixo ?? null,
      ativo: config?.ativo ?? true,
      regras: (regrasPorUsuario.get(f.id) ?? []).map(r => ({
        tipo: r.tipo, base: r.base, percentual: r.percentual,
        vigenciaInicio: r.vigenciaInicio, vigenciaFim: r.vigenciaFim,
      })),
    }
  })

  // Escopo de grupo: a aba Comissões precisa cadastrar regra de qualquer loja,
  // mesmo com o filtro de loja ligado — mesmo motivo da aba Ajustes.
  const nomePorUsuario = new Map(dados.funcionariosGrupo.map(f => [f.id, f.nome]))
  const lojaPorId = new Map(dados.lojas.map(l => [l.id, l.nome]))
  const lojaDoUsuario = new Map(dados.funcionariosGrupo.map(f => [f.id, f.lojaId]))
  const regrasParaUI = dados.regras.map(r => ({
    ...r,
    usuarioNome: nomePorUsuario.get(r.usuarioId) ?? '—',
    lojaNome: lojaPorId.get(lojaDoUsuario.get(r.usuarioId) ?? '') ?? null,
  })).sort((a, b) => a.usuarioNome.localeCompare(b.usuarioNome))

  // Grupo inteiro de propósito: com o filtro de loja ligado, ainda tem que dar
  // para lançar ajuste de qualquer loja. A aba Ajustes não segue o filtro.
  const funcionariosParaAjuste = dados.funcionariosGrupo
    .filter(f => f.lojaId)
    .map(f => ({ id: f.id, nome: f.nome, lojaId: f.lojaId as string }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const faixasParaUI = dados.faixas.map(f => ({ id: f.id, valorMinimoVendas: f.valorMinimoVendas, premiacao: f.premiacao }))

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
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
          <TabsTrigger value="premiacao">Premiação (OTE)</TabsTrigger>
          <TabsTrigger value="adiantamentos">Adiantamentos</TabsTrigger>
          <TabsTrigger value="holerites">Holerites</TabsTrigger>
          <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
        </TabsList>

        <TabsContent value="mes" className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <div className="flex items-center gap-2">
              <LojaSelectorFolha lojas={dados.lojas} lojaAtual={lojaParam} />
              <MesSelectorFolha mesAtual={mesParam} />
              <PrintButton
                href={`/folha-pagamento/imprimir?mes=${mesParam}&loja=${lojaParam}`}
                rotulo="Imprimir folha"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Salários</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(folha.totais.salarios)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Comissões</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(folha.totais.comissoes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Premiações</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(folha.totais.premiacoes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Ajuda de Custo</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold">{fmt(folha.totais.ajudaCusto)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Adiantamentos</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-amber-700">{folha.totais.adiantamentos > 0 ? '-' + fmt(folha.totais.adiantamentos) : fmt(0)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total Geral</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-emerald-700">{fmt(folha.totais.geral)}</p></CardContent>
            </Card>
            {/* Soma o valor real de quem já teve o valor informado e o calculado de
                quem não teve — é este número que o compromisso de folha usa em
                Contas a Pagar, e por isso ele nunca fica menor do que a realidade
                só porque a coluna ainda está pela metade. */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Pago (real)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-sky-700">{fmt(folha.totais.efetivo)}</p>
                <p className="text-[11px] text-slate-400">
                  {folha.totais.reaisInformados} de {folha.ativos.length} informados
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Salário</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Comissão</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Premiação</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Ajuda de Custo</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Adiantamento</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Total a Pagar</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Valor Real Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {folha.ativos.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <p className="font-medium">{f.nome}</p>
                      <p className="text-xs text-slate-400">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
                    </td>
                    <td className="px-4 py-2 text-right">{fmt(f.salario)}</td>
                    {/* A base saiu de coluna própria: com N regras por pessoa, cada
                        uma tem a sua. Vai embaixo do valor, junto do percentual. */}
                    <td className="px-4 py-2 text-right align-top">
                      {f.comissao > 0 ? fmt(f.comissao) : '—'}
                      {f.regras.filter(r => r.tipo !== 'premiacao').map(r => (
                        <span key={r.id} className="block text-[11px] text-slate-400 whitespace-nowrap">
                          {r.percentual.toLocaleString('pt-BR')}% {labelDaBase(r.base).toLowerCase()} · {fmt(r.valorBase)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-2 text-right align-top">
                      {f.premiacao > 0 ? fmt(f.premiacao) : '—'}
                      {f.premiacaoFaixa > 0 && (
                        <span className="block text-[11px] text-slate-400 whitespace-nowrap">
                          faixa OTE · {fmt(f.premiacaoFaixa)}
                        </span>
                      )}
                      {f.regras.filter(r => r.tipo === 'premiacao').map(r => (
                        <span key={r.id} className="block text-[11px] text-slate-400 whitespace-nowrap">
                          {r.percentual.toLocaleString('pt-BR')}% {labelDaBase(r.base).toLowerCase()} · {fmt(r.valorBase)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-2 text-right">{f.ajudaCusto > 0 ? fmt(f.ajudaCusto) : '—'}</td>
                    {/* Uma coluna só, com a quebra no title: fixo e eventual descontam
                        igual, e separar em duas colunas alargaria a tabela por nada. */}
                    <td
                      className="px-4 py-2 text-right text-amber-700"
                      title={f.adiantamento > 0
                        ? `Fixo ${fmt(f.adiantamentoFixo)} + eventual ${fmt(f.adiantamentoEventual)}`
                        : undefined}
                    >
                      {f.adiantamento > 0 ? '-' + fmt(f.adiantamento) : '—'}
                      {f.adiantamentoFixo > 0 && f.adiantamentoEventual > 0 && (
                        <span className="block text-[11px] text-amber-500">
                          fixo {fmt(f.adiantamentoFixo)} + {fmt(f.adiantamentoEventual)}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${f.totalPagar < 0 ? 'text-red-600' : ''}`}>{fmt(f.totalPagar)}</td>
                    {/* O que a contabilidade pagou de verdade. Em branco, a folha
                        segue valendo o calculado — ver valorEfetivo em queries/folha. */}
                    <td className="px-4 py-2">
                      <ValorRealInput
                        usuarioId={f.id}
                        mes={mesParam}
                        valorReal={f.valorReal}
                        totalPagar={f.totalPagar}
                      />
                    </td>
                  </tr>
                ))}
                {folha.ativos.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-slate-400 py-8">Nenhum funcionário ativo configurado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="funcionarios" className="mt-4 space-y-4">
          <div className="flex items-center justify-end">
            <LojaSelectorFolha lojas={dados.lojas} lojaAtual={lojaParam} />
          </div>
          <FuncionariosConfigTable funcionarios={funcionariosParaConfig} />
        </TabsContent>

        <TabsContent value="comissoes" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              Vigência conferida contra {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <MesSelectorFolha mesAtual={mesParam} />
          </div>
          {/* key no mês: o formulário nasce com "Vale a partir de" = mês selecionado,
              e sem remontar ele continuaria mostrando o mês anterior depois de trocar
              o seletor — cadastrando a regra na vigência errada. */}
          <RegrasComissaoTable key={mesParam} regras={regrasParaUI} funcionarios={funcionariosParaAjuste} mes={mesParam} />
        </TabsContent>

        <TabsContent value="premiacao" className="mt-4 space-y-3">
          <p className="text-sm text-slate-500">
            Faixa OTE é premiação em <strong>valor fixo</strong> por meta batida, só para vendedor e sempre sobre as
            motos que a própria pessoa vendeu. Ela <strong>soma</strong> com as regras de premiação em percentual
            cadastradas na aba Comissões.
          </p>
          <PremiacaoFaixasTable faixas={faixasParaUI} />
        </TabsContent>

        <TabsContent value="adiantamentos" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <MesSelectorFolha mesAtual={mesParam} />
          </div>
          <AdiantamentosTable
            adiantamentos={dados.adiantamentos}
            funcionarios={funcionariosParaAjuste}
            mes={mesParam}
          />
        </TabsContent>

        <TabsContent value="holerites" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <div className="flex items-center gap-2">
              <LojaSelectorFolha lojas={dados.lojas} lojaAtual={lojaParam} />
              <MesSelectorFolha mesAtual={mesParam} />
            </div>
          </div>
          {/* Só os ativos: quem saiu não recebe holerite novo, e a lista de quem
              falta enviar tem que ser a lista de quem realmente falta. */}
          <HoleritesTable
            funcionarios={folha.ativos.map(f => ({ id: f.id, nome: f.nome, papel: f.papel, lojaNome: f.lojaNome }))}
            holerites={holeritesDoMes}
            mes={mesParam}
          />
        </TabsContent>

        <TabsContent value="ajustes" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 capitalize">
              {new Date(`${mesParam}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
            <MesSelectorFolha mesAtual={mesParam} />
          </div>
          <AjustesBaseTable
            ajustes={dados.ajustes}
            lojas={dados.lojas}
            funcionarios={funcionariosParaAjuste}
            mes={mesParam}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
