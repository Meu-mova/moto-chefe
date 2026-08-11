// URL base para montar o link de assinatura.
//
// Vive fora dos arquivos 'use server' de propósito: lá só podem existir exports
// async, e esta função é síncrona.
//
// Em preview, o link tem que apontar para o PRÓPRIO deployment: MOVA_URL é a
// produção, onde a rota /assinar pode nem existir ainda — o link chegaria no
// WhatsApp do cliente dando 404. VERCEL_URL é o host deste deployment.
export function urlBase(): string {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.MOVA_URL ?? 'https://moto-chefe.vercel.app')
    .replace(/\/$/, '')
}
