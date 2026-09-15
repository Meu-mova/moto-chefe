// src/lib/sefaz/distribuicao.ts
// Transporte para o NFeDistribuicaoDFe do Ambiente Nacional.
//
// O certificado A1 é a credencial da CONEXÃO (TLS mútuo), não um header: por
// isso `fetch` não serve e usamos node:https com um Agent montado a partir do
// .pfx. Este módulo não decide nada — quem decide o próximo NSU é nsu.ts e quem
// entende o conteúdo é parser.ts.

import https from 'node:https'
import { gunzipSync } from 'node:zlib'
import { lerRetorno, type RespostaDistribuicao } from './parser'
import { somenteDigitos } from '@/lib/grupo-cnpj'
import { codigoDaUf } from './uf'

const HOST = 'www1.nfe.fazenda.gov.br'
const CAMINHO = '/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const ACAO = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'

/** 1 = produção. Homologação não distribui documento real, então não é opção. */
const TP_AMB = '1'

/**
 * `cUFAutor` sai do cadastro do certificado (tabela `certificados_digitais`,
 * editável em /admin/certificados), convertido de sigla para código IBGE por
 * `codigoDaUf`.
 *
 * Antes disto era um `const C_UF_AUTOR = '31'` fixo, escrito quando só
 * existiam grupos de Minas Gerais, e depois um mapa por CNPJ aqui dentro —
 * que exigia deploy a cada empresa nova. Cravar MG pra todos manda a UF errada
 * pra SEFAZ pro grupo que não for de lá, e a resposta é uma rejeição genérica
 * que não diz o que é; por isso `codigoDaUf` FALHA EXPLÍCITO pra sigla
 * inválida, em vez de cair num padrão.
 */
function envelope(cnpj: string, uf: string, ultNSU: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
 <soap12:Body>
  <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
   <nfeDadosMsg>
    <distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
     <tpAmb>${TP_AMB}</tpAmb>
     <cUFAutor>${codigoDaUf(uf)}</cUFAutor>
     <CNPJ>${cnpj}</CNPJ>
     <distNSU><ultNSU>${ultNSU.padStart(15, '0')}</ultNSU></distNSU>
    </distDFeInt>
   </nfeDadosMsg>
  </nfeDistDFeInteresse>
 </soap12:Body>
</soap12:Envelope>`
}

export async function consultarDistribuicao(opts: {
  pfx: Buffer
  senha: string
  cnpj: string
  /** Sigla da UF do autor (vem do certificado do grupo). Ex.: 'MG', 'SP'. */
  uf: string
  ultNSU: string
}): Promise<RespostaDistribuicao> {
  // Os dois campos interpolados no XML levam a mesma defesa: o ultNSU normalmente
  // já vem só com dígitos (do nsu.ts, que só repassa o que a própria SEFAZ
  // devolveu, ou o literal '0'), mas o tipo é `string` solto e não garante isso.
  const corpo = envelope(somenteDigitos(opts.cnpj), opts.uf, opts.ultNSU.replace(/\D/g, '') || '0')

  const resposta = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path: CAMINHO,
        method: 'POST',
        pfx: opts.pfx,
        passphrase: opts.senha,
        // 30s, não 60s: a função da Vercel tem `maxDuration` de 60s (teto do
        // plano Hobby — ver a página do /radar-fiscal, de onde a consulta
        // parte). Um timeout de rede
        // igual ao teto da função deixava zero folga pro `catch` de
        // sincronizar.ts gravar `ultimo_erro` antes de a própria função ser
        // morta — a falha acontecia, mas nada ficava registrado, e a tela
        // continuava muda sobre o motivo.
        timeout: 30_000,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${ACAO}"`,
          'Content-Length': Buffer.byteLength(corpo),
        },
      },
      res => {
        const partes: Buffer[] = []
        // O `req.on('error', ...)` lá embaixo cobre falha ao abrir/manter a
        // conexão, mas não uma queda no MEIO do corpo da resposta — isso chega
        // como erro no `res` (IncomingMessage), que sem listener próprio vira
        // exceção não tratada e derruba o processo em vez de rejeitar a Promise.
        res.on('error', reject)
        res.on('data', p => partes.push(p))
        res.on('end', () => {
          const texto = Buffer.concat(partes).toString('utf8')
          if (res.statusCode !== 200) {
            // O corpo do erro da SEFAZ é HTML/SOAP Fault e não cabe em log —
            // só o começo, que é onde o motivo aparece.
            reject(new Error(`SEFAZ respondeu ${res.statusCode}: ${texto.slice(0, 300)}`))
            return
          }
          resolve(texto)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('Timeout de 30s falando com a SEFAZ')))
    req.on('error', reject)
    req.end(corpo)
  })

  return lerRetorno(resposta, b64 => gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'))
}
