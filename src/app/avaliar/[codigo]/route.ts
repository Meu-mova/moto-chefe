import { NextRequest, NextResponse } from 'next/server'
import { registrarToque } from '@/lib/avaliacoes-google/avaliacoes'

export const dynamic = 'force-dynamic'

// Link gravado na plaquinha NFC (e no QR, com ?o=qr). Público: quem toca é o cliente,
// sem conta no MOVA. Conta o toque e manda para o "escrever avaliação" da loja no Google.
export async function GET(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const origem = req.nextUrl.searchParams.get('o') === 'qr' ? 'qr' : 'nfc'
  const destino = await registrarToque(codigo.toLowerCase(), origem)
  if (!destino) {
    return new NextResponse('Esta placa ainda não está ativa. Avise a loja.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  return NextResponse.redirect(destino, { status: 302, headers: { 'cache-control': 'no-store' } })
}
