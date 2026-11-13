'use client'
import { useId } from 'react'
import { dataPuraBr } from '@/lib/data-venda'
import type { ItemDaNovidade, NovidadeDaVersao } from '@/lib/novidades/tipos'
import { JanelaDeAviso } from './janela-de-aviso'

function Secao({ titulo, itens = [] }: { titulo: string; itens?: readonly ItemDaNovidade[] }) {
  const id = useId()
  if (!itens.length) return null
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <ul className="space-y-3">
        {itens.map((item, i) => (
          <li key={i}>
            <p className="font-medium text-foreground">{item.titulo}</p>
            <p className="text-muted-foreground">{item.texto}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Janela das Novidades da versão: o que mudou, escrito para a loja; sai só pelo Entendi. */
export function NovidadeModal({ novidade, aoEntendi }: { novidade: NovidadeDaVersao; aoEntendi: () => void }) {
  return (
    <JanelaDeAviso
      titulo={`Novidades do MOVA, versão ${novidade.versao}`}
      subtitulo={dataPuraBr(novidade.data)}
      textoDoBotao="Entendi"
      aoConfirmar={aoEntendi}
    >
      <div className="space-y-5">
        <Secao titulo="Novidades" itens={novidade.novidades} />
        <Secao titulo="Correções" itens={novidade.correcoes} />
      </div>
    </JanelaDeAviso>
  )
}
