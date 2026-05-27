# Fase 2 — Transferências + Vendas: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar os módulos de Transferências (solicitação, aceite, recusa) e Vendas (pedido, efetivação, cancelamento) com concorrência atômica via RPCs.

**Architecture:** Cada workflow tem RPCs SECURITY DEFINER no Supabase para garantir atomicidade com SELECT FOR UPDATE. O frontend usa Server Actions para chamar as RPCs. As páginas são Server Components com revalidação após mutações.

**Tech Stack:** Next.js 15 Server Actions, Supabase RPC (plpgsql SECURITY DEFINER), Drizzle ORM, TanStack Query, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-05-26-gestao-estoque-motos-design.md`

**Pré-requisito:** Fase 1 completa (schema, RLS, auth, layout, módulo estoque).

---

## Task 1: RPCs para o workflow de Transferências

**Files:**
- Modify: `src/lib/db/rpcs.sql` (adicionar novas RPCs)

- [ ] **Step 1: Criar RPC para solicitar transferência**

Execute no Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION solicitar_transferencia(
  p_moto_id uuid,
  p_loja_destino_id uuid,
  p_solicitado_por uuid,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status moto_status;
  v_loja_origem_id uuid;
  v_transferencia_id uuid;
BEGIN
  -- Lock atômico
  SELECT status, loja_id INTO v_status, v_loja_origem_id
  FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_status NOT IN ('disponivel', 'montada') THEN
    RAISE EXCEPTION 'Transferência não permitida para moto com status "%"', v_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM transferencias WHERE moto_id = p_moto_id AND status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'Moto já possui transferência pendente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pedidos_venda WHERE moto_id = p_moto_id AND status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'Moto possui pedido de venda pendente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ordens_servico
    WHERE moto_id = p_moto_id AND status IN ('aberta', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'Moto possui ordem de serviço em aberto';
  END IF;

  INSERT INTO transferencias (
    moto_id, loja_origem_id, loja_destino_id,
    solicitado_por, status, observacao
  )
  VALUES (
    p_moto_id, v_loja_origem_id, p_loja_destino_id,
    p_solicitado_por, 'pendente', p_observacao
  )
  RETURNING id INTO v_transferencia_id;

  RETURN v_transferencia_id;
END;
$$;
```

- [ ] **Step 2: Criar RPC para aceitar transferência**

```sql
CREATE OR REPLACE FUNCTION aceitar_transferencia(
  p_transferencia_id uuid,
  p_respondido_por uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_origem_id uuid;
  v_loja_destino_id uuid;
  v_status_transferencia transferencia_status;
BEGIN
  SELECT moto_id, loja_origem_id, loja_destino_id, status
  INTO v_moto_id, v_loja_origem_id, v_loja_destino_id, v_status_transferencia
  FROM transferencias WHERE id = p_transferencia_id FOR UPDATE;

  IF v_status_transferencia != 'pendente' THEN
    RAISE EXCEPTION 'Transferência não está pendente (status: %)', v_status_transferencia;
  END IF;

  -- Lock na moto para consistência
  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  -- Atualiza apenas loja_id — status da moto é preservado
  UPDATE motos SET loja_id = v_loja_destino_id WHERE id = v_moto_id;

  UPDATE transferencias
  SET status = 'aceita', respondido_por = p_respondido_por, data_resposta = now()
  WHERE id = p_transferencia_id;

  -- Histórico: dois registros (enviada na origem, recebida no destino)
  INSERT INTO historico_estoque (
    moto_id, loja_origem_id, loja_destino_id,
    usuario_id, tipo, referencia_tipo, referencia_id
  )
  VALUES
    (v_moto_id, v_loja_origem_id, v_loja_destino_id,
     p_respondido_por, 'transferencia_enviada', 'transferencia', p_transferencia_id),
    (v_moto_id, v_loja_origem_id, v_loja_destino_id,
     p_respondido_por, 'transferencia_recebida', 'transferencia', p_transferencia_id);
END;
$$;
```

- [ ] **Step 3: Criar RPC para recusar transferência**

```sql
CREATE OR REPLACE FUNCTION recusar_transferencia(
  p_transferencia_id uuid,
  p_respondido_por uuid,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_transferencia transferencia_status;
BEGIN
  SELECT status INTO v_status_transferencia
  FROM transferencias WHERE id = p_transferencia_id FOR UPDATE;

  IF v_status_transferencia != 'pendente' THEN
    RAISE EXCEPTION 'Transferência não está pendente (status: %)', v_status_transferencia;
  END IF;

  UPDATE transferencias
  SET status = 'recusada',
      respondido_por = p_respondido_por,
      data_resposta = now(),
      observacao = COALESCE(p_observacao, observacao)
  WHERE id = p_transferencia_id;
  -- loja_id e status da moto não mudam
END;
$$;
```

- [ ] **Step 4: Salvar SQLs no arquivo de referência**

Adicionar os três blocos acima em `src/lib/db/rpcs.sql` após os RPCs existentes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/rpcs.sql
git commit -m "feat: add transferencia RPCs (solicitar, aceitar, recusar)"
```

---

## Task 2: RPCs para o workflow de Vendas

**Files:**
- Modify: `src/lib/db/rpcs.sql`

- [ ] **Step 1: Criar RPC para cancelar pedido de venda**

Execute no Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION cancelar_pedido_venda(
  p_pedido_id uuid,
  p_usuario_id uuid,
  p_papel text,
  p_loja_usuario_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_id uuid;
  v_vendedor_id uuid;
  v_status pedido_status;
  v_moto_loja_id uuid;
BEGIN
  SELECT moto_id, loja_id, vendedor_id, status
  INTO v_moto_id, v_loja_id, v_vendedor_id, v_status
  FROM pedidos_venda WHERE id = p_pedido_id FOR UPDATE;

  IF v_status != 'pendente' THEN
    RAISE EXCEPTION 'Pedido não está pendente (status: %)', v_status;
  END IF;

  -- Lock na moto
  SELECT loja_id INTO v_moto_loja_id
  FROM motos WHERE id = v_moto_id FOR UPDATE;

  -- Verificar permissão: Aux Adm da loja, Admin Geral, ou Vendedor original na mesma loja
  IF p_papel = 'admin_geral' THEN
    NULL; -- permitido
  ELSIF p_papel = 'aux_adm' AND p_loja_usuario_id = v_loja_id THEN
    NULL;
  ELSIF p_papel = 'vendedor' AND p_usuario_id = v_vendedor_id AND p_loja_usuario_id = v_moto_loja_id THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Sem permissão para cancelar este pedido';
  END IF;

  UPDATE pedidos_venda
  SET status = 'cancelado',
      data_atualizacao = now(),
      observacao = COALESCE(p_observacao, observacao)
  WHERE id = p_pedido_id;

  UPDATE motos SET status = 'disponivel' WHERE id = v_moto_id;

  INSERT INTO historico_estoque (
    moto_id, usuario_id, tipo,
    status_anterior, status_novo, referencia_tipo, referencia_id, observacao
  )
  VALUES (
    v_moto_id, p_usuario_id, 'mudanca_status',
    'reservada', 'disponivel', 'pedido_venda', p_pedido_id, p_observacao
  );
END;
$$;
```

- [ ] **Step 2: Criar RPC para efetivar venda**

```sql
CREATE OR REPLACE FUNCTION efetivar_venda(
  p_pedido_id uuid,
  p_efetivado_por uuid,
  p_cliente_nome text,
  p_cliente_cpf text,
  p_valor numeric,
  p_forma_pagamento text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_id uuid;
  v_loja_id uuid;
  v_vendedor_id uuid;
  v_status pedido_status;
  v_venda_id uuid;
  v_chave text;
BEGIN
  SELECT moto_id, loja_id, vendedor_id, status
  INTO v_moto_id, v_loja_id, v_vendedor_id, v_status
  FROM pedidos_venda WHERE id = p_pedido_id FOR UPDATE;

  IF v_status != 'pendente' THEN
    RAISE EXCEPTION 'Pedido não está pendente (status: %)', v_status;
  END IF;

  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  -- Chave de criptografia da aplicação (configura via Supabase Vault ou env)
  v_chave := current_setting('app.encryption_key', true);
  IF v_chave IS NULL OR v_chave = '' THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada';
  END IF;

  INSERT INTO vendas (
    pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por,
    cliente_nome, cliente_cpf, valor, forma_pagamento, data_venda
  )
  VALUES (
    p_pedido_id, v_moto_id, v_loja_id, v_vendedor_id, p_efetivado_por,
    pgp_sym_encrypt(p_cliente_nome, v_chave),
    pgp_sym_encrypt(p_cliente_cpf, v_chave),
    p_valor, p_forma_pagamento, now()
  )
  RETURNING id INTO v_venda_id;

  UPDATE pedidos_venda
  SET status = 'efetivado', data_atualizacao = now()
  WHERE id = p_pedido_id;

  UPDATE motos SET status = 'vendida' WHERE id = v_moto_id;

  INSERT INTO historico_estoque (
    moto_id, usuario_id, tipo,
    status_anterior, status_novo, referencia_tipo, referencia_id
  )
  VALUES (
    v_moto_id, p_efetivado_por, 'mudanca_status',
    'reservada', 'vendida', 'pedido_venda', p_pedido_id
  );

  RETURN v_venda_id;
END;
$$;
```

- [ ] **Step 3: Configurar chave de criptografia no Supabase**

No Supabase SQL Editor:

```sql
-- Define a chave de criptografia como parâmetro de configuração do PostgreSQL
ALTER DATABASE postgres SET app.encryption_key = 'sua-chave-secreta-forte-aqui';
```

> Use uma string aleatória longa (32+ caracteres). Guarde-a segura — sem ela, os dados criptografados não podem ser lidos.

- [ ] **Step 4: Criar view para descriptografar dados da venda**

```sql
-- Substitui a view vendas_seguras do Plano 1 por versão com decrypt
CREATE OR REPLACE VIEW vendas_seguras AS
SELECT
  v.id,
  v.pedido_venda_id,
  v.moto_id,
  v.loja_id,
  v.vendedor_id,
  v.efetivado_por,
  pgp_sym_decrypt(v.cliente_nome::bytea, current_setting('app.encryption_key', true)) AS cliente_nome,
  CASE
    WHEN (current_setting('request.jwt.claims', true)::jsonb->>'papel') IN ('admin_geral', 'aux_adm')
    THEN pgp_sym_decrypt(v.cliente_cpf::bytea, current_setting('app.encryption_key', true))
    ELSE '***.***.***-**'
  END AS cliente_cpf,
  v.valor,
  v.forma_pagamento,
  v.data_venda
FROM vendas v;
```

- [ ] **Step 5: Salvar SQLs no arquivo de referência**

Adicionar em `src/lib/db/rpcs.sql`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/rpcs.sql
git commit -m "feat: add venda RPCs (cancelar_pedido_venda, efetivar_venda) with pgcrypto"
```

---

## Task 3: Queries de transferências e vendas

**Files:**
- Create: `src/lib/queries/transferencias.ts`
- Create: `src/lib/queries/vendas.ts`

- [ ] **Step 1: Criar queries de transferências**

```typescript
// src/lib/queries/transferencias.ts
import { db } from '@/lib/db'
import { transferencias, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, or, and } from 'drizzle-orm'

export type TransferenciaComDetalhes = Awaited<ReturnType<typeof listarTransferenciasPorLoja>>[0]

export async function listarTransferenciasPorLoja(lojaId: string) {
  return db
    .select({
      id: transferencias.id,
      status: transferencias.status,
      dataSolicitacao: transferencias.dataSolicitacao,
      dataResposta: transferencias.dataResposta,
      observacao: transferencias.observacao,
      motoId: transferencias.motoId,
      chassi: motos.chassi,
      cor: motos.cor,
      motoStatus: motos.status,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaOrigemId: transferencias.lojaOrigemId,
      lojaOrigemNome: lojas.nome,
      lojaDestinoId: transferencias.lojaDestinoId,
      solicitadoPorId: transferencias.solicitadoPor,
      solicitadoPorNome: usuarios.nome,
    })
    .from(transferencias)
    .innerJoin(motos, eq(transferencias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(transferencias.lojaOrigemId, lojas.id))
    .innerJoin(usuarios, eq(transferencias.solicitadoPor, usuarios.id))
    .where(
      or(
        eq(transferencias.lojaOrigemId, lojaId),
        eq(transferencias.lojaDestinoId, lojaId)
      )
    )
    .orderBy(transferencias.dataSolicitacao)
}

export async function listarTodasTransferencias() {
  return db
    .select({
      id: transferencias.id,
      status: transferencias.status,
      dataSolicitacao: transferencias.dataSolicitacao,
      observacao: transferencias.observacao,
      chassi: motos.chassi,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaOrigemNome: lojas.nome,
      lojaDestinoId: transferencias.lojaDestinoId,
      solicitadoPorNome: usuarios.nome,
    })
    .from(transferencias)
    .innerJoin(motos, eq(transferencias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(transferencias.lojaOrigemId, lojas.id))
    .innerJoin(usuarios, eq(transferencias.solicitadoPor, usuarios.id))
    .orderBy(transferencias.dataSolicitacao)
}
```

- [ ] **Step 2: Criar queries de vendas e pedidos**

```typescript
// src/lib/queries/vendas.ts
import { db } from '@/lib/db'
import { pedidosVenda, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export type PedidoComDetalhes = Awaited<ReturnType<typeof listarPedidosPorLoja>>[0]

export async function listarPedidosPorLoja(lojaId: string) {
  return db
    .select({
      id: pedidosVenda.id,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(eq(pedidosVenda.lojaId, lojaId))
    .orderBy(pedidosVenda.dataPedido)
}

export async function listarTodosPedidos() {
  return db
    .select({
      id: pedidosVenda.id,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      chassi: motos.chassi,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .orderBy(pedidosVenda.dataPedido)
}

export async function buscarPedido(id: string) {
  const [pedido] = await db
    .select({
      id: pedidosVenda.id,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      motoStatus: motos.status,
      motoLojaId: motos.lojaId,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(eq(pedidosVenda.id, id))
    .limit(1)
  return pedido ?? null
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/transferencias.ts src/lib/queries/vendas.ts
git commit -m "feat: add transferencias and vendas query helpers"
```

---

## Task 4: Módulo Transferências — Página e actions

**Files:**
- Create: `src/app/(dashboard)/transferencias/page.tsx`
- Create: `src/app/(dashboard)/transferencias/actions.ts`
- Create: `src/app/(dashboard)/transferencias/components/transferencia-card.tsx`
- Create: `src/app/(dashboard)/transferencias/components/solicitar-dialog.tsx`

- [ ] **Step 1: Criar Server Actions de transferência**

```typescript
// src/app/(dashboard)/transferencias/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function solicitarTransferenciaAction(
  motoId: string,
  lojaDestinoId: string,
  observacao?: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para solicitar transferência')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('solicitar_transferencia', {
    p_moto_id: motoId,
    p_loja_destino_id: lojaDestinoId,
    p_solicitado_por: usuario.id,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

export async function aceitarTransferenciaAction(transferenciaId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para aceitar transferência')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('aceitar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

export async function recusarTransferenciaAction(transferenciaId: string, observacao: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para recusar transferência')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('recusar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}
```

- [ ] **Step 2: Criar card de transferência com ações**

```tsx
// src/app/(dashboard)/transferencias/components/transferencia-card.tsx
'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { aceitarTransferenciaAction, recusarTransferenciaAction } from '../actions'
import type { TransferenciaComDetalhes } from '@/lib/queries/transferencias'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  aceita: 'default',
  recusada: 'destructive',
}

type Props = {
  transferencia: TransferenciaComDetalhes
  lojaDestinoNome: string
  papel: string
  lojaIdUsuario: string | null
  lojaDestinoId: string
}

export function TransferenciaCard({ transferencia: t, lojaDestinoNome, papel, lojaIdUsuario, lojaDestinoId }: Props) {
  const [recusarOpen, setRecusarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const podeResponder =
    t.status === 'pendente' &&
    (papel === 'admin_geral' || (papel === 'aux_adm' && lojaIdUsuario === lojaDestinoId))

  async function handleAceitar() {
    setLoading(true)
    try {
      await aceitarTransferenciaAction(t.id)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRecusar() {
    setLoading(true)
    try {
      await recusarTransferenciaAction(t.id, observacao)
      setRecusarOpen(false)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{t.marca} {t.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{t.chassi} · {t.cor}</p>
          </div>
          <Badge variant={statusBadge[t.status] ?? 'secondary'}>
            {t.status === 'pendente' ? 'Pendente' : t.status === 'aceita' ? 'Aceita' : 'Recusada'}
          </Badge>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>De: <span className="text-slate-700">{t.lojaOrigemNome}</span> → Para: <span className="text-slate-700">{lojaDestinoNome}</span></p>
          <p>Solicitado por <span className="text-slate-700">{t.solicitadoPorNome}</span> em {format(new Date(t.dataSolicitacao), "dd/MM/yyyy", { locale: ptBR })}</p>
          {t.observacao && <p className="italic">{t.observacao}</p>}
        </div>
        {podeResponder && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleAceitar} disabled={loading}>Aceitar</Button>
            <Button size="sm" variant="destructive" onClick={() => setRecusarOpen(true)} disabled={loading}>Recusar</Button>
          </div>
        )}
      </CardContent>
      <Dialog open={recusarOpen} onOpenChange={setRecusarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar Transferência</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Motivo da recusa (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRecusar} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
```

- [ ] **Step 3: Criar dialog de solicitação de transferência**

```tsx
// src/app/(dashboard)/transferencias/components/solicitar-dialog.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { solicitarTransferenciaAction } from '../actions'

type Loja = { id: string; nome: string }
type Moto = { id: string; chassi: string; marca: string; modelo: string; lojaId: string }

type Props = {
  lojas: Loja[]
  motos: Moto[]
  lojaUsuarioId: string | null
  papel: string
}

export function SolicitarDialog({ lojas, motos, lojaUsuarioId, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [lojaDestinoId, setLojaDestinoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  // Motos que o usuário pode transferir (sua loja, ou todas se admin)
  const motosPermitidas = papel === 'admin_geral'
    ? motos.filter(m => m.lojaId !== lojaDestinoId)
    : motos.filter(m => m.lojaId === lojaUsuarioId)

  const motoSelecionada = motosPermitidas.find(m => m.id === motoId)
  // Lojas destino: todas exceto a loja da moto selecionada
  const lojasDestino = lojas.filter(l =>
    motoSelecionada ? l.id !== motoSelecionada.lojaId : true
  )

  async function handleSolicitar() {
    if (!motoId || !lojaDestinoId) return
    setLoading(true)
    try {
      await solicitarTransferenciaAction(motoId, lojaDestinoId, observacao)
      setOpen(false)
      setMotoId('')
      setLojaDestinoId('')
      setObservacao('')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'aux_adm', 'vendedor'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Solicitar Transferência</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar Transferência</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto</Label>
              <Select value={motoId} onValueChange={setMotoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
                <SelectContent>
                  {motosPermitidas.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} — {m.chassi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loja Destino</Label>
              <Select value={lojaDestinoId} onValueChange={setLojaDestinoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar destino" /></SelectTrigger>
                <SelectContent>
                  {lojasDestino.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSolicitar} disabled={loading || !motoId || !lojaDestinoId}>
              {loading ? 'Solicitando...' : 'Solicitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 4: Criar página de transferências**

```tsx
// src/app/(dashboard)/transferencias/page.tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarTransferenciasPorLoja, listarTodasTransferencias } from '@/lib/queries/transferencias'
import { db } from '@/lib/db'
import { lojas, motos, modelos } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { TransferenciaCard } from './components/transferencia-card'
import { SolicitarDialog } from './components/solicitar-dialog'

export default async function TransferenciasPage() {
  const usuario = await getUsuarioLogado()

  const todasLojas = await db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(eq(lojas.ativa, true))
  const lojaMap = Object.fromEntries(todasLojas.map(l => [l.id, l.nome]))

  // Motos disponíveis/montadas para solicitar transferência
  const motosTransferiveis = await db
    .select({ id: motos.id, chassi: motos.chassi, lojaId: motos.lojaId, marca: modelos.marca, modelo: modelos.modelo })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .where(inArray(motos.status, ['disponivel', 'montada']))

  const lista = usuario.papel === 'admin_geral'
    ? await listarTodasTransferencias()
    : await listarTransferenciasPorLoja(usuario.lojaId!)

  const aguardando = lista.filter(t => t.status === 'pendente' && t.lojaOrigemId === (usuario.lojaId ?? t.lojaOrigemId))
  const paraAceitar = lista.filter(t => t.status === 'pendente' && t.lojaDestinoId === (usuario.lojaId ?? ''))
  const historico = lista.filter(t => t.status !== 'pendente')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferências</h1>
          <p className="text-slate-500 text-sm">Movimentações entre lojas</p>
        </div>
        <SolicitarDialog
          lojas={todasLojas}
          motos={motosTransferiveis}
          lojaUsuarioId={usuario.lojaId ?? null}
          papel={usuario.papel}
        />
      </div>

      {paraAceitar.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Para aceitar ({paraAceitar.length})</h2>
          {paraAceitar.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              lojaDestinoNome={lojaMap[t.lojaDestinoId] ?? '—'}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaDestinoId={t.lojaDestinoId}
            />
          ))}
        </section>
      )}

      {aguardando.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Aguardando resposta ({aguardando.length})</h2>
          {aguardando.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              lojaDestinoNome={lojaMap[t.lojaDestinoId] ?? '—'}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaDestinoId={t.lojaDestinoId}
            />
          ))}
        </section>
      )}

      {historico.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Histórico</h2>
          {historico.map(t => (
            <TransferenciaCard
              key={t.id}
              transferencia={t}
              lojaDestinoNome={lojaMap[t.lojaDestinoId] ?? '—'}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaDestinoId={t.lojaDestinoId}
            />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhuma transferência registrada.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Testar fluxo de transferência**

```bash
npm run dev
```

1. Acessar `/transferencias`
2. Clicar "Solicitar Transferência" → selecionar moto disponível → selecionar loja destino → confirmar
3. Verificar que o card aparece em "Aguardando resposta"
4. Logar como Aux Adm da loja destino → verificar card em "Para aceitar"
5. Aceitar → verificar que `motos.loja_id` mudou no banco

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/transferencias/
git commit -m "feat: implement transferencias module with solicitar/aceitar/recusar flow"
```

---

## Task 5: Módulo Vendas — Criar pedido de venda

**Files:**
- Create: `src/app/(dashboard)/vendas/actions.ts`
- Create: `src/app/(dashboard)/vendas/components/criar-pedido-dialog.tsx`

- [ ] **Step 1: Criar Server Actions de venda**

```typescript
// src/app/(dashboard)/vendas/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function criarPedidoVendaAction(motoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para criar pedido de venda')
  }
  const supabase = await createClient()

  const [moto] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const { error } = await supabase.rpc('criar_pedido_venda', {
    p_moto_id: motoId,
    p_loja_id: moto.lojaId,
    p_vendedor_id: usuario.id,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

export async function cancelarPedidoAction(pedidoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancelar_pedido_venda', {
    p_pedido_id: pedidoId,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/vendas')
  revalidatePath('/estoque')
}

export async function efetivarVendaAction(
  pedidoId: string,
  clienteNome: string,
  clienteCpf: string,
  valor: string,
  formaPagamento: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para efetivar venda')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('efetivar_venda', {
    p_pedido_id: pedidoId,
    p_efetivado_por: usuario.id,
    p_cliente_nome: clienteNome,
    p_cliente_cpf: clienteCpf,
    p_valor: parseFloat(valor),
    p_forma_pagamento: formaPagamento,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/vendas')
  revalidatePath('/estoque')
}
```

- [ ] **Step 2: Criar dialog de pedido de venda**

```tsx
// src/app/(dashboard)/vendas/components/criar-pedido-dialog.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { criarPedidoVendaAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string; cor: string; lojaNome: string }

type Props = { motos: Moto[]; papel: string }

export function CriarPedidoDialog({ motos, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCriar() {
    if (!motoId) return
    setLoading(true)
    try {
      await criarPedidoVendaAction(motoId, observacao)
      setOpen(false)
      setMotoId('')
      setObservacao('')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'aux_adm', 'vendedor'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Criar Pedido de Venda</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Pedido de Venda</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto Disponível</Label>
              <Select value={motoId} onValueChange={setMotoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
                <SelectContent>
                  {motos.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} — {m.chassi} ({m.cor}) — {m.lojaNome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={loading || !motoId}>
              {loading ? 'Criando...' : 'Criar Pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/vendas/actions.ts src/app/\(dashboard\)/vendas/components/criar-pedido-dialog.tsx
git commit -m "feat: add criar pedido de venda action and dialog"
```

---

## Task 6: Módulo Vendas — Listagem, efetivação e cancelamento

**Files:**
- Create: `src/app/(dashboard)/vendas/page.tsx`
- Create: `src/app/(dashboard)/vendas/components/pedido-card.tsx`
- Create: `src/app/(dashboard)/vendas/components/efetivar-dialog.tsx`

- [ ] **Step 1: Criar dialog de efetivação de venda**

```tsx
// src/app/(dashboard)/vendas/components/efetivar-dialog.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { efetivarVendaAction } from '../actions'

type Props = { pedidoId: string; chassi: string; modelo: string }

export function EfetivarDialog({ pedidoId, chassi, modelo }: Props) {
  const [open, setOpen] = useState(false)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCpf, setClienteCpf] = useState('')
  const [valor, setValor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleEfetivar() {
    if (!clienteNome || !clienteCpf || !valor || !formaPagamento) return
    setLoading(true)
    try {
      await efetivarVendaAction(pedidoId, clienteNome, clienteCpf, valor, formaPagamento)
      setOpen(false)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Efetivar Venda</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Efetivar Venda — {modelo} ({chassi})</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>CPF do Cliente</Label>
              <Input value={clienteCpf} onChange={e => setClienteCpf(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="financiamento">Financiamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEfetivar}
              disabled={loading || !clienteNome || !clienteCpf || !valor || !formaPagamento}
            >
              {loading ? 'Efetivando...' : 'Confirmar Venda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Criar card de pedido de venda**

```tsx
// src/app/(dashboard)/vendas/components/pedido-card.tsx
'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { EfetivarDialog } from './efetivar-dialog'
import { cancelarPedidoAction } from '../actions'
import type { PedidoComDetalhes } from '@/lib/queries/vendas'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  efetivado: 'default',
  cancelado: 'secondary',
}

type Props = {
  pedido: PedidoComDetalhes
  papel: string
  usuarioId: string
  lojaIdUsuario: string | null
}

export function PedidoCard({ pedido: p, papel, usuarioId, lojaIdUsuario }: Props) {
  const [cancelarOpen, setCancelarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const podeEfetivar = p.status === 'pendente' && ['admin_geral', 'aux_adm'].includes(papel) &&
    (papel === 'admin_geral' || lojaIdUsuario === p.lojaId)

  const podeCancelar = p.status === 'pendente' && (
    papel === 'admin_geral' ||
    (papel === 'aux_adm' && lojaIdUsuario === p.lojaId) ||
    (papel === 'vendedor' && usuarioId === p.vendedorId && lojaIdUsuario === p.lojaId)
  )

  async function handleCancelar() {
    setLoading(true)
    try {
      await cancelarPedidoAction(p.id, observacao)
      setCancelarOpen(false)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-sm">{p.marca} {p.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{p.chassi} · {p.cor}</p>
          </div>
          <Badge variant={statusBadge[p.status] ?? 'secondary'}>
            {p.status === 'pendente' ? 'Pendente' : p.status === 'efetivado' ? 'Efetivado' : 'Cancelado'}
          </Badge>
        </div>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{p.lojaNome}</span></p>
          <p>Vendedor: <span className="text-slate-700">{p.vendedorNome}</span></p>
          <p>Data: {format(new Date(p.dataPedido), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
          {p.observacao && <p className="italic">{p.observacao}</p>}
        </div>
        {(podeEfetivar || podeCancelar) && (
          <div className="flex gap-2 pt-1">
            {podeEfetivar && (
              <EfetivarDialog pedidoId={p.id} chassi={p.chassi} modelo={`${p.marca} ${p.modelo}`} />
            )}
            {podeCancelar && (
              <Button size="sm" variant="outline" onClick={() => setCancelarOpen(true)}>
                Cancelar Pedido
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <Dialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancelar Pedido</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelarOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancelar} disabled={loading}>
              {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
```

- [ ] **Step 3: Criar página de vendas**

```tsx
// src/app/(dashboard)/vendas/page.tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarPedidosPorLoja, listarTodosPedidos } from '@/lib/queries/vendas'
import { db } from '@/lib/db'
import { motos, modelos, lojas } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { PedidoCard } from './components/pedido-card'
import { CriarPedidoDialog } from './components/criar-pedido-dialog'

export default async function VendasPage() {
  const usuario = await getUsuarioLogado()

  const pedidos = usuario.papel === 'admin_geral'
    ? await listarTodosPedidos()
    : await listarPedidosPorLoja(usuario.lojaId!)

  // Motos disponíveis para criar pedido
  const motosDisponiveis = await db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      lojaId: motos.lojaId,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(eq(motos.status, 'disponivel'))

  const pendentes = pedidos.filter(p => p.status === 'pendente')
  const historico = pedidos.filter(p => p.status !== 'pendente')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-slate-500 text-sm">Pedidos e efetivações</p>
        </div>
        <CriarPedidoDialog motos={motosDisponiveis} papel={usuario.papel} />
      </div>

      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Pedidos Pendentes ({pendentes.length})</h2>
          {pendentes.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p as any}
              papel={usuario.papel}
              usuarioId={usuario.id}
              lojaIdUsuario={usuario.lojaId ?? null}
            />
          ))}
        </section>
      )}

      {historico.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Histórico</h2>
          {historico.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p as any}
              papel={usuario.papel}
              usuarioId={usuario.id}
              lojaIdUsuario={usuario.lojaId ?? null}
            />
          ))}
        </section>
      )}

      {pedidos.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhum pedido registrado.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Exibir dados da venda na aba do detalhe da moto**

Criar `src/app/(dashboard)/estoque/[id]/components/venda-tab.tsx`:

```tsx
// src/app/(dashboard)/estoque/[id]/components/venda-tab.tsx
import { db } from '@/lib/db'
import { pedidosVenda, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export async function VendaTab({ motoId, papel }: { motoId: string; papel: string }) {
  const supabase = await createClient()

  // Usar view vendas_seguras para CPF mascarado
  const { data: vendaData } = await supabase
    .from('vendas_seguras')
    .select('*')
    .eq('moto_id', motoId)
    .maybeSingle()

  const [pedido] = await db
    .select({ status: pedidosVenda.status, dataPedido: pedidosVenda.dataPedido })
    .from(pedidosVenda)
    .where(eq(pedidosVenda.motoId, motoId))
    .limit(1)

  if (!vendaData && !pedido) {
    return <p className="text-sm text-slate-400">Nenhum pedido ou venda registrado.</p>
  }

  return (
    <div className="space-y-4 text-sm">
      {pedido && (
        <div className="space-y-1">
          <p className="font-medium text-slate-700">Pedido de Venda</p>
          <p>Status: <span className="font-medium">{pedido.status}</span></p>
          <p>Data: {format(new Date(pedido.dataPedido), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </div>
      )}
      {vendaData && (
        <div className="space-y-1">
          <p className="font-medium text-slate-700">Venda Efetivada</p>
          <p>Cliente: <span className="font-medium">{vendaData.cliente_nome}</span></p>
          <p>CPF: <span className="font-mono">{vendaData.cliente_cpf}</span></p>
          <p>Valor: <span className="font-medium">R$ {Number(vendaData.valor).toFixed(2)}</span></p>
          <p>Pagamento: {vendaData.forma_pagamento}</p>
          <p>Data: {format(new Date(vendaData.data_venda), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </div>
      )}
    </div>
  )
}
```

Substituir o placeholder da aba "venda" em `src/app/(dashboard)/estoque/[id]/page.tsx`:

```tsx
// Em src/app/(dashboard)/estoque/[id]/page.tsx
// Substituir:
//   <TabsContent value="venda">
//     <Card><CardContent className="pt-4 text-sm text-slate-400">
//       Implementado no Plano 2.
//     </CardContent></Card>
//   </TabsContent>
// Por:
        <TabsContent value="venda">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <VendaTab motoId={moto.id} papel={usuario.papel} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
```

Adicionar import no topo de `src/app/(dashboard)/estoque/[id]/page.tsx`:

```tsx
import { VendaTab } from './components/venda-tab'
```

- [ ] **Step 5: Testar fluxo completo de venda**

```bash
npm run dev
```

1. Acessar `/vendas` → clicar "Criar Pedido de Venda" → selecionar moto disponível → confirmar
2. Verificar que moto ficou `reservada` no estoque
3. Logar como Aux Adm → ver pedido pendente → clicar "Efetivar Venda" → preencher dados → confirmar
4. Verificar que moto ficou `vendida`
5. Acessar detalhe da moto → aba "Dados da Venda" → verificar dados (CPF mascarado para vendedor/mecânico)
6. Testar cancelamento: criar novo pedido → cancelar → verificar moto volta para `disponivel`

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/vendas/ src/app/\(dashboard\)/estoque/
git commit -m "feat: implement vendas module with pedido, efetivacao and cancelamento"
```

---

## Checklist de cobertura do spec (Fase 2)

- [x] Task 1: RPCs atômicas para transferência (solicitar, aceitar, recusar) com SELECT FOR UPDATE
- [x] Task 2: RPCs atômicas para venda (cancelar, efetivar) com pgcrypto para CPF/nome
- [x] Task 3: Queries tipadas para transferências e pedidos
- [x] Task 4: Módulo Transferências — solicitação, aceite, recusa, cards separados por seção
- [x] Task 5: Módulo Vendas — criar pedido (reserva atômica)
- [x] Task 6: Módulo Vendas — efetivar, cancelar, aba de dados da venda com CPF mascarado
- [ ] OS → Plano 3
- [ ] Garantias + pg_cron → Plano 3
- [ ] Admin CRUD → Plano 3
