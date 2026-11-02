# Mapa: operação → página oficial da Nota Gateway

A coluna "Arquivo local" aponta para o resumo escrito à mão em `docs/fiscal/`, quando existir (índice
em `docs/fiscal/sumario.md`). A doc da NG não é copiada para o repo.

Conferido em 01/11/2026: todos os links abaixo responderam 200. "Cobre" resume o que a página
mostra. Página que mudar de endereço: procure de novo na barra lateral do HTML de qualquer página
de referência e atualize este mapa no mesmo PR.

Base da API: `https://api.notagateway.com.br`. Os caminhos abaixo vêm das páginas.

## Visão geral

| Assunto | Página | Arquivo local | Cobre |
|---|---|---|---|
| Sobre a API | https://docs.notagateway.com.br/v2/docs/sobre-a-api | sem resumo ainda | REST/JSON, autenticação por API Key, documentos NF-e, NFC-e e DC-e |
| Introdução (referência) | https://docs.notagateway.com.br/v2/reference/introdu%C3%A7%C3%A3o | sem resumo ainda | Entrada da referência de endpoints; a lista fica na barra lateral |
| Autenticação | https://docs.notagateway.com.br/v2/reference/autentica%C3%A7%C3%A3o | sem resumo ainda | Header `Authorization: Basic` com a API Key |
| Status da nota | https://docs.notagateway.com.br/v2/docs/status-da-nota-fiscal | sem resumo ainda | Os 13 status de autorização e cancelamento, com o significado de cada um. Fonte do `status.ts` |
| Webhook | https://docs.notagateway.com.br/v2/docs/webhook | sem resumo ainda | Avisa Autorizada, Negada, Cancelada e CancelamentoNegado; JSON ou XML por POST; token opcional no header `x-token`; 15 tentativas em cerca de 4 h até receber 200 |

## NF-e (modelo 55), a que o MOVA emite

| Operação | Página | Arquivo local | Método e caminho |
|---|---|---|---|
| Emitir | https://docs.notagateway.com.br/v2/reference/emitir-nota-fiscal-nfe | sem resumo ainda | `POST /v2/empresas/{empresaId}/nf-e` |
| Consultar | https://docs.notagateway.com.br/v2/reference/consultar-nota-fiscal-1 | sem resumo ainda | `GET /v2/empresas/{empresaId}/nf-e/{id}` |
| Cancelar | https://docs.notagateway.com.br/v2/reference/cancelar-nota-fiscal | sem resumo ainda | `DELETE /v2/empresas/{empresaId}/nf-e/{id}`; a página não documenta prazo nem regra de cancelamento |
| XML do cancelamento | https://docs.notagateway.com.br/v2/reference/consultar-xml-de-cancelamento-1 | sem resumo ainda | `GET /v2/empresas/{empresaId}/nf-e/{id}/xmlCancelamento` |
| Emitir carta de correção | https://docs.notagateway.com.br/v2/reference/emitir-carta-de-corre%C3%A7%C3%A3o | sem resumo ainda | `POST /v2/empresas/{empresaId}/nf-e/cartaCorrecao` (pela chave da NF-e) |
| Consultar carta de correção | https://docs.notagateway.com.br/v2/reference/consultar-carta-de-corre%C3%A7%C3%A3o | sem resumo ainda | `GET /v2/empresas/{empresaId}/nf-e/cartaCorrecao/{id}` |
| XML da carta de correção | https://docs.notagateway.com.br/v2/reference/consultar-xml-da-carta-de-corre%C3%A7%C3%A3o | sem resumo ainda | `GET /v2/empresas/{empresaId}/nf-e/cartaCorrecao/{id}/xml` |
| Inutilizar numeração | https://docs.notagateway.com.br/v2/reference/inutilizar-numeracao | `docs/fiscal/ng-inutilizar-numeracao.md` | `POST /v2/empresas/{empresaId}/nf-e/inutilizacao`; corpo: id, ambienteEmissao, serie, numeroInicial, numeroFinal, justificativa |
| Consultar inutilização | https://docs.notagateway.com.br/v2/reference/consulta-inutiliza%C3%A7%C3%A3o-de-n%C3%BAmero-da-nota-fiscal | `docs/fiscal/ng-inutilizar-numeracao.md` | `GET /v2/empresas/{empresaId}/nf-e/inutilizacao/{id}` |
| XML da inutilização | https://docs.notagateway.com.br/v2/reference/consultar-xml-de-inutiliza%C3%A7%C3%A3o-1 | `docs/fiscal/ng-inutilizar-numeracao.md` | `GET /v2/empresas/{empresaId}/nf-e/inutilizacao/{id}/xml` |

Cuidado com páginas parecidas que são de **NFC-e** (`/nfc-e/`), não de NF-e: `cancela-nota-fiscal`,
`consultar-xml`, `consultar-xml-de-envio-do-cancelamento`, `inutilizar-numera%C3%A7%C3%A3o`. Confira o
caminho na página antes de citar.

Não achei página de XML da NF-e autorizada nem de DANFE na referência v2 (a única "Consultar XML"
é de NFC-e). O MOVA gera o DANFE localmente.

## Empresas

| Operação | Página | Arquivo local | Método e caminho |
|---|---|---|---|
| Listar empresas | https://docs.notagateway.com.br/v2/reference/listar-empresas | sem resumo ainda | `GET /v2/empresas` |
| Consultar empresa | https://docs.notagateway.com.br/v2/reference/consultar-empresa | sem resumo ainda | `GET /v2/empresas/{Id}`: CNPJ, razão social, endereço, certificado, configurações de NF-e |
| Incluir ou alterar empresa | https://docs.notagateway.com.br/v2/reference/incluiralterar-empresa | sem resumo ainda | `POST /v2/empresas` |
| Vincular certificado | https://docs.notagateway.com.br/v2/reference/vincular-certificado | sem resumo ainda | Certificado A1 da empresa |
| Vincular logotipo | https://docs.notagateway.com.br/v2/reference/vincular-logotipo | sem resumo ainda | Logo que sai na nota |

## Rejeições da SEFAZ (base de conhecimento)

As páginas da base de conhecimento abrem, mas o WebFetch não extrai o texto: leia com `curl`.

| Rejeição | Página | Arquivo local | O que diz |
|---|---|---|---|
| 301: uso denegado, irregularidade fiscal do emitente | https://atendimento.notagateway.com.br/kb/pt-br/article/227470/rejeicao-ao-emitir-sefaz-301-uso-denegado-irregularidade-fiscal- | sem resumo ainda | IE do emitente suspensa, baixada, cancelada ou em baixa; consultar no SINTEGRA ou no CCC. "Quando uma nota é denegada, seu número não pode ser mais utilizado, cancelado ou inutilizado" |
| 302: uso denegado, irregularidade fiscal do destinatário | https://atendimento.notagateway.com.br/kb/pt-br/article/251476/rejeicao-sefaz-302-uso-denegado-irregularidade-fiscal-do-destina | sem resumo ainda | Mesma família da 301, do lado do destinatário |

Outras rejeições: a barra lateral desses artigos lista as demais (232, 733, 926 etc.).
