# Origem da venda — design

Data: 2026-08-08
Status: aguardando revisão do Cesar
Substitui: `2026-07-29-origem-cliente-design.md` (nunca implementada; ver "O que mudou")

## Problema

Ao fechar uma venda de moto não se registra por onde o cliente chegou. Sem isso não há como
comparar ação de marketing: qual canal traz volume, qual traz faturamento, qual não traz nada.

O relatório `/marketing` que já existe mede **leads de entrada do Kommo** — quem chamou no
WhatsApp, quem veio de anúncio. Ele não sabe quem **comprou**: o Kommo tem lead ganho, mas o
valor é digitado à mão no CRM e não bate com a venda do MOVA (foi o que produziu os leads de
R$ 14 milhões corrigidos em 08/08). A origem na venda é o dado do lado de dentro: fonte única,
conferida contra o faturamento real.

## Objetivo

Tornar a origem um campo obrigatório para fechar venda de moto, com catálogo editável por
grupo, e mostrar vendas/faturamento por origem em `/marketing`.

## Decisões

Da conversa de 29/07, mantidas:

1. **Origem é da venda, não do cliente.** Quem compra de novo pode ter vindo de outro canal;
   é a origem da venda que mede campanha num período.
2. **Catálogo editável no Admin**, não enum fixo — acrescentar "TikTok" sem deploy.
3. **Por grupo.** Cada bandeira tem suas origens; toda funcionalidade nova nasce separada por
   grupo.
4. **Flag "pede detalhe"** por origem: em Indicação, o vendedor é obrigado a dizer quem indicou.
5. **Só venda de moto.** Reserva, demanda, peça e OS não perguntam.
6. **Obrigatoriedade na aplicação**, não em constraint: a coluna aceita nulo por causa do
   histórico, e nenhum caminho de escrita novo deixa passar.
7. **Sem backfill.** Venda antiga fica "Não informado". Inventar origem para venda passada
   produz número de marketing falso, que é pior que número faltando.

Novas, de 08/08:

8. **Lista única, não canal + campanha.** Decisão dele depois de eu propor os dois campos: um
   select só no fechamento. Campanha entra como origem nova ("Black Friday 2026") e é desativada
   quando acaba.
9. **Cada origem carrega um `tipo`** (Digital, Presencial, Relacional, Parceria, Ativo, Outro).
   É a mitigação do risco do item 8: quando o catálogo tiver 30 linhas cheias de campanha
   pontual, o relatório ainda soma "tudo que foi Digital". Não custa clique — na tela da venda é
   `<optgroup>`; no relatório, uma linha de subtotal.
10. **Os três caminhos de criação de venda pedem origem** (ver "Fluxo de venda"). A spec de
    29/07 errava aqui, e o erro era grave.

## O que mudou em relação à spec de 29/07

- `criarVendaTx` **não** é o único insert em `vendas`: a RPC `efetivar_venda` também insere.
- Tabela passa a se chamar `origens_venda` (era `origens_cliente`) — o dado é da venda.
- Origem ganha `tipo`.
- `/marketing` já existe (relatório do Kommo, 06/08); a origem entra como aba, não como página
  nova.
- Migração por `scripts/sql.ts`, não pelo MCP do Supabase (que não autentica mais).

## Modelo de dados

```sql
create table origens_venda (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references grupos(id),
  nome         text not null,
  tipo         text not null default 'Outro'
               check (tipo in ('Digital','Presencial','Relacional','Parceria','Ativo','Outro')),
  pede_detalhe boolean not null default false,
  ativo        boolean not null default true,
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);
create unique index origens_venda_nome_unq on origens_venda (grupo_id, lower(trim(nome)));

alter table vendas
  add column origem_id      uuid references origens_venda(id),
  add column origem_detalhe text;
create index vendas_origem_id_idx on vendas (origem_id);
```

FK em vez de texto solto: desativar uma origem não apaga histórico. Consequência aceita de
propósito — renomear no catálogo muda o rótulo retroativamente, o que é desejável para corrigir
grafia e não é dado fiscal.

`check` no `tipo` em vez de enum do Postgres: acrescentar valor a enum exige migração e trava a
tabela; aqui é um `alter constraint`. Os seis valores cobrem o que existe hoje.

### Seed, aplicado para cada grupo ativo

| nome | tipo | pede_detalhe |
| --- | --- | --- |
| Instagram | Digital | não |
| Instagram (anúncio) | Digital | não |
| Facebook | Digital | não |
| WhatsApp | Digital | não |
| Google (busca) | Digital | não |
| Google Ads | Digital | não |
| Classificados (OLX, ML, iCarros) | Digital | **sim** |
| Passou na porta | Presencial | não |
| Evento / feira | Presencial | **sim** |
| Indicação de cliente | Relacional | **sim** |
| Cliente antigo / recompra | Relacional | não |
| Parceiro / revenda | Parceria | **sim** |
| Empresa ou frota (PJ) | Parceria | **sim** |
| Oficina / pós-venda | Ativo | não |
| Não informou | Outro | não |
| Outro | Outro | **sim** |

"Não informou" existe de propósito e **não** é o mesmo que campo vazio: registra que o cliente
não soube dizer, o que é informação. Vazio é venda antiga, anterior ao deploy.

## Regra pura

Uma função concentra a validação, chamada pelo formulário e pelas três actions:

```ts
// src/lib/origem-venda.ts
export function validarOrigemVenda(
  origem: { id: string; ativo: boolean; grupoId: string; pedeDetalhe: boolean } | undefined,
  detalhe: string | null | undefined,
  grupoIdEsperado: string,
): { ok: true } | { ok: false; erro: string }
```

Recusa: origem ausente, origem inativa, origem de outro grupo, e detalhe vazio ou só espaços
quando `pedeDetalhe`. É a única fonte da regra — a duplicação entre action e página já produziu
bug neste repo (o cancelamento de OS, que liberava para um papel na action e outro na tela).

## Fluxo de venda

São **três** caminhos que criam venda. Todos passam a exigir origem.

### 1. Venda direta do estoque — `registrarVendaCompletaAction` → `criarVendaTx`

- `DadosVendaCompleta` ganha `origemId: string` e `origemDetalhe?: string`; `criarVendaTx` grava
  as duas colunas no insert.
- `vender-button.tsx` (`src/app/(dashboard)/estoque/components/`): campo no bloco "Dados do
  cliente". **`<select>` nativo**, não o `<Select>` do `@base-ui/react` — o value é UUID e o
  label é o nome, que é exatamente o caso em que aquele componente mostra o UUID na tela.
  `<optgroup>` por `tipo`. O input de detalhe só aparece quando a origem escolhida pede.
- Validação no cliente (submit não passa) e no servidor, via `validarOrigemVenda`.

### 2. Venda que passou por aprovação — `solicitarAprovacaoVendaAction` → `aprovarVendaAction`

A venda negociada abaixo do mínimo grava `aprovacoes_venda.dados_venda` (jsonb) e só vira venda
quando aprovada. Como a origem faz parte de `DadosVendaCompleta`, ela viaja no jsonb.
**Validar também na solicitação**, não só na aprovação: senão grava-se um `dados_venda` inválido
que só quebra na hora de aprovar, na frente de outra pessoa.

### 3. Pedido/reserva efetivada — `efetivarVendaAction` → RPC `efetivar_venda`

Este é o caminho que a spec anterior não viu. A RPC insere em `vendas` dentro do Postgres.

- `DROP FUNCTION efetivar_venda(uuid,uuid,text,text,numeric,text)` e recriar com
  `p_origem_id uuid DEFAULT NULL, p_origem_detalhe text DEFAULT NULL` no fim da lista,
  gravando as duas colunas no `INSERT INTO vendas`. Precisa ser `DROP` + `CREATE`:
  `CREATE OR REPLACE` não muda lista de argumentos, e manter as duas versões deixaria a chamada
  de 6 argumentos ambígua.
- `efetivar-dialog.tsx` ganha o mesmo campo do `vender-button`.
- `efetivarVendaAction` valida com `validarOrigemVenda` **antes** de chamar a RPC e passa os dois
  parâmetros.

Gravar dentro da RPC, e não com um `UPDATE` depois (como é feito hoje com `cliente_id`), porque
campo obrigatório precisa nascer atômico: um update que falha deixaria a venda sem origem e a
obrigatoriedade viraria ficção.

### Correção posterior

`editarVendaAction` passa a permitir trocar origem e detalhe. Campo obrigatório que só pode ser
preenchido uma vez, e errado para sempre, produz dado ruim de propósito.

## Admin — catálogo

Página `/admin/origens` no padrão de `/admin/categorias-caixa`: criar, editar, ativar/desativar,
com nome, tipo, "pede detalhe" e ordem. Card novo na grade de `/admin`.

Opera sobre o **grupo ativo** (`getGrupoAtivo`), com o nome do grupo no título — sem isso não se
sabe qual bandeira está sendo editada. Liberada para `admin_geral`, `admin_socio` e **`aux_adm`**:
quem opera a loja é quem cria a origem de uma ação local. O item do menu tem de aparecer também
para o admin, senão não há como validar.

Não há exclusão, só `ativo = false` — `vendas.origem_id` referencia a linha.

## Relatório — aba em `/marketing`

`/marketing` hoje mostra leads do Kommo. Ganha duas abas: **Leads (Kommo)**, o que já existe, e
**Vendas por origem**, nova. Mesma régua de papel e mesmo escopo por grupo ativo, com filtro de
período e loja.

Conteúdo da aba nova:

- **Cobertura** — % das vendas do período com origem informada. Primeira coisa da tela: sem ela
  todos os outros números enganam. Venda anterior ao deploy entra como "Não informado".
- **Vendas por origem** — quantidade, faturamento e ticket médio, ordenado por faturamento, com
  subtotal por `tipo`. "Não informado" é faixa separada, nunca diluída nas outras.
- **Origem × loja** e **origem × vendedor** — um canal pode funcionar numa praça e não na outra.
- **Evolução mês a mês** por origem.
- **Indicação** — os detalhes preenchidos, agrupados por quem indicou, para reconhecer quem
  mais indica.

Queries novas em `src/lib/queries/marketing.ts`, no formato das que já estão lá.

Cruzar origem da venda com lead do Kommo continua **fora de escopo** — exige casar lead com
venda por telefone e é projeto próprio. As duas abas convivem lado a lado e a comparação é
visual.

## Armadilhas deste repo que valem para esta tarefa

- Migração: SQL à mão aplicado por `scripts/sql.ts`. Nunca `db:generate`/`db:migrate` (journal
  do drizzle quebrado) e nem MCP do Supabase (não autentica mais).
- Nunca passar `Date` cru dentro do template `sql` do drizzle — estoura em runtime e o `tsc` não
  pega. Usar string ISO.
- Escopar por `lojaId in (lojas do grupo)`; `${tabela.id}` em subconsulta correlacionada sem
  join não fica qualificado e casa com a tabela errada — usar `sql.raw('"tabela"."id"')`.
- `<select>` nativo quando value ≠ label exibido.
- A lista de arquivos de teste em `package.json` é explícita: teste novo que não entrar na lista
  nunca roda.

## Testes

Unitários, sem banco, sobre `validarOrigemVenda`: aceita origem ativa sem detalhe quando não
pede; recusa origem ausente; recusa inativa; recusa origem de outro grupo; recusa detalhe vazio
ou só espaços quando pede detalhe. Arquivo `src/lib/origem-venda.test.ts`, acrescentado à lista
do `package.json`.

Verificação manual antes de dar por pronto:

1. Fechar venda direta com origem; conferir no banco.
2. Tentar fechar sem origem — barra no formulário; forçando o payload, barra na action.
3. Fechar venda pelo fluxo de aprovação e confirmar que a origem sobreviveu ao round-trip do
   `dados_venda`.
4. Efetivar um pedido e confirmar que a origem foi gravada pela RPC.
5. Conferir o total da aba nova contra o total de vendas do período no Financeiro.

## Fora de escopo

- Reserva, demanda, venda de peça e OS.
- Origem na ficha do cliente.
- Casar origem da venda com lead do Kommo.
- Verba/CPL por origem de venda (a verba hoje é lançada por funil do Kommo, em
  `marketing_investimento`).
- Campanha como dimensão própria — decisão 8.
