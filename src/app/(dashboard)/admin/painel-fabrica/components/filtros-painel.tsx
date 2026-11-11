// Filtros do Painel da Fábrica: formulário GET, sem JavaScript. O filtro mora na URL,
// para o impresso e o CSV saírem iguais ao que está na tela.
import Link from 'next/link'
import type { FiltroPainel, LojaPainel } from '@/lib/painel-fabrica'

function Multipla({ nome, rotulo, opcoes, marcados }: {
  nome: string
  rotulo: string
  opcoes: { valor: string; texto: string; detalhe?: string }[]
  marcados: string[]
}) {
  const resumo = marcados.length === 0 ? 'Todas' : marcados.length === 1
    ? (opcoes.find(o => o.valor === marcados[0])?.texto ?? '1 selecionada')
    : `${marcados.length} selecionadas`
  return (
    <details className="relative group">
      <summary className="list-none cursor-pointer select-none border border-input rounded-md px-3 py-1.5 text-sm bg-card min-w-44 flex justify-between gap-2">
        <span><span className="text-muted-foreground">{rotulo}:</span> {resumo}</span>
        <span aria-hidden className="text-muted-foreground group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute z-20 mt-1 w-72 max-h-72 overflow-y-auto bg-popover text-popover-foreground border rounded-md shadow-md p-2 space-y-1">
        {opcoes.length === 0 && <p className="text-sm text-muted-foreground px-1">Nada para escolher.</p>}
        {opcoes.map(o => (
          <label key={o.valor} className="flex items-start gap-2 text-sm px-1 py-0.5 rounded hover:bg-muted cursor-pointer">
            <input type="checkbox" name={nome} value={o.valor} defaultChecked={marcados.includes(o.valor)} className="mt-0.5" />
            <span>{o.texto}{o.detalhe && <span className="block text-xs text-muted-foreground">{o.detalhe}</span>}</span>
          </label>
        ))}
      </div>
    </details>
  )
}

export function FiltrosPainel({ lojas, modelos, cores, filtro, de, ate }: {
  lojas: LojaPainel[]
  modelos: string[]
  cores: string[]
  filtro: FiltroPainel
  de: string
  ate: string
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 bg-card border rounded-lg p-3">
      <Multipla
        nome="loja" rotulo="Lojas" marcados={filtro.lojas}
        opcoes={lojas.map(l => ({ valor: l.lojaId, texto: l.lojaNome, detalhe: `${l.cidade} · ${l.grupoNome}` }))}
      />
      <Multipla nome="modelo" rotulo="Modelos" marcados={filtro.modelos} opcoes={modelos.map(m => ({ valor: m, texto: m }))} />
      <Multipla nome="cor" rotulo="Cores" marcados={filtro.cores} opcoes={cores.map(c => ({ valor: c, texto: c }))} />
      <div className="space-y-1">
        <label htmlFor="de" className="text-xs text-muted-foreground block">Vendas de</label>
        <input type="date" id="de" name="de" defaultValue={de} className="border border-input rounded-md px-3 py-1.5 text-sm bg-card" />
      </div>
      <div className="space-y-1">
        <label htmlFor="ate" className="text-xs text-muted-foreground block">até</label>
        <input type="date" id="ate" name="ate" defaultValue={ate} className="border border-input rounded-md px-3 py-1.5 text-sm bg-card" />
      </div>
      <button type="submit" className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm">Aplicar</button>
      <Link href="/admin/painel-fabrica" className="h-9 px-3 inline-flex items-center rounded-md text-sm text-muted-foreground hover:bg-muted">Limpar</Link>
    </form>
  )
}
