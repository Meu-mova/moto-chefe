# MOVA

Sistema de gestão das lojas MotoChefe (motos elétricas): estoque, vendas, ordens de serviço,
peças, financeiro, folha e fiscal. Em produção, usado todo dia pelas lojas de três grupos (Sul
de Minas, BH e Vale).

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · Drizzle ORM sobre Postgres
(Supabase) · Tailwind 4 · `@base-ui/react` · Vercel.

## Antes de tudo

- Leia o [`AGENTS.md`](AGENTS.md): cada regra ali nasceu de um incidente real.
- **O `.env.local` ainda aponta para a produção.** Para desenvolver, use o staging.

## Rodar localmente

```bash
npm ci
npm run dev:staging   # app contra o mova-staging (dado sintético); ver docs/infra/staging.md
```

As variáveis estão listadas no [`.env.example`](.env.example). Os valores do staging ficam no
Bitwarden (coleção "MOVA staging"); ver [`docs/infra/segredos.md`](docs/infra/segredos.md).

## Antes de abrir um PR

```bash
npm run type-check
npm test
npm run build
```

Fluxo de branches, revisão e tamanho de PR: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentação

Índice em [`docs/README.md`](docs/README.md): decisões de arquitetura (ADRs), runbooks de
operação e o histórico de cada funcionalidade.
