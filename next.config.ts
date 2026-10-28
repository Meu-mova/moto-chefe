// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // A landing /convencao foi aposentada; o QR e os links antigos levam ao formulário de adesão.
  // Redirect de config roda antes do middleware, então não cai no login.
  async redirects() {
    return [{ source: '/convencao', destination: '/adesao', permanent: true }]
  },
  // unpdf carrega o pdf.js inteiro para ler o holerite (@/lib/holerite-pdf). Ele
  // só roda no servidor, dentro de um import dinâmico, e empacotá-lo levou o
  // build local a estourar a memória na geração das páginas. Fora do bundle, é
  // exigido em runtime como qualquer dependência de Node.
  //
  // nfe-danfe-pdf (rota /api/nfe/[chave]/danfe) usa pdfkit por baixo, que
  // carrega fonte .afm do disco em runtime — empacotado pelo bundler do Next
  // esses arquivos não acompanham o build e o PDF sai sem fonte (ou quebra).
  // A imagem da logo do DANFE (#428) desenha texto com a fonte do repo; ela não é importada,
  // então o rastreio de arquivos não a leva sozinho para a função da página.
  outputFileTracingIncludes: { '/admin/notas-fiscais': ['./assets/fonts/**'] },
  serverExternalPackages: ['unpdf', 'nfe-danfe-pdf', 'pdfkit'],
}

export default nextConfig
