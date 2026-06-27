# Canal de Comunicação Interna (Comunicados) — Design Spec

**Data:** 2026-06-27  
**Status:** Aprovado

---

## Objetivo

Canal oficial de comunicação interna: admins publicam mensagens que aparecem como modal bloqueante ao acessar o dashboard. O usuário confirma com "LIDO" e o sistema registra o aceite com timestamp.

Casos de uso: orientações, regras, alertas, mensagens motivacionais.

---

## Permissões

| Ação | Papéis permitidos |
|------|-------------------|
| Criar/editar/desativar comunicados | `admin_geral`, `admin_socio` |
| Ver modal e confirmar | Todos os papéis |

---

## Banco de Dados

### Tabela `comunicados`

| campo | tipo | obs |
|---|---|---|
| `id` | uuid PK | defaultRandom() |
| `titulo` | text NOT NULL | |
| `conteudo` | text NOT NULL | |
| `ativo` | boolean NOT NULL DEFAULT true | |
| `criado_por_id` | uuid FK → usuarios | |
| `criado_em` | timestamp DEFAULT now() | |

### Tabela `comunicados_lidos`

| campo | tipo | obs |
|---|---|---|
| `comunicado_id` | uuid FK → comunicados | |
| `usuario_id` | uuid FK → usuarios | |
| `lido_em` | timestamp DEFAULT now() | |
| PK | `(comunicado_id, usuario_id)` | garante unicidade |

---

## Lógica de Exibição

Query no layout:
```sql
SELECT * FROM comunicados
WHERE ativo = true
AND id NOT IN (
  SELECT comunicado_id FROM comunicados_lidos
  WHERE usuario_id = $usuarioLogado
)
ORDER BY criado_em ASC
```

- Se retornar vazio → nenhum modal
- Se retornar N itens → exibe um por vez; após LIDO avança para o próximo

---

## Componentes

### `<ComunicadoModal>` (Client Component)
- Recebe `comunicados: { id, titulo, conteudo }[]`
- Estado local: índice do comunicado atual
- Dialog do shadcn com `open={true}`, sem botão fechar (×)
- Botão **LIDO** chama Server Action e avança para o próximo ou fecha
- Scroll no conteúdo se for longo

### Layout do Dashboard (`src/app/(dashboard)/layout.tsx`)
- Já carrega `getUsuarioLogado()` — adicionar query de comunicados não lidos
- Passa lista para `<ComunicadoModal>`

### Server Action `marcarComoLido(comunicadoId)`
- Insere em `comunicados_lidos`
- `revalidatePath('/dashboard')` para limpar cache

---

## Gestão de Comunicados (`/admin/comunicados`)

**Lista:**
- Tabela com: título, data, criado por, status (ativo/inativo), total de confirmações
- Ações: ativar/desativar, excluir

**Formulário (Novo / Editar):**
- Campos: título (input), conteúdo (textarea), ativo (checkbox)
- Validação: título e conteúdo obrigatórios

**Acesso:** link na página `/admin` existente, visível apenas para `admin_geral` e `admin_socio`

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/lib/db/schema.ts` | Adicionar tabelas `comunicados` e `comunicados_lidos` |
| `src/lib/db/migrations/` | Migration SQL para as novas tabelas |
| `src/app/(dashboard)/layout.tsx` | Query de comunicados não lidos + renderizar modal |
| `src/app/(dashboard)/components/comunicado-modal.tsx` | Criar — Client Component do modal |
| `src/app/(dashboard)/admin/comunicados/page.tsx` | Criar — listagem |
| `src/app/(dashboard)/admin/comunicados/actions.ts` | Criar — Server Actions (criar, ativar/desativar, excluir, marcar lido) |
| `src/app/(dashboard)/admin/comunicados/components/comunicado-form.tsx` | Criar — formulário |
| `src/app/(dashboard)/admin/page.tsx` | Modificar — adicionar link para /admin/comunicados |

---

## Fora de Escopo

- Segmentação por loja (todos recebem todas as mensagens)
- Edição de comunicado após criação (desativar e criar novo)
- Notificação push ou e-mail
- Rich text / formatação — texto simples por ora
