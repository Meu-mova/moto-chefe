# Navegação por categorias e permissão no cadastro do usuário

Data: 2026-08-29

## Contexto

O menu cresceu junto com o sistema e hoje é uma lista plana de 26 itens em
`src/components/layout/sidebar.tsx`, na ordem em que as coisas foram construídas.
Quatro problemas concretos:

1. **Cinco módulos não têm item de menu**: `/financeiro`, `/despesas`, `/compras`,
   `/folha-pagamento` e `/precificacao`. Só se chega neles pelo grid de cards do
   `/admin`.
2. **O `/admin` virou um segundo menu escondido**, com 17 sub-páginas, misturando
   cadastro (lojas, bancos, modelos) com operação (DRE, metas, comunicados).
3. **A permissão está copiada inline no sidebar**: `['admin_geral','admin_socio','aux_adm']`
   aparece literal 8 vezes. Não há fonte única — e a regra do menu pode discordar
   da regra da página sem ninguém notar.
4. **O sidebar ignora `papeisExtras`**: recebe `papel: string` e compara direto, em
   vez de usar `temPapel()` como o schema manda. Tiago Souza Gomes é `aux_adm` com
   `vendedor` nos extras e o menu não sabe disso.

Achados durante o levantamento, que entram como correção nesta entrega:

- **`/compras` não tem guarda nenhuma** (`compras/page.tsx:118` usa o papel só pra
  variar a tela). Está protegido apenas por não ter link no menu.
- **`/simulador` é link morto pro mecânico**: aparece no menu dele e a página o
  expulsa (`simulador/page.tsx:14`).
- Os redirects de acesso negado divergem: uns mandam pra `/estoque`, outros pra
  `/dashboard`.

## Objetivo

Sidebar enxuto com hubs por área do negócio, uma fonte única de "quem vê o quê",
e a permissão de cada pessoa editável no cadastro do usuário — para que cadastrar
gente nova seja escolher o papel e ajustar o que for diferente.

## Decisões (confirmadas com o usuário)

1. **Formato**: menu enxuto + página-hub por área (não accordion, não seções).
2. **Eixo**: categorias por área do negócio, iguais para todos os papéis — cada um
   vê os itens que pode. Não é menu por papel.
3. **Acesso**: tabela no código define o padrão por papel; o cadastro do usuário
   guarda a **diferença** (liberado a mais / bloqueado a menos).
4. **O papel continua vivo**: módulo novo adicionado ao papel aparece sozinho para
   todos daquele papel. O cadastro não é foto.
5. **Hubs em `/areas/<slug>`**. Nenhuma URL de módulo muda.
6. **Menu do mecânico enxugado** para Dashboard, Ordens de Serviço, Agenda,
   Garantias e Peças — no sidebar isso vira três linhas: Dashboard e Ordens de
   Serviço soltos, e Agenda, Garantias e Peças dentro do hub Oficina.
7. **Despesas, Financeiro, Folha e Precificação continuam admin+sócio.** O aux_adm
   não ganha acesso nesta entrega; se precisar, libera-se caso a caso no cadastro.

## As seis categorias

| slug | nome | itens |
|---|---|---|
| `comercial` | Comercial | Vendas, Demandas, Clientes, Atendimento, Marketing, Simulador, RADAR |
| `oficina` | Oficina | Ordens de Serviço, Agenda, Garantias, Serviços, Montagens, Peças, Retirada de Peças |
| `estoque` | Estoque & Fábrica | Showroom, Entrada, Transferências, Precificação, Compras, Relatório Fábrica |
| `financeiro` | Financeiro | Caixa, PIX, Conciliação, Despesas, Financeiro, DRE, Folha de Pagamento |
| `gestao` | Gestão | Metas, Calendário, Comunicados, Histórico de Veículos, Ações |
| `configuracao` | Configuração | Lojas, Grupos, Usuários, Dados de Funcionários, Modelos, Categorias de Caixa, Bancos, Categorias de Calendário, Canais, Origens, Kommo, Bling |

Itens marcados `destaque` aparecem **também** soltos no topo do sidebar: Dashboard,
Showroom, Vendas e Ordens de Serviço. O hub mostra a área inteira, incluindo o item
em destaque — quem entra em "Oficina" precisa achar a OS lá.

**Categoria que sobrou com um item só vira link direto**, sem hub. Para o vendedor,
"Financeiro" é só PIX: o sidebar mostra "PIX".

## A tabela de navegação — `src/lib/navegacao.ts`

Fonte única lida pelo sidebar, pelos hubs e pela guarda de rota.

```ts
export type Slug = 'comercial' | 'oficina' | 'estoque' | 'financeiro' | 'gestao' | 'configuracao'

export type ItemNav = {
  id: string           // chave estável usada em modulos_extras/bloqueados
  href: string
  label: string
  icon: LucideIcon
  categoria: Slug | null   // null = só destaque, sem hub (Dashboard)
  papeis: Papel[]      // padrão do papel
  destaque?: true      // também solto no sidebar
  regraPropria?: true  // permissão não sai da tabela (só /entrada)
}
```

`id` é a chave gravada no banco, e **não** o `href` — assim mover uma página não
invalida a permissão de ninguém.

Atalhos de papel usados na tabela:

```
SUPER     = admin_geral
ADMINS    = admin_geral, admin_socio
GESTORES  = ADMINS + aux_adm
COMERCIAL = GESTORES + vendedor
TODOS     = COMERCIAL + mecanico
```

### Tabela completa (a regra de hoje, item por item)

| id | href | categoria | papéis | origem da regra hoje |
|---|---|---|---|---|
| `dashboard` | `/dashboard` | — (destaque) | TODOS | base do sidebar |
| `showroom` | `/estoque` | estoque (destaque) | COMERCIAL | base; **tira mecânico** |
| `vendas` | `/vendas` | comercial (destaque) | COMERCIAL | base; **tira mecânico** |
| `ordens-servico` | `/ordens-servico` | oficina (destaque) | TODOS | base |
| `demandas` | `/demandas` | comercial | COMERCIAL | sidebar: `papel !== 'mecanico'` |
| `clientes` | `/clientes` | comercial | COMERCIAL | sidebar |
| `atendimento` | `/atendimento` | comercial | GESTORES | `atendimento/page.tsx:25` |
| `marketing` | `/marketing` | comercial | GESTORES | `marketing/page.tsx:60` |
| `simulador` | `/simulador` | comercial | COMERCIAL | `simulador/page.tsx:14` bloqueia mecânico |
| `radar` | `/radar` | comercial | COMERCIAL | base; **tira mecânico** |
| `agenda` | `/agenda` | oficina | TODOS | base |
| `garantias` | `/garantias` | oficina | TODOS | base |
| `servicos` | `/servicos` | oficina | GESTORES | `servicos/page.tsx:16` |
| `montagens` | `/montagens` | oficina | GESTORES | `montagens/page.tsx:22` |
| `pecas` | `/pecas` | oficina | TODOS | `pecas/page.tsx:22` era COMERCIAL; **soma mecânico** |
| `pecas-fabrica` | `/pecas-fabrica` | oficina | GESTORES | `pecas-fabrica/page.tsx:9` |
| `entrada` | `/entrada` | estoque | `regraPropria` | `podeRegistrarEntradaMotos` (por e-mail) |
| `transferencias` | `/transferencias` | estoque | COMERCIAL | base; **tira mecânico** |
| `precificacao` | `/precificacao` | estoque | ADMINS | `precificacao/page.tsx:13` |
| `compras` | `/compras` | estoque | ADMINS | **hoje sem guarda**; ganha uma |
| `relatorio-fabrica` | `/relatorio-fabrica` | estoque | GESTORES | `relatorio-fabrica/page.tsx:17` |
| `caixa` | `/caixa` | financeiro | GESTORES | `caixa/page.tsx:17` |
| `pix` | `/pix-mcp` | financeiro | COMERCIAL | `pix-mcp/page.tsx:51` |
| `conciliacao` | `/conciliacao` | financeiro | GESTORES | `conciliacao/page.tsx:26` |
| `despesas` | `/despesas` | financeiro | ADMINS | `despesas/page.tsx:29` |
| `financeiro` | `/financeiro` | financeiro | ADMINS | `financeiro/page.tsx:28` |
| `dre` | `/admin/dre` | financeiro | ADMINS | `admin/dre/page.tsx:31` |
| `folha` | `/folha-pagamento` | financeiro | ADMINS | `folha-pagamento/page.tsx:45` |
| `metas` | `/admin/metas` | gestao | GESTORES | `admin/metas/page.tsx:27` |
| `calendario` | `/calendario` | gestao | COMERCIAL | base; **tira mecânico** |
| `comunicados` | `/admin/comunicados` | gestao | ADMINS | AdminGuard |
| `veiculos-historico` | `/admin/veiculos-historico` | gestao | ADMINS | `admin/veiculos-historico:10` |
| `acoes` | `/admin/acoes` | gestao | SUPER | SuperAdminGuard |
| `lojas` | `/admin/lojas` | configuracao | ADMINS | AdminGuard |
| `grupos` | `/admin/grupos` | configuracao | SUPER | SuperAdminGuard |
| `usuarios` | `/admin/usuarios` | configuracao | SUPER | SuperAdminGuard |
| `dados-funcionarios` | `/admin/dados-funcionarios` | configuracao | ADMINS | AdminGuard |
| `modelos` | `/admin/modelos` | configuracao | ADMINS | AdminGuard |
| `categorias-caixa` | `/admin/categorias-caixa` | configuracao | ADMINS | AdminGuard |
| `bancos` | `/admin/bancos` | configuracao | ADMINS | AdminGuard |
| `calendario-categorias` | `/admin/calendario-categorias` | configuracao | ADMINS | AdminGuard |
| `canais` | `/admin/canais` | configuracao | GESTORES | `admin/canais/page.tsx:20` |
| `origens` | `/admin/origens` | configuracao | GESTORES | `admin/origens/page.tsx:12` |
| `kommo` | `/admin/kommo` | configuracao | ADMINS | AdminGuard |
| `bling` | `/admin/bling` | configuracao | ADMINS | AdminGuard |

**Mudanças de permissão nesta entrega** (tudo o mais é cópia fiel do que já vale):

- `showroom`, `vendas`, `radar`, `transferencias`, `calendario`: **saem do mecânico**
  (enxugamento aprovado).
- `pecas`: **entra pro mecânico** — é a única permissão adicionada. Hoje a página o
  expulsa; passa a deixar entrar.
- `compras`: ganha guarda `ADMINS`, que é o que a tela já pressupõe.
- `simulador`: sai do menu do mecânico, resolvendo o link morto. A regra da página
  não muda.

O link **Conecta** continua fora da tabela: é URL por usuário (`usuarios.conecta`),
não módulo. Segue no rodapé do sidebar.

## Permissão no cadastro do usuário

### Schema

Migração SQL manual (`scripts/sql.ts`), no molde do `papeis_extras` que já existe:

```sql
ALTER TABLE usuarios
  ADD COLUMN modulos_extras     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN modulos_bloqueados text[] NOT NULL DEFAULT '{}';
```

Guardam `id` de item, não `href`. Ambas nascem vazias — no dia do deploy ninguém
muda de acesso, porque todo mundo fica só com o padrão do papel.

### A regra

```ts
itensVisiveis(usuario): ItemNav[]
podeAcessar(usuario, href): boolean
```

Um item é visível quando:

```
(item.papeis satisfeito via temPapel(usuario)  OU  item.id ∈ modulos_extras)
E  item.id ∉ modulos_bloqueados
```

`temPapel()` — não `usuario.papel` — é o que conserta o furo do `papeisExtras`.

`regraPropria` (só `/entrada`) não passa pela tabela: o item consulta
`podeRegistrarEntradaMotos(usuario)`. Regra por e-mail não cabe em tabela de papel,
e espremer ela ali só esconderia a exceção.

### A tela

`/admin/usuarios` (já é `SuperAdminGuard`, então na prática só o Cesar edita) ganha,
no formulário do usuário, a lista de módulos agrupada por categoria. Cada item tem
três estados:

```
Papel: [vendedor ▾]          ← trocar remarca a tela na hora

COMERCIAL
  [x] Vendas          do papel
  [x] Clientes        do papel
  [✓] Marketing       liberado pra ele     → modulos_extras
FINANCEIRO
  [✗] PIX             bloqueado pra ele    → modulos_bloqueados
```

A caixa é um alterna de dois estados, e o significado depende do papel: item que o
papel **dá** alterna entre "do papel" e "bloqueado"; item que o papel **não dá**
alterna entre "não tem" e "liberado". Não existe marcar como "do papel" um item que
o papel não concede — para isso troca-se o papel.

Só o que difere do papel é gravado, então trocar o papel do usuário reaproveita as
exceções em vez de zerá-las.

Cadastro de gente nova: escolhe o papel, os módulos já vêm marcados, ajusta o que
for diferente, salva.

## Hubs — `/areas/[slug]`

Uma rota dinâmica só. Renderiza o nome da categoria e os cards dos itens que
`itensVisiveis()` devolveu para aquela categoria, no estilo dos cards do `/admin`
de hoje. Slug desconhecido ou categoria vazia para o usuário → `notFound()`.

`/admin` passa a redirecionar para `/areas/configuracao`, preservando link salvo.
As sub-páginas de `/admin/*` continuam nas URLs atuais.

## Guarda de rota

A guarda passa a sair da mesma tabela, para que esconder do menu e barrar a rota
sejam o mesmo fato. Cada página guardada troca seu array literal por
`podeAcessar(usuario, '/rota')`, e o redirect de acesso negado passa a ser sempre
`/dashboard`.

`AdminGuard` e `SuperAdminGuard` continuam existindo para as páginas de `/admin/*`
e **continuam checando o papel diretamente**: eles embrulham 12 páginas diferentes e
não sabem qual item estão protegendo, e `podeAcessar` precisa de um href. Passar o
href como prop significaria tocar nos 12 arquivos, que é justamente o que esses
componentes existem para evitar. Deles só muda o destino do redirect. As páginas de
`/admin/*` com guarda própria — dre, canais, metas, origens, veiculos-historico —
essas passam por `podeAcessar`.

Consequência aceita: para essas 12 páginas a regra fica escrita em dois lugares
(tabela e guard), ambos dizendo `ADMINS`.

## Testes

`src/lib/navegacao.test.ts`, puro, escrito antes do código:

1. **Não-regressão, item a item**: para cada um dos 5 papéis, a lista de ids que
   `itensVisiveis()` devolve bate exatamente com a lista esperada — congelada a
   partir do levantamento acima. É o teste que pega erro de transcrição de
   permissão, que é o risco real desta entrega. As mudanças aprovadas (mecânico)
   entram na lista esperada como tal.
2. `modulos_extras` acrescenta item fora do papel.
3. `modulos_bloqueados` remove item do papel, e ganha de `modulos_extras`.
4. `papeisExtras` conta: aux_adm com `vendedor` extra vê os itens de vendedor.
5. Categoria com um item visível vira link direto; com zero, some do sidebar.
6. `regraPropria` não é decidida pela tabela.

## Rollout

Entrega única, sem feature flag — navegação não dá pra ligar pela metade. O seguro
é que **nenhuma URL de módulo muda** e as duas colunas novas nascem vazias, então
reverter é reverter o commit; nenhum dado precisa ser desfeito.

Ordem: migração → `navegacao.ts` + testes → `itensVisiveis`/`podeAcessar` →
sidebar → hubs `/areas/[slug]` → guardas das páginas → tela de `/admin/usuarios`.

## Fora de escopo

- Não muda KPI, relatório ou qualquer regra de negócio.
- Não mexe em `/pix` (ValidaPix), que segue abolido do menu e intacto no código.
- Não cria perfis de acesso nomeados; se um dia a exceção por usuário virar
  bagunça, é aí que se reabre essa conversa.
