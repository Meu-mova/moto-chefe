'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CalendarX, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BASES_COMISSAO, TIPOS_REGRA, labelDaBase, regraVigenteNoMes, type RegraFolha } from '@/lib/folha'
import { fmtPercentual, rotuloVigencia } from '@/lib/folha-tela'
import { rotuloMesCurto } from '@/lib/data-venda'
import { parseNumeroBR } from '@/lib/numero-br'
import { criarRegraComissaoAction, encerrarRegraComissaoAction, excluirRegraComissaoAction } from '../actions'
import { CELULA, TITULO } from './folha-mes-grade'

export type RegraRow = RegraFolha & { usuarioNome: string; lojaNome: string | null }
export type FuncionarioOpcao = { id: string; nome: string; lojaId: string }

// Faixas pela largura do CONTEÚDO (container `folha`, ver folha-casca.tsx): celular < 680 px (nome,
// loja e tipo, percentual e seta; o resto no detalhe), tablet 680 a 959 px (+ tipo, base e vigência),
// desktop >= 960 px (tabela completa, ações em ícone). Observação e ações são UM elemento só: o
// wrapper deles é o detalhe abaixo de 960 px e vira `contents` a partir dele.
const GRADE = [
  'grid grid-cols-[minmax(0,1fr)_auto_44px]',
  '@[680px]/folha:grid-cols-[minmax(130px,2fr)_6.5rem_minmax(0,2fr)_4rem_minmax(0,2fr)_44px]',
  '@[960px]/folha:grid-cols-[minmax(140px,1.6fr)_6.5rem_minmax(0,1.6fr)_4rem_minmax(0,1.8fr)_minmax(0,1.6fr)_5rem]',
].join(' ')
const SO_TABLET_EM_DIANTE = 'hidden @[680px]/folha:block'
const ROTULO_DO_DETALHE = 'mb-0.5 block text-xs text-muted-foreground @[960px]/folha:hidden'
const CAMPO = 'h-11 text-base @[960px]/folha:h-8 @[960px]/folha:text-xs'
const SELECT = `w-full rounded-lg border border-border bg-card px-2 ${CAMPO}`

const corDoTipo = (tipo: string) => tipo === 'premiacao' ? 'border-info/50 bg-info/10 text-info' : 'border-success/50 bg-success/10 text-success'
const rotuloDoTipo = (tipo: string) => tipo === 'premiacao' ? 'Premiação' : 'Comissão'

function Vigencia({ r, vigente, mes }: { r: RegraRow; vigente: boolean; mes: string }) {
  return (
    <>
      {rotuloVigencia(r.vigenciaInicio, r.vigenciaFim)}
      {/* Sem esta marca, uma regra futura ou encerrada parece estar valendo e alguém cadastra a
          mesma coisa duas vezes. */}
      {!vigente && <span className="block text-xs text-muted-foreground">não vale em {rotuloMesCurto(mes)}</span>}
    </>
  )
}

function BotaoDaRegra({ rotulo, dica, pessoa, desabilitado, onClick, Icone, hover }: {
  rotulo: string; dica: string; pessoa: string; desabilitado: boolean; onClick: () => void
  Icone: typeof CalendarX; hover: string
}) {
  return (
    <Button variant="outline" title={dica} aria-label={`${rotulo} regra de ${pessoa}`} disabled={desabilitado} onClick={onClick}
      className={`h-11 gap-2 text-sm @[960px]/folha:size-8 @[960px]/folha:border-0 @[960px]/folha:bg-transparent @[960px]/folha:p-0 @[960px]/folha:text-muted-foreground ${hover}`}>
      <Icone aria-hidden className="size-4" /><span className="@[960px]/folha:sr-only">{rotulo}</span>
    </Button>
  )
}

function LinhaRegra({ r, mes, pending, encerrar, excluir }: {
  r: RegraRow; mes: string; pending: boolean; encerrar: (id: string) => void; excluir: (id: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const vigente = regraVigenteNoMes(r, mes)
  const idDetalhe = `detalhe-regra-${r.id}`
  return (
    <div role="row" className={`${GRADE} items-start border-t hover:bg-muted ${aberta ? 'bg-muted' : ''} ${vigente ? '' : 'text-muted-foreground'}`}>
      <div role="cell" className={CELULA}>
        <p className={`wrap-anywhere ${vigente ? 'font-medium' : ''}`}>{r.usuarioNome}</p>
        <p className="text-xs text-muted-foreground">{r.lojaNome ?? 'Sem loja'}</p>
        <Badge variant="outline" className={`mt-1 @[680px]/folha:hidden ${corDoTipo(r.tipo)}`}>{rotuloDoTipo(r.tipo)}</Badge>
      </div>
      <div role="cell" className={`${CELULA} ${SO_TABLET_EM_DIANTE}`}>
        <Badge variant="outline" className={corDoTipo(r.tipo)}>{rotuloDoTipo(r.tipo)}</Badge>
      </div>
      <div role="cell" className={`${CELULA} ${SO_TABLET_EM_DIANTE}`}>{labelDaBase(r.base)}</div>
      <div role="cell" className={`${CELULA} text-right font-medium tabular-nums whitespace-nowrap`}>{fmtPercentual(r.percentual)}%</div>
      <div role="cell" className={`${CELULA} ${SO_TABLET_EM_DIANTE}`}><Vigencia r={r} vigente={vigente} mes={mes} /></div>
      <div role="cell" className="flex items-center justify-center @[960px]/folha:hidden">
        <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-expanded={aberta} aria-controls={idDetalhe}
          aria-label={`Ver detalhes de ${r.usuarioNome}`} onClick={() => setAberta(a => !a)}>
          <ChevronDown aria-hidden className={aberta ? 'rotate-180' : ''} />
        </Button>
      </div>

      <div id={idDetalhe} className={`${aberta ? 'col-span-full grid grid-cols-2 gap-3 px-2.5 pb-3' : 'hidden'} @[960px]/folha:contents`}>
        <div role="cell" className="@[680px]/folha:hidden">
          <span className={ROTULO_DO_DETALHE}>Base de cálculo</span><p className="text-sm">{labelDaBase(r.base)}</p>
        </div>
        <div role="cell" className="@[680px]/folha:hidden">
          <span className={ROTULO_DO_DETALHE}>Vigência</span><p className="text-sm"><Vigencia r={r} vigente={vigente} mes={mes} /></p>
        </div>
        <div role="cell" className={`col-span-full text-sm @[960px]/folha:col-auto ${CELULA}`}>
          <span className={ROTULO_DO_DETALHE}>Observação</span>
          {r.descricao ? <span className="text-muted-foreground">{r.descricao}</span> : <span className="text-muted-foreground @[960px]/folha:hidden">Sem observação</span>}
        </div>
        <div role="cell" className="col-span-full grid grid-cols-2 gap-2 @[960px]/folha:col-auto @[960px]/folha:flex @[960px]/folha:justify-end @[960px]/folha:gap-1 @[960px]/folha:px-2.5 @[960px]/folha:py-2">
          <BotaoDaRegra rotulo="Encerrar" dica="Encerrar a partir de um mês (preserva o histórico)" pessoa={r.usuarioNome} desabilitado={pending}
            onClick={() => encerrar(r.id)} Icone={CalendarX} hover="@[960px]/folha:hover:text-warning" />
          <BotaoDaRegra rotulo="Apagar" dica="Apagar de vez" pessoa={r.usuarioNome} desabilitado={pending}
            onClick={() => excluir(r.id)} Icone={Trash2} hover="@[960px]/folha:hover:text-destructive" />
        </div>
      </div>
    </div>
  )
}

function Campo({ rotulo, className = '', children }: { rotulo: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid min-w-0 content-start gap-1 text-xs text-muted-foreground ${className}`}><span>{rotulo}</span>{children}</label>
}

export function RegrasComissaoTable({ regras, funcionarios, mes }: {
  regras: RegraRow[]
  funcionarios: FuncionarioOpcao[]
  /** Mês do recorte da folha. Serve para marcar quais regras estão valendo nele. */
  mes: string
}) {
  const [usuarioId, setUsuarioId] = useState('')
  const [tipo, setTipo] = useState('comissao')
  const [base, setBase] = useState('padrao')
  const [percentual, setPercentual] = useState('')
  const [vigenciaInicio, setVigenciaInicio] = useState(mes)
  const [vigenciaFim, setVigenciaFim] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pending, startTransition] = useTransition()

  function adicionar() {
    const percentualNum = parseNumeroBR(percentual)
    if (percentualNum === null) { toast.error('Percentual inválido'); return }

    startTransition(async () => {
      try {
        await criarRegraComissaoAction({
          usuarioId, tipo, base,
          percentual: percentualNum,
          vigenciaInicio: vigenciaInicio || null,
          vigenciaFim: vigenciaFim || null,
          descricao,
        })
        toast.success('Regra cadastrada')
        setPercentual('')
        setDescricao('')
        setVigenciaFim('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar regra')
      }
    })
  }

  function encerrar(id: string) {
    const informado = prompt('Encerrar a regra a partir de qual mês? (formato AAAA-MM)\n\nA regra continua valendo até o mês informado, inclusive, e os meses já pagos não mudam.', mes)
    if (informado === null) return
    startTransition(async () => {
      try {
        await encerrarRegraComissaoAction(id, informado.trim())
        toast.success('Regra encerrada')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao encerrar')
      }
    })
  }

  function excluir(id: string) {
    if (!confirm('Apagar a regra de vez?\n\nEla some também dos meses em que valeu: reabrir uma folha antiga vai mostrar valor diferente do que foi pago.\n\nPara só parar de valer daqui pra frente, use "Encerrar".')) return
    startTransition(async () => {
      try {
        await excluirRegraComissaoAction(id)
        toast.success('Regra removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="max-w-[72ch] text-sm text-muted-foreground">
        Cada funcionário pode ter <strong>várias regras</strong>, de comissão e de premiação. Regras do mesmo tipo
        somam. A vigência protege o passado: sem mês de início a regra vale desde sempre, e encerrar uma regra
        não muda os meses já pagos.
      </p>

      <div role="table" aria-label="Regras de comissão" className="overflow-hidden rounded-lg border bg-card text-sm">
        <div role="row" className={`hidden ${GRADE} bg-muted @[680px]/folha:grid`}>
          <div role="columnheader" className={`${CELULA} ${TITULO}`}>Funcionário</div>
          <div role="columnheader" className={`${CELULA} ${TITULO}`}>Tipo</div>
          <div role="columnheader" className={`${CELULA} ${TITULO}`}>Base de cálculo</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} text-right`}>%</div>
          <div role="columnheader" className={`${CELULA} ${TITULO}`}>Vigência</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} hidden @[960px]/folha:block`}>Observação</div>
          <div role="columnheader" className="sr-only">Detalhes e ações</div>
        </div>
        {regras.map(r => <LinhaRegra key={r.id} r={r} mes={mes} pending={pending} encerrar={encerrar} excluir={excluir} />)}
        {regras.length === 0 && (
          <p className="border-t py-6 text-center text-muted-foreground">Nenhuma regra cadastrada.</p>
        )}
      </div>

      <details className="rounded-lg border bg-card">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Plus aria-hidden className="size-4" /> Nova regra
        </summary>
        <div className="grid gap-3 border-t p-3 @[680px]/folha:grid-cols-2 @[960px]/folha:grid-cols-4">
          <Campo rotulo="Funcionário">
            <select value={usuarioId} onChange={e => setUsuarioId(e.target.value)} className={SELECT}>
              <option value="">Selecione…</option>
              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Tipo">
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={SELECT}>
              {TIPOS_REGRA.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Base de cálculo">
            <select value={base} onChange={e => setBase(e.target.value)} className={SELECT}>
              {BASES_COMISSAO.map(b => <option key={b.valor} value={b.valor}>{b.label}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Percentual (%)">
            <Input value={percentual} onChange={e => setPercentual(e.target.value)} inputMode="decimal" className={CAMPO} placeholder="0,2" />
          </Campo>
          <Campo rotulo="Vale a partir de">
            <Input type="month" value={vigenciaInicio} onChange={e => setVigenciaInicio(e.target.value)} className={CAMPO} />
          </Campo>
          <Campo rotulo="Até (opcional)">
            <Input type="month" value={vigenciaFim} onChange={e => setVigenciaFim(e.target.value)} className={CAMPO} />
          </Campo>
          <Campo rotulo="Observação" className="@[680px]/folha:col-span-2">
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} className={CAMPO} placeholder="Ex.: premiação combinada em setembro" />
          </Campo>
          <Button className="h-11 w-full text-sm @[960px]/folha:h-8 @[960px]/folha:self-end @[960px]/folha:text-xs" disabled={pending || !usuarioId} onClick={adicionar}>
            Cadastrar regra
          </Button>
        </div>
      </details>
    </div>
  )
}
