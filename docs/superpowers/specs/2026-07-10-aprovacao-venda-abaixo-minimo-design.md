# Aprovação de Venda Abaixo do Valor Mínimo — Design

**Data:** 2026-07-10
**Status:** Aprovado

## Contexto

Hoje, ao registrar uma venda direto do estoque (`vender-button.tsx` → `registrarVendaCompletaAction`), o sistema calcula o líquido recebido a partir da forma de pagamento e compara com `precificacao.valorMinimo` (por grupo + modelo). Se o líquido ficar abaixo do mínimo, a venda é **bloqueada** com um erro — tanto no client quanto no server (`vendas/actions.ts:168-177`).

Na prática, o dono (`admin_geral`) e os sócios (`admin_socio`) às vezes precisam autorizar uma venda abaixo do mínimo (negociação pontual). Hoje isso não tem caminho pela interface — o vendedor fica travado.

## Objetivo

Permitir que um vendedor **peça aprovação** para vender abaixo do mínimo, em vez de ficar bloqueado. Só `admin_geral` (qualquer grupo) e `admin_socio` (do mesmo grupo da venda) podem aprovar ou recusar. Quem já tem esse poder (`admin_geral`/`admin_socio`) continua vendendo abaixo do mínimo direto, sem passar por aprovação.

## Escopo

- Afeta **somente** o fluxo direto de venda pelo estoque (`vender-button.tsx` / `registrarVendaCompletaAction`). O fluxo legado de pedido → efetivar (`criar-pedido-dialog`/`efetivar-dialog`) não muda.
- Sem notificação externa (e-mail, WhatsApp) — a solicitação pendente aparece na tela para quem pode aprovar.
- Motivo/justificativa é **obrigatório** ao pedir aprovação.
- Recusar cancela a solicitação e libera a moto — não existe "devolver para o vendedor ajustar".

## Design

### Modelo de dados

Nova tabela `aprovacoes_venda`, seguindo o mesmo padrão de solicitação/resposta já usado em `transferencias`:

```ts
export const aprovacaoVendaStatusEnum = pgEnum('aprovacao_venda_status', ['pendente', 'aprovada', 'recusada'])

export const aprovacoesVenda = pgTable('aprovacoes_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id), // quem pediu
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  dadosVenda: jsonb('dados_venda').notNull(), // mesmo formato de DadosVendaCompleta (cliente + pagamentos)
  motivo: text('motivo').notNull(),
  status: aprovacaoVendaStatusEnum('status').notNull().default('pendente'),
  respondidoPor: uuid('respondido_por').references(() => usuarios.id),
  dataSolicitacao: timestamp('data_solicitacao', { withTimezone: true }).notNull().defaultNow(),
  dataResposta: timestamp('data_resposta', { withTimezone: true }),
})
```

`referenciaEnum` (`historico_estoque.referencia_tipo`) ganha um novo valor `'aprovacao_venda'` para os registros de histórico gerados por esse fluxo.

Nenhuma linha em `pedidos_venda`/`vendas` é criada enquanto a solicitação está pendente — só no momento da aprovação, exatamente como já acontece hoje no fluxo direto (que cria pedido "efetivado" + venda juntos). Isso preserva a garantia de que uma linha em `vendas` sempre representa uma venda confirmada (importante para Bling, caixa e relatórios).

**Correção em relação à primeira versão deste documento:** o campo que trava a moto no fluxo direto é `motos.disponibilidade`, não `motos.status` (o `status` só é tocado pelo fluxo legado de pedido pendente). `disponibilidade` já tem um valor `'reservada'`, mas ele pertence ao fluxo de sinal/reserva (`reservas`) — reaproveitá-lo aqui misturaria os dois conceitos. Por isso o `disponibilidadeEnum` ganha um valor novo, `'aguardando_aprovacao'`, usado só por este fluxo.

### Fluxo

1. **Vendedor pede aprovação** (`solicitarAprovacaoVendaAction`): mesmas validações de hoje (moto disponível/montada, soma dos pagamentos bate com o total). Se o líquido calculado ficar abaixo do mínimo:
   - Papel `vendedor`/`aux_adm` → exige `motivo` preenchido, marca `motos.disponibilidade = 'aguardando_aprovacao'` (guardando o valor anterior para poder reverter em caso de recusa), grava linha em `aprovacoes_venda` com `status: 'pendente'`, grava `historico_estoque` (`mudanca_status`, `referencia_tipo: 'aprovacao_venda'`).
   - Papel `admin_geral`/`admin_socio` → **não** entra nesse caminho: `registrarVendaCompletaAction` já deixa esses papéis venderem abaixo do mínimo direto (auto-aprovação), sem criar linha em `aprovacoes_venda`.

2. **Admin/sócio aprova** (`aprovarVendaAction`): lê a linha pendente, roda a mesma transação de criação de venda que `registrarVendaCompletaAction` já faz hoje (extraída para um helper compartilhado `criarVendaTx`) — cria `pedidos_venda` efetivado, `vendas`, upsert de cliente, moto vira `vendida`, histórico, lançamento de caixa se houver pagamento em dinheiro. `efetivadoPor` = quem aprovou, `vendedorId` = quem pediu (preservado). Marca `aprovacoes_venda.status = 'aprovada'`.

3. **Admin/sócio recusa** (`recusarVendaAction`): `motos.disponibilidade` volta para o valor guardado antes do pedido (normalmente `disponivel`), `aprovacoes_venda.status = 'recusada'`, histórico registrado.

### Permissões

- Pedir aprovação: `vendedor`, `aux_adm`, `admin_socio`, `admin_geral` (igual à permissão atual de `registrarVendaCompletaAction`).
- Aprovar/recusar: `admin_geral` sempre pode. `admin_socio` só pode se o grupo da **loja da venda** (`getGrupoIdDaLoja(aprovacao.lojaId)`) for igual ao grupo da **loja de origem do próprio sócio** (`getGrupoIdDaLoja(aprovador.lojaId)`).
  - Usa a loja fixa do usuário (`usuarios.lojaId`), não o cookie `grupoAtivo` — o cookie é só para navegação/visualização e pode ser trocado pelo próprio admin; a permissão de aprovar não deve depender de qual grupo o sócio está "olhando" no momento.
  - `vendedor`/`aux_adm` nunca podem aprovar, mesmo o próprio solicitante.
- A checagem de servidor em `registrarVendaCompletaAction` também muda: hoje bloqueia qualquer venda abaixo do mínimo; passa a bloquear só para quem não é `admin_geral`/`admin_socio` (para esses papéis o valor abaixo do mínimo é permitido direto). Isso evita que um `vendedor` contorne a exigência de aprovação chamando a action diretamente.

### UI

**`vender-button.tsx`**: hoje, valor abaixo do mínimo desabilita o submit com uma mensagem de erro (`liquidoOk`, linha ~333-336). Passa a:
- `valor >= mínimo` → sem mudança, botão "Confirmar Venda".
- `valor < mínimo` e papel `vendedor`/`aux_adm` → aparece um campo de texto obrigatório "Motivo", botão vira **"Pedir aprovação"**, chama `solicitarAprovacaoVendaAction`.
- `valor < mínimo` e papel `admin_geral`/`admin_socio` → continua "Confirmar Venda" normal.

**Estoque (`estoque/[id]/...` e `moto-table.tsx`)**: quando `motos.disponibilidade = 'aguardando_aprovacao'`:
- Na lista (`moto-table.tsx`): badge "Aguardando aprovação", sem ação — o botão de vender não aparece.
- Na página de detalhe da moto: card com dados da venda pendente (cliente, valor, motivo, quem pediu). Para `admin_geral`/`admin_socio` autorizados (ver regra de escopo acima), o card tem dois botões — **"Aprovar"** e **"Recusar"**. Para os demais (inclusive o vendedor que pediu), o card aparece sem ação.
- Como `'aguardando_aprovacao'` é um valor próprio de `disponibilidade` (distinto de `'reservada'`, que é do fluxo de sinal), não há ambiguidade entre os dois casos.

## Fora de escopo

- Não altera o fluxo legado de pedido → efetivar.
- Não adiciona notificação externa (e-mail, WhatsApp, push).
- Não permite editar o valor no momento da aprovação — aprovar é "aceitar como está" ou recusar.
- Não cria um papel "sócio" novo no enum — reaproveita `admin_socio`, que já existe.

## Teste

Projeto não tem suite automatizada. Validação manual:
1. Logado como `vendedor`, tentar vender moto abaixo do mínimo → ver campo de motivo obrigatório e botão "Pedir aprovação"; confirmar que a moto fica `reservada` e não aparece em `vendas`.
2. Logado como `admin_socio` de outro grupo → confirmar que a solicitação pendente **não** aparece com botões de ação.
3. Logado como `admin_socio` do mesmo grupo → aprovar a solicitação, confirmar que `vendas` é criada com `efetivadoPor` correto, moto vira `vendida`, caixa lança entrada se pagamento em dinheiro.
4. Repetir criando uma segunda solicitação e recusando → confirmar moto volta para `disponivel` e nenhuma linha aparece em `vendas`.
5. Logado como `admin_geral`, vender abaixo do mínimo → confirmar que salva direto, sem passar por aprovação.
