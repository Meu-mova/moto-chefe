import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { carregarPainelFabrica } from '@/lib/queries/painel-fabrica'
import {
  abaDaUrl, filtroDaUrl, filtrarEstoque, filtrarVendas, podeVerPainelFabrica, MARCA_PAINEL_FABRICA,
} from '@/lib/painel-fabrica'
import { dataPuraBr } from '@/lib/data-venda'
import { TabelaEstoque, TabelaVendas } from '@/app/(fabrica)/fabrica/components/tabelas-painel'
import { PrintButtons } from '@/app/(print)/relatorio-fabrica/imprimir/print-buttons'

type Params = { aba?: string; de?: string; ate?: string; loja?: string | string[]; modelo?: string | string[]; cor?: string | string[] }

export default async function PainelFabricaImprimirPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Mesma permissão da tela, antes de qualquer busca. Fica em /fabrica/*: o login da
  // fábrica alcança (middleware) e não chama Server Action (PrintButtons só usa window).
  const usuario = await getUsuarioLogado()
  if (!podeVerPainelFabrica(usuario)) redirect('/dashboard')

  const params = await searchParams
  const aba = abaDaUrl(params.aba)
  const { de, ate, lojas, estoque, vendas } = await carregarPainelFabrica(params.de, params.ate)
  const filtro = filtroDaUrl(params)
  const nomesLojas = filtro.lojas.map(id => lojas.find(l => l.lojaId === id)?.lojaNome).filter(Boolean)
  const periodo = `${dataPuraBr(de)} a ${dataPuraBr(ate)}`
  const filtros = [
    `Lojas: ${nomesLojas.length ? nomesLojas.join(', ') : 'todas'}`,
    `Modelos: ${filtro.modelos.length ? filtro.modelos.join(', ') : 'todos'}`,
    `Cores: ${filtro.cores.length ? filtro.cores.join(', ') : 'todas'}`,
    ...(aba === 'vendas' ? [`Período: ${periodo}`] : []),
  ]
  const geradoEm = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 print:p-0 space-y-6">
      <style>{`
        .actions-bar { display: flex; gap: 10px; justify-content: flex-end; }
        .btn { padding: 8px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; border: 1.5px solid var(--border); background: var(--card); color: var(--foreground); }
        .btn-primary { background: var(--foreground); color: var(--card); border-color: var(--foreground); }
        @media print { .actions-bar { display: none } @page { margin: 12mm 10mm; size: A4 landscape } }
      `}</style>
      <PrintButtons />
      <header className="flex justify-between items-start gap-4 border-b-2 border-foreground pb-3">
        <div>
          <h1 className="text-xl font-bold">
            {aba === 'estoque' ? 'Estoque' : 'Vendas'} · Fábrica {MARCA_PAINEL_FABRICA}
          </h1>
          <p className="text-xs text-muted-foreground">Só motos {MARCA_PAINEL_FABRICA} · {lojas.length} lojas</p>
        </div>
        <p className="text-xs text-muted-foreground text-right">Gerado em {geradoEm}<br />MOVA</p>
      </header>
      <p className="text-xs text-muted-foreground">{filtros.join(' · ')}</p>
      {aba === 'estoque'
        ? <TabelaEstoque lojas={lojas} estoque={filtrarEstoque(estoque, filtro)} />
        : <TabelaVendas lojas={lojas} vendas={filtrarVendas(vendas, filtro)} periodo={periodo} filtro={filtro} de={de} ate={ate} impresso />}
    </div>
  )
}
