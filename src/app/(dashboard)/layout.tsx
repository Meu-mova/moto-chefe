import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { cookies, headers } from 'next/headers'
import { Sidebar, MenuMobile } from '@/components/layout/sidebar'
import { COOKIE_SIDEBAR_RECOLHIDA } from '@/components/layout/sidebar-cookie'
import { BotaoVoltar } from '@/components/layout/botao-voltar'
import { GroupSelector } from '@/components/layout/group-selector'
import { Providers } from '@/lib/providers'
import { getUsuarioLogado } from '@/lib/auth'
import { precisaRegistrar, registrarPrimeiroAcesso } from '@/lib/primeiro-acesso'
import { origemDaRequisicao, registrarSemFalhar } from '@/lib/log-acoes'
import { grupoAtivoDaRequisicao, gruposVisiveisDaRequisicao } from '@/lib/grupo'
import { situacaoMensalidade, SEM_MENSALIDADE } from '@/lib/mensalidade/bloqueio'
import { podePagarMensalidade } from '@/lib/mensalidade/regras'
import { hojeBrt } from '@/lib/data-venda'
import { AvisoMensalidade } from '@/components/layout/aviso-mensalidade'
import { itensDoUsuario } from '@/lib/navegacao-servidor'
import { ComunicadoModal } from './components/comunicado-modal'
import { buscarComunicadosNaoLidosAction } from './admin/comunicados/actions'

// Timeout defensivo para as consultas do layout. O layout roda em TODA página;
// sem isso, uma consulta que engasga no banco pendura qualquer tela até o limite
// de 300s da Vercel (era a query de comunicados, presa em ClientRead, derrubando
// páginas inteiras com 504). Falha rápido em vez de pendurar.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms no layout`)), ms)),
  ])
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()

  // Ninguém usa o sistema sem CPF, chave PIX e nascimento preenchidos.
  // admin_geral fica de fora de propósito: esta trava roda em toda página para
  // todo usuário, então precisa sobrar alguém que consiga entrar e corrigir se
  // ela tiver defeito.
  if (usuario.papel !== 'admin_geral') {
    // Fail-open: se a consulta estourar o timeout, deixa passar (dados = null) em
    // vez de travar a tela — a obrigatoriedade real vive nas escritas, não aqui.
    const dados = await withTimeout(
      db.select({ usuarioId: usuariosDados.usuarioId }).from(usuariosDados).where(eq(usuariosDados.usuarioId, usuario.id)).limit(1),
      8000,
    ).catch(() => null)
    if (dados && dados.length === 0) redirect('/completar-cadastro')
  }

  // Grupo ativo: o mesmo da barra de grupo (cache da requisição). Sem ele (timeout,
  // usuário sem grupo), a página abre do mesmo jeito.
  const grupoAtivo = await withTimeout(grupoAtivoDaRequisicao(usuario), 3000).catch(() => null)

  // Mensalidade do grupo ativo vencida há mais de 5 dias (contrato 4.5). Fail-open de
  // propósito: bloquear quem paga porque o banco piscou é pior que deixar entrar quem deve.
  // Quem paga vê também os outros grupos que enxerga, na faixa do topo.
  const paga = podePagarMensalidade(usuario.papel)
  let mensalidade = SEM_MENSALIDADE
  if (grupoAtivo && usuario.papel !== 'admin_geral') {
    mensalidade = await withTimeout((async () => {
      const visiveis = paga ? (await gruposVisiveisDaRequisicao(usuario)).map(g => g.id) : []
      return situacaoMensalidade(grupoAtivo.id, visiveis)
    })(), 3000).catch(() => SEM_MENSALIDADE)
    if (mensalidade.bloqueado) redirect('/mensalidade')
  }

  const [comunicadosNaoLidos] = await Promise.all([
    // Comunicados são acessórios: se demorar/falhar, o app abre sem o modal em vez
    // de pendurar. É a consulta que estava travando o layout inteiro.
    withTimeout(buscarComunicadosNaoLidosAction(), 8000).catch(() => []),
    // A cobrança depende disto, mas a página não: se falhar, tenta de novo no próximo acesso.
    grupoAtivo && precisaRegistrar(usuario.papel, grupoAtivo)
      ? withTimeout(registrarPrimeiroAcesso(grupoAtivo.id), 3000)
        .catch(e => console.error('[primeiro-acesso] falha ao registrar:', e instanceof Error ? e.message : e))
      : null,
    // Toda página tenta; o índice único deixa só a 1ª do dia por grupo (#198).
    grupoAtivo
      ? withTimeout((async () => registrarSemFalhar({
        tipo: 'acesso_dia', usuarioId: usuario.id, contaId: grupoAtivo.contaId, grupoId: grupoAtivo.id,
        ...origemDaRequisicao(await headers()),
      }))(), 3000).catch(() => null)
      : null,
  ])

  const recolhida = (await cookies()).get(COOKIE_SIDEBAR_RECOLHIDA)?.value === '1'
  const itensIds = itensDoUsuario(usuario).map(i => i.id)
  const usuarioMenu = { nome: usuario.nome, email: usuario.email, papel: usuario.papel }

  return (
    <Providers>
      <div className="flex min-h-screen bg-background">
        <Sidebar itensIds={itensIds} conecta={usuario.conecta} usuario={usuarioMenu} recolhidaInicial={recolhida} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MenuMobile itensIds={itensIds} conecta={usuario.conecta} usuario={usuarioMenu} />
          <GroupSelector usuario={usuario} />
          {paga && grupoAtivo && <AvisoMensalidade situacao={mensalidade} grupoAtivo={grupoAtivo.nome} hoje={hojeBrt()} />}
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            <BotaoVoltar />
            {children}
          </main>
        </div>
      </div>
      <ComunicadoModal comunicados={comunicadosNaoLidos} />
    </Providers>
  )
}
