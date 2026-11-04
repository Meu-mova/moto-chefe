import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { mesBrt } from '@/lib/data-venda'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { redirect } from 'next/navigation'
import { TabsContent } from '@/components/ui/tabs'
import { FuncionariosConfigTable } from './components/funcionarios-config-table'
import { PremiacaoFaixasTable } from './components/premiacao-faixas-table'
import { FolhaCasca } from './components/folha-casca'
import { FolhaMesResumo } from './components/folha-mes-resumo'
import { FolhaMesTabela } from './components/folha-mes-tabela'
import { AjustesBaseTable } from './components/ajustes-base-table'
import { AdiantamentosTable } from './components/adiantamentos-table'
import { RegrasComissaoTable } from './components/regras-comissao-table'
import { HoleritesTable } from './components/holerites-table'
import { listarHoleritesAction } from './holerites-actions'
import { rotuloMes } from '@/lib/folha-tela'
import { buscarDadosFolha, agregarFolha } from '@/lib/queries/folha'
import { rotuloDoPapelGravado } from '@/lib/rotulo-do-papel'

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
    <FolhaCasca lojas={dados.lojas} lojaAtual={lojaParam} mesAtual={mesParam}>
      <TabsContent value="mes" className="space-y-6">
        <FolhaMesResumo totais={folha.totais} ativos={folha.ativos.length} />
        <FolhaMesTabela
          ativos={folha.ativos.map(f => ({ ...f, papelLabel: rotuloDoPapelGravado(f.papel) }))}
          totais={folha.totais}
          mes={mesParam}
        />
      </TabsContent>

      <TabsContent value="funcionarios" className="space-y-4">
        <FuncionariosConfigTable funcionarios={funcionariosParaConfig} />
      </TabsContent>

      <TabsContent value="comissoes" className="space-y-4">
        <p className="text-sm text-muted-foreground">Vigência conferida contra {rotuloMes(mesParam)}</p>
        {/* key no mês: o formulário nasce com "Vale a partir de" = mês selecionado,
            e sem remontar ele continuaria mostrando o mês anterior depois de trocar
            o seletor — cadastrando a regra na vigência errada. */}
        <RegrasComissaoTable key={mesParam} regras={regrasParaUI} funcionarios={funcionariosParaAjuste} mes={mesParam} />
      </TabsContent>

      <TabsContent value="premiacao">
        <PremiacaoFaixasTable faixas={faixasParaUI} />
      </TabsContent>

      <TabsContent value="adiantamentos" className="space-y-4">
        <AdiantamentosTable
          adiantamentos={dados.adiantamentos}
          funcionarios={funcionariosParaAjuste}
          mes={mesParam}
        />
      </TabsContent>

      <TabsContent value="holerites" className="space-y-4">
        {/* Só os ativos: quem saiu não recebe holerite novo, e a lista de quem
            falta enviar tem que ser a lista de quem realmente falta. */}
        <HoleritesTable
          funcionarios={folha.ativos.map(f => ({ id: f.id, nome: f.nome, papel: f.papel, lojaNome: f.lojaNome }))}
          holerites={holeritesDoMes}
          mes={mesParam}
        />
      </TabsContent>

      <TabsContent value="ajustes" className="space-y-4">
        <AjustesBaseTable
          ajustes={dados.ajustes}
          lojas={dados.lojas}
          funcionarios={funcionariosParaAjuste}
          mes={mesParam}
        />
      </TabsContent>
    </FolhaCasca>
  )
}
