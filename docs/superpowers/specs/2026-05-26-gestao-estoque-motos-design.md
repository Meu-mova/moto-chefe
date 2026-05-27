# Design: Sistema de Gestão de Estoque — Motos Elétricas

**Data:** 2026-05-26
**Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (PostgreSQL + Auth), Drizzle ORM, TanStack Query

---

## 1. Visão Geral

Sistema web multi-loja para gestão de estoque de motos elétricas. Permite controlar o ciclo completo de cada unidade: da entrada (faturamento) até a venda, passando por montagem, movimentações entre lojas, ordens de serviço e garantias.

**Regra central de acesso:**
- Leitura: todos os usuários veem todas as lojas (exceto dados sensíveis de clientes — ver seção LGPD)
- Escrita (vendas, OS, garantias, transferências): somente usuários da loja onde a moto está localizada
- Admin Geral: bypass total de restrições por loja (ver seção 5)

---

## 2. Arquitetura

Monolito full-stack em um único repositório Next.js 15 com App Router.

```
app/
├── (auth)/              → login, recuperação de senha
├── (dashboard)/         → área autenticada
│   ├── estoque/         → listagem e detalhe de motos
│   ├── transferencias/  → solicitação, aceite e recusa
│   ├── vendas/          → pedido, efetivação e cancelamento
│   ├── ordens-servico/  → abertura e acompanhamento
│   ├── garantias/       → registro e acompanhamento
│   └── admin/           → lojas, usuários, modelos
├── api/                 → rotas server-side (Next.js API Routes)
└── layout.tsx
```

**Autenticação:** Supabase Auth com JWT. RLS (Row Level Security) no PostgreSQL controla acesso por loja para os papéis comuns. Admin Geral usa `security definer` functions ou `service_role` para operações cross-loja — RLS verifica `papel = 'admin_geral'` antes de qualquer restrição de `loja_id`.

**LGPD:** Dados pessoais de clientes (`cliente_cpf`, `cliente_nome`) são armazenados criptografados em repouso via pgcrypto (Supabase). A coluna `cliente_cpf` é mascarada por column-level security — apenas papéis `aux_adm` e `admin_geral` (da loja da venda) enxergam o CPF completo; demais papéis recebem valor mascarado (`***.***.***-**`). Nenhum dado de CPF é retornado em listagens — somente na tela de detalhe da venda com permissão adequada.

---

## 3. Modelo de Dados

### `lojas`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| nome | text | Nome da loja |
| cidade | text | |
| endereco | text | |
| ativa | boolean | |

### `usuarios`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK (vinculado ao Supabase Auth) |
| nome | text | |
| email | text | |
| papel | enum | `admin_geral`, `aux_adm`, `vendedor`, `mecanico` |
| loja_id | uuid | FK → lojas, **nullable** (NULL para `admin_geral`) |

### `modelos`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| marca | text | |
| modelo | text | |
| categoria | enum | `autopropelido`, `ciclomotor` |
| potencia_w | integer | Potência em Watts |
| motor | text | |
| velocidade_max | integer | km/h |

### `motos`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| chassi | text | Único, NOT NULL |
| modelo_id | uuid | FK → modelos |
| loja_id | uuid | FK → lojas (localização atual) |
| status | enum | `faturada`, `montada`, `disponivel`, `reservada`, `em_garantia`, `vendida` |
| cor | text | |
| nota_fiscal_entrada | text | Número da NF de entrada |
| responsavel_montagem_id | uuid | FK → usuarios, nullable |
| data_montagem | date | nullable |

### `pedidos_venda`
Representa o pedido intermediário antes da efetivação. Separa o fluxo de reserva do registro definitivo da venda.

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| moto_id | uuid | FK → motos |
| loja_id | uuid | FK → lojas (loja da moto no momento do pedido) |
| vendedor_id | uuid | FK → usuarios |
| status | enum | `pendente`, `efetivado`, `cancelado` |
| data_pedido | timestamptz | |
| data_atualizacao | timestamptz | |
| observacao | text | nullable |

### `vendas`
Representa apenas vendas **efetivadas**. Criada pelo Aux Adm ao efetivar um `pedido_venda`.

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| pedido_venda_id | uuid | FK → pedidos_venda |
| moto_id | uuid | FK → motos |
| loja_id | uuid | FK → lojas |
| vendedor_id | uuid | FK → usuarios (quem criou o pedido) |
| efetivado_por | uuid | FK → usuarios (Aux Adm ou Admin Geral que efetivou) |
| cliente_nome | text | NOT NULL — armazenado criptografado (pgcrypto) |
| cliente_cpf | text | NOT NULL — armazenado criptografado; mascarado por column security para papéis sem permissão |
| valor | numeric | NOT NULL |
| forma_pagamento | text | NOT NULL |
| data_venda | timestamptz | NOT NULL |

### `transferencias`
Representa o workflow de transferência entre lojas (estado persistente, não apenas log).

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| moto_id | uuid | FK → motos |
| loja_origem_id | uuid | FK → lojas |
| loja_destino_id | uuid | FK → lojas |
| solicitado_por | uuid | FK → usuarios |
| respondido_por | uuid | FK → usuarios, nullable |
| status | enum | `pendente`, `aceita`, `recusada` |
| data_solicitacao | timestamptz | |
| data_resposta | timestamptz | nullable |
| observacao | text | nullable |

### `historico_estoque`
Log imutável de todas as movimentações e mudanças de estado de motos (apenas para auditoria).

| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| moto_id | uuid | FK → motos |
| loja_origem_id | uuid | FK → lojas, nullable |
| loja_destino_id | uuid | FK → lojas, nullable |
| usuario_id | uuid | FK → usuarios |
| tipo | enum | `entrada`, `saida`, `transferencia_enviada`, `transferencia_recebida`, `mudanca_status` |
| status_anterior | enum (motos.status) | nullable — preenchido quando tipo = `mudanca_status` |
| status_novo | enum (motos.status) | nullable — preenchido quando tipo = `mudanca_status` |
| referencia_tipo | enum | nullable — `transferencia` ou `pedido_venda` |
| referencia_id | uuid | nullable — id do registro em `transferencias` ou `pedidos_venda` |
| data | timestamptz | |
| observacao | text | nullable |

### `ordens_servico`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| moto_id | uuid | FK → motos |
| loja_id | uuid | FK → lojas |
| aberta_por | uuid | FK → usuarios |
| mecanico_id | uuid | FK → usuarios, nullable (mecânico principal) |
| status | enum | `aberta`, `em_andamento`, `concluida` |
| descricao | text | |
| data_abertura | timestamptz | |
| data_conclusao | timestamptz | nullable |

### `garantias`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| moto_id | uuid | FK → motos |
| loja_id | uuid | FK → lojas (loja da moto no momento da abertura) |
| os_id | uuid | FK → ordens_servico, nullable |
| descricao | text | |
| data_inicio | date | |
| data_fim | date | |
| status | enum | `ativa`, `encerrada` |
| data_pedido_peca | date | nullable |
| numero_pedido_fabrica | text | nullable |

**Constraint:** apenas uma garantia com `status = 'ativa'` por moto é permitida (`UNIQUE(moto_id) WHERE status = 'ativa'`). Para abrir segunda garantia, a anterior deve ser encerrada primeiro.

**RLS em `garantias`:** a policy verifica `garantias.loja_id = usuarios.loja_id` para operações de escrita (Aux Adm). Não requer join por `motos`.

---

## 4. Telas e Navegação

**Layout:** sidebar lateral fixa + header com loja e usuário logado.

### Dashboard (home)
- Cards de resumo: total de motos por status e por loja
- Tabela/grid de motos com filtros: status, loja, modelo, categoria
- Acesso ao detalhe de cada moto

### Detalhe da Moto
- Dados do modelo e características
- Status atual + botão de alterar status (Aux Adm) — apenas transições permitidas são exibidas
- Botão de correção de status (Admin Geral) — permite transições de retrocesso para corrigir erros
- Abas:
  - **Histórico** — movimentações e mudanças de status com auditoria completa
  - **Ordens de Serviço** — lista e abertura
  - **Garantias** — lista e abertura
  - **Dados da Venda** — quando vendida (exibe pedido e venda; CPF mascarado para Vendedor/Mecânico)

### Transferências
- Vendedor/Aux Adm: solicitar transferência — apenas para motos da **sua própria loja**
- Lista de transferências pendentes separada por: "Aguardando resposta" (solicitadas por mim) e "Para aceitar" (destinadas à minha loja)
- Aux Adm da loja destino: aceitar ou recusar com observação

### Vendas
- Vendedor: criar pedido de venda para moto `disponivel` → status da moto vai para `reservada`
- Lista de pedidos pendentes visível para Aux Adm da loja da moto
- Aux Adm: efetivar pedido (preenche dados do cliente e pagamento → cria registro em `vendas` → status `vendida`)
- Aux Adm da loja da moto ou Vendedor original (apenas se moto ainda na mesma loja): cancelar pedido pendente → status da moto volta para `disponivel`

### Ordens de Serviço
- Aux Adm: abre OS vinculada a uma moto da sua loja, atribui mecânico
- Mecânico: visualiza fila das OS da sua loja, atualiza status
- Histórico de OS acessível no detalhe da moto

### Garantias
- Aux Adm: abre garantia vinculada a moto da sua loja (e opcionalmente a uma OS)
- Garantia pode ser aberta para motos com status `faturada`, `montada`, `disponivel` ou `em_garantia`
- Ao abrir garantia em moto não `em_garantia`: status muda para `em_garantia` automaticamente
- Registra número do pedido na fábrica e data do pedido da peça
- Ao encerrar garantia: status da moto muda automaticamente para `disponivel` (via transição da máquina de estados)

### Admin (Admin Geral)
- CRUD de lojas (desativação bloqueada se loja tem motos ativas ou usuários ativos)
- CRUD de usuários e papéis
- CRUD de modelos de moto
- Correção de status de moto (transições de retrocesso para admin)
- Reatribuição de loja de moto `faturada` — permite corrigir `loja_id` de motos em status `faturada` que foram cadastradas na loja errada (ação exclusiva do Admin Geral, gera registro em `historico_estoque`)
- Encerramento forçado de garantia ativa (ver regras de Garantia)

---

## 5. Controle de Acesso

**Admin Geral:** `loja_id = NULL`. RLS verifica `papel = 'admin_geral'` e concede acesso irrestrito a todas as operações via policy separada. Não está sujeito às restrições de loja das demais regras abaixo.

| Ação | Admin Geral | Aux Adm | Vendedor | Mecânico |
|---|---|---|---|---|
| Ver estoque (todas as lojas) | ✅ | ✅ | ✅ | ✅ |
| Ver CPF completo do cliente | ✅ | ✅ (só sua loja) | ❌ (mascarado) | ❌ (mascarado) |
| Alterar status da moto (frente) | ✅ | ✅ (só sua loja) | ❌ | ❌ |
| Corrigir status (retrocesso) | ✅ | ❌ | ❌ | ❌ |
| Solicitar transferência | ✅ | ✅ (só sua loja) | ✅ (só sua loja) | ❌ |
| Aceitar/recusar transferência | ✅ | ✅ (só loja destino) | ❌ | ❌ |
| Criar pedido de venda | ✅ | ✅ | ✅ | ❌ |
| Cancelar pedido de venda | ✅ | ✅ (só sua loja) | ✅ (próprios, só sua loja) | ❌ |
| Efetivar venda | ✅ | ✅ (só sua loja) | ❌ | ❌ |
| Abrir OS | ✅ | ✅ (só sua loja) | ❌ | ❌ |
| Atualizar status OS | ✅ | ✅ (só sua loja) | ❌ | ✅ (só sua loja) |
| Abrir/encerrar garantia | ✅ | ✅ (só sua loja) | ❌ | ❌ |
| Encerrar garantia (forçado) | ✅ | ❌ | ❌ | ❌ |
| Reatribuir loja de moto faturada | ✅ | ❌ | ❌ | ❌ |
| Gerenciar lojas/usuários/modelos | ✅ | ❌ | ❌ | ❌ |

---

## 6. Máquina de Estados — Status da Moto

### Transições normais (Aux Adm da loja da moto)

```
faturada    → montada        (Aux Adm — após montagem concluída)
faturada    → em_garantia    (Aux Adm — defeito de fábrica antes da montagem)
montada     → disponivel     (Aux Adm — moto pronta para venda)
montada     → em_garantia    (Aux Adm — defeito detectado na montagem)
disponivel  → reservada      (sistema — ao criar pedido de venda)
disponivel  → em_garantia    (Aux Adm — garantia aberta em moto disponível)
reservada   → disponivel     (sistema — ao cancelar pedido de venda)
reservada   → vendida        (sistema — ao efetivar venda)
reservada   → em_garantia    ❌ proibido (cancelar reserva primeiro)
em_garantia → disponivel     (sistema — ao encerrar garantia)
em_garantia → vendida        ❌ proibido
vendida     → qualquer       ❌ proibido (status final imutável)
```

### Transições de correção (Admin Geral apenas)

Usadas para corrigir erros operacionais. Toda correção gera registro em `historico_estoque` com `tipo = 'mudanca_status'`, `status_anterior`, `status_novo` e `observacao` obrigatória.

```
montada     → faturada       (Admin Geral — correção de status aplicado por engano)
disponivel  → montada        (Admin Geral — correção de status aplicado por engano)
em_garantia → montada        (Admin Geral — garantia aberta por engano em moto não disponivel; pré-condição: garantia ativa deve ser encerrada antes ou o RPC encerra automaticamente com observacao obrigatória)
```

A UI exibe apenas os botões de transição permitidos para o status atual e papel do usuário. O backend valida a transição antes de persistir.

---

## 7. Regras de Negócio

### Pedido de Venda
- Pedido só pode ser criado para moto com status `disponivel`
- Moto não pode ter transferência `pendente` no momento da criação do pedido (verificação atômica junto ao SELECT FOR UPDATE)
- Ao criar pedido: status da moto muda para `reservada` atomicamente (SELECT FOR UPDATE via Supabase RPC para evitar condição de corrida)
- Pedido pode ser cancelado enquanto `pendente`:
  - Aux Adm da loja da moto: pode cancelar qualquer pedido pendente da sua loja
  - Vendedor original: pode cancelar seu próprio pedido **somente se seu `loja_id` ainda coincide com o `loja_id` da moto**
  - Ao cancelar: moto volta para `disponivel`, pedido fica `cancelado`, gera registro em `historico_estoque`
- Ao efetivar: cria registro em `vendas`, pedido fica `efetivado`, moto vai para `vendida`
- Apenas um pedido `pendente` por moto (constraint: `UNIQUE(moto_id) WHERE status = 'pendente'`)

### Transferência
- Transferência só pode ser solicitada para motos com status `disponivel` ou `montada` — status `em_garantia`, `reservada`, `faturada` e `vendida` são **explicitamente proibidos para todos os papéis, incluindo Admin Geral** (regra de negócio, não apenas RLS)
- **O solicitante deve pertencer à loja de origem da moto** (`usuarios.loja_id = motos.loja_id`), exceto Admin Geral
- Moto não pode ter `pedido_venda` com status `pendente` no momento da solicitação (verificação atômica)
- Moto não pode ter OS com status `aberta` ou `em_andamento` no momento da solicitação — a transferência é bloqueada até todas as OS estarem `concluida`
- Ao solicitar: cria registro em `transferencias` com status `pendente` — `loja_id` da moto **não muda** ainda
- Ao aceitar: apenas `loja_id` da moto muda para a loja destino — **o status da moto é preservado exatamente como estava na origem** (moto `montada` chega `montada` na destino). Cria dois registros em `historico_estoque` (`transferencia_enviada` na origem, `transferencia_recebida` no destino, ambos com `referencia_tipo = 'transferencia'` e `referencia_id = transferencias.id`), transferencia fica `aceita`
- Ao recusar: `loja_id` e status da moto **não mudam**, transferencia fica `recusada` — moto permanece disponível na origem
- Apenas uma transferência `pendente` por moto (constraint: `UNIQUE(moto_id) WHERE status = 'pendente'`)

### Ordem de Serviço
- OS só pode ser aberta para motos na loja do Aux Adm que a abre
- Aux Adm pode atualizar status apenas de OS da sua loja (`usuarios.loja_id = ordens_servico.loja_id`) — pode fazer qualquer transição (`aberta→em_andamento`, `em_andamento→concluida`)
- Mecânico pode atualizar status apenas de OS da sua loja (`usuarios.loja_id = ordens_servico.loja_id`) — pode fazer qualquer transição (`aberta→em_andamento`, `em_andamento→concluida`)
- `mecanico_id` é o mecânico principal responsável; uma OS tem apenas um responsável
- Concluir uma OS não muda automaticamente o status da moto — o encerramento da `garantia` vinculada (se houver) é que dispara a mudança

### Garantia
- Pode existir com ou sem OS vinculada
- Apenas uma garantia `ativa` por moto é permitida (`UNIQUE(moto_id) WHERE status = 'ativa'`)
- `data_fim` deve ser maior que `data_inicio` (validação no backend na criação e edição)
- Ao abrir garantia: se moto não está `em_garantia`, o sistema muda status automaticamente para `em_garantia` via transição da máquina de estados
- Ao encerrar garantia (fluxo normal): se a garantia possui OS vinculada (`os_id` preenchido), a OS deve estar com status `concluida` — caso contrário, o encerramento é bloqueado. Ao encerrar: sistema muda status da moto automaticamente para `disponivel` (via RPC atômica)
- **Expiração automática:** uma Supabase Edge Function agendada (pg_cron, diária) encerra automaticamente garantias com `data_fim < now()` e `status = 'ativa'`, movendo o status da moto para `disponivel`. Gera registro em `historico_estoque` com `observacao = 'Encerramento automático por expiração de data_fim'`
- **Encerramento forçado (Admin Geral):** Admin Geral pode encerrar qualquer garantia ativa independentemente do status da OS vinculada, com `observacao` obrigatória. Útil para corrigir garantias abertas por engano ou expiradas sem encerramento automático
- Para abrir segunda garantia (ex: problema diferente), a garantia anterior deve ser encerrada primeiro
- `loja_id` da garantia é preenchido com `motos.loja_id` no momento da abertura; o RLS de `garantias` usa este campo diretamente

### Auditoria (historico_estoque)
- Toda mudança de status de moto (normal ou de correção) gera registro com `tipo = 'mudanca_status'`, `status_anterior`, `status_novo`, `usuario_id` e `data`
- Toda movimentação física (entrada, saída, transferência) gera registro com o `tipo` correspondente
- Registros com `referencia_id` devem sempre ter `referencia_tipo` preenchido (validação no backend)
- O log é imutável — nenhuma operação de DELETE ou UPDATE é permitida nesta tabela

### Loja
- Loja não pode ser desativada (`ativa = false`) se houver motos com `loja_id` apontando para ela com status diferente de `vendida`
- Loja não pode ser desativada se houver usuários com `loja_id` apontando para ela
- Bloqueio é validado no backend antes de persistir a desativação

### Concorrência
- Operações que alteram status de moto (criar pedido, aceitar transferência, abrir/encerrar garantia) usam transação atômica com `SELECT FOR UPDATE` via Supabase RPC (`SECURITY DEFINER`) para evitar que dois usuários simultâneos alterem o mesmo registro

---

## 8. Stack Técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + TypeScript |
| Estilo | Tailwind CSS v4 + shadcn/ui |
| Banco | PostgreSQL via Supabase |
| ORM | Drizzle ORM |
| Auth | Supabase Auth (JWT + RLS) |
| Criptografia | pgcrypto (Supabase) para dados pessoais |
| Jobs agendados | pg_cron via Supabase (expiração de garantias) |
| Data fetching | TanStack Query |
| Deploy | Vercel (frontend) + Supabase (banco/auth) |
