# 0005. Zero dado real fora de produção

- **Status:** Aceita
- **Data da decisão:** 2026-10-01 (seed entregue em 2026-10-06, PR #7)
- **Fontes:** `docs/seguranca/2026-10-01-plano-staging-ci.md` (D3), `scripts/seed-staging.ts`

## Contexto

O sistema guarda CPF, endereço, celular e e-mail de clientes, folha de pagamento e certificados
fiscais. Um staging com cópia da produção carregaria tudo isso para um ambiente com menos
controle.

## Decisão

- Staging e máquinas de desenvolvimento só têm **dado sintético**.
- `scripts/seed-staging.ts` recria a estrutura: 3 grupos, lojas, um usuário por papel por
  grupo, motos, vendas, OS e reservas de teste, com nomes fictícios e usuários
  `@teste.meumova.com`.
- O seed só roda se banco **e** Supabase forem o `mova-staging`.
- Anonimizar um dump real só se um bug exigir, com script revisado.

## Por quê

Dado pessoal fora da produção é risco sem benefício: vazamento de um ambiente de teste é
vazamento de verdade (LGPD).

## Alternativas descartadas

- **Copiar a produção para o staging:** é exatamente o risco que a decisão evita.

## Quando revisar

Se aparecer um bug que só se reproduz com dado real; aí entra a anonimização, com revisão.
