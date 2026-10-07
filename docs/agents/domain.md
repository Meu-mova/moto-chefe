# Documentação de domínio

Como as skills de engenharia usam a documentação de domínio deste repo. O repo tem contexto único.

## Antes de explorar, leia

- **`CONTEXT.md`**, na raiz: glossário do domínio.
- **`docs/adr/`**: os ADRs que tocam a área em que você vai trabalhar (índice em
  `docs/adr/README.md`).

## Use o vocabulário do glossário

Ao nomear um conceito do domínio (título de issue, proposta de refactor, hipótese, nome de
teste), use o termo como o `CONTEXT.md` define. Não troque por sinônimos que o glossário evita.

Se o conceito não está no glossário, é sinal: ou você está inventando linguagem que o projeto
não usa (reveja), ou há uma lacuna real (anote para o `/domain-modeling`).

## Aponte conflito com ADR

Se o que você propõe contradiz um ADR, diga explicitamente em vez de passar por cima:

> _Contradiz o ADR-0007 (multi-tenant por CNPJ), mas vale reabrir porque…_
