import QRCode from 'qrcode'
import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { painelAvaliacoes } from '@/lib/avaliacoes-google/avaliacoes'
import { urlBase } from '@/lib/assinatura/url'
import { Star } from 'lucide-react'
import { AvaliacoesClient, type PlacaTela } from './components/avaliacoes-client'

/**
 * Avaliações do Google de cada loja do grupo ativo e a plaquinha NFC/QR que leva o
 * cliente a avaliar. Só os sócios (o item do menu é soPeloPapel).
 */
export default async function AvaliacoesGooglePage() {
  const usuario = await getUsuarioLogado()
  const grupo = await grupoAtivoDaRequisicao(usuario)
  const painel = await painelAvaliacoes(usuario, grupo.id)

  const base = urlBase()
  const placas: Record<string, PlacaTela> = {}
  for (const l of painel?.lojas ?? []) {
    if (!l.codigoPlaca) continue
    const link = `${base}/avaliar/${l.codigoPlaca}`
    const linkQr = `${link}?o=qr`
    // Margem de 2 módulos e correção M: aguenta risco e reflexo do acrílico.
    const svg = await QRCode.toString(linkQr, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
    placas[l.lojaId] = { link, linkQr, qrSvg: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
  }

  return (
    <AdminGuard href="/admin/avaliacoes-google">
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star size={22} /> Avaliações Google
          </h1>
          <p className="text-muted-foreground text-sm">
            Nota e avaliações de cada loja de {grupo.nome} no Google, e a plaquinha NFC/QR do balcão.
          </p>
        </div>
        {painel
          ? <AvaliacoesClient painel={painel} placas={placas} />
          : <p className="text-sm text-muted-foreground">Sem acesso a este grupo.</p>}
      </div>
    </AdminGuard>
  )
}
