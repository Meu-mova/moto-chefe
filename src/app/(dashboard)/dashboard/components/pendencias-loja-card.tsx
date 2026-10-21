import { LinhaPendencia, TituloGrupo } from './painel-secoes'

type Props = {
  semNotaFiscal: number
  vendasPendentes: number
  osPendentes: number
  pecasPendentes: number
}

export function PendenciasLojaCard({ semNotaFiscal, vendasPendentes, osPendentes, pecasPendentes }: Props) {
  const itens = [
    { count: semNotaFiscal, href: '/vendas', label: 'Vendas sem nota fiscal' },
    { count: vendasPendentes, href: '/vendas', label: 'Vendas com pagamento a conciliar' },
    { count: osPendentes, href: '/ordens-servico', label: 'Serviços com pagamento a conciliar' },
    { count: pecasPendentes, href: '/pecas', label: 'Peças com pagamento a conciliar' },
  ].filter(item => item.count > 0)

  if (itens.length === 0) return null

  return (
    <div>
      <TituloGrupo>Sua loja · últimos 30 dias</TituloGrupo>
      {itens.map(item => <LinhaPendencia key={item.label} rotulo={item.label} valor={item.count} href={item.href} />)}
    </div>
  )
}
