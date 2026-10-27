import QRCode from 'qrcode'
import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { painelAvaliacoes } from '@/lib/avaliacoes-google/avaliacoes'
import { urlBase } from '@/lib/assinatura/url'
import { Star } from 'lucide-react'
import { AvaliacoesClient, type LinkPlaca } from './components/avaliacoes-client'

/**
 * Avaliações do Google de cada loja do grupo ativo e as plaquinhas NFC/QR (por loja e por
 * vendedor) que levam o cliente a avaliar. Só os sócios (o item do menu é soPeloPapel).
 */
export default async function AvaliacoesGooglePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams
  const usuario = await getUsuarioLogado()
  const grupo = await grupoAtivoDaRequisicao(usuario)
  const painel = await painelAvaliacoes(usuario, grupo.id, undefined, { mes })

  const base = urlBase()
  const links: Record<string, LinkPlaca> = {}
  for (const p of painel?.placas ?? []) {
    const link = `${base}/avaliar/${p.codigo}`
    // Margem de 2 módulos e correção M: aguenta risco e reflexo do acrílico.
    const svg = await QRCode.toString(`${link}?o=qr`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
    links[p.id] = { link, qrSvg: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
  }

  return (
    <AdminGuard href="/admin/avaliacoes-google">
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star size={22} /> Avaliações Google
          </h1>
          <p className="text-muted-foreground text-sm">
            Nota e avaliações de cada loja de {grupo.nome} no Google, e o uso de cada plaquinha NFC/QR por loja e por vendedor.
          </p>
        </div>
        {painel
          ? <AvaliacoesClient painel={painel} links={links} />
          : <p className="text-sm text-muted-foreground">Sem acesso a este grupo.</p>}
      </div>
    </AdminGuard>
  )
}
