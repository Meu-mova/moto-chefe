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

## Faixa (#655)

O pedido da NG já aceita `numeroInicial` e `numeroFinal` (exemplo da [página oficial](https://docs.notagateway.com.br/v2/reference/inutilizar-numeracao): `16` a `24`). O MOVA pede **uma faixa contínua por vez**, sem nota de origem (`nota_id` nulo em `notas_fiscais_saida_inutilizacoes`); duas lacunas são dois pedidos.

| Regra | Fonte oficial e trecho |
|---|---|
| Faixa crescente | [MOC NF-e v7](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf), regra I03: "Número da Faixa Inicial maior do que o número Final" (rejeição 224: "A faixa inicial é maior que a faixa final"). |
| No máximo 10.000 números por pedido | Mesmo MOC, regra I04: "Quantidade máxima de numeração a inutilizar ultrapassa o limite (10.000 números)" (rejeição 201). O banco repete o limite num CHECK. |
| AC, BA e SP não têm o pedido | [Ajuste SINIEF 40/2026](https://app1.sefaz.mt.gov.br/Sistema/legislacao/legislacaotribut.nsf/173e6c0d2202fdcb03258b1700659f1e/b54277fb985485c203258e720071bd8c): acrescenta à cláusula décima quarta do Ajuste SINIEF 07/05 o "§ 6º O Pedido de Inutilização de Número da NF-e previsto no caput não se aplica aos Estados do Acre, Bahia e São Paulo". Cláusula terceira: efeitos "a partir do primeiro dia do segundo mês subsequente ao da publicação" (DOU de 14/09/2026, logo 01/11/2026). A UF vem de Consultar Empresa, nunca da tela. |
| Série do ambiente | [Consultar Empresa](https://docs.notagateway.com.br/v2/reference/consultar-empresa) (`updatedAt` `2026-06-10T19:17:01.000Z`): `emissaoNFeProduto.ambienteProducao.serieNFe` e `ambienteHomologacao.serieNFe`, "Número da série para emissão de NF-e". O MOVA usa a do ambiente da credencial, sem seletor. |

O que não é documentado e vale por decisão do Luis (#655): faixa repetida ou sobreposta a outro pedido ou nota do MOVA não bloqueia (a tela avisa); emissão feita fora do MOVA não é consultável; o 200 do POST segue sem resultado, que chega pela consulta. O duplo clique cai no `id_externo` (hash de grupo e chave da tentativa). Hoje o AC/BA/SP só barra a faixa; o pedido por nota segue em [#659](https://github.com/Meu-mova/moto-chefe/issues/659).

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
- **Número de nota `Autorizada` ou `Cancelada` não se inutiliza**: a SEFAZ recusa número já usado. Fonte: teste em homologação, no [comentário na #504](https://github.com/Meu-mova/moto-chefe/issues/504#issuecomment-6503150925); no código, `elegivelParaInutilizar` (`src/lib/notagateway/inutilizacao.ts`) só aceita `Negada`, e recusa as duas. Desde a #597, `numeroLivre` (`status.ts`) diz se OUTRA nota do grupo ainda ocupa o número: só a recusada não denegada e a descartada deixam o número livre; o MOVA recusa antes de enviar, em vez de esperar a rejeição 241.
- **Faixa já usada é recusada** (código 241 no teste em homologação). Fonte: o mesmo [comentário na #504](https://github.com/Meu-mova/moto-chefe/issues/504#issuecomment-6503150925).
- **Na produção é irreversível**; homologação funciona igual. Fonte: suporte da NG, na [#504](https://github.com/Meu-mova/moto-chefe/issues/504).
- **Nota denegada não se inutiliza**: "Quando uma nota é denegada, seu número não pode ser mais utilizado, cancelado ou inutilizado, pois o registro dessa nota já está na SEFAZ." Fonte: [KB da NG, rejeição 301](https://atendimento.notagateway.com.br/kb/pt-br/article/227470/rejeicao-ao-emitir-sefaz-301-uso-denegado-irregularidade-fiscal-).

## Onde isso vive no MOVA

- `src/lib/notagateway/client.ts`: `pedirInutilizacao` (POST; 5xx vira `NotaGatewayIndisponivel`, só com o status) e `consultarInutilizacaoNaNg` (GET).
- `src/lib/notagateway/inutilizacao.ts`: regras puras (justificativa, nota elegível, pedido sem resposta, quem pode pedir, e `decidirInutilizacao`: a decisão única que a lista mostra e o pedido aceita, inclusive se o grupo está no ambiente da nota).
- `src/lib/notagateway/inutilizar-faixa.ts`: `inutilizarFaixa`, o pedido de faixa (config, série e UF da NG, grava pendente, envia pelo `enviarPedido` de `inutilizar.ts`). Regras puras da faixa em `inutilizacao.ts` (`validarFaixaInutilizacao`, `ufPermiteInutilizacao`, `serieEUfDaEmpresa`).
- `src/lib/notagateway/inutilizar.ts`: `contextoDeInutilizacao` (o que a decisão precisa, com o grupo no `where`), pedido e consulta, gravação e log com o resultado de cada pedido.
- `src/lib/notagateway/status.ts`: `ehDenegada`, `ehDuplicidade`, `STATUS_MORTOS` e `numeroLivre`, que decidem se a nota pode ter o número inutilizado e se outra nota ainda o ocupa.
- `src/lib/queries/notas-emitidas.ts`: `anexarSituacaoDeInutilizacao`, a situação por nota na tela Notas emitidas.
- `src/app/(dashboard)/notas-emitidas/`: a action, o diálogo e o bloco de situação da linha (#597).
