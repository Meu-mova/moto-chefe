# 0007. Multi-tenant por CNPJ (`grupo_id`)

- **Status:** Aceita; revisada por [0018](0018-conta-acima-do-grupo.md) (nível Conta acima do grupo)
- **Data da decisão:** 2026-07-01
- **Fontes:** `docs/superpowers/specs/2026-07-01-multi-grupo-design.md`,
  `docs/superpowers/specs/2026-07-01-integracoes-por-grupo-pix-conciliacao-design.md`,
  `AGENTS.md` ("Multi-grupo e permissões"), `src/lib/grupo.ts`

## Contexto

O sistema nasceu para o Grupo Motochefe Sul de Minas. A abertura da Motochefe BH, com CNPJ,
lojas e integrações próprias (na época Bling, ValidaPix e fábrica), exigiu que as duas operações
convivessem com dados isolados. Hoje são três grupos: Sul de Minas, BH e Vale.

## Decisão

- Um só sistema, um só banco e um só login. Cada operação é um **grupo** (`grupos`).
- As tabelas que já tinham `loja_id` (vendas, motos, OS, garantias…) derivam o grupo pela loja
  (`loja → grupo`); `grupo_id` foi para `lojas` e para as tabelas sem loja (spec).
- Tabela nova nasce com `grupo_id not null references grupos(id)` (`AGENTS.md`).
- Funcionário vê o grupo da sua loja; `admin_geral` e `admin_socio` trocam de grupo pelo
  seletor no topo.
- Toda funcionalidade nova nasce separada por grupo: consultas filtradas por `getGrupoAtivo()`
  ou `listarLojaIdsDoGrupoAtivo()`, configuração e credencial por grupo no banco, nunca env var
  global.
- Permissão de venda, OS ou peça é avaliada no **grupo da loja do registro**, não no grupo
  ativo da sessão.

## Por quê

Isolar os dados de cada CNPJ sem multiplicar instâncias, deploys e bancos. Os dados que já
existiam passaram a ser do grupo Sul de Minas, sem migração manual (spec).

## Alternativas descartadas

Não registradas nas specs.

## Quando revisar

Se um grupo precisar de isolamento físico (banco próprio) por exigência legal ou contratual.
Pendência relacionada: o RLS do banco ainda não separa por grupo; a separação hoje é feita
pelas consultas do app (issue #16, "Etapa 1").
