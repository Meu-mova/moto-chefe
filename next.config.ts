// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // unpdf carrega o pdf.js inteiro para ler o holerite (@/lib/holerite-pdf). Ele
  // só roda no servidor, dentro de um import dinâmico, e empacotá-lo levou o
  // build local a estourar a memória na geração das páginas. Fora do bundle, é
  // exigido em runtime como qualquer dependência de Node.
  serverExternalPackages: ['unpdf'],
}

export default nextConfig
