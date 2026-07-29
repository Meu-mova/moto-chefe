# Kommo — leads em negociação sem tarefa agendada

**Data:** 2026-07-29
**Fase:** 4 da integração Kommo (segue `2026-07-28-kommo-atendimento-design.md`)

## Objetivo

Todo funil do Kommo tem as etapas: contato inicial, pré qualificado, qualificado, **tem interesse** e **em negociação**. Lead que chegou nas duas últimas etapas obrigatoriamente precisa ter tarefa de fechamento agendada. Hoje não há nada que cobre isso — lead esfria parado sem próximo passo.

Entregar uma métrica de **cobertura** dessas etapas e uma **mensagem em destaque** que mostre ao vendedor exatamente quais leads dele estão descobertos.

## Decisões (confirmadas com o usuário)

- **Tarefa de fechamento = qualquer tarefa em aberto.** Não depende de tipo/nome de tarefa no Kommo. Tarefa com prazo vencido ainda conta como coberta (o prazo fica guardado para um aperto futuro).
- **Onde:** card em destaque no dashboard do vendedor (só os leads dele) + visão do time inteiro na página Atendimento (gestores).
- **Identificação das etapas:** automática pelo nome. Nome normalizado (minúsculo, sem acento) que contenha `interesse` ou `negocia` é etapa de fechamento. Funil novo entra sozinho; a tela avisa se algum funil ficou sem nenhuma etapa detectada.
- **Conteúdo do card:** contagem + lista dos leads (nome, etapa, valor, dias parado) com link direto pro lead no Kommo.
- **Período:** ignora o filtro de período — é foto do agora (pendência a resolver), não histórico.

## Arquitetura

### Origem dos dados

`GET /api/v4/tasks?filter[is_completed]=0` (paginado, 250/página), mantendo só `entity_type = 'leads'`, gravado numa tabela própria substituída a cada sync. Alternativas descartadas: contador denormalizado em `kommo_leads` (perde prazo/texto e exige zerar todos os leads a cada sync) e derivar de eventos `task_added`/`task_completed` (frágil — tarefa editada, reagendada ou deletada não gera o evento correspondente).

### Schema — migração SQL manual `0035_kommo_fechamento.sql`

Aplicada via Supabase MCP (`apply_migration`). O repo não usa `db:generate`/`db:migrate` — journal do drizzle-kit quebrado.

- `kommo_leads`: `+ nome text` (necessário para listar o lead no card).
- `kommo_stages` (nova): `status_id bigint PK`, `pipeline_id text`, `pipeline_nome text`, `nome text`, `sort int`, `etapa_fechamento boolean not null default false`.
- `kommo_tarefas_abertas` (nova): `id bigint PK`, `lead_id bigint not null`, `kommo_user_id text`, `prazo timestamptz`, `texto text`; índice em `lead_id`.

Espelhado em `src/lib/db/schema.ts`.

### Sync — `src/lib/kommo.ts`

- `sincronizarEtapasKommo()` — `GET /api/v4/leads/pipelines`, upsert do catálogo de funis/etapas em `kommo_stages`. `etapa_fechamento` calculado no sync a partir do nome normalizado.
- `sincronizarTarefasAbertas()` — puxa as tarefas abertas, filtra `entity_type = 'leads'`, apaga e regrava `kommo_tarefas_abertas` (conjunto pequeno; replace-all evita lixo de tarefa concluída/deletada).
- `sincronizarLeadsKommo()` — passa a gravar `nome` do lead no upsert.
- Ambos os novos syncs entram em `sincronizarSeNecessario()`: mesma janela de cache de 15min e mesmo botão "Atualizar agora". Falha neles não pode derrubar o resto do sync.

### Query — `src/lib/queries/atendimento.ts`

`fechamentoSemTarefa(lojaIds, usuarioId?)`:

- Leads cujo `status_id` está numa etapa com `etapa_fechamento = true`, do grupo ativo (join `kommo_user_map` → `usuarios.loja_id in lojaIds`), sem nenhuma linha em `kommo_tarefas_abertas` (`LEFT JOIN ... IS NULL`).
- Sem recorte de período.
- Devolve, por colaborador: `naEtapa`, `semTarefa`, `valorParado`, `cobertura` (= `1 - semTarefa/naEtapa`), e a lista de leads descobertos (id, nome, etapa, valor, dias parado desde `atualizado_em`), ordenada por dias parado desc.
- Com `usuarioId`, restringe ao vendedor (uso no dashboard).

`funisSemEtapaDetectada()`: funis de `kommo_stages` sem nenhuma etapa de fechamento — alimenta o aviso de configuração.

Link do lead: `https://{subdominio}.kommo.com/leads/detail/{leadId}` (subdomínio vem de `getKommoStatus()`).

### UI

- **Dashboard do vendedor** (`src/app/(dashboard)/dashboard/`): componente `AlertaFechamento` em destaque no topo, junto do placar. Com pendências: faixa vermelha/âmbar — "N leads em negociação sem tarefa agendada" + lista com link pro Kommo. Sem pendências: faixa verde discreta — "✓ todos os N leads em negociação têm tarefa" (distingue zerado de não-carregado). Só lê cache, não sincroniza — igual ao placar.
- **Atendimento** (`src/app/(dashboard)/atendimento/page.tsx`): KPI de cobertura do time + seção "Leads sem tarefa de fechamento" agrupada por colaborador, no padrão visual dos blocos de SLA e motivos de perda. Aviso de funil sem etapa detectada aparece aqui.

## Riscos

- **Etapa renomeada no Kommo** deixa de casar pelo nome e a métrica silenciosamente zera. Mitigação: aviso explícito na página Atendimento quando um funil não tem nenhuma etapa de fechamento detectada.
- **Volume de tarefas abertas** cresce com o tempo. A trava de páginas do sync (mesmo padrão dos leads) evita loop infinito; o replace-all mantém a tabela do tamanho do conjunto realmente aberto.
