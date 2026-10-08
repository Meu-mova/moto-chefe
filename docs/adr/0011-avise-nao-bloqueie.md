# 0011. Avise, não bloqueie

- **Status:** Aceita
- **Data da decisão:** antes de 2026-09-30 (registrada no `AGENTS.md` nessa data)
- **Fontes:** `AGENTS.md` ("Interface")

## Contexto

Regra da seção "Interface" do `AGENTS.md`. O `AGENTS.md` diz que cada regra dele nasceu de um
incidente real; o incidente desta não está registrado.

## Decisão

Nas palavras do `AGENTS.md`: "validação que discorda do usuário vira aviso e deixa gravar; só o
efeito derivado (preencher um valor sozinho) é que não acontece."

Exceção: venda com NF de saída autorizada em produção não se cancela
([ADR-0014](0014-venda-com-nf-autorizada-nao-se-cancela.md)).

## Por quê

Não registrado.

## Alternativas descartadas

Não registradas na fonte.

## Quando revisar

Se um aviso ignorado causar prejuízo recorrente.
