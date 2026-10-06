# 0011. Avise, não bloqueie

- **Status:** Aceita
- **Data da decisão:** antes de 2026-09-30 (registrada no `AGENTS.md` nessa data)
- **Fontes:** `AGENTS.md` ("Interface")

## Contexto

O sistema roda a operação das lojas. Validação que trava a gravação quando discorda do usuário
para a loja numa situação que o sistema não previu. O `AGENTS.md` diz que cada regra dele
nasceu de um incidente real; o incidente desta não está registrado.

## Decisão

Validação que discorda do usuário vira **aviso** e deixa gravar. O que não acontece é o efeito
derivado, como preencher um valor sozinho a partir de um dado que o sistema não confia.

## Por quê

Não registrado. Leitura provável: quem está no balcão conhece casos que o código não conhece;
avisar mantém o alerta sem parar a venda.

## Alternativas descartadas

Não registradas na fonte.

## Quando revisar

Se um aviso ignorado causar prejuízo recorrente. Escopo: vale para validação de dado digitado;
permissão (quem pode fazer o quê) continua bloqueando.
