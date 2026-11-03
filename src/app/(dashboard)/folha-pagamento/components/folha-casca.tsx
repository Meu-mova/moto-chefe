'use client'
import { useState } from 'react'
import { Info } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PrintButton } from '../../relatorio-fabrica/print-button'
import { ABAS_FOLHA, avisoDaAba } from '@/lib/folha-tela'
import { LojaSelectorFolha } from './loja-selector-folha'
import { MesStepperFolha } from './mes-stepper-folha'

// Casca da /folha-pagamento. Tudo dentro dela responde à largura do CONTEÚDO (container query
// `folha`, sem o menu lateral), não da janela: celular < 680 px, tablet 680 a 959 px, desktop
// >= 960 px. Quem desenha uma aba usa as variantes `@[680px]/folha:` e `@[960px]/folha:` no
// próprio componente, com alvo de toque de 44 px abaixo de 960 px e cor só pelas variáveis do
// globals.css. A lista de abas, os avisos e o que imprime ficam em ABAS_FOLHA (@/lib/folha-tela).
export function FolhaCasca({ lojas, lojaAtual, mesAtual, children }: {
  lojas: { id: string; nome: string }[]
  lojaAtual: string
  mesAtual: string
  children: React.ReactNode
}) {
  const [aba, setAba] = useState(ABAS_FOLHA[0].id)
  const aviso = avisoDaAba(aba)
  const imprime = ABAS_FOLHA.find(a => a.id === aba)?.imprime ?? false
  const rotulo = 'text-xs text-muted-foreground'

  return (
    <div className="@container/folha min-w-0 space-y-4">
      <div className="flex flex-col gap-3 @[900px]/folha:flex-row @[900px]/folha:items-end @[900px]/folha:justify-between @[900px]/folha:gap-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold @[900px]/folha:text-2xl">Folha de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Salários, comissões, premiação e ajuda de custo</p>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2 @[680px]/folha:grid-cols-[minmax(160px,240px)_auto_auto] @[680px]/folha:justify-start">
          <div className="col-span-full flex flex-col gap-1 @[680px]/folha:col-auto">
            <span className={rotulo}>Loja</span>
            <LojaSelectorFolha lojas={lojas} lojaAtual={lojaAtual} />
          </div>
          <div className="flex min-w-max flex-col gap-1">
            <span className={rotulo}>Mês</span>
            <MesStepperFolha mesAtual={mesAtual} />
          </div>
          {imprime && (
            <PrintButton
              href={`/folha-pagamento/imprimir?mes=${mesAtual}&loja=${lojaAtual}`}
              rotulo="Imprimir folha"
              className="h-11 min-w-11 px-3 @[960px]/folha:h-9 @[960px]/folha:min-w-0"
              rotuloClassName="sr-only @[680px]/folha:not-sr-only"
            />
          )}
        </div>
      </div>

      <Tabs value={aba} onValueChange={v => setAba(String(v))} className="gap-4">
        {/* Abaixo de 820 px as 7 abas não cabem: vira um seletor. O mesmo estado alimenta os dois. */}
        <label className="flex flex-col gap-1 @[820px]/folha:hidden">
          <span className={rotulo}>Seção</span>
          <select
            aria-label="Seção"
            value={aba}
            onChange={e => setAba(e.target.value)}
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm font-semibold"
          >
            {ABAS_FOLHA.map(a => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
          </select>
        </label>
        <TabsList variant="line" className="hidden w-full justify-start border-b @[820px]/folha:inline-flex group-data-horizontal/tabs:h-11">
          {ABAS_FOLHA.map(a => (
            <TabsTrigger key={a.id} value={a.id} className="flex-none px-3.5">{a.rotulo}</TabsTrigger>
          ))}
        </TabsList>

        {aviso && (
          <p className="flex max-w-[72ch] gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <span>{aviso}</span>
          </p>
        )}
        {children}
      </Tabs>
    </div>
  )
}
