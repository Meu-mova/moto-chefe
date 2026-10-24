<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MOVA — guia para quem desenvolve aqui

Sistema de gestão das lojas MotoChefe (motos elétricas): estoque, vendas, OS,
peças, financeiro, folha, fiscal. Em produção em `moto-chefe.vercel.app`, usado
todo dia pelas lojas. Converse e comente em **português**; nomes de código
seguem o padrão do arquivo em volta.

Cada regra abaixo nasceu de um incidente real. Se uma parecer exagerada, pergunte
ao Cesar antes de contornar.

## ⚠️ Local é staging; produção só explícita

O `.env.local` aponta para o **staging** (`mova-staging`, só dado sintético). A
**produção** fica em `.env.prod.local`, que só existe na máquina de quem
opera a produção. Máquina que ainda tenha a produção no `.env.local`: troque antes
de qualquer coisa (passo a passo em `docs/infra/segredos.md`).

- `npm run dev` e script rodado com o env padrão falam com o staging. Na dúvida, o
  `sql.ts` e o `migrate.ts` imprimem o banco antes de tudo.
- Produção sempre explícita: `npx dotenv-cli -e .env.prod.local -- ...` (o `sql.ts` e o
  `migrate.ts` exigem também `--prod`).
- O nome é `.env.prod.local` de propósito: o Next carregaria sozinho um
  `.env.production.local` em `next build`/`next start`, e o build local que o
  "Antes de dar por pronto" pede passaria a usar a produção.
- `npm run dev:staging` continua valendo: só sobe se banco e Supabase forem o
  staging (detalhes em `docs/infra/staging.md`).
- Antes de todo `update`/`delete`/`drop`, rode um `select` com o mesmo `where` e confira.
- Nunca imprima, logue, commite ou cole em chat o conteúdo de nenhum `.env*` com valores
  (o `.env.example` só tem nomes e padrões não secretos, como `http://localhost:3000`).
- Segredos que dão poder real: `CERT_MASTER_KEY` (abre os certificados A1 →
  emite nota fiscal em nome das empresas), `SUPABASE_SERVICE_ROLE_KEY` (ignora
  RLS), `DATABASE_URL`.
- **Todo push na `main` vai ao ar sozinho** (deploy automático na Vercel).
  **Ninguém dá push direto em `main` ou `dev`, nem o Cesar nem um agente
  rodando na máquina dele**: trabalhe em branch e abra Pull Request para `dev`
  (ver `CONTRIBUTING.md` e `docs/adr/0002-branches-dev-main-e-revisao.md`).
  O responsável técnico (Luis) revisa e decide o que sobe.
- Na Vercel, só o Owner do time MOVA (Luis) publica. Commit de outro autor
  chega à `main` mas o deploy é recusado ("Deployment failed"); foi o que
  aconteceu com o `30150e3` em 2026-10-06.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · Drizzle ORM sobre Postgres
(Supabase) · Tailwind 4 · `@base-ui/react` (não Radix) · Vercel.

```bash
npm run dev          # local contra o staging (.env.local)
npm run dev:staging  # como o dev, mas recusa subir fora do staging; ver docs/infra/staging.md
npm run type-check   # tsc --noEmit
npm test             # testes node:test — lista explícita no package.json
npm run build        # rode antes de subir: pega erro de fronteira server/client que o tsc não pega
```

**Teste novo precisa entrar na lista do script `test` do `package.json`** (teste de
banco, `*.db.test.ts`, vai no `test:db`) — não há descoberta automática. Testes ficam ao lado do código (`src/lib/x.test.ts`).

## Banco e migrações

**Nunca rode `npm run db:generate` nem `db:migrate`.** O journal do Drizzle está
quebrado desde a fusão multi-grupo; o generate cospe uma migração tentando
recriar tabelas que já existem.

O fluxo real:
1. Edite `src/lib/db/schema.ts`.
2. Escreva SQL à mão em `src/lib/db/migrations/NNNN_nome.sql` — **confira o
   próximo número livre** (`ls src/lib/db/migrations/*.sql | tail`).
3. Abra o PR: o workflow `Migrações` aplica baseline + migrações num Postgres descartável
   e barra SQL quebrado. Depois do merge na `dev`, ele mesmo aplica no **staging**.
   Para testar no staging antes do merge, aplique à mão (o CI vê que já está aplicada).
   Depois disso, não edite o arquivo nem abandone o PR sem desfazer no staging: o
   `migrate.ts` acusa checksum diferente ou registro sem arquivo, e o job do staging trava:
   `npx dotenv-cli -e .env.local -- node --import tsx scripts/migrate.ts --aplicar`
   (`--status` mostra o que está pendente sem aplicar nada).
4. Confira lá: `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --query "select ..."`.
5. Na **produção** (sempre manual): `npx dotenv-cli -e .env.prod.local -- node --import tsx scripts/migrate.ts --aplicar --prod`.

`sql.ts` e `migrate.ts` imprimem o banco antes de tudo e **recusam a produção sem
`--prod`**. Produção só com `-e .env.prod.local` e `--prod`.

**Migração na produção só pelo `migrate.ts`** — nunca pelo MCP do Supabase
(`apply_migration`/`execute_sql`) nem pelo SQL Editor do painel (o `sql.ts --file`
já recusa a produção, mesmo com `--prod`). O que entra por fora
não fica anotado em `schema_migrations`, e o próximo `--aplicar` tenta rodar de novo.
Também não edite um arquivo de migração já aplicado: o `migrate.ts` compara o
checksum e trava. Correção vira arquivo novo.

Cada arquivo roda numa transação. `ALTER TYPE ... ADD VALUE` não pode usar o valor
novo no mesmo arquivo: separe em dois.

Constraint criada inline ganha nome `<tabela>_<col>_key`, não o que o schema.ts
sugere — `drop constraint if exists` com nome errado não faz nada e não avisa.

**Não mexa em `src/lib/db/index.ts`** (pool `pg` + `attachDatabasePool`, `max: 10`).
A configuração do pool já derrubou /folha e /estoque em produção três vezes.

## Armadilhas do Drizzle (o tsc não pega nenhuma)

- **Array dentro de `` sql`` ``**: vira `($1,$2,$3)` — serve para `IN`, mas quebra
  qualquer cast (`${ids}::bigint[]`). Use `sql.param(ids)`. Custou 12 dias de
  dado perdido calado no sync do Kommo.
- **`${tabela.id}` em subconsulta correlacionada de query SEM join** sai sem
  qualificar e casa com o `id` da tabela de dentro (erro `uuid = text` ou soma
  sempre 0). Use `sql.raw('"tabela"."id"')`.
- **Datas dentro de `` sql`` ``**: passe string ISO, não `Date`.
- `db.execute()` devolve `{ rows }` em runtime apesar do tipo; use `execRows()`
  de `src/lib/db`.
- Join com `kommo_stages` multiplica leads pelo número de etapas — deduplique
  numa CTE antes. Regra geral: confira se a soma das partes bate com o total.

## Datas e fuso (Brasília)

- `<input type="date">` → **`parseDataInput()`** (`src/lib/data-venda.ts`), nunca
  `new Date(str)` — vira 21h do dia anterior.
- "Hoje" → **`hojeBrt()`**, nunca `new Date().toISOString().slice(0,10)` — das
  21h à meia-noite isso já é amanhã, e a venda some do fechamento do mês.

## Multi-grupo e permissões

**Regra absoluta: nenhuma Conta lê, sobrescreve ou se liga a dado de outra Conta.** Sem
exceção, em tela, busca, importação, upsert, contagem ou mensagem de erro. Vale para toda
leitura e gravação:

- Consulta de usuário que não é `admin_geral` filtra pela Conta (`contaDoGrupoAtivo()`,
  `lojasDaConta()`) **dentro da consulta**, não depois no JS.
- Busca por chave única global (chassi, CPF, código) procura só na Conta. "Não encontrado"
  não pode revelar que o registro existe em outra.
- `upsert`/`onConflictDoUpdate` em tabela com Conta leva `setWhere` com a mesma Conta, e a
  tela conta só as linhas que de fato entraram.
- Gravação que referencia outro registro (moto, cliente, loja) confere no servidor que ele é
  da Conta.
- Todo fluxo novo ou alterado tem teste de banco provando que a Conta B não lê nem sobrescreve
  dado da Conta A. Isso custou os hotfixes v1.8.1 e v1.8.2 (#320, #325).

- O sistema é **multi-tenant por CNPJ** (grupos Sul de Minas, BH e Vale). **Toda
  funcionalidade nova nasce separada por grupo**: tabela com
  `grupo_id not null references grupos(id)`, consulta filtrada por
  `getGrupoAtivo()` / `listarLojaIdsDoGrupoAtivo()` (`src/lib/grupo.ts`),
  configuração e credencial de integração por grupo — nunca env var global.
- Permissão de venda/OS/peça é avaliada no **grupo da loja do registro**, não
  no grupo ativo da sessão.
- Papéis: `admin_geral` e `admin_socio` (sócios — não operam a rotina),
  **`aux_adm` (quem opera a loja)**, vendedor, mecânico etc. Ação administrativa
  de rotina **inclui `aux_adm`**. Quando o Cesar diz "adm", quase sempre é `aux_adm`.
- Liberou um módulo? O item do menu aparece para **todos** que têm a permissão,
  inclusive admin — senão o Cesar não consegue validar. Menu e permissão de rota
  ficam em `src/lib/navegacao.ts`.
- Quem aprova o quê se configura em `/admin/usuarios`, não com e-mail no código.

## Interface

- `@base-ui/react`: `Button` **não tem `asChild`** (use `buttonVariants()` num
  `<Link>`); `Dialog` usa `disablePointerDismissal`.
- Largura de diálogo: **`sm:max-w-*`** (com prefixo). `max-w-*` sozinho não vence
  o `sm:max-w-lg` da base.
- `<Select>` do design system mostra o UUID cru quando `value` ≠ texto exibido.
  Nesses casos use `<select>` nativo.
- **Server Action + `revalidatePath` desmonta componente** que só existe num
  ramo da condição que a própria action muda — o diálogo fecha sozinho e a tela
  de sucesso some. Dê a mesma `key` às variantes, ou dispare o efeito
  (`window.open`) logo que a action volta. Só aparece testando no navegador.
- Formulário controlado + busca assíncrona: `onChange(prev => ({ ...prev, ...patch }))`,
  nunca `{ ...value, ...patch }` — a resposta async desfaz a última tecla.
- **Avise, não bloqueie**: validação que discorda do usuário vira aviso e deixa
  gravar; só o efeito derivado (preencher um valor sozinho) é que não acontece.
  Exceções: venda com NF de saída do MOVA viva em produção (autorizada, em
  emissão ou em cancelamento) não se cancela; o "Cancelar venda" recusa e orienta
  a cancelar a NF antes (ADR-0014). Para o `aux_adm`, também recusa venda com
  número de NF preenchido (Bling ou "Confirmar NF"; adendo ao ADR-0014, #191). E
  CPF/CNPJ inválido do comprador bloqueia venda, reserva e demanda (ADR-0015).

## Fiscal — cuidado redobrado

- NF-e própria via **Nota Gateway** (`src/lib/notagateway/`,
  `/admin/notas-fiscais`). Ambiente por grupo; **homologação nunca fatura a venda
  nem manda e-mail ao cliente**. Não apague linhas de `notas_fiscais_saida`
  (o número da próxima tentativa sai do histórico).
- **Status da NF de saída**: para saber se a nota trava a venda, se ainda está em
  andamento ou se foi recusada, use `src/lib/notagateway/status.ts`. A API tem
  status intermediários que uma lista de nomes escrita à mão deixa escapar (#80:
  podia liberar uma segunda nota para a mesma venda).
- O **nome fiscal do produto na NF de saída é SEMPRE o literal da nota de
  entrada** (`motos_fiscal.x_prod`) — decisão firme do Cesar; não "padronize".
- Origem na saída: entrada 1 sai 2; 0, 2 e 4 saem iguais (regra do contador).
- Segredo de integração guardado no banco é cifrado com `src/lib/cripto.ts`
  (AES-256-GCM). Credencial nova: cifre igual.
- O Bling ainda convive durante a transição e vai ser desligado.

## Teste de banco

A efetivação de pedido de venda falhava na produção (#181, corrigida em outubro de 2026):
dependia de uma configuração que não existe em nenhum banco, e nenhum teste a exercitava.
"Zero uso na produção" parecia desuso, e era erro.

- Fluxo que grava venda, pedido, reserva, caixa ou estoque precisa de teste de banco
  (`npm run test:db`), contra o schema real num Postgres descartável. O CI roda em todo PR.
- Função SQL não depende de configuração do banco (`current_setting('app.*')`): ela não
  vem com as migrações e quebra calada onde faltar.

## Antes de dar por pronto

`npm run type-check` → `npm test` → `npm run build`. Mexeu em gravação de venda, pedido,
reserva, caixa ou estoque: `npm run test:db` também (seção acima). Fluxo com diálogo,
Server Action ou permissão: teste no navegador também.
