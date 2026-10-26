import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { contarPorCategoria, listarNotasEmitidas } from '@/lib/queries/notas-emitidas'
import { naSituacao, periodoEmissao, type Situacao } from '@/lib/notas-emitidas'
import { periodoBr, tamanhoEstimado } from '@/lib/notas-contador'
import { emailDoContador, ultimoEnvioAoContador } from '@/lib/queries/notas-contador'
import { Secao } from '../dashboard/components/painel-secoes'
import { NotasFiltros } from './components/notas-filtros'
import { NotasTabela } from './components/notas-tabela'
import { EnviarContador } from './components/enviar-contador'

// Filtro explícito (#402): os indicadores da #348 pareciam resumo, não filtro. A Descartada nunca virou nota e fica fora.
const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'autorizada', rotulo: 'Autorizadas' },
  { valor: 'cancelada', rotulo: 'Canceladas' },
  { valor: 'recusada', rotulo: 'Recusadas' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
]

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export default async function NotasEmitidasPage({
  searchParams,
}: { searchParams: Promise<{ situacao?: string; ambiente?: string; de?: string; ate?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/notas-emitidas')) redirect('/dashboard')

  const params = await searchParams
  const situacao = SITUACOES.find(s => s.valor === params.situacao)?.valor ?? 'todas'
  const ambiente = params.ambiente === 'Homologacao' ? 'Homologacao' : 'Producao'
  const periodo = periodoEmissao(params)
  const grupo = await grupoAtivoDaRequisicao(usuario)

  const filtro = { grupoId: grupo.id, contaId: usuario.papel === 'admin_geral' ? null : grupo.contaId, ambiente, ...periodo } as const
  const doGrupo = { grupoId: filtro.grupoId, contaId: filtro.contaId }
  const [notas, contagem, contagemProducao, emailSalvo, ultimo] = await Promise.all([
    listarNotasEmitidas(filtro), contarPorCategoria(filtro),
    // Ao contador vai só produção, mesmo com a tela em homologação.
    ambiente === 'Producao' ? null : contarPorCategoria({ ...filtro, ambiente: 'Producao' }),
    emailDoContador(doGrupo), ultimoEnvioAoContador(doGrupo),
  ])
  const producao = contagemProducao ?? contagem
  const ultimoEnvio = ultimo && `${data(ultimo.em)}, para ${ultimo.para}, ${ultimo.notas} ${ultimo.notas === 1 ? 'nota' : 'notas'}`
  const visiveis = notas.filter(n => naSituacao(n, situacao))
  const total = (s: Situacao) => (s === 'todas' ? contagem.autorizada + contagem.cancelada + contagem.recusada + contagem.em_andamento : contagem[s])
  const comDocumento = situacao === 'todas' ? contagem.autorizada + contagem.cancelada
    : situacao === 'autorizada' || situacao === 'cancelada' ? contagem[situacao] : 0
  const href = (s: Situacao) => `/notas-emitidas?${new URLSearchParams({ situacao: s, ambiente, ...periodo })}`
  const rotulo = SITUACOES.find(s => s.valor === situacao)!.rotulo

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notas Emitidas</h1>
          <p className="text-sm text-muted-foreground">NF-e de saída do grupo {grupo.nome}</p>
        </div>
        <NotasFiltros de={periodo.de} ate={periodo.ate} ambiente={ambiente} />
      </div>

      {ambiente === 'Homologacao' && (
        <p className="text-sm text-warning">Homologação: notas de teste, sem valor fiscal.</p>
      )}

      <nav aria-label="Filtrar por situação" className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Situação</span>
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {SITUACOES.map(s => {
            const ativo = s.valor === situacao
            const n = total(s.valor)
            return (
              <Link key={s.valor} href={href(s.valor)} aria-current={ativo ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativo ? 'bg-card text-primary-text ring-1 ring-primary' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'}`}>
                {s.rotulo}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${ativo ? 'bg-primary-soft text-primary-text' : 'bg-card'} ${s.valor === 'recusada' && n > 0 ? 'text-destructive' : ''}`}>{n}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <Secao
        titulo={rotulo}
        acao={
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{total(situacao)} {total(situacao) === 1 ? 'nota' : 'notas'}</span>
            <EnviarContador resumo={{
              grupo: grupo.nome, ...periodo, periodo: periodoBr(periodo.de, periodo.ate),
              autorizadas: producao.autorizada, canceladas: producao.cancelada,
              tamanho: tamanhoEstimado(producao.autorizada + producao.cancelada),
              emailSalvo, ultimoEnvio,
            }} />
          </div>
        }
      >
        <p className="pt-2 text-sm text-muted-foreground">Último envio ao contador: {ultimoEnvio ?? 'nenhum ainda'}</p>
        {total(situacao) > visiveis.length && (
          <p className="pt-2 text-sm text-muted-foreground">
            A tabela mostra as {visiveis.length} mais recentes de {total(situacao)}. O download do filtro leva todas.
          </p>
        )}
        {/* key: trocar de filtro limpa a seleção e volta à primeira página. */}
        <NotasTabela key={`${situacao}|${ambiente}|${periodo.de}|${periodo.ate}`} notas={visiveis} totalComDocumento={comDocumento}
          filtro={{ situacao, ambiente, ...periodo }} />
      </Secao>
    </div>
  )
}
