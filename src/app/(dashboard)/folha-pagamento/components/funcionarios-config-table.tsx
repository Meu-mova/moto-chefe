'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { salvarConfigFuncionarioAction } from '../actions'
import { labelDaBase } from '@/lib/folha'
import { parseNumeroBR, formatarNumeroBR } from '@/lib/numero-br'

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

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm:     'Auxiliar Adm.',
  vendedor:    'Vendedor',
  mecanico:    'Mecânico',
  motorista:   'Motorista',
}

function fmtPercent(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}

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

  return (
    <tr className="hover:bg-muted align-top">
      <td className="px-4 py-2">
        <p className="font-medium">{f.nome}</p>
        <p className="text-xs text-muted-foreground">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
      </td>
      <td className="px-4 py-2">
        <Input value={salario} onChange={e => setSalario(e.target.value)} className="h-8 text-xs w-28" placeholder="0,00" />
      </td>
      <td className="px-4 py-2">
        {/* Só leitura: uma pessoa pode ter várias regras, e editá-las numa célula de
            tabela esconderia a vigência. O cadastro fica na aba Comissões. */}
        {f.regras.length === 0 ? (
          <span className="text-xs text-muted-foreground">sem regra</span>
        ) : (
          <div className="space-y-0.5">
            {f.regras.map((r, i) => (
              <p key={i} className="text-xs whitespace-nowrap">
                <span className={r.tipo === 'premiacao' ? 'text-info' : 'text-success'}>
                  {fmtPercent(r.percentual)}%
                </span>
                {' '}{labelDaBase(r.base).toLowerCase()}
                <span className="text-muted-foreground"> · {r.tipo === 'premiacao' ? 'premiação' : 'comissão'}</span>
              </p>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <Input value={ajudaCusto} onChange={e => setAjudaCusto(e.target.value)} className="h-8 text-xs w-28" placeholder="Opcional" />
      </td>
      <td className="px-4 py-2">
        {/* Vale fixo: desconta TODO mês, sem precisar lançar nada. O adiantamento
            avulso de um mês só continua na aba Adiantamentos, e os dois se somam. */}
        <Input
          value={adiantamentoFixo}
          onChange={e => setAdiantamentoFixo(e.target.value)}
          className="h-8 text-xs w-28"
          placeholder="Opcional"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="rounded border-input" />
      </td>
      <td className="px-4 py-2">
        <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={salvar}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </td>
    </tr>
  )
}

export function FuncionariosConfigTable({ funcionarios }: { funcionarios: FuncionarioRow[] }) {
  if (funcionarios.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhum funcionário encontrado nas lojas do grupo.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Adiantamento fixo é o vale combinado que desconta <strong>todo mês</strong>, sem precisar lançar nada.
        Adiantamento de um mês só continua na aba <strong>Adiantamentos</strong> — os dois se somam no desconto.
        Comissão e premiação ficam na aba <strong>Comissões</strong>, onde cada pessoa pode ter várias regras.
      </p>
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Funcionário</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Salário (R$)</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Regras de comissão/premiação</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Ajuda de Custo (R$)</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Adiantamento fixo (R$)</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Ativo</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {funcionarios.map(f => <LinhaFuncionario key={f.usuarioId} f={f} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
