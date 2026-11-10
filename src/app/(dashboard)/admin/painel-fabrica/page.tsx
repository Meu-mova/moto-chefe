import { exigirAcessoPagina } from '../components/admin-guard'
import { carregarPainelFabrica } from '@/lib/queries/painel-fabrica'
import {
  filtroDaUrl, filtrarEstoque, filtrarVendas, opcoesDoPainel, urlDoFiltro, MARCA_PAINEL_FABRICA,
} from '@/lib/painel-fabrica'
import { dataPuraBr, hojeBrt } from '@/lib/data-venda'
import { FiltrosPainel } from './components/filtros-painel'
import { TabelasPainel } from './components/tabelas-painel'
import { AcoesPainel } from './components/acoes-painel'

type Params = { de?: string; ate?: string; loja?: string | string[]; modelo?: string | string[]; cor?: string | string[] }

export default async function PainelFabricaPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Antes de qualquer busca (#579): lê todas as Contas, só o admin_geral.
  await exigirAcessoPagina('/admin/painel-fabrica')

  const params = await searchParams
  const { de, ate, lojas, estoque, vendas } = await carregarPainelFabrica(params.de, params.ate)
  const filtro = filtroDaUrl(params)
  const { modelos, cores } = opcoesDoPainel(estoque, vendas)
  const estoqueFiltrado = filtrarEstoque(estoque, filtro)
  const vendasFiltradas = filtrarVendas(vendas, filtro)
  const periodo = `${dataPuraBr(de)} a ${dataPuraBr(ate)}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Painel da Fábrica {MARCA_PAINEL_FABRICA}</h1>
          <p className="text-muted-foreground text-sm">
            Só motos da marca {MARCA_PAINEL_FABRICA}, das {lojas.length} lojas com o portal da fábrica cadastrado.
            Outras marcas não entram.
          </p>
        </div>
        <AcoesPainel
          lojas={lojas} estoque={estoqueFiltrado} vendas={vendasFiltradas} de={de} ate={ate} hoje={hojeBrt()}
          urlImpressao={`/admin/painel-fabrica/imprimir?${urlDoFiltro(filtro, de, ate)}`}
        />
      </div>

      <FiltrosPainel lojas={lojas} modelos={modelos} cores={cores} filtro={filtro} de={de} ate={ate} />
      {filtro.cores.length > 0 && (
        <p className="text-xs text-muted-foreground -mt-3">O filtro de cor vale só para o estoque; as vendas mostram todas as cores.</p>
      )}

      <TabelasPainel lojas={lojas} estoque={estoqueFiltrado} vendas={vendasFiltradas} periodo={periodo} />
    </div>
  )
}
