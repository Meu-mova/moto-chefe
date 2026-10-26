import { asc } from 'drizzle-orm'
import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { contas } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { buttonVariants } from '@/components/ui/button'
import { listarLog, listarPessoasDoLog, LIMITE_LOG } from '@/lib/queries/log-acoes'
import {
  agruparPorPessoa, contaDoFiltro, dispositivoLegivel, eventoDeFora, resumoDoEvento,
  ehSensivel, ROTULO_TIPO, TIPOS_DESTRUTIVOS, type EventoLog,
} from '@/lib/log-acoes-tela'
import { TriangleAlert } from 'lucide-react'

type Params = { conta?: string; pessoa?: string; tipo?: string; de?: string; ate?: string }

const DIA = /^\d{4}-\d{2}-\d{2}$/
const CAMPO = 'h-10 rounded-md border border-input bg-card px-2 text-sm text-foreground'

function diasAntes(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const quando = (d: Date) => d.toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

export default function LogPage({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <AdminGuard href="/admin/log">
      <Conteudo searchParams={searchParams} />
    </AdminGuard>
  )
}

async function Conteudo({ searchParams }: { searchParams: Promise<Params> }) {
  const usuario = await getUsuarioLogado()
  const params = await searchParams
  const filtro = contaDoFiltro(usuario, params.conta)
  const geral = usuario.papel === 'admin_geral'

  const hoje = hojeBrt()
  const ate = params.ate && DIA.test(params.ate) ? params.ate : hoje
  const de = params.de && DIA.test(params.de) ? params.de : diasAntes(ate, 13)

  const [eventos, pessoasDoPeriodo, listaContas] = await Promise.all([
    filtro ? listarLog({ contaId: filtro.contaId, de, ate, usuarioId: params.pessoa || undefined }) : Promise.resolve([] as EventoLog[]),
    filtro ? listarPessoasDoLog({ contaId: filtro.contaId, de, ate }) : Promise.resolve([]),
    geral ? db.select({ id: contas.id, nome: contas.nome }).from(contas).orderBy(asc(contas.nome)) : Promise.resolve([]),
  ])
  const filtrados = eventos.filter(e =>
    !params.tipo || (params.tipo === 'sensiveis' ? ehSensivel(e.tipo) : e.tipo === params.tipo))
  const pessoas = agruparPorPessoa(filtrados)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Log de acessos e ações</h1>
        <p className="text-sm text-muted-foreground">
          {geral ? 'Todas as Contas' : 'Só a sua Conta'} · guarda 12 meses
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3" method="get">
        {geral && (
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Conta
            <select name="conta" defaultValue={params.conta ?? ''} className={CAMPO}>
              <option value="">Todas</option>
              {listaContas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Pessoa
          <select name="pessoa" defaultValue={params.pessoa ?? ''} className={CAMPO}>
            <option value="">Todas</option>
            {pessoasDoPeriodo.map(p => <option key={p.usuarioId} value={p.usuarioId}>{p.nome}</option>)}
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Tipo
          <select name="tipo" defaultValue={params.tipo ?? ''} className={CAMPO}>
            <option value="">Tudo</option>
            <option value="sensiveis">Só ações sensíveis</option>
            {Object.entries(ROTULO_TIPO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          De
          <input type="date" name="de" defaultValue={de} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <input type="date" name="ate" defaultValue={ate} className={CAMPO} />
        </label>
        <button type="submit" className={buttonVariants({ className: 'h-10' })}>Filtrar</button>
      </form>

      {!filtro && <p className="text-sm text-muted-foreground">Seu usuário não está ligado a nenhuma Conta.</p>}
      {eventos.length === LIMITE_LOG && (
        <p className="text-sm text-warning">Mostrando os {LIMITE_LOG} registros mais recentes: diminua o período para ver o resto.</p>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {pessoas.length === 0 && filtro && <p className="p-4 text-sm text-muted-foreground">Nada no período.</p>}
        {pessoas.map(p => (
          <details key={p.usuarioId} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 hover:bg-muted">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {p.nome}
                  {p.deFora && <span className="ml-2 text-xs font-semibold text-warning">entrou em grupo de fora da Conta</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Último registro {quando(p.ultimo)} · {p.dias} dia(s) com registro · {p.dispositivos} dispositivo(s)
                  {p.dispositivos > 1 && <TriangleAlert size={12} className="ml-1 inline -mt-0.5 text-warning" aria-label="mais de um dispositivo" />}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {p.sensiveis > 0
                  ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-text">{p.sensiveis} ação(ões) sensível(is)</span>
                  : <span className="text-xs text-muted-foreground">só acessos</span>}
                <p className="text-xs text-muted-foreground group-open:hidden">▼</p>
                <p className="hidden text-xs text-muted-foreground group-open:block">▲</p>
              </div>
            </summary>
            <ul className="divide-y divide-border border-t border-border bg-background">
              {p.eventos.map(e => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 sm:pl-8">
                  <span className="text-xs tabular-nums text-muted-foreground">{quando(e.criadoEm)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${ehSensivel(e.tipo)
                    ? (TIPOS_DESTRUTIVOS.includes(e.tipo) ? 'bg-muted font-semibold text-destructive' : 'bg-primary-soft font-semibold text-primary-text')
                    : 'bg-muted text-muted-foreground'}`}>
                    {ROTULO_TIPO[e.tipo] ?? e.tipo}
                  </span>
                  <span className="text-sm text-foreground">
                    {e.grupoNome && <>{e.grupoNome} · </>}{resumoDoEvento(e)}
                    {eventoDeFora(e) && <span className="ml-1 text-xs font-semibold text-warning">de fora da Conta</span>}
                  </span>
                  {ehSensivel(e.tipo) && (
                    <span className="w-full text-xs text-muted-foreground">{dispositivoLegivel(e.userAgent)} · IP {e.ip ?? '?'}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  )
}
