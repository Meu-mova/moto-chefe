import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { carregarPainelFabrica } from '@/lib/queries/painel-fabrica'
import {
  abaDaUrl, filtroDaUrl, filtrarEstoque, filtrarVendas, opcoesDoPainel, podeVerPainelFabrica, urlDoFiltro,
  MARCA_PAINEL_FABRICA, type Aba,
} from '@/lib/painel-fabrica'
import { dataPuraBr, hojeBrt } from '@/lib/data-venda'
import { cn } from '@/lib/utils'
import { FiltrosPainel } from './components/filtros-painel'
import { TabelaEstoque, TabelaVendas } from './components/tabelas-painel'
import { AcoesPainel } from './components/acoes-painel'

type Params = { aba?: string; de?: string; ate?: string; loja?: string | string[]; modelo?: string | string[]; cor?: string | string[] }

export default async function PainelFabricaPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Antes de qualquer busca (#579): lê todas as Contas, só a fábrica e o admin_geral.
  const usuario = await getUsuarioLogado()
  if (!podeVerPainelFabrica(usuario)) redirect('/dashboard')

  const params = await searchParams
  const aba = abaDaUrl(params.aba)
  const { de, ate, lojas, estoque, vendas } = await carregarPainelFabrica(params.de, params.ate)
  const filtro = filtroDaUrl(params)
  const { modelos, cores } = opcoesDoPainel(estoque, vendas)
  const estoqueFiltrado = filtrarEstoque(estoque, filtro)
  const vendasFiltradas = filtrarVendas(vendas, filtro)
  const periodo = `${dataPuraBr(de)} a ${dataPuraBr(ate)}`

  const abas: { id: Aba; rotulo: string }[] = [{ id: 'estoque', rotulo: 'Estoque' }, { id: 'vendas', rotulo: 'Vendas' }]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Painel da Fábrica {MARCA_PAINEL_FABRICA}</h1>
          <p className="text-muted-foreground text-sm">
            Só motos da marca {MARCA_PAINEL_FABRICA}, das {lojas.length} lojas da rede no MOVA.
          </p>
        </div>
        <AcoesPainel
          aba={aba} lojas={lojas} estoque={estoqueFiltrado} vendas={vendasFiltradas} de={de} ate={ate} hoje={hojeBrt()}
          urlImpressao={`/fabrica/imprimir?${urlDoFiltro(filtro, de, ate, aba)}`}
        />
      </div>

      <nav className="flex gap-1 border-b" aria-label="Abas do painel">
        {abas.map(a => (
          <Link
            key={a.id}
            href={`/fabrica?${urlDoFiltro(filtro, de, ate, a.id)}`}
            aria-current={a.id === aba ? 'page' : undefined}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              a.id === aba ? 'border-primary text-primary-text' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      <FiltrosPainel aba={aba} lojas={lojas} modelos={modelos} cores={cores} filtro={filtro} de={de} ate={ate} />

      {aba === 'estoque'
        ? <TabelaEstoque lojas={lojas} estoque={estoqueFiltrado} />
        : <TabelaVendas lojas={lojas} vendas={vendasFiltradas} periodo={periodo} filtro={filtro} de={de} ate={ate} />}
    </div>
  )
}
