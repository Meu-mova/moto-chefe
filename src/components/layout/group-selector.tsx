import { getGrupoAtivo, grupoAtivoDaRequisicao, gruposDoSeletorDaRequisicao, listarGruposVisiveis } from '@/lib/grupo'
import { GroupSwitcher } from './group-switcher'
import { nomesDasContas } from '@/lib/conta'
import { blocosDoSeletor } from '@/lib/blocos-seletor'
import { gruposParaOSeletor } from '@/lib/dados-seletor'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

type Props = { usuario: Parameters<typeof gruposDoSeletorDaRequisicao>[0] }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms no seletor de grupo`)), ms)),
  ])
}

export async function GroupSelector({ usuario }: Props) {
  if (!ADMIN_PAPEIS.includes(usuario.papel)) return null

  // A barra de grupo roda no layout de toda página. Se o banco engasgar, o app
  // abre SEM a barra (fail-open) em vez de pendurar a tela inteira até 300s.
  let gruposList: Awaited<ReturnType<typeof listarGruposVisiveis>>
  let grupoAtivo: Awaited<ReturnType<typeof getGrupoAtivo>>
  try {
    [gruposList, grupoAtivo] = await withTimeout(
      Promise.all([gruposDoSeletorDaRequisicao(usuario), grupoAtivoDaRequisicao(usuario)]),
      6000,
    )
  } catch {
    return null
  }

  // Usuário com um grupo só (a maioria) nem precisa ver o seletor.
  if (gruposList.length <= 1) return null

  // Fail-open como o resto da barra: sem os nomes, a Conta dona só não aparece ao lado.
  const contas = await nomesDasContas(gruposList.map(g => g.contaId)).catch(() => new Map<string, string>())
  const contaDeOrigem = usuario.papel === 'admin_geral' ? null : (usuario.origem ?? usuario).contaId
  // Só os grupos que ele já vê: cidade e CNPJ vão ao navegador apenas deles (busca no cliente).
  // Fail-open: sem as cidades, o seletor abre com nome, Conta e CNPJ.
  const dados = await gruposParaOSeletor(gruposList, contas).catch(() => gruposList.map(g => ({
    id: g.id, nome: g.nome, cor: g.cor, contaId: g.contaId, contaNome: contas.get(g.contaId) ?? '', cidade: g.cidadeSede, cnpj: g.cnpj,
  })))
  const blocos = blocosDoSeletor(dados, contaDeOrigem)

  return <GroupSwitcher blocos={blocos} ativoId={grupoAtivo.id} />
}
