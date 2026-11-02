---
name: nota-gateway-docs
description: Consulta a documentação oficial da Nota Gateway antes de qualquer mudança ou análise fiscal no MOVA, e cita a página e o trecho que sustentam cada decisão. Use sempre que a tarefa criar, editar, apagar, atualizar ou investigar algo fiscal, mesmo que o pedido não fale em "documentação" - código em src/lib/notagateway/ (inclusive logo-ng.ts) ou em qualquer arquivo que chame a API da NG, NF de saída, emissão, consulta, cancelamento (inclusive extemporâneo), inutilização, carta de correção, XML, webhook, status de nota, nota negada ou denegada, rejeição da SEFAZ (301, 302 etc.), empresa ou certificado na NG.
---

# Documentação da Nota Gateway

A Nota Gateway (NG) emite as NF-e do MOVA. Erro aqui fatura venda errada, trava uma venda para sempre ou deixa sair nota duplicada (#80, #88, #347). A regra desta skill: **toda decisão fiscal se apoia numa página oficial, citada**, e não na memória do modelo nem no que o código "parece" fazer.

## Passos

1. **Leia o resumo do assunto, ou crie.** Abra `docs/fiscal/sumario.md` e, se o assunto tiver resumo, leia o arquivo inteiro, inclusive "O que a doc NÃO diz": ela junta o que o suporte da NG respondeu e o que os nossos testes acharam, com a fonte de cada item.
   - **Está em dia?** Compare o `updatedAt` anotado no resumo com o da página online: `curl -s <url da página>.md | head -3` (qualquer página da doc da NG + `.md` devolve o markdown com `updatedAt` no topo). Se o online for mais novo, leia a página de novo e atualize o resumo no mesmo PR.
   - **Assunto sem resumo**: ache a página no [mapa](references/mapa-paginas.md), leia o `.md` dela e **crie o resumo** em `docs/fiscal/ng-<assunto>.md` no padrão de `docs/fiscal/ng-inutilizar-numeracao.md` (link e `updatedAt`, caminho, corpo e respostas, páginas relacionadas, status que importam, "O que a doc NÃO diz" só com fonte escrita, onde vive no MOVA). Acrescente a linha no `sumario.md` e a coluna "Arquivo local" do mapa, no mesmo PR. Resumo à mão, curto: não copie a página da NG para o repo.
   - **Página fora do mapa**: procure na barra lateral do HTML de qualquer página de referência (`curl -sL -A "Mozilla/5.0" <url>` e `href="/v2/reference/..."`; o `llms.txt` do site é incompleto) e acrescente a linha no mapa.
   - **Base de conhecimento** (rejeições da SEFAZ): não tem `.md`; leia o HTML com `curl` (o WebFetch não extrai o texto).
   Concluído quando você tiver lido o resumo em dia (ou a página e o resumo novo), e não só o título.

2. **Confira contra o MOVA**, nesta ordem:
   - `src/lib/notagateway/status.ts`: a classificação dos status. Para saber se a nota trava a venda, está em andamento ou foi recusada, use as funções dele, nunca uma lista escrita à mão.
   - Seção "Fiscal" do `AGENTS.md`: regras do Cesar e do contador (nome fiscal do produto, origem, homologação, segredos).
   - `src/lib/notagateway/client.ts` e `logo-ng.ts` (ou `grep -nE 'chamar\(|fetch\(' src/lib/notagateway`): o caminho e o método que o MOVA chama de fato.
   - `~/Development/work/moto-chefe/ng-nfe-modelo55.txt`, se existir na máquina (manual da NG para NF-e modelo 55, fora do repo). Não existindo, diga isso no plano.

3. **Divergência = pare e pergunte.** Se a página oficial, o código e o `AGENTS.md` discordarem (um status que a doc tem e o `status.ts` não, um caminho diferente, um prazo), não decida qual está certo. Descreva a divergência com as duas fontes e pare e pergunte ao Maestro; fora da esteira, ao Luis. Deduzir aqui já liberou segunda nota para a mesma venda (#80).

4. **Cite no plano e no PR.** Para cada decisão fiscal: a URL específica da página oficial (não a home, nem o arquivo local) e o trecho que a sustenta, entre aspas. Item da seção "O que a doc NÃO diz" se cita pela fonte dele (issue, PR ou artigo da KB). Exemplo:
   > Cancelamento: `DELETE /v2/empresas/{empresaId}/nf-e/{id}` (https://docs.notagateway.com.br/v2/reference/cancelar-nota-fiscal). A página não documenta prazo de cancelamento; o prazo segue a regra da SEFAZ e o fluxo atual do MOVA.

   Se a página não diz algo, escreva que não diz. Não preencha com conhecimento geral.

## Segredos

Token e `empresaId` da NG nunca aparecem em log, terminal, issue, PR ou chat, nem em pedaços (regra completa no `AGENTS.md`, "Fiscal"). Na citação, use o caminho com `{empresaId}`, como na doc. Para chamar a API num script, use o mascarador de `scripts/lib/postman-ng.ts`; não monte a chamada à mão para "testar rápido".

## Fora desta skill

- Regra de negócio fiscal que a doc não cobre (o que o Cesar ou o contador decidem): pare e pergunte ao Maestro; fora da esteira, ao Luis. Não está na NG.
- DANFE: o MOVA gera o PDF localmente (`src/app/api/nfe/[chave]/danfe/route.ts`, pacote `nfe-danfe-pdf`); a NG não tem página de DANFE de NF-e na referência v2.
