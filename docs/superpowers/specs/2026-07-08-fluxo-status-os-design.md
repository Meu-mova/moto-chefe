# Fluxo de Status da OS com Permissão por Papel — Design

## Contexto

Primeira de duas partes de uma mudança no fluxo de status da Ordem de
Serviço. Hoje o status tem 3 valores (`aberta`, `em_andamento`,
`concluida`) e qualquer usuário em `EDITORES` (admin_geral, admin_socio,
aux_adm, mecanico) pode avançar para qualquer status seguinte — sem
distinção de quem deveria fazer o quê.

O usuário quer um fluxo mais granular, com cada etapa avançada pela
pessoa certa:

> Adm abre a OS → Oficina (mecânico recebe a moto) → Em Andamento
> (mecânico inicia) → Finalizada (mecânico termina) → Pendente de
> Pagamento (admin recebe a moto de volta da oficina) → Concluída
> (automático, quando o pagamento é conciliado).

A segunda parte (spec separado, ainda não escrito) troca o gatilho de
"Concluída" pela integração real com o módulo de Conciliação (cartão/PIX),
que hoje só linka com `vendas`. Esta parte usa o registro de pagamento
manual que já existe (`OSPagamentoPanel`/`registrarPagamentoOSAction`)
como gatilho temporário — ele continua funcionando exatamente como hoje
(valor + forma de pagamento), só passa a também fechar a OS.

## Decisões

- **6 status, todos no mesmo enum `os_status`**: `aberta`, `oficina`,
  `em_andamento`, `finalizada`, `pendente_pagamento`, `concluida`. Adiciona
  3 valores novos ao enum existente via `ALTER TYPE ... ADD VALUE` — não
  remove nem renomeia nenhum valor existente, então OS já em `aberta`,
  `em_andamento` ou `concluida` continuam válidas sem migração de dados.
- **Cada transição tem um papel responsável**, validado no servidor (não
  só escondido na UI):
  | De | Para | Quem |
  |---|---|---|
  | `aberta` | `oficina` | mecânico |
  | `oficina` | `em_andamento` | mecânico |
  | `em_andamento` | `finalizada` | mecânico |
  | `finalizada` | `pendente_pagamento` | admin (GESTORES: admin_geral/admin_socio/aux_adm) |
  | `pendente_pagamento` | `concluida` | **automático** — não é um botão, é efeito colateral de `registrarPagamentoOSAction` (nesta parte) |
- **Sem restrição por mecânico específico** — qualquer usuário com papel
  `mecanico` pode avançar as etapas de oficina, não só o mecânico
  designado na OS (`mecanicoId`). Mesmo padrão que já existe hoje para
  adicionar itens.
- **`OSPagamentoPanel` só aparece a partir de `pendente_pagamento`** — hoje
  aparece sempre que `podeFechar` é verdadeiro, independente do status.
  Passa a só renderizar quando `status` for `pendente_pagamento` ou
  `concluida` (esse último para consulta/edição depois de já ter pago).
- **`atualizarStatusOSAction` passa a validar a transição**, não só o
  papel amplo `EDITORES`: rejeita se `novoStatus` não for o próximo da
  sequência a partir do status atual, e rejeita se o papel do usuário não
  for o responsável por aquela transição específica.
- **`registrarPagamentoOSAction` passa a também fechar a OS**: ao salvar
  valor + forma de pagamento com sucesso, se o status atual for
  `pendente_pagamento`, atualiza para `concluida` e grava `dataConclusao`
  — mesmo efeito que already acontecia manualmente para `concluida` no
  `atualizarStatusOSAction` antigo.

## Schema

Migração manual (nem `db:generate`, ver
`docs/superpowers/plans/2026-07-07-catalogo-servicos.md`):

```sql
ALTER TYPE "os_status" ADD VALUE 'oficina' AFTER 'aberta';
ALTER TYPE "os_status" ADD VALUE 'finalizada' AFTER 'em_andamento';
ALTER TYPE "os_status" ADD VALUE 'pendente_pagamento' AFTER 'finalizada';
```

`src/lib/db/schema.ts` — `osStatusEnum` ganha os 3 valores novos, na
ordem correta:

```ts
export const osStatusEnum = pgEnum('os_status', [
  'aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida',
])
```

## Server actions (`src/app/(dashboard)/ordens-servico/actions.ts`)

`atualizarStatusOSAction(osId, novoStatus)` é reescrita para validar a
transição:

```ts
const SEQUENCIA: string[] = ['aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida']
const RESPONSAVEL_TRANSICAO: Record<string, readonly string[]> = {
  oficina:             ['mecanico'],
  em_andamento:        ['mecanico'],
  finalizada:          ['mecanico'],
  pendente_pagamento:  GESTORES,
}
```

A action verifica: `novoStatus` é o próximo item de `SEQUENCIA` em
relação ao status atual da OS (busca no banco, não confia no client); o
papel do usuário está em `RESPONSAVEL_TRANSICAO[novoStatus]`. `concluida`
não é aceita como `novoStatus` direto por essa action — só é atingida via
`registrarPagamentoOSAction`.

`registrarPagamentoOSAction(osId, dados)` ganha o efeito colateral: depois
de gravar valor/forma de pagamento, se o status atual da OS for
`pendente_pagamento`, atualiza para `concluida` e grava `dataConclusao =
now()` no mesmo update.

## UI

- `os-status-bar.tsx`: `STEPS` ganha as 3 etapas novas, na ordem. Recebe
  uma prop nova `papel: string`. Para cada transição, o botão "avançar"
  só aparece se `RESPONSAVEL_TRANSICAO[próximoStatus].includes(papel)` —
  caso contrário, mostra um texto passivo indicando quem precisa agir
  (ex: "Aguardando mecânico" / "Aguardando admin"). Na etapa
  `pendente_pagamento`, não há botão nenhum — mostra "Aguardando
  pagamento" (a barra vira `concluida` sozinha quando o pagamento é
  registrado).
- `[id]/page.tsx`: passa `papel={usuario.papel}` para `OSStatusBar`;
  troca a condição de renderizar `OSPagamentoPanel` de `podeFechar` para
  `podeFechar && ['pendente_pagamento', 'concluida'].includes(os.status)`.

## Tratamento de erros

- Transição fora de sequência ou fora do papel responsável: `Error('Sem
  permissão')`, mesma mensagem já usada em `verificarAcessoOS`.
- `registrarPagamentoOSAction` chamada fora de `pendente_pagamento`:
  continua registrando o pagamento (não quebra o caso de reabrir/corrigir
  um valor já pago), só não repete a transição de status se já estiver em
  `concluida`.

## Verificação

`npm run type-check`, `npm run build`. Migração aplicada via Supabase MCP
`apply_migration`, com confirmação do usuário. Teste manual (limitado, sem
credenciais de todos os papéis): confirmar que a sequência de status
aparece correta na barra, que o botão de avançar não aparece pra quem não
pode, e que registrar pagamento em `pendente_pagamento` fecha a OS.

## Fora de escopo

- Integração real com o módulo de Conciliação (cartão/PIX) — segunda
  parte, spec separado.
- Restringir avanço de oficina ao mecânico especificamente designado na
  OS (`mecanicoId`) — qualquer mecânico pode avançar, como já é hoje para
  outras ações da OS.
- Checklist de avarias com foto — ainda pendente, spec separado.
