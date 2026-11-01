# Nota Gateway: inutilizar numeração de NF-e

Resumo escrito à mão para decidir mudanças na inutilização. Cite sempre a página oficial, não este arquivo.

- Página oficial: https://docs.notagateway.com.br/v2/reference/inutilizar-numeracao
- `updatedAt` da página na consulta: `2026-06-16T11:57:17.000Z` (consultado em 01/11/2026). Para saber se este resumo está velho: `curl -s https://docs.notagateway.com.br/v2/reference/inutilizar-numeracao.md | head -3`.

## Pedido

`POST /v2/empresas/{empresaId}/nf-e/inutilizacao`, autenticação `Authorization: Basic` com a API Key.

Corpo (exemplo da página):

```json
{
  "id": "inut-001",
  "ambienteEmissao": "Homologacao",
  "serie": "1",
  "numeroInicial": 16,
  "numeroFinal": 24,
  "justificativa": "Quebra na sequência da numeração"
}
```

Respostas documentadas: `200` com corpo vazio; `400` (`GW002`, payload que não foi interpretado); `401` (`AUT002`) e `403` (`AUT001`), API Key inválida.

## Consulta e XML

| O quê | Página | Caminho |
|---|---|---|
| Consultar a inutilização | https://docs.notagateway.com.br/v2/reference/consulta-inutiliza%C3%A7%C3%A3o-de-n%C3%BAmero-da-nota-fiscal | `GET /v2/empresas/{empresaId}/nf-e/inutilizacao/{id}` |
| XML da inutilização | https://docs.notagateway.com.br/v2/reference/consultar-xml-de-inutiliza%C3%A7%C3%A3o-1 | `GET /v2/empresas/{empresaId}/nf-e/inutilizacao/{id}/xml` (`retInutNFe`; `cStat` 102 = inutilização homologada) |

A página da consulta não documenta os campos da resposta (o exemplo do 200 é `{}`).

## Status

A página [Status da nota fiscal](https://docs.notagateway.com.br/v2/docs/status-da-nota-fiscal) (`updatedAt` `2026-07-13T15:59:22.000Z`) lista os status da **nota**, não os da inutilização. Os que importam aqui:

- `Negada`: "A nota fiscal foi rejeitada pelo órgão."
- `Autorizada`: "Nota fiscal autorizada e com PDF pronto para download."

A página não diz o que cada status significa para a inutilização, nem lista os status da inutilização: estão na seção abaixo.

## O que a doc NÃO diz

Cada item tem fonte escrita. Doc e item divergem? Vale o que foi testado; na dúvida, pergunte (skill `nota-gateway-docs`).

- **Resultado assíncrono**: o 200 do POST só confirma que o pedido foi criado; o resultado vem pela consulta ou pelo webhook `InutilizacaoNumeracaoNFe`. Fonte: suporte da NG, registrado na [#504](https://github.com/Meu-mova/moto-chefe/issues/504) ("Como a Nota Gateway funciona (respostas do suporte)").
- **Justificativa de 15 a 255 caracteres, só ASCII básico (sem acento).** Fonte: suporte da NG, na [#504](https://github.com/Meu-mova/moto-chefe/issues/504).
- **A NG soma +1 na numeração a cada envio de nota, mesmo com erro, e não há API para listar números usados.** O número a inutilizar sai do histórico do MOVA (`notas_fiscais_saida`). Fonte: suporte da NG, na [#504](https://github.com/Meu-mova/moto-chefe/issues/504).
- **Nomes do status**: o suporte informou `InutilizacaoAutorizada` (com `protocoloAutorizacao`) e `InutilizacaoNegada` (motivo em `motivoStatus`), mas a consulta em homologação devolveu `Autorizada` e `Negada`. O MOVA aceita os dois nomes. Fonte: [comentário na #504](https://github.com/Meu-mova/moto-chefe/issues/504#issuecomment-6503150925) e [PR #507](https://github.com/Meu-mova/moto-chefe/pull/507).
- **Só o número de nota `Negada` que não vai ser reenviada se inutiliza**: a nota rejeitada deixa o número gasto e sem nota; a que ainda vai ser corrigida e reenviada não se inutiliza, porque o reenvio com o mesmo `id` mantém o número. Fonte: [#504](https://github.com/Meu-mova/moto-chefe/issues/504) ("O que é") e suporte da NG no [comentário na #504](https://github.com/Meu-mova/moto-chefe/issues/504#issuecomment-6502646869); no código, `elegivelParaInutilizar` recusa o que não for `Negada`.
- **Número de nota `Autorizada` ou `Cancelada` não se inutiliza**: a SEFAZ recusa número já usado. Fonte: teste em homologação, no [comentário na #504](https://github.com/Meu-mova/moto-chefe/issues/504#issuecomment-6503150925); no código, `elegivelParaInutilizar` (`src/lib/notagateway/inutilizacao.ts`) só aceita `Negada`, e recusa as duas.
- **Faixa já usada é recusada** (código 241 no teste em homologação). Fonte: o mesmo [comentário na #504](https://github.com/Meu-mova/moto-chefe/issues/504#issuecomment-6503150925).
- **Na produção é irreversível**; homologação funciona igual. Fonte: suporte da NG, na [#504](https://github.com/Meu-mova/moto-chefe/issues/504).
- **Nota denegada não se inutiliza**: "Quando uma nota é denegada, seu número não pode ser mais utilizado, cancelado ou inutilizado, pois o registro dessa nota já está na SEFAZ." Fonte: [KB da NG, rejeição 301](https://atendimento.notagateway.com.br/kb/pt-br/article/227470/rejeicao-ao-emitir-sefaz-301-uso-denegado-irregularidade-fiscal-).

## Onde isso vive no MOVA

- `src/lib/notagateway/client.ts`: `pedirInutilizacao` (POST) e `consultarInutilizacaoNaNg` (GET).
- `src/lib/notagateway/inutilizacao.ts`: regras puras (justificativa, nota elegível, pedido sem resposta).
- `src/lib/notagateway/inutilizar.ts`: pedido e consulta com o grupo no `where`, gravação e log.
- `src/lib/notagateway/status.ts`: `ehDenegada`, `ehDuplicidade` e `STATUS_MORTOS`, que decidem se a nota pode ter o número inutilizado.
