# Origem da venda — plano de implementação

> Spec: `docs/superpowers/specs/2026-08-08-origem-venda-design.md`.
> Execução inline nesta sessão (o Cesar autorizou subir direto).

**Goal:** origem obrigatória para fechar venda de moto, catálogo editável por grupo, e aba
"Vendas por origem" no `/marketing`.

**Architecture:** catálogo `origens_venda` por grupo; `vendas.origem_id`/`origem_detalhe`; uma
regra pura (`validarOrigemVenda`) usada pelos três caminhos que criam venda; relatório como aba
da página que já existe.

**Tech Stack:** Next.js (App Router) + drizzle/pg + Supabase RPC, `node --test` via tsx.

## Global Constraints

- Migração: SQL à mão em `src/lib/db/migrations/0050_origem_venda.sql`, aplicada com
  `npx dotenv-cli -e .env.local -- node --import tsx scripts/sql.ts --file 0050_origem_venda.sql`.
  Nunca `db:generate`/`db:migrate`; nunca MCP do Supabase.
- Catálogo sempre escopado por grupo (`getGrupoAtivo`); `aux_adm` tem acesso, e o item aparece
  no menu para o admin.
- `<select>` nativo onde o value é UUID e o label é o nome.
- Nunca `Date` cru dentro do template `sql`; usar string ISO.
- Teste novo tem de entrar na lista explícita de `"test"` no `package.json`.

---

### Task 1: Migração e schema

**Files:**
- Create: `src/lib/db/migrations/0050_origem_venda.sql`
- Modify: `src/lib/db/schema.ts` (tabela `origensVenda`; `vendas` ganha `origemId`,
  `origemDetalhe`)

- [ ] Tabela `origens_venda` (id, grupo_id, nome, tipo com CHECK dos 6 valores, pede_detalhe,
      ativo, ordem, criado_em) + índice único `(grupo_id, lower(trim(nome)))`.
- [ ] `vendas`: `origem_id uuid references origens_venda(id)`, `origem_detalhe text`, índice.
- [ ] Seed dos 16 itens para cada grupo (`insert ... select from grupos`).
- [ ] `DROP FUNCTION efetivar_venda(uuid,uuid,text,text,numeric,text)` e recriar idêntica com
      `p_origem_id uuid DEFAULT NULL, p_origem_detalhe text DEFAULT NULL`, gravando as duas
      colunas no `INSERT INTO vendas`.
- [ ] Aplicar a migração e conferir: 16 origens × 3 grupos, e a RPC nova com 8 argumentos.

### Task 2: Regra pura + teste

**Files:**
- Create: `src/lib/origem-venda.ts`, `src/lib/origem-venda.test.ts`
- Modify: `package.json` (lista do `test`)

**Produces:** `validarOrigemVenda(origem, detalhe, grupoIdEsperado): { ok: true } | { ok: false; erro: string }`
e `type OrigemParaValidar = { id: string; ativo: boolean; grupoId: string; pedeDetalhe: boolean }`.

- [ ] Teste primeiro: aceita origem ativa sem detalhe quando não pede; recusa ausente; recusa
      inativa; recusa origem de outro grupo; recusa detalhe vazio/só espaços quando pede.
- [ ] Rodar (deve falhar), implementar, rodar (deve passar), commitar.

### Task 3: Leitura do catálogo

**Files:**
- Create: `src/lib/queries/origens-venda.ts`

**Produces:** `listarOrigensAtivasDoGrupo(grupoId)` → `{ id, nome, tipo, pedeDetalhe }[]`
ordenado por `tipo, ordem, nome`; `buscarOrigemParaValidar(id)` → `OrigemParaValidar | undefined`.

### Task 4: Caminho 1 — venda direta

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts` (`DadosVendaCompleta`, `criarVendaTx`,
  `registrarVendaCompletaAction`)
- Modify: `src/app/(dashboard)/estoque/components/vender-button.tsx`

- [ ] `DadosVendaCompleta` ganha `origemId` e `origemDetalhe`; `criarVendaTx` grava.
- [ ] Action valida com `validarOrigemVenda` + `buscarOrigemParaValidar`, comparando com o grupo
      da loja da moto.
- [ ] `<select>` nativo com `<optgroup>` por tipo no bloco "Dados do cliente"; input de detalhe
      condicional; submit barrado sem origem.

### Task 5: Caminho 2 — venda aprovada

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts` (`solicitarAprovacaoVendaAction`,
  `aprovarVendaAction`)

- [ ] Validar na **solicitação** (não deixar `dados_venda` inválido ser gravado) e de novo na
      aprovação, já que o jsonb pode ter sido gravado antes deste deploy.

### Task 6: Caminho 3 — pedido efetivado

**Files:**
- Modify: `src/app/(dashboard)/vendas/actions.ts` (`efetivarVendaAction`)
- Modify: `src/app/(dashboard)/vendas/components/efetivar-dialog.tsx`

- [ ] Dialog ganha o mesmo campo; action valida antes e passa `p_origem_id`/`p_origem_detalhe`
      para a RPC.

### Task 7: Correção posterior

**Files:**
- Modify: `src/app/(dashboard)/vendas/components/editar-venda-dialog.tsx` e a
  `editarVendaAction` correspondente.

- [ ] Permitir trocar origem e detalhe, com a mesma validação.

### Task 8: Admin do catálogo

**Files:**
- Create: `src/app/(dashboard)/admin/origens/page.tsx`, `actions.ts`,
  `components/origens-table.tsx`
- Modify: `src/app/(dashboard)/admin/page.tsx` (card novo)

- [ ] Padrão de `/admin/categorias-caixa`: criar, editar, ativar/desativar; nome, tipo, pede
      detalhe, ordem. Grupo ativo no título. Liberado para `admin_geral`, `admin_socio`,
      `aux_adm`.

### Task 9: Aba do relatório

**Files:**
- Modify: `src/app/(dashboard)/marketing/page.tsx` (abas Leads (Kommo) | Vendas por origem)
- Modify: `src/lib/queries/marketing.ts` (queries novas)

- [ ] Cobertura (% com origem informada) primeiro; vendas por origem com subtotal por tipo e
      "Não informado" em faixa separada; origem × loja; origem × vendedor; evolução mensal;
      lista de indicações.
- [ ] Conferir o total da aba contra o total de vendas do período.

### Task 10: Fechamento

- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] Verificação manual dos 5 itens da spec.
- [ ] Commit e push (deploy automático da Vercel).
