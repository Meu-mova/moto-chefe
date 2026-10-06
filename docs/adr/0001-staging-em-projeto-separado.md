# 0001. Staging em projeto Supabase separado, com schema por dump da produção

- **Status:** Aceita
- **Data da decisão:** 2026-10-01 (executada em 2026-10-06, PR #4)
- **Fontes:** `docs/seguranca/2026-10-01-plano-staging-ci.md` (D1, D2), `docs/infra/staging.md`

## Contexto

Até outubro de 2026 não existia ambiente de teste: o `.env.local` de quem desenvolve apontava
para o banco de produção, e todo `npm run dev` ou script mexia em dado real de cliente. O schema
também não era reproduzível a partir do repo: 107 migrações escritas à mão, journal do Drizzle
quebrado, e RLS e funções vindos de arquivos fora de qualquer trilha.

## Decisão

- Staging é um **projeto Supabase próprio**, `mova-staging`, na mesma org da produção e na
  mesma região (`sa-east-1`).
- O schema nasce de um **dump schema-only do `public` da produção**, congelado em
  `supabase/schema-baseline.sql` e nunca re-dumpado. Tudo depois disso entra por migração
  ([0004](0004-migracoes-versionadas.md)).
- O schema `crm`, de outro sistema que mora no banco da produção, fica de fora.

## Por quê

Um projeto separado isola credenciais, dados e usuários do Auth: errar no staging não alcança a
produção. O dump é o único retrato fiel do schema que roda de verdade; refazer o schema pelas
migrações do repo daria um banco diferente da produção.

## Alternativas descartadas

- **Branching do Supabase:** exigia o plano Pro na época da decisão (plano, §2).
- **Recriar o schema pelas migrações do repo:** sem replay confiável (journal quebrado,
  arquivos fora da trilha).

## Quando revisar

Se o Supabase Branching passar a cobrir o fluxo com custo aceitável, ou se o staging divergir
da produção a ponto de o `scripts/schema-diff.ts` acusar diferenças recorrentes.
