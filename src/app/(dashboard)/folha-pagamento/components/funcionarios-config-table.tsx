'use client'
import { useState, useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { salvarConfigFuncionarioAction } from '../actions'
import { labelDaBase } from '@/lib/folha'
import { fmtPercentual } from '@/lib/folha-tela'
import { parseNumeroBR, formatarNumeroBR } from '@/lib/numero-br'
import { rotuloDoPapelGravado } from '@/lib/rotulo-do-papel'
import { Bloco } from './folha-bloco'
import { CELULA } from './folha-mes-grade'
import { ValorOuZero } from './folha-mes-valor'

export type RegraResumo = {
  tipo: string
  base: string
  percentual: string
  vigenciaInicio: string | null
  vigenciaFim: string | null
}

export type FuncionarioRow = {
  usuarioId: string
  nome: string
  papel: string
  lojaNome: string
  salario: string
  ajudaCusto: string | null
  adiantamentoFixo: string | null
  ativo: boolean
  /** Só leitura aqui — quem cadastra é a aba Comissões. */
  regras: RegraResumo[]
}

// Faixas pela largura do CONTEÚDO (container `folha`, ver folha-casca.tsx): celular < 680 px (nome,
// salário e seta; os campos ficam no detalhe), tablet 680 a 959 px (+ ajuda, adiantamento e situação
// como texto; editar no detalhe), desktop >= 960 px (campos na própria linha, Salvar por linha).
// Cada campo é UM elemento só: o wrapper dos controles é o detalhe abaixo de 960 px e vira
// `contents` a partir dele, e aí os campos viram as células da grade da linha.
const GRADE = [
  'grid grid-cols-[minmax(0,1fr)_auto_44px]',
  '@[680px]/folha:grid-cols-[minmax(140px,2fr)_repeat(3,minmax(0,1fr))_minmax(5rem,auto)_44px]',
  '@[960px]/folha:grid-cols-[minmax(150px,1.6fr)_9rem_minmax(0,1.6fr)_8rem_8rem_4rem_6.5rem]',
].join(' ')
const SO_TABLET = 'hidden @[680px]/folha:block @[960px]/folha:hidden'
const ROTULO_DO_CAMPO = 'mb-1 block text-xs text-muted-foreground @[960px]/folha:hidden'
const CAMPO = 'h-11 text-base @[960px]/folha:h-8 @[960px]/folha:text-xs'

function RegrasLista({ regras }: { regras: RegraResumo[] }) {
  if (regras.length === 0) return <span className="text-xs text-muted-foreground">sem regra</span>
  return (
    <ul className="space-y-0.5">
      {regras.map((r, i) => (
        <li key={i} className="text-xs">
          <span className={r.tipo === 'premiacao' ? 'text-info' : 'text-success'}>{fmtPercentual(r.percentual)}%</span>
          {' '}{labelDaBase(r.base).toLowerCase()}
          <span className="text-muted-foreground"> · {r.tipo === 'premiacao' ? 'premiação' : 'comissão'}</span>
        </li>
      ))}
    </ul>
  )
}

const SeloInativo = ({ className = '' }: { className?: string }) => (
  <Badge variant="outline" className={`bg-muted text-muted-foreground ${className}`}>Inativo</Badge>
)

function LinhaFuncionario({ f }: { f: FuncionarioRow }) {
  // Os valores vêm do banco como "1880.00" / "0.50". Exibir cru fazia o campo
  // mostrar ponto onde o Brasil usa vírgula.
  const [salario, setSalario] = useState(formatarNumeroBR(f.salario))
  const [ajudaCusto, setAjudaCusto] = useState(formatarNumeroBR(f.ajudaCusto))
  const [adiantamentoFixo, setAdiantamentoFixo] = useState(formatarNumeroBR(f.adiantamentoFixo))
  const [ativo, setAtivo] = useState(f.ativo)
  const [pending, startTransition] = useTransition()

  function salvar() {
    const salarioNum = parseNumeroBR(salario)
    const ajudaNum = ajudaCusto.trim() ? parseNumeroBR(ajudaCusto) : null
    const adiantamentoNum = adiantamentoFixo.trim() ? parseNumeroBR(adiantamentoFixo) : null

    // Recusa em vez de salvar 0 calado — é salário, o erro passaria despercebido.
    if (salarioNum === null) { toast.error('Salário inválido'); return }
    if (ajudaCusto.trim() && ajudaNum === null) { toast.error('Ajuda de custo inválida'); return }
    if (adiantamentoFixo.trim() && adiantamentoNum === null) { toast.error('Adiantamento inválido'); return }

    startTransition(async () => {
      try {
        await salvarConfigFuncionarioAction(f.usuarioId, {
          salario: salarioNum,
          ajudaCusto: ajudaNum,
          adiantamentoFixo: adiantamentoNum,
          ativo,
        })
        // Renormaliza: quem digitou "1880.5" vê "1.880,50" e confirma o que salvou.
        setSalario(formatarNumeroBR(salarioNum))
        setAjudaCusto(ajudaNum === null ? '' : formatarNumeroBR(ajudaNum))
        setAdiantamentoFixo(adiantamentoNum === null ? '' : formatarNumeroBR(adiantamentoNum))
        toast.success(`Configuração de ${f.nome} salva`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  const [aberta, setAberta] = useState(false)
  const idDetalhe = `detalhe-config-${f.usuarioId}`
  // Texto das faixas sem campo: o valor GRAVADO, não o que está sendo digitado no detalhe.
  const gravado = { salario: Number(f.salario), ajuda: Number(f.ajudaCusto ?? 0), fixo: Number(f.adiantamentoFixo ?? 0) }

  return (
    <div role="row" className={`${GRADE} items-start border-t hover:bg-muted ${aberta ? 'bg-muted' : ''} ${f.ativo ? '' : 'text-muted-foreground'}`}>
      <div role="cell" className={CELULA}>
        <p className="wrap-anywhere font-medium">{f.nome}</p>
        <p className="text-xs text-muted-foreground"><span className="whitespace-nowrap">{rotuloDoPapelGravado(f.papel)}</span> · <span className="whitespace-nowrap">{f.lojaNome}</span></p>
        {!f.ativo && <SeloInativo className="mt-1 @[680px]/folha:hidden" />}
      </div>
      <div role="cell" className={`${CELULA} text-right tabular-nums @[960px]/folha:hidden`}><ValorOuZero valor={gravado.salario} /></div>
      <div role="cell" className={`${CELULA} text-right tabular-nums ${SO_TABLET}`}><ValorOuZero valor={gravado.ajuda} /></div>
      <div role="cell" className={`${CELULA} text-right tabular-nums ${SO_TABLET}`}><ValorOuZero valor={gravado.fixo} /></div>
      <div role="cell" className={`${CELULA} ${SO_TABLET}`}>
        {f.ativo ? <Badge variant="outline" className="border-success/50 bg-success/10 text-success">Ativo</Badge> : <SeloInativo />}
      </div>
      <div role="cell" className="flex items-center justify-center @[960px]/folha:hidden">
        <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-expanded={aberta} aria-controls={idDetalhe}
          aria-label={`Ver detalhes de ${f.nome}`} onClick={() => setAberta(a => !a)}>
          <ChevronDown aria-hidden className={aberta ? 'rotate-180' : ''} />
        </Button>
      </div>

      <div id={idDetalhe} className={`${aberta ? 'col-span-full grid gap-3 px-2.5 pb-3 @[680px]/folha:grid-cols-4' : 'hidden'} @[960px]/folha:contents`}>
        <div role="cell" className={`${CELULA} @[960px]/folha:py-2`}>
          <span className={ROTULO_DO_CAMPO}>Salário (R$)</span>
          <Input aria-label={`Salário de ${f.nome}`} inputMode="decimal" value={salario} onChange={e => setSalario(e.target.value)} className={CAMPO} placeholder="0,00" />
        </div>
        <div role="cell" className={`${CELULA} hidden @[960px]/folha:block`}><RegrasLista regras={f.regras} /></div>
        <div role="cell" className={`${CELULA} @[960px]/folha:py-2`}>
          <span className={ROTULO_DO_CAMPO}>Ajuda de custo (R$)</span>
          <Input aria-label={`Ajuda de custo de ${f.nome}`} inputMode="decimal" value={ajudaCusto} onChange={e => setAjudaCusto(e.target.value)} className={CAMPO} placeholder="Opcional" />
        </div>
        {/* Vale fixo: desconta TODO mês, sem precisar lançar nada. O adiantamento
            avulso de um mês só continua na aba Adiantamentos, e os dois se somam. */}
        <div role="cell" className={`${CELULA} @[960px]/folha:py-2`}>
          <span className={ROTULO_DO_CAMPO}>Adiantamento fixo (R$)</span>
          <Input aria-label={`Adiantamento fixo de ${f.nome}`} inputMode="decimal" value={adiantamentoFixo} onChange={e => setAdiantamentoFixo(e.target.value)} className={CAMPO} placeholder="Opcional" />
        </div>
        {/* O mesmo `ativo` em dois controles: botões de 44 px abaixo de 960 px, checkbox na tabela. */}
        <div role="cell" className={`${CELULA} @[960px]/folha:flex @[960px]/folha:justify-center @[960px]/folha:py-3`}>
          <span className={ROTULO_DO_CAMPO}>Situação</span>
          <div role="group" aria-label={`Situação de ${f.nome}`} className="grid grid-cols-2 overflow-hidden rounded-lg border border-input @[960px]/folha:hidden">
            {[{ rotulo: 'Ativo', valor: true }, { rotulo: 'Inativo', valor: false }].map(o => (
              <button key={o.rotulo} type="button" aria-pressed={ativo === o.valor} onClick={() => setAtivo(o.valor)}
                className="h-11 text-sm aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-primary-text">
                {o.rotulo}
              </button>
            ))}
          </div>
          <input type="checkbox" aria-label={`${f.nome} ativo`} checked={ativo} onChange={e => setAtivo(e.target.checked)} className="hidden rounded border-input @[960px]/folha:block" />
        </div>
        <Bloco titulo="Regras de comissão e premiação" className="col-span-full @[960px]/folha:hidden">
          <RegrasLista regras={f.regras} />
          <p className="mt-1.5 text-xs text-muted-foreground">Para mudar, use a aba Comissões.</p>
        </Bloco>
        <div role="cell" className="col-span-full flex @[680px]/folha:justify-end @[960px]/folha:col-auto @[960px]/folha:px-2.5 @[960px]/folha:py-2">
          <Button aria-label={`Salvar ${f.nome}`} className="h-11 w-full text-sm @[680px]/folha:w-40 @[960px]/folha:h-8 @[960px]/folha:w-auto @[960px]/folha:text-xs"
            disabled={pending} onClick={salvar}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

const TITULO = 'text-xs font-medium text-muted-foreground'

export function FuncionariosConfigTable({ funcionarios }: { funcionarios: FuncionarioRow[] }) {
  if (funcionarios.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhum funcionário encontrado nas lojas do grupo.</p>
  }
  return (
    <div className="space-y-3">
      <p className="max-w-[72ch] text-sm text-muted-foreground">
        Adiantamento fixo é o vale combinado que desconta <strong>todo mês</strong>, sem precisar lançar nada.
        O adiantamento de um mês só fica na aba <strong>Adiantamentos</strong>, e os dois se somam no desconto.
        Comissão e premiação ficam na aba <strong>Comissões</strong>, onde cada pessoa pode ter várias regras.
      </p>
      <div role="table" aria-label="Funcionários" className="overflow-hidden rounded-lg border bg-card text-sm">
        <div role="row" className={`hidden ${GRADE} bg-muted @[680px]/folha:grid`}>
          <div role="columnheader" className={`${CELULA} ${TITULO}`}>Funcionário</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} text-right @[960px]/folha:text-left`}>Salário (R$)</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} hidden @[960px]/folha:block`}>Regras de comissão/premiação</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} text-right @[960px]/folha:text-left`}>Ajuda de custo (R$)</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} text-right @[960px]/folha:text-left`}>Adiantamento fixo (R$)</div>
          <div role="columnheader" className={`${CELULA} ${TITULO} @[960px]/folha:text-center`}>
            <span className="@[960px]/folha:hidden">Situação</span><span className="hidden @[960px]/folha:inline">Ativo</span>
          </div>
          <div role="columnheader" className="sr-only">Detalhes e Salvar</div>
        </div>
        {funcionarios.map(f => <LinhaFuncionario key={f.usuarioId} f={f} />)}
      </div>
    </div>
  )
}
