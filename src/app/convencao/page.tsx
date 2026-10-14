import { redirect } from 'next/navigation'

// O QR da convenção continua apontando para cá; a captação agora é a página de adesão.
export default function ConvencaoPage() {
  redirect('/adesao')
}
