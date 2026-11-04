'use client'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'
import { criarFaixaPremiacaoAction, excluirFaixaPremiacaoAction } from '../actions'
import { parseNumeroBR } from '@/lib/numero-br'
import { AVISO_PREMIACAO, exemploDaPremiacao } from '@/lib/folha-tela'
import { ordenarFaixas } from '@/lib/premiacao'
import { fmtBRL } from '@/lib/preco-minimo'
import { AvisoFolha } from './folha-aviso'

export type FaixaRow = { id: string; valorMinimoVendas: string; premiacao: string }

const reais = (v: string) => fmtBRL(parseFloat(v))
const CARTAO = 'rounded-lg border bg-card p-4'
const TITULO_COLUNA = 'px-4 py-2 text-left text-xs font-medium text-muted-foreground'
// Alvo de toque de 44 px abaixo de 960 px de conteúdo (container `folha`, ver folha-casca.tsx).
const CAMPO = 'h-11 @[960px]/folha:h-8'

function ComoFunciona({ faixas }: { faixas: FaixaRow[] }) {
  const exemplo = exemploDaPremiacao(faixas)
  return (
    <section aria-labelledby="como-funciona" className={`${CARTAO} space-y-3 @[960px]/folha:col-start-2 @[960px]/folha:row-start-1`}>
      <h2 id="como-funciona" className="font-semibold">Como funciona</h2>
      <AvisoFolha>{AVISO_PREMIACAO}</AvisoFolha>
      <p className="text-sm text-muted-foreground">
        Valor fixo por meta batida, só para vendedor e sobre as motos que a própria pessoa vendeu no mês. Vale a
        faixa de maior venda mínima que ele atingiu, e ela <strong>soma</strong> com as regras de premiação em
        percentual da aba Comissões.
      </p>
      {exemplo && (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">
          Exemplo: vendeu <b>{fmtBRL(exemplo.vendido)}</b> no mês, ganha <b>{fmtBRL(exemplo.premiacao)}</b> ({exemplo.ordinal}ª faixa).
        </p>
      )}
    </section>
  )
}

export function PremiacaoFaixasTable({ faixas }: { faixas: FaixaRow[] }) {
  const [novoMinimo, setNovoMinimo] = useState('')
  const [novoPremio, setNovoPremio] = useState('')
  const [pending, startTransition] = useTransition()
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const idMinimo = useId()
  const idPremio = useId()

  const ordenadas = ordenarFaixas(faixas)

  function adicionar() {
    if (!novoMinimo.trim() || !novoPremio.trim()) {
      toast.error('Preencha os dois campos')
      return
    }
    const minimo = parseNumeroBR(novoMinimo)
    const premio = parseNumeroBR(novoPremio)
    if (minimo === null) { toast.error('Venda mínima inválida'); return }
    if (premio === null) { toast.error('Premiação inválida'); return }

    startTransition(async () => {
      try {
        await criarFaixaPremiacaoAction(minimo, premio)
        toast.success('Faixa adicionada')
        setNovoMinimo('')
        setNovoPremio('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao adicionar faixa')
      }
    })
  }

  function excluir(id: string) {
    setExcluindoId(id)
    startTransition(async () => {
      try {
        await excluirFaixaPremiacaoAction(id)
        toast.success('Faixa removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      } finally {
        setExcluindoId(null)
      }
    })
  }

  // Celular e tablet: Como funciona, tabela, Nova faixa, nessa ordem. Desktop (>= 960 px): tabela à
  // esquerda e os dois cartões na coluna da direita, por posição na grade (o DOM não muda de ordem).
  // A 2ª linha é 1fr: com muitas faixas a tabela cresce e o excesso fica embaixo de "Nova faixa", sem abrir
  // buraco entre os dois cartões.
  return (
    <div className="grid items-start gap-4 @[960px]/folha:grid-cols-[minmax(0,1fr)_22rem] @[960px]/folha:grid-rows-[auto_1fr]">
      <ComoFunciona faixas={faixas} />

      <div className="overflow-hidden rounded-lg border bg-card @[960px]/folha:col-start-1 @[960px]/folha:row-span-2 @[960px]/folha:row-start-1">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted">
            <tr>
              <th className={`${TITULO_COLUNA} hidden @[680px]/folha:table-cell`}>Faixa</th>
              <th className={TITULO_COLUNA}>Venda mínima no mês</th>
              <th className={`${TITULO_COLUNA} text-right`}>Premiação</th>
              <th className="w-14 px-2 py-2"><span className="sr-only">Remover</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ordenadas.map((f, i) => (
              <tr key={f.id} className="hover:bg-muted">
                <td className="hidden px-4 py-2 text-muted-foreground @[680px]/folha:table-cell">{i + 1}ª</td>
                <td className="px-4 py-2 tabular-nums">{reais(f.valorMinimoVendas)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{reais(f.premiacao)}</td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    aria-label={`Remover faixa ${i + 1}ª`}
                    onClick={() => excluir(f.id)}
                    disabled={pending && excluindoId === f.id}
                    className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive @[960px]/folha:size-8"
                  >
                    <Trash2 aria-hidden size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Nenhuma faixa cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="nova-faixa" className={`${CARTAO} space-y-3 @[960px]/folha:col-start-2 @[960px]/folha:row-start-2`}>
        <h2 id="nova-faixa" className="font-semibold">Nova faixa</h2>
        <div className="space-y-1">
          <label htmlFor={idMinimo} className="text-xs text-muted-foreground">Venda mínima (R$)</label>
          <Input id={idMinimo} value={novoMinimo} onChange={e => setNovoMinimo(e.target.value)} className={CAMPO} placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <label htmlFor={idPremio} className="text-xs text-muted-foreground">Premiação (R$)</label>
          <Input id={idPremio} value={novoPremio} onChange={e => setNovoPremio(e.target.value)} className={CAMPO} placeholder="0,00" />
        </div>
        <Button className="h-11 w-full @[960px]/folha:h-9" disabled={pending} onClick={adicionar}>
          Adicionar faixa
        </Button>
      </section>
    </div>
  )
}
