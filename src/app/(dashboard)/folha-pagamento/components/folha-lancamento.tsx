'use client'
import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CAMPO, CELULA, TITULO } from './folha-mes-grade'
import { SetaDetalhe } from './folha-seta-detalhe'

// Peças das abas que listam lançamentos do mês e têm um formulário embaixo (Adiantamentos, Ajustes).
// Faixas pela largura do CONTEÚDO (container `folha`, ver folha-casca.tsx): celular < 680 px (linha
// compacta e seta), tablet 680 a 959 px (mais colunas e a seta), desktop >= 960 px (tabela completa e
// lixeira; o detalhe e a seta somem). Cada aba define a `grade` das suas colunas.

export type ColunaLancamento = { titulo: string; className?: string }

export function TabelaLancamentos({ rotulo, grade, colunas, quantidade, vazio, rodape, children }: {
  rotulo: string
  grade: string
  colunas: ColunaLancamento[]
  quantidade: number
  vazio: string
  rodape?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div role="table" aria-label={rotulo} className="overflow-hidden rounded-lg border bg-card text-sm">
      <div role="row" className={`${grade} bg-muted`}>
        {colunas.map(c => <div key={c.titulo} role="columnheader" className={`${CELULA} ${TITULO} ${c.className ?? ''}`}>{c.titulo}</div>)}
        <div role="columnheader" className="sr-only">Ações</div>
      </div>
      {children}
      {quantidade === 0
        ? <div role="row"><div role="cell" className="border-t py-8 text-center text-muted-foreground">{vazio}</div></div>
        : rodape}
    </div>
  )
}

// As células da linha vêm em `children`, na ordem das colunas do desktop. Depois delas: a lixeira (só
// desktop), a seta (celular e tablet) e o detalhe aberto, com o texto longo e o Remover.
export function LinhaLancamento({ id, grade, nome, rotuloDetalhe, detalhe, rotuloRemover, onRemover, ocupado, children }: {
  id: string
  grade: string
  nome: string
  rotuloDetalhe: string
  detalhe: string | null
  rotuloRemover: string
  onRemover: () => void
  ocupado: boolean
  children: React.ReactNode
}) {
  // O estado "aberta" mora aqui: a linha tem `key` estável, então remover outra linha ou revalidar
  // a página não fecha o detalhe.
  const [aberta, setAberta] = useState(false)
  const idDetalhe = `detalhe-${id}`
  return (
    <div role="row" className={`${grade} items-center border-t ${aberta ? 'bg-muted' : 'hover:bg-muted'}`}>
      {children}
      <div role="cell" className="hidden items-center justify-center @[960px]/folha:flex">
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={rotuloRemover} disabled={ocupado} onClick={onRemover}>
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div role="cell" className="flex items-center justify-center @[960px]/folha:hidden">
        <SetaDetalhe nome={nome} aberta={aberta} alternar={() => setAberta(a => !a)} idDetalhe={idDetalhe} />
      </div>
      {aberta && (
        <div role="cell" id={idDetalhe} className="col-span-full px-2.5 pb-3 @[960px]/folha:hidden">
          <p className="text-xs text-muted-foreground">{rotuloDetalhe}</p>
          <p className="mb-2 wrap-anywhere font-medium">{detalhe || <span className="font-normal text-muted-foreground">Sem {rotuloDetalhe.toLowerCase()}</span>}</p>
          <Button variant="outline" className="h-11 w-full @[680px]/folha:w-auto" disabled={ocupado} onClick={onRemover}>
            <Trash2 aria-hidden /> Remover
          </Button>
        </div>
      )}
    </div>
  )
}

export const SELECT = `${CAMPO} w-full rounded-lg border border-input bg-card px-2.5 disabled:bg-muted disabled:text-muted-foreground`

/** `colunas`: as colunas do formulário a partir de 960 px (ex.: `@[960px]/folha:grid-cols-3`); abaixo, 1 e 2 colunas. */
export function CartaoFormulario({ titulo, dica, colunas, children }: { titulo: string; dica: string | null; colunas: string; children: React.ReactNode }) {
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo} className="rounded-lg border bg-card p-4">
      <h2 id={idTitulo} className="mb-3 font-semibold">{titulo}</h2>
      <div className={`grid gap-3 @[680px]/folha:grid-cols-2 @[960px]/folha:items-end ${colunas}`}>{children}</div>
      {dica && <p className="mt-2 text-xs text-muted-foreground">{dica}</p>}
    </section>
  )
}

export function Campo({ id, rotulo, className = '', children }: { id: string; rotulo: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</label>
      {children}
    </div>
  )
}
