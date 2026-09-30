<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MOVA — guia para quem desenvolve aqui

Sistema de gestão das lojas MotoChefe (motos elétricas): estoque, vendas, OS,
peças, financeiro, folha, fiscal. Em produção em `moto-chefe.vercel.app`, usado
todo dia pelas lojas. Converse e comente em **português**; nomes de código
seguem o padrão do arquivo em volta.

Cada regra abaixo nasceu de um incidente real. Se uma parecer exagerada, pergunte
ao Cesar antes de contornar.

## ⚠️ Não existe ambiente de desenvolvimento

O `.env.local` aponta para o **banco de PRODUÇÃO**. Script, `npm run dev` e
consulta rodando na sua máquina mexem em dado real de cliente.

- Antes de todo `update`/`delete`/`drop`, rode um `select` com o mesmo `where` e confira.
- Nunca imprima, logue, commite ou cole em chat o conteúdo do `.env.local`.
- Segredos que dão poder real: `CERT_MASTER_KEY` (abre os certificados A1 →
  emite nota fiscal em nome das empresas), `SUPABASE_SERVICE_ROLE_KEY` (ignora
  RLS), `DATABASE_URL`.
- **Todo push na `main` vai ao ar sozinho** (deploy automático na Vercel).
  Se você não é o Cesar (nem está trabalhando na máquina dele): trabalhe em
  branch e abra Pull Request; ele decide o que sobe.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · Drizzle ORM sobre Postgres
(Supabase) · Tailwind 4 · `@base-ui/react` (não Radix) · Vercel.

```bash
npm run dev          # local (lembre: banco de produção)
npm run type-check   # tsc --noEmit
npm test             # testes node:test — lista explícita no package.json
npm run build        # rode antes de subir: pega erro de fronteira server/client que o tsc não pega
```

**Teste novo precisa entrar na lista do script `test` do `package.json`** — não há
descoberta automática. Testes ficam ao lado do código (`src/lib/x.test.ts`).

## Banco e migrações

**Nunca rode `npm run db:generate` nem `db:migrate`.** O journal do Drizzle está
quebrado desde a fusão multi-grupo; o generate cospe uma migração tentando
recriar tabelas que já existem.

O fluxo real:
1. Edite `src/lib/db/schema.ts`.
2. Escreva SQL à mão em `src/lib/db/migrations/NNNN_nome.sql` — **confira o
   próximo número livre** (`ls src/lib/db/migrations/*.sql | tail`).
3. Aplique: `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file NNNN_nome.sql`
4. Confira: `... scripts/sql.ts --query "select ... from information_schema.columns ..."`.

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

## Fiscal — cuidado redobrado

- NF-e própria via **Nota Gateway** (`src/lib/notagateway/`,
  `/admin/notas-fiscais`). Ambiente por grupo; **homologação nunca fatura a venda
  nem manda e-mail ao cliente**. Não apague linhas de `notas_fiscais_saida`
  (o número da próxima tentativa sai do histórico).
- O **nome fiscal do produto na NF de saída é SEMPRE o literal da nota de
  entrada** (`motos_fiscal.x_prod`) — decisão firme do Cesar; não "padronize".
- Origem na saída: entrada 1 sai 2; 0, 2 e 4 saem iguais (regra do contador).
- Segredo de integração guardado no banco é cifrado com `src/lib/cripto.ts`
  (AES-256-GCM). Credencial nova: cifre igual.
- O Bling ainda convive durante a transição e vai ser desligado.

## Antes de dar por pronto

`npm run type-check` → `npm test` → `npm run build`. Fluxo com diálogo, Server
Action ou permissão: teste no navegador também.
