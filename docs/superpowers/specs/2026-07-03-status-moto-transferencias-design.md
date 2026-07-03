# Spec: Status da moto nos cards de transferência pendente

**Data:** 2026-07-03

## Problema

No módulo de Transferências, o responsável por aceitar/buscar uma moto não vê se ela já está montada ou ainda na caixa. Isso dificulta saber se a moto está pronta para retirada.

## Solução

Mostrar o status da moto (`caixa`, `montada`, `em_garantia`, `vendida`) no card de transferência, apenas para transferências com `status === 'pendente'` (seções "Para aceitar/Pendentes" e "Aguardando resposta"). O histórico (aceitas/recusadas) não muda.

## Mudanças

1. **Extrair `StatusIcon`** de `src/app/(dashboard)/estoque/components/moto-table.tsx` (hoje privado ao arquivo) para um componente compartilhado `src/components/moto-status-icon.tsx`, exportado como `MotoStatusIcon`. Atualizar `moto-table.tsx` para importar do novo local — sem mudança de comportamento ali.

2. **Query** (`src/lib/queries/transferencias.ts`, função `listarTransferencias`): adicionar `motoStatus: motos.status` ao `select`. A tabela `motos` já está no `innerJoin`, então é só incluir a coluna.

3. **Card** (`src/app/(dashboard)/transferencias/components/transferencia-card.tsx`):
   - Adicionar `motoStatus: string` ao tipo `TransferenciaCardData`.
   - Renderizar `<MotoStatusIcon status={t.motoStatus} />` ao lado do chassi/modelo, condicionado a `t.status === 'pendente'`.

## Fora do escopo

- Sem migração de banco (coluna já existe).
- Sem novas actions ou filtros.
- Histórico de transferências não exibe o status da moto.
