# Multi-Grupo (Multi-Tenant por CNPJ) — Design

**Data:** 2026-07-01
**Status:** Aprovado

## Contexto

O sistema gerencia o Grupo Motochefe Sul de Minas (5 lojas + galpão). O operador está abrindo uma nova operação independente — Motochefe BH — com CNPJ próprio, integrações distintas (Bling, ValidaPix, Fábrica) e lojas próprias. Ambas as operações devem conviver no mesmo sistema, mesmo banco de dados e mesmo login, com dados completamente isolados entre grupos.

---

## Objetivo

Permitir que o sistema suporte múltiplos grupos operacionais (empresas com CNPJ distintos) de forma transparente:
- Funcionários veem apenas os dados do seu grupo (derivado automaticamente da loja deles)
- `admin_geral` e `admin_socio` acessam qualquer grupo via seletor de abas no topo
- Cada grupo tem suas próprias integrações configuradas no banco (sem variáveis de ambiente por grupo)
- Todos os dados existentes pertencem ao grupo "Sul de Minas" sem necessidade de migração manual

---

## Permissões

| Ação | Quem pode |
|---|---|
| Criar/editar grupos e credenciais | `admin_geral` |
| Trocar grupo ativo via seletor | `admin_geral`, `admin_socio` |
| Ver dados do grupo ativo | todos os papéis |
| Criar loja em um grupo | `admin_geral` |

Grupos são **completamente isolados** entre si. Nenhum papel (exceto `admin_geral` e `admin_socio` via seletor) tem acesso a dados de outro grupo.

---

## Modelo de dados

### Nova tabela `grupos`

| Campo | Tipo | Observações |
|---|---|---|
| `id` | uuid PK | defaultRandom() |
| `nome` | text NOT NULL | ex: "Sul de Minas", "BH" |
| `cnpj` | text NOT NULL | |
| `ativo` | boolean NOT NULL | default true |
| `validapixEmail` | text nullable | credencial ValidaPix do grupo |
| `validapixPassword` | text nullable | credencial ValidaPix do grupo |
| `fabricaEmail` | text nullable | credencial sistema de peças da fábrica |
| `fabricaSenha` | text nullable | credencial sistema de peças da fábrica |

### Alterações em tabelas existentes

| Tabela | Alteração | Observação |
|---|---|---|
| `lojas` | ADD `grupo_id` uuid NOT NULL FK → grupos | determina a qual grupo a loja pertence |
| `despesas` | ADD `grupo_id` uuid NOT NULL FK → grupos | necessário pois `loja_id` é nullable (despesa geral) |
| `pix_recebimentos` | ADD `grupo_id` uuid NOT NULL FK → grupos | não tem `loja_id`; vincula o Pix ao grupo que o recebeu |
| `bling_config` | REMOVE PK fixa (id=1); ADD `grupo_id` uuid PK FK → grupos | uma linha por grupo em vez de singleton |
| `comunicados` | ADD `grupo_id` uuid NOT NULL FK → grupos | comunicados criados num grupo só aparecem para usuários daquele grupo |

### Tabelas que NÃO mudam

Todas as demais tabelas (`vendas`, `motos`, `ordens_servico`, `caixa`, `garantias`, `clientes`, `transferencias`, etc.) já possuem `loja_id`. O isolamento por grupo é derivado automaticamente via `loja → grupo`.

---

## Contexto de grupo ativo

### Função central `getGrupoAtivo(usuario)`

Usada em todas as páginas para obter o `grupoId` que deve filtrar as queries:

- Se `usuario.papel` for `admin_geral` ou `admin_socio` → lê o cookie `grupoAtivo` (UUID). Se o cookie não existir, assume o primeiro grupo ativo do banco.
- Qualquer outro papel → deriva `grupoId` via `usuario.lojaId → loja.grupoId`. Não tem acesso ao seletor.

### Cookie `grupoAtivo`

- Nome: `grupoAtivo`
- Valor: UUID do grupo ativo
- Setado via Server Action quando o usuário troca de aba
- HttpOnly, SameSite=Lax

---

## UI — Seletor de grupo

Barra de abas exibida no topo do layout do dashboard, **visível apenas para `admin_geral` e `admin_socio`**:

```
[ Sul de Minas ]  [ BH ]
```

- A aba do grupo ativo fica destacada
- Ao clicar, chama uma Server Action que seta o cookie `grupoAtivo` e redireciona para a mesma página
- Os nomes das abas são carregados dinamicamente do banco (query em `grupos where ativo = true`)
- Novos grupos aparecem automaticamente sem alteração de código

Funcionários comuns não veem a barra — a interface é idêntica à atual para eles.

---

## Integrações por grupo

Todas as credenciais de integração são lidas do registro do grupo ativo em vez de variáveis de ambiente.

### ValidaPix

- Credenciais (`validapixEmail`, `validapixPassword`) lidas de `grupos` pelo `grupoId` ativo
- `src/lib/validapix.ts` recebe as credenciais como parâmetro em vez de ler `process.env`
- `pixRecebimentos` ganha `grupoId` para filtrar o módulo `/pix` por grupo

### Fábrica (sistema de peças)

- Credenciais (`fabricaEmail`, `fabricaSenha`) lidas de `grupos` pelo `grupoId` ativo
- `src/lib/fabrica-scraper.ts` recebe as credenciais como parâmetro em vez de ler `process.env`
- Garantias já têm `loja_id` — o isolamento segue naturalmente

### Bling

- `blingConfig` deixa de ser singleton (id=1) e passa a ter uma linha por grupo
- OAuth flow de conexão do Bling passa a receber/salvar o token no registro do grupo correto
- `blingCodigo` nos modelos é global (não por grupo) — modelos são compartilhados entre grupos

---

## Administração de grupos (`/admin/grupos`)

Acessível apenas por `admin_geral`. Permite:
- Listar grupos existentes
- Criar novo grupo (nome, CNPJ)
- Editar credenciais de integração de cada grupo (ValidaPix, Fábrica)
- Ver lojas associadas a cada grupo (leitura — associação feita no cadastro da loja)

A conexão do Bling por grupo é feita pelo fluxo OAuth já existente em `/admin/bling`, adaptado para ser grupo-aware.

---

## Migração dos dados existentes

Executada via migration SQL uma única vez. Todos os dados existentes pertencem ao grupo "Sul de Minas":

1. `INSERT INTO grupos (id, nome, cnpj, ativo) VALUES ('<uuid-fixo>', 'Sul de Minas', '<cnpj>', true)`
2. `UPDATE lojas SET grupo_id = '<uuid-fixo>'`
3. `UPDATE despesas SET grupo_id = '<uuid-fixo>'`
4. `UPDATE pix_recebimentos SET grupo_id = '<uuid-fixo>'`
5. `UPDATE bling_config SET grupo_id = '<uuid-fixo>'` (e remover coluna `id`)
6. `UPDATE comunicados SET grupo_id = '<uuid-fixo>'`
7. Credenciais atuais de `VALIDAPIX_EMAIL/PASSWORD` e `FABRICA_EMAIL/SENHA` são inseridas no registro do grupo "Sul de Minas" via script ou manualmente no painel `/admin/grupos`

Após a migração, o comportamento para todos os usuários do Sul de Minas é **idêntico ao atual** — zero impacto na operação.

---

## Fora do escopo (por enquanto)

- Usuários com acesso a mais de um grupo (exceto admin_geral e admin_socio)
- Relatórios consolidados entre grupos
- Transferências de estoque entre grupos
- Configuração de categorias de caixa por grupo (compartilhadas por ora)
