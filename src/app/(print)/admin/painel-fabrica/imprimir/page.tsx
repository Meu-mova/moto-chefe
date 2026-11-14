import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { carregarPainelFabrica } from '@/lib/queries/painel-fabrica'
import {
  abaDaUrl, filtroDaUrl, filtrarEstoque, filtrarVendas, rotuloDaAba, MARCA_PAINEL_FABRICA, ROTA_PAINEL_FABRICA, type ParamsPainel,
} from '@/lib/painel-fabrica'
import { dataEHoraBrt } from '@/lib/data-venda'
import { periodoBr } from '@/lib/notas-emitidas'
import { TabelaEstoque, TabelaVendas } from '@/app/(dashboard)/admin/painel-fabrica/components/tabelas-painel'
import { PrintButtons } from '@/app/(print)/relatorio-fabrica/imprimir/print-buttons'

export default async function PainelFabricaImprimirPage({ searchParams }: { searchParams: Promise<ParamsPainel> }) {
  // Mesma permissão da tela, antes de qualquer busca.
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, ROTA_PAINEL_FABRICA)) redirect('/dashboard')

  const params = await searchParams
  const aba = abaDaUrl(params.aba)
  const { de, ate, lojas, estoque, vendas } = await carregarPainelFabrica(params.de, params.ate)
  const filtro = filtroDaUrl(params)
  const nomesLojas = filtro.lojas.map(id => lojas.find(l => l.lojaId === id)?.lojaNome).filter(Boolean)
  const periodo = periodoBr(de, ate)
  const filtros = [
    `Lojas: ${nomesLojas.length ? nomesLojas.join(', ') : 'todas'}`,
    `Modelos: ${filtro.modelos.length ? filtro.modelos.join(', ') : 'todos'}`,
    `Cores: ${filtro.cores.length ? filtro.cores.join(', ') : 'todas'}`,
    ...(aba === 'vendas' ? [`Período: ${periodo}`] : []),
  ]

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
          <h1 className="text-xl font-bold">{rotuloDaAba(aba)} · Fábrica {MARCA_PAINEL_FABRICA}</h1>
          <p className="text-xs text-muted-foreground">Só motos {MARCA_PAINEL_FABRICA} · {lojas.length} lojas</p>
        </div>
        <p className="text-xs text-muted-foreground text-right">Gerado em {dataEHoraBrt(new Date().toISOString())}<br />MOVA</p>
      </header>
      <p className="text-xs text-muted-foreground">{filtros.join(' · ')}</p>
      {aba === 'estoque'
        ? <TabelaEstoque lojas={lojas} estoque={filtrarEstoque(estoque, filtro)} />
        : <TabelaVendas lojas={lojas} vendas={filtrarVendas(vendas, filtro)} periodo={periodo} filtro={filtro} de={de} ate={ate} impresso />}
    </div>
  )
}
