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
vazamento de verdade.

## Alternativas descartadas

- **Copiar a produção para o staging:** é exatamente o risco que a decisão evita.

## Situação em 2026-10-09

Uma exceção, decidida pelo Luis em 2026-10-08 (#66): a chave da Nota Gateway no staging é a da
conta, a mesma que emite em produção para BH e Sul de Minas. Ela fica cifrada no banco do staging,
só num grupo de teste ligado à empresa de teste da Nota Gateway (CNPJ da própria Nota Gateway), em
homologação, para testar emissão e cancelamento de NF-e sem certificado nem dado das nossas
empresas. Fora do app publicado em produção, a trava em `src/lib/notagateway/ambiente.ts` recusa
qualquer chamada com configuração em `Producao`. Nenhum dado de cliente real entra. Passo a passo
em `docs/infra/staging.md` ("Nota Gateway em homologação").

## Quando revisar

Se aparecer um bug que só se reproduz com dado real; aí entra a anonimização, com revisão.
