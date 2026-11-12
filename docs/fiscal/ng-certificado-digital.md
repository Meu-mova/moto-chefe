# Certificado digital A1 e consulta de distribuição DF-e

Resumo das fontes oficiais para regras de certificado matriz/filial. Para decisões, cite a página da fonte, não este resumo.

## Nota Gateway

- Página: https://docs.notagateway.com.br/v2/reference/vincular-certificado
- `updatedAt`: `2026-06-10T19:11:42.000Z` (conferido em 09/11/2026).
- `POST /v2/empresas/{empresaId}/certificadoDigital` vincula certificado A1 à empresa. Recebe arquivo `.PFX`/`.P12` e senha; respostas documentadas: 200, 400, 401, 403, 500.
- A página não especifica comparação de CNPJ completo nem regra matriz/filial.

## NF-e assinada por certificado da mesma raiz

- [MOC 7.0, Anexo I](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf), p. 74, seção 4.1.5, F03: “CNPJ-Base do Emitente difere do CNPJ-Base do Certificado Digital” (rejeição 213). A verificação é de raiz/base do CNPJ.
- Evidência operacional relatada pelo Luis em 09/11/2026: SEFAZ-MG autorizou em homologação NF da filial com A1 da matriz (venda 32247). Produção retornou 245 por cadastro na SEFAZ-MG, fora do MOVA.

## Distribuição DF-e

- [NT 2014.002 v1.40, publicada em julho de 2026](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=uWO2d%2FgTuWg%3D).
- Página 4, seção 3: pessoa jurídica autenticada pelo CNPJ base e pode consultar qualquer CNPJ da empresa (14 posições), “desde que o CNPJ base consultado seja o mesmo do certificado digital”.
- Página 8, seção 3.4.2: informar o CNPJ do interessado; para empresas, o campo permite recuperar DF-e de quaisquer estabelecimentos com um único certificado. Página 11, H04, rejeita quando a base do CNPJ do certificado não é a base do CNPJ consultado (593).
- Consequência: `distDFeInt/CNPJ` deve ser o CNPJ do grupo consultado; o certificado fornece a autenticação. O A1 matriz não deve fazer o Radar da filial consultar a matriz. A resposta deve continuar gravada apenas no grupo que fez a consulta.

## Onde vive no MOVA

- `src/lib/sefaz/certificado.ts`: lê titular/CNPJ do A1 e salva uma cópia cifrada por grupo.
- `src/lib/certificado-grupo.ts`: regra pura de raiz igual + certificado titular em algum grupo da mesma Conta.
- `src/lib/certificado-conta.ts`: lista grupos/CNPJs sob filtro da Conta do grupo de destino.
- `src/lib/sefaz/distribuicao.ts`: monta `distDFeInt` com CNPJ interessado e transmite com A1.
- `src/lib/sefaz/sincronizar.ts`: obtém o CNPJ consultado do grupo e grava os documentos no grupo da consulta.

A NT e o MOC não dizem que uma Conta do MOVA deve limitar o certificado a um dos grupos cadastrados; esse limite é a defesa de isolamento do produto.
