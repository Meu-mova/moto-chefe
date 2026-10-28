# 0008. Nome do produto na NF de saída = literal da nota de entrada

- **Status:** Aceita (decisão firme do Cesar)
- **Data da decisão:** 2026-09-24 (commit `64b71a3`: "x_prod guarda o nome fiscal literal da
  entrada, que sai igual na NF de saída — decisão do Cesar")
- **Fontes:** `AGENTS.md` ("Fiscal — cuidado redobrado"), commits `64b71a3` e `e959a8b`
  (2026-09-24), `motos_fiscal.x_prod`

## Contexto

A fábrica fatura por vários CNPJs, e o mesmo modelo comercial (X12, GIGA, JET…) chega com
classificação fiscal diferente em cada um: CEST, origem e CST mudam, além do nome do produto
(commit `64b71a3`). Uma ficha fiscal por modelo escolheria uma das versões e erraria a outra.

## Decisão

- A ficha fiscal é **da moto**, preenchida a partir do XML da nota de entrada.
- O nome do produto na NF-e de saída é **sempre o texto literal** da nota de entrada
  (`motos_fiscal.x_prod`). Não padronizar nem "corrigir".
- Origem na saída: entrada 1 sai 2; entradas 0, 2 e 4 saem iguais (regra do contador).

## Por quê

O `AGENTS.md` registra o nome literal como decisão firme do Cesar, sem o motivo. O que está
registrado é a base da ficha por moto: o mesmo modelo entra com classificação e nome diferentes
conforme o CNPJ da fábrica (`64b71a3`), então só a nota de entrada diz o que aquela moto é.

## Alternativas descartadas

- **Ficha fiscal por modelo:** descartada em `64b71a3`. Erra a classificação quando o mesmo
  modelo entra por CNPJs diferentes.
- **Nome padronizado** ("não padronize", `AGENTS.md`). A tela continua mostrando o nome
  comercial; só a NF usa o literal (`64b71a3`).

## Quando revisar

Só com orientação do contador.

## Adendo de 2026-10-27: o que "literal" quer dizer (#341)

- **Decisão (Luis):** "literal" é o texto do `xProd` com só os espaços das pontas removidos (trim),
  igual nas motos (`motos_fiscal.x_prod`) e nas peças (`nome_xml` do vínculo com o fornecedor).
  Nada mais muda: as entidades XML (`&amp;`) ficam como vieram e nada é padronizado.
- **Por quê:** espaço nas pontas não tem valor fiscal, e as motos já eram lidas assim.
- O `nomeLegivel`, com as entidades decodificadas, serve só para sugerir o nome da peça nova
  na conferência. Ele nunca vai para a NF.
