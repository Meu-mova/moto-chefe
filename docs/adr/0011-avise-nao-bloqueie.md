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

Exceções:

- Venda com NF de saída autorizada em produção não se cancela
  ([ADR-0014](0014-venda-com-nf-autorizada-nao-se-cancela.md)).
- CPF/CNPJ do comprador com dígito verificador errado bloqueia venda, reserva e demanda: a SEFAZ
  recusaria a nota (decisão do Luis na triagem da #65, 2026-10-08). O CPF do representante legal
  não vai para a nota e segue a regra: avisa e deixa gravar.

## Por quê

Não registrado.

## Alternativas descartadas

Não registradas na fonte.

## Quando revisar

Se um aviso ignorado causar prejuízo recorrente.
