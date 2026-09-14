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

const HOST = 'www1.nfe.fazenda.gov.br'
const CAMINHO = '/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
const ACAO = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'

/** 1 = produção. Homologação não distribui documento real, então não é opção. */
const TP_AMB = '1'

/**
 * UF do autor da consulta (`cUFAutor`), por CNPJ do grupo — mesmo padrão dos
 * mapas por CNPJ que já existem em `src/lib/mcpai.ts`
 * (`BANCOS_DE_DESPESA_POR_CNPJ` e afins). Chave em dígitos, como o `cnpj` que
 * chega aqui de `carregarCertificado` (lido do CN do próprio certificado A1,
 * nunca com pontuação).
 *
 * Antes disto era um `const C_UF_AUTOR = '31'` fixo, escrito quando só
 * existiam grupos de Minas Gerais. O banco hoje tem TRÊS grupos ativos (Sul
 * de Minas, BH, Vale) — cravar MG pra todos manda a UF errada pra SEFAZ pro
 * grupo que não for de lá, e a resposta é uma rejeição genérica que não diz
 * o que é. Por isso `ufAutor` abaixo FALHA EXPLÍCITO pra CNPJ não cadastrado,
 * em vez de cair num padrão.
 */
const UF_AUTOR_POR_CNPJ: Record<string, string> = {
  '57113017000172': '31', // Sul de Minas
  '63009605000163': '31', // BH
}

function ufAutor(cnpjDigitos: string): string {
  const uf = UF_AUTOR_POR_CNPJ[cnpjDigitos]
  if (!uf) {
    throw new Error(
      `Falta cadastrar a UF do autor (cUFAutor) para o CNPJ ${cnpjDigitos} em UF_AUTOR_POR_CNPJ ` +
      `(src/lib/sefaz/distribuicao.ts) — sem isso a consulta nem deveria sair pra SEFAZ, que devolveria ` +
      `rejeição genérica em vez de dizer que é a UF.`,
    )
  }
  return uf
}

function envelope(cnpj: string, ultNSU: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
 <soap12:Body>
  <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
   <nfeDadosMsg>
    <distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
     <tpAmb>${TP_AMB}</tpAmb>
     <cUFAutor>${ufAutor(cnpj)}</cUFAutor>
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
  ultNSU: string
}): Promise<RespostaDistribuicao> {
  // Os dois campos interpolados no XML levam a mesma defesa: o ultNSU normalmente
  // já vem só com dígitos (do nsu.ts, que só repassa o que a própria SEFAZ
  // devolveu, ou o literal '0'), mas o tipo é `string` solto e não garante isso.
  const corpo = envelope(somenteDigitos(opts.cnpj), opts.ultNSU.replace(/\D/g, '') || '0')

  const resposta = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path: CAMINHO,
        method: 'POST',
        pfx: opts.pfx,
        passphrase: opts.senha,
        // 30s, não 60s: a função da Vercel tem `maxDuration` de 60s (teto do
        // plano Hobby — ver vercel.json/route.ts do cron). Um timeout de rede
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
