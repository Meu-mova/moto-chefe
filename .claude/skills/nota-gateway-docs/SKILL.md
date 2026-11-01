---
name: nota-gateway-docs
description: Consulta a documentação oficial da Nota Gateway antes de qualquer mudança ou análise fiscal no MOVA, e cita a página e o trecho que sustentam cada decisão. Use sempre que a tarefa criar, editar, apagar, atualizar ou investigar algo fiscal, mesmo que o pedido não fale em "documentação" - código em src/lib/notagateway/ (inclusive logo-ng.ts) ou em qualquer arquivo que chame a API da NG, NF de saída, emissão, consulta, cancelamento (inclusive extemporâneo), inutilização, carta de correção, XML, webhook, status de nota, nota negada ou denegada, rejeição da SEFAZ (301, 302 etc.), empresa ou certificado na NG.
---

# Documentação da Nota Gateway

A Nota Gateway (NG) emite as NF-e do MOVA. Erro aqui fatura venda errada, trava uma venda para sempre ou deixa sair nota duplicada (#80, #88, #347). A regra desta skill: **toda decisão fiscal se apoia numa página oficial, citada**, e não na memória do modelo nem no que o código "parece" fazer.

## Passos

1. **Ache a página da operação** em [references/mapa-paginas.md](references/mapa-paginas.md) e abra a página (WebFetch). Se o WebFetch vier vazio ou sem a parte que importa (o site de referência e a base de conhecimento renderizam no navegador), baixe o HTML com `curl -sL -A "Mozilla/5.0" <url>` e leia o texto. Operação que não está no mapa: procure na barra lateral de qualquer página de referência (`href="/v2/reference/..."` no HTML); o `llms.txt` do site é incompleto.
   Concluído quando você tiver lido a página da operação, e não só o título.

2. **Confira contra o MOVA**, nesta ordem:
   - `src/lib/notagateway/status.ts`: a classificação dos status. Para saber se a nota trava a venda, está em andamento ou foi recusada, use as funções dele, nunca uma lista escrita à mão.
   - Seção "Fiscal" do `AGENTS.md`: regras do Cesar e do contador (nome fiscal do produto, origem, homologação, segredos).
   - `src/lib/notagateway/client.ts` e `logo-ng.ts` (ou `grep -n "chamar(" src/lib/notagateway`): o caminho e o método que o MOVA chama de fato.
   - `~/Development/work/moto-chefe/ng-nfe-modelo55.txt`, se existir na máquina (manual da NG para NF-e modelo 55, fora do repo). Não existindo, diga isso no plano.

3. **Divergência = pare e pergunte.** Se a página oficial, o código e o `AGENTS.md` discordarem (um status que a doc tem e o `status.ts` não, um caminho diferente, um prazo), não decida qual está certo. Descreva a divergência com as duas fontes e pare e pergunte ao Maestro; fora da esteira, ao Luis. Deduzir aqui já liberou segunda nota para a mesma venda (#80).

4. **Cite no plano e no PR.** Para cada decisão fiscal: a URL específica da página (não a home) e o trecho que a sustenta, entre aspas. Exemplo:
   > Cancelamento: `DELETE /v2/empresas/{empresaId}/nf-e/{id}` (https://docs.notagateway.com.br/v2/reference/cancelar-nota-fiscal). A página não documenta prazo de cancelamento; o prazo segue a regra da SEFAZ e o fluxo atual do MOVA.

   Se a página não diz algo, escreva que não diz. Não preencha com conhecimento geral.

## Segredos

Token e `empresaId` da NG nunca aparecem em log, terminal, issue, PR ou chat, nem em pedaços (regra completa no `AGENTS.md`, "Fiscal"). Na citação, use o caminho com `{empresaId}`, como na doc. Para chamar a API num script, use o mascarador de `scripts/lib/postman-ng.ts`; não monte a chamada à mão para "testar rápido".

## Fora desta skill

- Regra de negócio fiscal que a doc não cobre (o que o Cesar ou o contador decidem): pare e pergunte ao Maestro; fora da esteira, ao Luis. Não está na NG.
- DANFE: o MOVA gera o PDF localmente (`src/app/api/nfe/[chave]/danfe/route.ts`, pacote `nfe-danfe-pdf`); a NG não tem página de DANFE de NF-e na referência v2.
