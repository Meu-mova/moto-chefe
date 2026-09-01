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

  const configPorUsuario = new Map(dados.configs.map(c => [c.usuarioId, c]))
  const funcionariosParaConfig = dados.funcionarios.map(f => {
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
      baseComissao: config?.baseComissao ?? 'padrao',
    }
  })

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
          <TabsTrigger value="premiacao">Premiação (OTE)</TabsTrigger>
          <TabsTrigger value="adiantamentos">Adiantamentos</TabsTrigger>
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

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
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
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Adiantamento</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-600">Total a Pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {folha.ativos.map(f => (
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
                    <td className="px-4 py-2 text-right text-amber-700">{f.adiantamento > 0 ? '-' + fmt(f.adiantamento) : '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${f.totalPagar < 0 ? 'text-red-600' : ''}`}>{fmt(f.totalPagar)}</td>
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

        <TabsContent value="premiacao" className="mt-4">
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
