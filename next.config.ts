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
  //
  // nfe-danfe-pdf (rota /api/nfe/[chave]/danfe) usa pdfkit por baixo, que
  // carrega fonte .afm do disco em runtime — empacotado pelo bundler do Next
  // esses arquivos não acompanham o build e o PDF sai sem fonte (ou quebra).
  serverExternalPackages: ['unpdf', 'nfe-danfe-pdf', 'pdfkit'],
}

export default nextConfig
