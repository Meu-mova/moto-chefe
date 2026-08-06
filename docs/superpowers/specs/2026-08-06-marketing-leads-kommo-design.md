# Relatório de Marketing — leads de entrada do Kommo

Data: 2026-08-06
Status: aprovado pelo Cesar (decisões abaixo), implementação autorizada na mesma sessão

## Problema

O marketing investe em anúncio e não tem número para julgar o resultado. A tela `/atendimento`
existe, mas é de **gestão de vendedor**: agrupa por colaborador, mede SLA e cobrança de tarefa.
Ela responde "quem atende bem", não "qual canal traz lead e a que custo".

Pior: para marketing ela **subconta a entrada**. O grupo é derivado do vendedor responsável
(`kommo_user_map → usuarios.loja_id`), então todo lead de funil sem vendedor cadastrado no Mova
some. Em jul+ago/2026 isso são 1.133 leads de Pinda e Taubaté mais parte de Itajubá — ~13% da
entrada invisível.

## O que a conta Kommo tem de verdade (apurado na API, 2026-08-06)

Conta `motochefebrasil`, 40.562 leads desde out/2024.

| Dado | Situação |
|---|---|
| `pipeline_id` (funil) | preenchido em **100%** dos leads; um funil por cidade |
| `source_id` (canal) | preenchido em **94%** da amostra recente; **não é sincronizado hoje** |
| UTM (`utm_source`, `utm_campaign`, …) | campos existem, **vazios em 750 leads seguidos** |
| Tags | texto livre e poluído (preço, cidade, nome de vendedor) |
| `loss_reason_id` | já sincronizado, com catálogo |

**Consequência que define o escopo:** dá para medir **canal e perfil**, não dá para medir
**campanha individual**. Sem UTM não existe o dado — nenhum código o inventa. Ligar UTM no gerador
de leads do Meta (ou a integração de anúncios do Kommo) é ajuste lá, e o relatório absorve depois
sem retrabalho.

### Como o canal é recuperado

A API não dá o nome do canal direto — `/api/v4/sources` responde 204 porque só lista sources da
própria integração. Duas rotas resolvem, e as duas foram testadas nesta conta:

- `/api/v4/talks` → `source_id` + `origin` (`com.amocrm.amocrmwa`, `instagram_business`,
  `facebook`). Cobre os canais de maior volume.
- `/api/v4/leads/unsorted` → `metadata.service` + `metadata.source_name`, que é o **perfil**:
  `motochefeitajuba`, `motochefepocos`, `motochefevarginha`, `motochefelavras`,
  `EcoMov - Mobilidade Elétrica`, `Motochefe Poços de Caldas`, e o número do WhatsApp.

O que nenhuma das duas nomear fica como "Canal 57985" numa tela do Admin, onde o Cesar batiza.
Nunca se inventa nome.

## Decisões tomadas (com o Cesar)

1. **Página no sistema**, `/marketing` — não relatório imprimível avulso.
2. **Grupo vem do funil**, não do vendedor. É o que conta a entrada inteira.
3. **Pinda e Taubaté são o grupo Vale** (já existe, loja Motochefe Pinda).
4. **Canal + perfil nomeado**, não só o tipo de canal.
5. **Investimento em mídia entra nesta entrega** — sem custo não se julga campanha.
6. Funis soltos (`Funil de vendas`, `MATRIZ`, `SDR`) → **Sul de Minas**.

## Modelo de dados

### `kommo_leads.source_id` (coluna nova)

```sql
alter table kommo_leads add column source_id bigint;
create index kommo_leads_source_id_idx on kommo_leads (source_id);
```

O sync passa a pedir `with=source_id` (sem isso a API não devolve o campo). O histórico exige um
backfill único varrendo os 40k leads — script dedicado, não no caminho do request.

### `kommo_sources` — catálogo de canal

```sql
create table kommo_sources (
  source_id  bigint primary key,
  origem     text,          -- com.amocrm.amocrmwa | instagram_business | facebook | ...
  perfil     text,          -- motochefepocos, "Motochefe Poços de Caldas", 553599884773
  nome       text,          -- rótulo manual; vence o automático quando preenchido
  atualizado_em timestamptz not null default now()
);
```

`origem` e `perfil` são reescritos pelo sync; `nome` **nunca** é tocado pelo sync — é do humano.

### `kommo_pipeline_grupo` — funil → grupo

```sql
create table kommo_pipeline_grupo (
  pipeline_id text primary key,
  grupo_id    uuid references grupos(id) on delete set null,
  atualizado_em timestamptz not null default now()
);
```

Seed conforme a decisão 6. Funil novo que aparecer no Kommo nasce sem grupo e cai no aviso de
"funil não classificado" da página — buraco visível em vez de lead sumindo em silêncio.

### `marketing_investimento` — verba

```sql
create table marketing_investimento (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references grupos(id),
  mes         date not null,          -- sempre dia 1
  pipeline_id text,                   -- null = verba do grupo, sem loja definida
  plataforma  text not null,          -- Meta Ads, Google Ads, ...
  valor       numeric(12,2) not null default 0,
  observacao  text,
  criado_em   timestamptz not null default now()
);
create unique index marketing_investimento_unq
  on marketing_investimento (grupo_id, mes, coalesce(pipeline_id,''), plataforma);
```

`grupo_id` é redundante com `pipeline_id` de propósito: permite lançar verba do grupo inteiro sem
amarrar a uma loja, e mantém o escopo por grupo mesmo se o mapa de funil mudar depois.

## Regras de cálculo (as que mudam o número na tela)

**Conversão por coorte.** Dos leads que *entraram* no período, quantos já foram ganhos. É assim que
se julga campanha. Difere da tela de Atendimento de propósito — lá são coortes distintas (leads
criados no período × vendas fechadas no período). Como venda de moto demora, o mês corrente ainda
amadurece: a página avisa em texto, não deixa parecer queda.

**CPL confiável é por loja, não por plataforma.** Anúncio click-to-WhatsApp do Meta chega no Kommo
como WhatsApp, não como Facebook — dividir verba do Meta pelos leads de Instagram daria número
falso. Então:

- CPL, CAC e ROAS saem no nível de **grupo** e de **loja/funil**: verba ÷ leads de entrada,
  verba ÷ ganhos, faturamento ganho ÷ verba.
- Por canal sai **volume, conversão e faturamento** — sem CPL. A composição da verba por plataforma
  aparece ao lado, com a ressalva escrita na página.

**Faturamento** é `price` do lead ganho, com a mesma ressalva que já existe em `/atendimento`:
ganho sem valor preenchido subestima o total, e isso é sinalizado.

## Página `/marketing`

Escopada pelo grupo ativo. Papéis `admin_geral`, `admin_socio`, `aux_adm` (mesma régua de
`/atendimento`), item no sidebar para os três. Filtro de período, mês corrente por padrão,
com comparação contra o período anterior de mesma duração.

1. **KPIs** — Leads de entrada · Ganhos · Conversão · Faturamento · CPL · CAC · ROAS, cada um com
   variação vs. período anterior.
2. **Cobertura da atribuição** — % dos leads com canal identificado e aviso de funil não
   classificado. Vem antes de tudo: sem isso o resto engana.
3. **Entrada por canal/perfil** — leads, % do total, ganhos, conversão, ticket, faturamento.
4. **Entrada por loja/funil** — o mesmo, mais verba, CPL, CAC e ROAS.
5. **Evolução** — leads por dia; por mês quando o período passa de 60 dias.
6. **Quando o lead chega** — dia da semana × faixa de hora, para ajustar veiculação e plantão.
7. **Onde a verba vaza** — por canal: % de lead sem resposta e principais motivos de perda.

## Admin

- `/admin/canais` — três abas: **Canais** (batizar `source_id` sem nome), **Funis** (mapear funil →
  grupo) e **Investimento** (lançar verba por mês/loja/plataforma, do grupo ativo).
- Card novo na grade de `/admin`.

## Sync

`sincronizarSeNecessario` ganha `sincronizarCanaisKommo()` — lê `/talks` e `/unsorted` e faz upsert
em `kommo_sources` sem tocar em `nome`. É barato (2 chamadas) e roda junto do resto. Falha dele não
derruba o sync, no mesmo padrão dos outros catálogos.

Backfill do `source_id`: `scripts/backfill-kommo-source.ts`, varredura única por páginas de 250.

## Testes

`node --test` com lista explícita em `package.json` — todo arquivo novo tem de entrar na lista,
senão nunca roda.

`src/lib/marketing-canal.ts` concentra as regras puras e é o que se testa sem banco:
`rotuloCanal` (nome manual > perfil > origem > "Canal {id}"), `nomeOrigem` (tradução dos códigos da
API), `calcularCpl/Cac/Roas` (divisão por zero devolve `null`, nunca `Infinity` nem `0`) e
`variacaoPct`.

Cuidados conhecidos deste repo, os dois já cobrados em produção: nunca passar `Date` cru dentro de
`sql` (o postgres.js com `prepare:false` estoura em runtime e o `tsc` não pega — usar string ISO), e
qualificar id em subconsulta correlacionada.

## Fora de escopo

- **Campanha individual / UTM** — o dado não existe na conta. Depende de ajuste no Meta ou no Kommo.
- **Cruzar lead do Kommo com venda do Mova** — projeto próprio, como já registrado no spec de origem
  do cliente (2026-07-29).
- **Tags do Kommo** como dimensão — poluídas demais.
- **Origem do cliente na venda** (`origens_cliente`) — spec separado, ainda não implementado. Quando
  entrar, vira a checagem cruzada do que o Kommo diz.
