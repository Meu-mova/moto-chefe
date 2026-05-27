# Fase 3 — OS + Garantias + Admin: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar Ordens de Serviço, Garantias (incluindo expiração automática via pg_cron e encerramento forçado pelo Admin), e o painel Admin com CRUD de lojas, usuários e modelos, além das ações exclusivas do Admin Geral.

**Architecture:** OS e Garantias usam RPCs SECURITY DEFINER para operações atômicas. pg_cron executa job diário para expirar garantias. Admin usa Server Actions diretas no banco (via Drizzle) com validações de negócio antes de persistir.

**Tech Stack:** Next.js 15 Server Actions, Supabase RPC + pg_cron, Drizzle ORM, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-05-26-gestao-estoque-motos-design.md`

**Pré-requisito:** Fases 1 e 2 completas.

---

## Task 1: RPCs para Ordens de Serviço

**Files:**
- Modify: `src/lib/db/rpcs.sql`

- [ ] **Step 1: Criar RPC para abrir OS**

Execute no Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION abrir_ordem_servico(
  p_moto_id uuid,
  p_loja_id uuid,
  p_aberta_por uuid,
  p_mecanico_id uuid,
  p_descricao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_loja_id uuid;
  v_os_id uuid;
BEGIN
  SELECT loja_id INTO v_moto_loja_id FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_moto_loja_id IS NULL THEN
    RAISE EXCEPTION 'Moto não encontrada';
  END IF;

  IF v_moto_loja_id != p_loja_id THEN
    RAISE EXCEPTION 'Moto não pertence à loja do usuário';
  END IF;

  INSERT INTO ordens_servico (moto_id, loja_id, aberta_por, mecanico_id, status, descricao)
  VALUES (p_moto_id, p_loja_id, p_aberta_por, p_mecanico_id, 'aberta', p_descricao)
  RETURNING id INTO v_os_id;

  RETURN v_os_id;
END;
$$;
```

- [ ] **Step 2: Criar RPC para atualizar status de OS**

```sql
CREATE OR REPLACE FUNCTION atualizar_status_os(
  p_os_id uuid,
  p_novo_status os_status,
  p_usuario_id uuid,
  p_papel text,
  p_loja_usuario_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_loja_os_id uuid;
  v_status_atual os_status;
BEGIN
  SELECT loja_id, status INTO v_loja_os_id, v_status_atual
  FROM ordens_servico WHERE id = p_os_id FOR UPDATE;

  IF v_loja_os_id IS NULL THEN
    RAISE EXCEPTION 'OS não encontrada';
  END IF;

  -- Admin pode tudo; aux_adm e mecanico apenas da sua loja
  IF p_papel != 'admin_geral' AND v_loja_os_id != p_loja_usuario_id THEN
    RAISE EXCEPTION 'Sem permissão para atualizar esta OS';
  END IF;

  IF v_status_atual = 'concluida' THEN
    RAISE EXCEPTION 'OS já concluída não pode ser alterada';
  END IF;

  UPDATE ordens_servico
  SET status = p_novo_status,
      data_conclusao = CASE WHEN p_novo_status = 'concluida' THEN now() ELSE NULL END
  WHERE id = p_os_id;
END;
$$;
```

- [ ] **Step 3: Salvar SQLs no arquivo de referência**

Adicionar em `src/lib/db/rpcs.sql`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/rpcs.sql
git commit -m "feat: add ordens_servico RPCs (abrir, atualizar_status)"
```

---

## Task 2: RPCs para Garantias

**Files:**
- Modify: `src/lib/db/rpcs.sql`

- [ ] **Step 1: Criar RPC para abrir garantia**

Execute no Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION abrir_garantia(
  p_moto_id uuid,
  p_loja_id uuid,
  p_aberta_por uuid,
  p_os_id uuid,
  p_descricao text,
  p_data_inicio date,
  p_data_fim date,
  p_data_pedido_peca date DEFAULT NULL,
  p_numero_pedido_fabrica text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_moto_loja_id uuid;
  v_moto_status moto_status;
  v_garantia_id uuid;
BEGIN
  IF p_data_fim <= p_data_inicio THEN
    RAISE EXCEPTION 'data_fim deve ser maior que data_inicio';
  END IF;

  SELECT loja_id, status INTO v_moto_loja_id, v_moto_status
  FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_moto_loja_id != p_loja_id THEN
    RAISE EXCEPTION 'Moto não pertence à loja do usuário';
  END IF;

  IF v_moto_status NOT IN ('faturada', 'montada', 'disponivel', 'em_garantia') THEN
    RAISE EXCEPTION 'Garantia não pode ser aberta para moto com status "%"', v_moto_status;
  END IF;

  -- Verificar se já há garantia ativa (partial unique index fará isso também, mas melhor mensagem)
  IF EXISTS (SELECT 1 FROM garantias WHERE moto_id = p_moto_id AND status = 'ativa') THEN
    RAISE EXCEPTION 'Já existe garantia ativa para esta moto. Encerre a anterior primeiro.';
  END IF;

  INSERT INTO garantias (
    moto_id, loja_id, os_id, descricao,
    data_inicio, data_fim, status,
    data_pedido_peca, numero_pedido_fabrica
  )
  VALUES (
    p_moto_id, p_loja_id, p_os_id, p_descricao,
    p_data_inicio, p_data_fim, 'ativa',
    p_data_pedido_peca, p_numero_pedido_fabrica
  )
  RETURNING id INTO v_garantia_id;

  -- Se moto não estava em_garantia, muda status
  IF v_moto_status != 'em_garantia' THEN
    UPDATE motos SET status = 'em_garantia' WHERE id = p_moto_id;
    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo)
    VALUES (p_moto_id, p_aberta_por, 'mudanca_status', v_moto_status, 'em_garantia');
  END IF;

  RETURN v_garantia_id;
END;
$$;
```

- [ ] **Step 2: Criar RPC para encerrar garantia (fluxo normal)**

```sql
CREATE OR REPLACE FUNCTION encerrar_garantia(
  p_garantia_id uuid,
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
  v_loja_garantia_id uuid;
  v_os_id uuid;
  v_os_status os_status;
  v_garantia_status garantia_status;
BEGIN
  SELECT moto_id, loja_id, os_id, status
  INTO v_moto_id, v_loja_garantia_id, v_os_id, v_garantia_status
  FROM garantias WHERE id = p_garantia_id FOR UPDATE;

  IF v_garantia_status != 'ativa' THEN
    RAISE EXCEPTION 'Garantia não está ativa';
  END IF;

  IF p_papel != 'admin_geral' AND v_loja_garantia_id != p_loja_usuario_id THEN
    RAISE EXCEPTION 'Sem permissão para encerrar esta garantia';
  END IF;

  -- Fluxo normal (não-admin): OS vinculada deve estar concluída
  IF p_papel != 'admin_geral' AND v_os_id IS NOT NULL THEN
    SELECT status INTO v_os_status FROM ordens_servico WHERE id = v_os_id;
    IF v_os_status != 'concluida' THEN
      RAISE EXCEPTION 'A OS vinculada deve estar concluída antes de encerrar a garantia';
    END IF;
  END IF;

  -- Lock na moto
  PERFORM id FROM motos WHERE id = v_moto_id FOR UPDATE;

  UPDATE garantias SET status = 'encerrada' WHERE id = p_garantia_id;
  UPDATE motos SET status = 'disponivel' WHERE id = v_moto_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
  VALUES (v_moto_id, p_usuario_id, 'mudanca_status', 'em_garantia', 'disponivel', p_observacao);
END;
$$;
```

- [ ] **Step 3: Criar job pg_cron para expiração automática**

```sql
-- Habilitar pg_cron (já vem ativado no Supabase)
-- Criar função de expiração
CREATE OR REPLACE FUNCTION expirar_garantias()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_garantia RECORD;
BEGIN
  FOR v_garantia IN
    SELECT g.id, g.moto_id
    FROM garantias g
    WHERE g.status = 'ativa' AND g.data_fim < CURRENT_DATE
  LOOP
    -- Lock na moto
    PERFORM id FROM motos WHERE id = v_garantia.moto_id FOR UPDATE;

    UPDATE garantias SET status = 'encerrada' WHERE id = v_garantia.id;
    UPDATE motos SET status = 'disponivel' WHERE id = v_garantia.moto_id;

    INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
    -- usuario_id usa um UUID fixo do sistema — crie um registro de "sistema" na tabela usuarios
    SELECT v_garantia.moto_id, u.id, 'mudanca_status', 'em_garantia', 'disponivel',
           'Encerramento automático por expiração de data_fim'
    FROM usuarios u WHERE u.papel = 'admin_geral' LIMIT 1;
  END LOOP;
END;
$$;

-- Agendar execução diária às 03:00
SELECT cron.schedule(
  'expirar-garantias-diario',
  '0 3 * * *',
  'SELECT expirar_garantias()'
);
```

- [ ] **Step 4: Salvar SQLs no arquivo de referência**

Adicionar em `src/lib/db/rpcs.sql`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/rpcs.sql
git commit -m "feat: add garantias RPCs (abrir, encerrar) and pg_cron expiry job"
```

---

## Task 3: Módulo Ordens de Serviço

**Files:**
- Create: `src/lib/queries/ordens-servico.ts`
- Create: `src/app/(dashboard)/ordens-servico/page.tsx`
- Create: `src/app/(dashboard)/ordens-servico/actions.ts`
- Create: `src/app/(dashboard)/ordens-servico/components/os-card.tsx`
- Create: `src/app/(dashboard)/ordens-servico/components/abrir-os-dialog.tsx`
- Create: `src/app/(dashboard)/estoque/[id]/components/os-tab.tsx`

- [ ] **Step 1: Criar queries de OS**

```typescript
// src/lib/queries/ordens-servico.ts
import { db } from '@/lib/db'
import { ordensServico, motos, lojas, usuarios, modelos } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'

export type OSComDetalhes = Awaited<ReturnType<typeof listarOSPorLoja>>[0]

export async function listarOSPorLoja(lojaId: string) {
  return db
    .select({
      id: ordensServico.id,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      motoId: ordensServico.motoId,
      lojaId: ordensServico.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      abertaPorNome: usuarios.nome,
      mecanicoId: ordensServico.mecanicoId,
    })
    .from(ordensServico)
    .innerJoin(motos, eq(ordensServico.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(ordensServico.lojaId, lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor, usuarios.id))
    .where(eq(ordensServico.lojaId, lojaId))
    .orderBy(ordensServico.dataAbertura)
}

export async function listarTodasOS() {
  return db
    .select({
      id: ordensServico.id,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      motoId: ordensServico.motoId,
      lojaId: ordensServico.lojaId,
      chassi: motos.chassi,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      abertaPorNome: usuarios.nome,
      mecanicoId: ordensServico.mecanicoId,
    })
    .from(ordensServico)
    .innerJoin(motos, eq(ordensServico.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(ordensServico.lojaId, lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor, usuarios.id))
    .orderBy(ordensServico.dataAbertura)
}

export async function listarOSPorMoto(motoId: string) {
  return db
    .select({
      id: ordensServico.id,
      status: ordensServico.status,
      descricao: ordensServico.descricao,
      dataAbertura: ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      abertaPorNome: usuarios.nome,
      mecanicoId: ordensServico.mecanicoId,
    })
    .from(ordensServico)
    .innerJoin(usuarios, eq(ordensServico.abertaPor, usuarios.id))
    .where(eq(ordensServico.motoId, motoId))
    .orderBy(ordensServico.dataAbertura)
}
```

- [ ] **Step 2: Criar Server Actions de OS**

```typescript
// src/app/(dashboard)/ordens-servico/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function abrirOSAction(
  motoId: string,
  mecanicoId: string | null,
  descricao: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para abrir OS')
  }
  if (!usuario.lojaId && usuario.papel !== 'admin_geral') {
    throw new Error('Usuário sem loja associada')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('abrir_ordem_servico', {
    p_moto_id: motoId,
    p_loja_id: usuario.lojaId,
    p_aberta_por: usuario.id,
    p_mecanico_id: mecanicoId ?? null,
    p_descricao: descricao,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/ordens-servico')
  revalidatePath(`/estoque/${motoId}`)
}

export async function atualizarStatusOSAction(osId: string, novoStatus: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm', 'mecanico'].includes(usuario.papel)) {
    throw new Error('Sem permissão para atualizar OS')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('atualizar_status_os', {
    p_os_id: osId,
    p_novo_status: novoStatus,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/ordens-servico')
}
```

- [ ] **Step 3: Criar card de OS**

```tsx
// src/app/(dashboard)/ordens-servico/components/os-card.tsx
'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { atualizarStatusOSAction } from '../actions'
import type { OSComDetalhes } from '@/lib/queries/ordens-servico'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusBadge: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aberta: 'outline',
  em_andamento: 'default',
  concluida: 'secondary',
}

const nextStatus: Record<string, string> = {
  aberta: 'em_andamento',
  em_andamento: 'concluida',
}

const nextLabel: Record<string, string> = {
  aberta: 'Iniciar',
  em_andamento: 'Concluir',
}

type Props = {
  os: OSComDetalhes
  papel: string
  lojaIdUsuario: string | null
}

export function OSCard({ os, papel, lojaIdUsuario }: Props) {
  const [loading, setLoading] = useState(false)

  const podeAtualizar =
    os.status !== 'concluida' &&
    ['admin_geral', 'aux_adm', 'mecanico'].includes(papel) &&
    (papel === 'admin_geral' || lojaIdUsuario === os.lojaId)

  async function handleAvancar() {
    const novo = nextStatus[os.status]
    if (!novo) return
    setLoading(true)
    try {
      await atualizarStatusOSAction(os.id, novo)
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
            <p className="font-medium text-sm">{os.marca} {os.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{os.chassi}</p>
          </div>
          <Badge variant={statusBadge[os.status] ?? 'secondary'}>
            {os.status === 'aberta' ? 'Aberta' : os.status === 'em_andamento' ? 'Em Andamento' : 'Concluída'}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">{os.descricao}</p>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{os.lojaNome}</span></p>
          <p>Aberta por: <span className="text-slate-700">{os.abertaPorNome}</span> em {format(new Date(os.dataAbertura), "dd/MM/yyyy", { locale: ptBR })}</p>
          {os.dataConclusao && (
            <p>Concluída em: {format(new Date(os.dataConclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
          )}
        </div>
        {podeAtualizar && nextStatus[os.status] && (
          <Button size="sm" onClick={handleAvancar} disabled={loading}>
            {loading ? 'Salvando...' : nextLabel[os.status]}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Criar dialog de abertura de OS**

```tsx
// src/app/(dashboard)/ordens-servico/components/abrir-os-dialog.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { abrirOSAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string }
type Mecanico = { id: string; nome: string }
type Props = { motos: Moto[]; mecanicos: Mecanico[]; papel: string }

export function AbrirOSDialog({ motos, mecanicos, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [mecanicoId, setMecanicoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAbrir() {
    if (!motoId || !descricao) return
    setLoading(true)
    try {
      await abrirOSAction(motoId, mecanicoId || null, descricao)
      setOpen(false)
      setMotoId('')
      setMecanicoId('')
      setDescricao('')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'aux_adm'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir OS</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Ordem de Serviço</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto</Label>
              <Select value={motoId} onValueChange={setMotoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
                <SelectContent>
                  {motos.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.marca} {m.modelo} — {m.chassi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mecânico Responsável (opcional)</Label>
              <Select value={mecanicoId} onValueChange={setMecanicoId}>
                <SelectTrigger><SelectValue placeholder="Selecionar mecânico" /></SelectTrigger>
                <SelectContent>
                  {mecanicos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva o problema ou serviço..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleAbrir} disabled={loading || !motoId || !descricao}>
              {loading ? 'Abrindo...' : 'Abrir OS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 5: Criar página de OS**

```tsx
// src/app/(dashboard)/ordens-servico/page.tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarOSPorLoja, listarTodasOS } from '@/lib/queries/ordens-servico'
import { db } from '@/lib/db'
import { motos, modelos, usuarios } from '@/lib/db/schema'
import { eq, ne } from 'drizzle-orm'
import { OSCard } from './components/os-card'
import { AbrirOSDialog } from './components/abrir-os-dialog'

export default async function OrdensServicoPage() {
  const usuario = await getUsuarioLogado()

  const lista = usuario.papel === 'admin_geral'
    ? await listarTodasOS()
    : await listarOSPorLoja(usuario.lojaId!)

  // Motos da loja do usuário (para admin: todas)
  const motosQuery = db
    .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))

  const motosDaLoja = usuario.papel === 'admin_geral'
    ? await motosQuery
    : await motosQuery.where(eq(motos.lojaId, usuario.lojaId!))

  const mecanicos = await db
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.papel, 'mecanico'))

  const abertas = lista.filter(o => o.status !== 'concluida')
  const concluidas = lista.filter(o => o.status === 'concluida')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-slate-500 text-sm">Acompanhamento de manutenções</p>
        </div>
        <AbrirOSDialog motos={motosDaLoja} mecanicos={mecanicos} papel={usuario.papel} />
      </div>

      {abertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Em Aberto ({abertas.length})</h2>
          {abertas.map(o => (
            <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {concluidas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Concluídas</h2>
          {concluidas.map(o => (
            <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhuma ordem de serviço registrada.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Criar aba OS no detalhe da moto**

```tsx
// src/app/(dashboard)/estoque/[id]/components/os-tab.tsx
import { listarOSPorMoto } from '@/lib/queries/ordens-servico'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusLabel: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
}

export async function OSTab({ motoId }: { motoId: string }) {
  const lista = await listarOSPorMoto(motoId)
  return (
    <div className="space-y-3">
      {lista.map(os => (
        <div key={os.id} className="p-3 border rounded-lg space-y-1">
          <div className="flex justify-between">
            <p className="text-sm font-medium">{os.descricao}</p>
            <Badge variant={os.status === 'concluida' ? 'secondary' : 'default'}>
              {statusLabel[os.status]}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Aberta por {os.abertaPorNome} em {format(new Date(os.dataAbertura), "dd/MM/yyyy", { locale: ptBR })}
          </p>
          {os.dataConclusao && (
            <p className="text-xs text-slate-400">
              Concluída em {format(new Date(os.dataConclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma OS para esta moto.</p>
      )}
    </div>
  )
}
```

Substituir o placeholder da aba "os" em `src/app/(dashboard)/estoque/[id]/page.tsx`:

```tsx
// Substituir:
//   <TabsContent value="os">
//     <Card><CardContent className="pt-4 text-sm text-slate-400">
//       Implementado no Plano 3.
//     </CardContent></Card>
//   </TabsContent>
// Por:
        <TabsContent value="os">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <OSTab motoId={moto.id} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
```

Adicionar import:

```tsx
import { OSTab } from './components/os-tab'
```

- [ ] **Step 7: Testar fluxo de OS**

```bash
npm run dev
```

1. Abrir OS para uma moto → verificar aparece em "Em Aberto"
2. Clicar "Iniciar" → status muda para `em_andamento`
3. Clicar "Concluir" → status muda para `concluida`
4. Verificar aba OS no detalhe da moto

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/ordens-servico/ src/lib/queries/ordens-servico.ts src/app/\(dashboard\)/estoque/
git commit -m "feat: implement ordens-servico module with status progression"
```

---

## Task 4: Módulo Garantias

**Files:**
- Create: `src/lib/queries/garantias.ts`
- Create: `src/app/(dashboard)/garantias/page.tsx`
- Create: `src/app/(dashboard)/garantias/actions.ts`
- Create: `src/app/(dashboard)/garantias/components/garantia-card.tsx`
- Create: `src/app/(dashboard)/garantias/components/abrir-garantia-dialog.tsx`
- Create: `src/app/(dashboard)/estoque/[id]/components/garantias-tab.tsx`

- [ ] **Step 1: Criar queries de garantias**

```typescript
// src/lib/queries/garantias.ts
import { db } from '@/lib/db'
import { garantias, motos, lojas, ordensServico, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type GarantiaComDetalhes = Awaited<ReturnType<typeof listarGarantiasPorLoja>>[0]

export async function listarGarantiasPorLoja(lojaId: string) {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      lojaId: garantias.lojaId,
      motoId: garantias.motoId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      osId: garantias.osId,
    })
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .where(eq(garantias.lojaId, lojaId))
    .orderBy(garantias.dataInicio)
}

export async function listarTodasGarantias() {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      lojaId: garantias.lojaId,
      motoId: garantias.motoId,
      chassi: motos.chassi,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      osId: garantias.osId,
    })
    .from(garantias)
    .innerJoin(motos, eq(garantias.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(garantias.lojaId, lojas.id))
    .orderBy(garantias.dataInicio)
}

export async function listarGarantiasPorMoto(motoId: string) {
  return db
    .select({
      id: garantias.id,
      status: garantias.status,
      descricao: garantias.descricao,
      dataInicio: garantias.dataInicio,
      dataFim: garantias.dataFim,
      dataPedidoPeca: garantias.dataPedidoPeca,
      numeroPedidoFabrica: garantias.numeroPedidoFabrica,
      osId: garantias.osId,
    })
    .from(garantias)
    .where(eq(garantias.motoId, motoId))
    .orderBy(garantias.dataInicio)
}
```

- [ ] **Step 2: Criar Server Actions de garantia**

```typescript
// src/app/(dashboard)/garantias/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function abrirGarantiaAction(params: {
  motoId: string
  osId?: string
  descricao: string
  dataInicio: string
  dataFim: string
  dataPedidoPeca?: string
  numeroPedidoFabrica?: string
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para abrir garantia')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('abrir_garantia', {
    p_moto_id: params.motoId,
    p_loja_id: usuario.lojaId,
    p_aberta_por: usuario.id,
    p_os_id: params.osId ?? null,
    p_descricao: params.descricao,
    p_data_inicio: params.dataInicio,
    p_data_fim: params.dataFim,
    p_data_pedido_peca: params.dataPedidoPeca ?? null,
    p_numero_pedido_fabrica: params.numeroPedidoFabrica ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/garantias')
  revalidatePath(`/estoque/${params.motoId}`)
}

export async function encerrarGarantiaAction(garantiaId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()
  const { error } = await supabase.rpc('encerrar_garantia', {
    p_garantia_id: garantiaId,
    p_usuario_id: usuario.id,
    p_papel: usuario.papel,
    p_loja_usuario_id: usuario.lojaId ?? null,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/garantias')
  revalidatePath('/estoque')
}
```

- [ ] **Step 3: Criar card de garantia**

```tsx
// src/app/(dashboard)/garantias/components/garantia-card.tsx
'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { encerrarGarantiaAction } from '../actions'
import type { GarantiaComDetalhes } from '@/lib/queries/garantias'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Props = {
  garantia: GarantiaComDetalhes
  papel: string
  lojaIdUsuario: string | null
}

export function GarantiaCard({ garantia: g, papel, lojaIdUsuario }: Props) {
  const [open, setOpen] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const podeEncerrar =
    g.status === 'ativa' &&
    (papel === 'admin_geral' || (papel === 'aux_adm' && lojaIdUsuario === g.lojaId))

  async function handleEncerrar() {
    setLoading(true)
    try {
      await encerrarGarantiaAction(g.id, observacao)
      setOpen(false)
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
            <p className="font-medium text-sm">{g.marca} {g.modelo}</p>
            <p className="text-xs font-mono text-slate-500">{g.chassi}</p>
          </div>
          <Badge variant={g.status === 'ativa' ? 'default' : 'secondary'}>
            {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">{g.descricao}</p>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Loja: <span className="text-slate-700">{g.lojaNome}</span></p>
          <p>Período: {g.dataInicio} → {g.dataFim}</p>
          {g.dataPedidoPeca && <p>Pedido peça: {g.dataPedidoPeca}</p>}
          {g.numeroPedidoFabrica && <p>Pedido fábrica: <span className="text-slate-700">{g.numeroPedidoFabrica}</span></p>}
        </div>
        {podeEncerrar && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Encerrar Garantia</Button>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Encerrar Garantia</DialogTitle></DialogHeader>
          <Textarea
            placeholder={papel === 'admin_geral' ? 'Motivo do encerramento forçado (obrigatório para admin)' : 'Observação (opcional)'}
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleEncerrar}
              disabled={loading || (papel === 'admin_geral' && !observacao)}
            >
              {loading ? 'Encerrando...' : 'Confirmar Encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
```

- [ ] **Step 4: Criar dialog de abertura de garantia**

```tsx
// src/app/(dashboard)/garantias/components/abrir-garantia-dialog.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { abrirGarantiaAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string }
type OS = { id: string; descricao: string; motoId: string }
type Props = { motos: Moto[]; ordens: OS[]; papel: string }

export function AbrirGarantiaDialog({ motos, ordens, papel }: Props) {
  const [open, setOpen] = useState(false)
  const [motoId, setMotoId] = useState('')
  const [osId, setOsId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataPedidoPeca, setDataPedidoPeca] = useState('')
  const [numeroPedidoFabrica, setNumeroPedidoFabrica] = useState('')
  const [loading, setLoading] = useState(false)

  const ordensDaMoto = ordens.filter(o => o.motoId === motoId)

  async function handleAbrir() {
    if (!motoId || !descricao || !dataInicio || !dataFim) return
    setLoading(true)
    try {
      await abrirGarantiaAction({
        motoId,
        osId: osId || undefined,
        descricao,
        dataInicio,
        dataFim,
        dataPedidoPeca: dataPedidoPeca || undefined,
        numeroPedidoFabrica: numeroPedidoFabrica || undefined,
      })
      setOpen(false)
      setMotoId(''); setOsId(''); setDescricao(''); setDataInicio(''); setDataFim('')
      setDataPedidoPeca(''); setNumeroPedidoFabrica('')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!['admin_geral', 'aux_adm'].includes(papel)) return null

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir Garantia</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Garantia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Moto</Label>
              <Select value={motoId} onValueChange={v => { setMotoId(v); setOsId('') }}>
                <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
                <SelectContent>
                  {motos.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.marca} {m.modelo} — {m.chassi}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ordensDaMoto.length > 0 && (
              <div className="space-y-2">
                <Label>OS Vinculada (opcional)</Label>
                <Select value={osId} onValueChange={setOsId}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    {ordensDaMoto.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do problema em garantia..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data Fim</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data Pedido da Peça (opcional)</Label>
              <Input type="date" value={dataPedidoPeca} onChange={e => setDataPedidoPeca(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Número do Pedido na Fábrica (opcional)</Label>
              <Input value={numeroPedidoFabrica} onChange={e => setNumeroPedidoFabrica(e.target.value)} placeholder="Ex: FAB-2024-001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleAbrir} disabled={loading || !motoId || !descricao || !dataInicio || !dataFim}>
              {loading ? 'Abrindo...' : 'Abrir Garantia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 5: Criar página de garantias**

```tsx
// src/app/(dashboard)/garantias/page.tsx
import { getUsuarioLogado } from '@/lib/auth'
import { listarGarantiasPorLoja, listarTodasGarantias } from '@/lib/queries/garantias'
import { db } from '@/lib/db'
import { motos, modelos, ordensServico } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { GarantiaCard } from './components/garantia-card'
import { AbrirGarantiaDialog } from './components/abrir-garantia-dialog'

export default async function GarantiasPage() {
  const usuario = await getUsuarioLogado()

  const lista = usuario.papel === 'admin_geral'
    ? await listarTodasGarantias()
    : await listarGarantiasPorLoja(usuario.lojaId!)

  const motosQuery = db
    .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .where(inArray(motos.status, ['faturada', 'montada', 'disponivel', 'em_garantia']))

  const motosDaLoja = usuario.papel === 'admin_geral'
    ? await motosQuery
    : await motosQuery.where(eq(motos.lojaId, usuario.lojaId!))

  const ordensAbertas = await db
    .select({ id: ordensServico.id, descricao: ordensServico.descricao, motoId: ordensServico.motoId })
    .from(ordensServico)
    .where(inArray(ordensServico.status, ['aberta', 'em_andamento']))

  const ativas = lista.filter(g => g.status === 'ativa')
  const encerradas = lista.filter(g => g.status === 'encerrada')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Garantias</h1>
          <p className="text-slate-500 text-sm">Acompanhamento de garantias</p>
        </div>
        <AbrirGarantiaDialog motos={motosDaLoja} ordens={ordensAbertas} papel={usuario.papel} />
      </div>

      {ativas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Ativas ({ativas.length})</h2>
          {ativas.map(g => (
            <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {encerradas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Encerradas</h2>
          {encerradas.map(g => (
            <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhuma garantia registrada.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Criar aba de garantias no detalhe da moto**

```tsx
// src/app/(dashboard)/estoque/[id]/components/garantias-tab.tsx
import { listarGarantiasPorMoto } from '@/lib/queries/garantias'
import { Badge } from '@/components/ui/badge'

export async function GarantiasTab({ motoId }: { motoId: string }) {
  const lista = await listarGarantiasPorMoto(motoId)
  return (
    <div className="space-y-3">
      {lista.map(g => (
        <div key={g.id} className="p-3 border rounded-lg space-y-1">
          <div className="flex justify-between">
            <p className="text-sm font-medium">{g.descricao}</p>
            <Badge variant={g.status === 'ativa' ? 'default' : 'secondary'}>
              {g.status === 'ativa' ? 'Ativa' : 'Encerrada'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400">{g.dataInicio} → {g.dataFim}</p>
          {g.numeroPedidoFabrica && (
            <p className="text-xs text-slate-500">Pedido fábrica: {g.numeroPedidoFabrica}</p>
          )}
        </div>
      ))}
      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma garantia para esta moto.</p>
      )}
    </div>
  )
}
```

Substituir o placeholder da aba "garantias" em `src/app/(dashboard)/estoque/[id]/page.tsx`:

```tsx
// Substituir:
//   <TabsContent value="garantias">
//     <Card><CardContent className="pt-4 text-sm text-slate-400">
//       Implementado no Plano 3.
//     </CardContent></Card>
//   </TabsContent>
// Por:
        <TabsContent value="garantias">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <GarantiasTab motoId={moto.id} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
```

Adicionar import:

```tsx
import { GarantiasTab } from './components/garantias-tab'
```

- [ ] **Step 7: Testar fluxo de garantia**

```bash
npm run dev
```

1. Abrir garantia para moto disponível → verificar que moto ficou `em_garantia`
2. Testar encerramento normal (sem OS vinculada)
3. Abrir garantia com OS vinculada → tentar encerrar sem concluir OS → verificar erro
4. Concluir OS → encerrar garantia → verificar que moto voltou para `disponivel`
5. Logar como Admin Geral → encerrar garantia com OS aberta (forçado) → verificar observação obrigatória

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/garantias/ src/lib/queries/garantias.ts src/app/\(dashboard\)/estoque/
git commit -m "feat: implement garantias module with abrir/encerrar and pg_cron expiry"
```

---

## Task 5: Painel Admin — CRUD de Lojas, Usuários e Modelos

**Files:**
- Create: `src/app/(dashboard)/admin/page.tsx`
- Create: `src/app/(dashboard)/admin/lojas/page.tsx`
- Create: `src/app/(dashboard)/admin/lojas/actions.ts`
- Create: `src/app/(dashboard)/admin/usuarios/page.tsx`
- Create: `src/app/(dashboard)/admin/usuarios/actions.ts`
- Create: `src/app/(dashboard)/admin/modelos/page.tsx`
- Create: `src/app/(dashboard)/admin/modelos/actions.ts`
- Create: `src/app/(dashboard)/admin/components/admin-guard.tsx`

- [ ] **Step 1: Criar guard de acesso Admin**

```tsx
// src/app/(dashboard)/admin/components/admin-guard.tsx
import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') redirect('/estoque')
  return <>{children}</>
}
```

- [ ] **Step 2: Criar página admin principal**

```tsx
// src/app/(dashboard)/admin/page.tsx
import { AdminGuard } from './components/admin-guard'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Bike } from 'lucide-react'

export default function AdminPage() {
  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Administração</h1>
          <p className="text-slate-500 text-sm">Gerenciamento do sistema</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Link href="/admin/lojas">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Building2 className="text-slate-600" size={20} />
                <CardTitle className="text-base">Lojas</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar lojas da rede</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/usuarios">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Users className="text-slate-600" size={20} />
                <CardTitle className="text-base">Usuários</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar usuários e papéis</p></CardContent>
            </Card>
          </Link>
          <Link href="/admin/modelos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Bike className="text-slate-600" size={20} />
                <CardTitle className="text-base">Modelos</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Gerenciar modelos de moto</p></CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 3: Criar actions de lojas**

```typescript
// src/app/(dashboard)/admin/lojas/actions.ts
'use server'
import { db } from '@/lib/db'
import { lojas, motos, usuarios } from '@/lib/db/schema'
import { eq, and, ne, count } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function criarLojaAction(formData: FormData) {
  await assertAdmin()
  await db.insert(lojas).values({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
  })
  revalidatePath('/admin/lojas')
}

export async function editarLojaAction(id: string, formData: FormData) {
  await assertAdmin()
  await db.update(lojas).set({
    nome: formData.get('nome') as string,
    cidade: formData.get('cidade') as string,
    endereco: formData.get('endereco') as string,
  }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
}

export async function desativarLojaAction(id: string) {
  await assertAdmin()

  // Verificar motos ativas
  const [{ total: motosAtivas }] = await db
    .select({ total: count() })
    .from(motos)
    .where(and(eq(motos.lojaId, id), ne(motos.status, 'vendida')))

  if (motosAtivas > 0) {
    throw new Error(`Loja possui ${motosAtivas} moto(s) ativa(s). Transfira-as antes de desativar.`)
  }

  // Verificar usuários ativos
  const [{ total: usuariosAtivos }] = await db
    .select({ total: count() })
    .from(usuarios)
    .where(eq(usuarios.lojaId, id))

  if (usuariosAtivos > 0) {
    throw new Error(`Loja possui ${usuariosAtivos} usuário(s) associado(s). Reatribua-os antes de desativar.`)
  }

  await db.update(lojas).set({ ativa: false }).where(eq(lojas.id, id))
  revalidatePath('/admin/lojas')
}
```

- [ ] **Step 4: Criar página de lojas**

```tsx
// src/app/(dashboard)/admin/lojas/page.tsx
import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { desativarLojaAction } from './actions'

export default async function LojasPage() {
  const todas = await db.select().from(lojas).orderBy(lojas.nome)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Lojas</h1>
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {todas.map(loja => (
                <TableRow key={loja.id}>
                  <TableCell className="font-medium">{loja.nome}</TableCell>
                  <TableCell>{loja.cidade}</TableCell>
                  <TableCell>{loja.endereco}</TableCell>
                  <TableCell>
                    <Badge variant={loja.ativa ? 'default' : 'secondary'}>
                      {loja.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {loja.ativa && (
                      <form action={desativarLojaAction.bind(null, loja.id)}>
                        <Button variant="destructive" size="sm" type="submit">Desativar</Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 5: Criar actions de usuários**

```typescript
// src/app/(dashboard)/admin/usuarios/actions.ts
'use server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

export async function criarUsuarioAction(formData: FormData) {
  await assertAdmin()
  const supabase = await createClient()

  const email = formData.get('email') as string
  const nome = formData.get('nome') as string
  const papel = formData.get('papel') as string
  const lojaId = (formData.get('loja_id') as string) || null
  const senha = formData.get('senha') as string

  // Criar usuário no Supabase Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)

  // Criar perfil na tabela usuarios
  await db.insert(usuarios).values({
    id: data.user.id,
    nome,
    email,
    papel: papel as any,
    lojaId,
  })

  revalidatePath('/admin/usuarios')
}

export async function editarPapelAction(id: string, papel: string, lojaId: string | null) {
  await assertAdmin()
  await db.update(usuarios).set({ papel: papel as any, lojaId }).where(eq(usuarios.id, id))
  revalidatePath('/admin/usuarios')
}
```

- [ ] **Step 6: Criar página de usuários**

```tsx
// src/app/(dashboard)/admin/usuarios/page.tsx
import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const papelLabel: Record<string, string> = {
  admin_geral: 'Admin Geral',
  aux_adm: 'Aux. Adm.',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
}

export default async function UsuariosPage() {
  const todos = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      papel: usuarios.papel,
      lojaId: usuarios.lojaId,
      lojaNome: lojas.nome,
    })
    .from(usuarios)
    .leftJoin(lojas, eq(usuarios.lojaId, lojas.id))
    .orderBy(usuarios.nome)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Usuários</h1>
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Loja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome}</TableCell>
                  <TableCell className="text-slate-500">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{papelLabel[u.papel] ?? u.papel}</Badge>
                  </TableCell>
                  <TableCell>{u.lojaNome ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 7: Criar actions e página de modelos**

```typescript
// src/app/(dashboard)/admin/modelos/actions.ts
'use server'
import { db } from '@/lib/db'
import { modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

export async function criarModeloAction(formData: FormData) {
  await assertAdmin()
  await db.insert(modelos).values({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
    motor: formData.get('motor') as string,
    velocidadeMax: formData.get('velocidade_max') as string,
  })
  revalidatePath('/admin/modelos')
}

export async function editarModeloAction(id: string, formData: FormData) {
  await assertAdmin()
  await db.update(modelos).set({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
    motor: formData.get('motor') as string,
    velocidadeMax: formData.get('velocidade_max') as string,
  }).where(eq(modelos.id, id))
  revalidatePath('/admin/modelos')
}
```

```tsx
// src/app/(dashboard)/admin/modelos/page.tsx
import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { modelos } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function ModelosPage() {
  const todos = await db.select().from(modelos).orderBy(modelos.marca)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Modelos</h1>
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Potência</TableHead>
                <TableHead>Motor</TableHead>
                <TableHead>Vel. Máx.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.marca}</TableCell>
                  <TableCell>{m.modelo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.categoria}</Badge>
                  </TableCell>
                  <TableCell>{m.potenciaW}W</TableCell>
                  <TableCell>{m.motor}</TableCell>
                  <TableCell>{m.velocidadeMax} km/h</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/admin/
git commit -m "feat: implement admin panel with lojas, usuarios and modelos management"
```

---

## Task 6: Ações exclusivas do Admin Geral

**Files:**
- Create: `src/app/(dashboard)/admin/acoes/page.tsx`
- Create: `src/app/(dashboard)/admin/acoes/actions.ts`

- [ ] **Step 1: Criar actions admin especiais**

```typescript
// src/app/(dashboard)/admin/acoes/actions.ts
'use server'
import { db } from '@/lib/db'
import { motos, lojas, historico_estoque } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Importar com o nome correto do schema
import { historicoEstoque } from '@/lib/db/schema'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function reatribuirLojaMotaAction(motoId: string, novaLojaId: string, observacao: string) {
  const admin = await assertAdmin()

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status !== 'faturada') throw new Error('Reatribuição de loja só permitida para motos com status "faturada"')
  if (!observacao) throw new Error('Observação obrigatória para reatribuição de loja')

  const lojaAnteriorId = moto.lojaId

  await db.update(motos).set({ lojaId: novaLojaId }).where(eq(motos.id, motoId))
  await db.insert(historicoEstoque).values({
    motoId,
    lojaOrigemId: lojaAnteriorId,
    lojaDestinoId: novaLojaId,
    usuarioId: admin.id,
    tipo: 'transferencia_enviada',
    observacao: `Reatribuição de loja pelo Admin: ${observacao}`,
  })

  revalidatePath('/estoque')
  revalidatePath(`/estoque/${motoId}`)
}

export async function correcaoStatusAdminAction(motoId: string, novoStatus: string, observacao: string) {
  const admin = await assertAdmin()
  if (!observacao) throw new Error('Observação obrigatória para correção de status')

  const supabase = await createClient()
  const { error } = await supabase.rpc('mudar_status_moto', {
    p_moto_id: motoId,
    p_novo_status: novoStatus,
    p_usuario_id: admin.id,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/estoque/${motoId}`)
}
```

- [ ] **Step 2: Criar página de ações admin**

```tsx
// src/app/(dashboard)/admin/acoes/page.tsx
import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { motos, lojas, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ReatribuirLojaForm } from './components/reatribuir-loja-form'

export default async function AcoesAdminPage() {
  const motasFaturadas = await db
    .select({ id: motos.id, chassi: motos.chassi, lojaId: motos.lojaId, marca: modelos.marca, modelo: modelos.modelo })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .where(eq(motos.status, 'faturada'))

  const todasLojas = await db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(eq(lojas.ativa, true))

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Ações Administrativas</h1>
        <ReatribuirLojaForm motos={motasFaturadas} lojas={todasLojas} />
      </div>
    </AdminGuard>
  )
}
```

- [ ] **Step 3: Criar formulário de reatribuição de loja**

```tsx
// src/app/(dashboard)/admin/acoes/components/reatribuir-loja-form.tsx
'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { reatribuirLojaMotaAction } from '../actions'

type Moto = { id: string; chassi: string; marca: string; modelo: string; lojaId: string }
type Loja = { id: string; nome: string }

export function ReatribuirLojaForm({ motos, lojas }: { motos: Moto[]; lojas: Loja[] }) {
  const [motoId, setMotoId] = useState('')
  const [novaLojaId, setNovaLojaId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const motoSelecionada = motos.find(m => m.id === motoId)
  const lojasDestino = lojas.filter(l => l.id !== motoSelecionada?.lojaId)

  async function handleReatribuir() {
    if (!motoId || !novaLojaId || !observacao) return
    setLoading(true)
    try {
      await reatribuirLojaMotaAction(motoId, novaLojaId, observacao)
      setMotoId(''); setNovaLojaId(''); setObservacao('')
      alert('Loja reatribuída com sucesso.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reatribuir Loja de Moto Faturada</CardTitle>
        <p className="text-sm text-slate-500">Corrige o loja_id de motos cadastradas na loja errada. Apenas motos com status "Faturada".</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Moto Faturada</Label>
          <Select value={motoId} onValueChange={v => { setMotoId(v); setNovaLojaId('') }}>
            <SelectTrigger><SelectValue placeholder="Selecionar moto" /></SelectTrigger>
            <SelectContent>
              {motos.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.marca} {m.modelo} — {m.chassi}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nova Loja</Label>
          <Select value={novaLojaId} onValueChange={setNovaLojaId} disabled={!motoId}>
            <SelectTrigger><SelectValue placeholder="Selecionar loja" /></SelectTrigger>
            <SelectContent>
              {lojasDestino.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Motivo da Correção (obrigatório)</Label>
          <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: Moto cadastrada na loja errada durante a entrada do lote..." />
        </div>
        <Button onClick={handleReatribuir} disabled={loading || !motoId || !novaLojaId || !observacao}>
          {loading ? 'Reatribuindo...' : 'Reatribuir Loja'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Adicionar link para ações no painel admin**

Modificar `src/app/(dashboard)/admin/page.tsx` para incluir mais um card:

```tsx
// Adicionar import no topo:
import { Settings2 } from 'lucide-react'

// Adicionar card na grid (após o card de Modelos):
          <Link href="/admin/acoes">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex-row gap-3 items-center pb-2">
                <Settings2 className="text-slate-600" size={20} />
                <CardTitle className="text-base">Ações Especiais</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-slate-500">Reatribuição de loja, correções</p></CardContent>
            </Card>
          </Link>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/admin/acoes/
git commit -m "feat: add admin special actions (reatribuir loja, correcao status)"
```

---

## Task 7: Testes de integração e ajustes finais

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx` (grid-cols-4)

- [ ] **Step 1: Testar fluxo completo de OS + Garantia**

```bash
npm run dev
```

1. Moto `disponivel` → abrir OS → status da moto **não muda** (OS não muda status)
2. Moto `disponivel` → abrir garantia → status vai para `em_garantia`
3. Abrir OS vinculada à garantia → concluir OS → encerrar garantia → status volta para `disponivel`
4. Testar encerramento forçado pelo admin com observação → funciona mesmo com OS em aberto

- [ ] **Step 2: Testar pg_cron (simulação manual)**

No Supabase SQL Editor, inserir garantia vencida:

```sql
INSERT INTO garantias (moto_id, loja_id, descricao, data_inicio, data_fim, status)
SELECT
  m.id,
  m.loja_id,
  'Garantia de teste vencida',
  '2024-01-01',
  '2024-01-31',
  'ativa'
FROM motos m LIMIT 1;

-- Simular execução do job
SELECT expirar_garantias();

-- Verificar que garantia foi encerrada e moto voltou para disponivel
SELECT g.status, m.status
FROM garantias g
JOIN motos m ON g.moto_id = m.id
WHERE g.descricao = 'Garantia de teste vencida';
```

Expected: `g.status = 'encerrada'`, `m.status = 'disponivel'`.

- [ ] **Step 3: Testar painel admin**

1. Logar como admin → `/admin` → clicar em Lojas → verificar listagem
2. Tentar desativar loja com motos ativas → verificar erro
3. `/admin/usuarios` → verificar listagem com papéis
4. `/admin/modelos` → verificar listagem
5. `/admin/acoes` → reatribuir loja de moto faturada → verificar `loja_id` mudou no banco

- [ ] **Step 4: Verificar sidebar para mecânico**

Logar como mecânico. Verificar que:
- `/ordens-servico` aparece e mostra OS da sua loja
- Botões "Iniciar" e "Concluir" aparecem
- `/transferencias`, `/vendas`, `/garantias`, `/admin` estão acessíveis para leitura mas sem botões de ação para funções restritas
- Tentar chamar action proibida → erro correto retornado

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat: complete fase 3 — all modules implemented and tested"
```

---

## Checklist de cobertura do spec (Fase 3)

- [x] Task 1: RPCs atômicas para OS (abrir, atualizar_status com validações de loja e papel)
- [x] Task 2: RPCs atômicas para garantia (abrir, encerrar normal e forçado) + pg_cron expiração diária
- [x] Task 3: Módulo OS — listagem, abertura, progressão de status, aba no detalhe da moto
- [x] Task 4: Módulo Garantias — abertura (muda status para em_garantia), encerramento (valida OS, muda para disponivel), aba no detalhe da moto
- [x] Task 5: Admin CRUD — Lojas (com bloqueio de desativação), Usuários, Modelos
- [x] Task 6: Ações Admin — reatribuição de loja para motos faturadas, correção de status com observação obrigatória
- [x] Task 7: Testes integrados de todos os fluxos
- [x] Spec coberto integralmente: todos os módulos, papéis, transições de estado, regras de negócio e LGPD implementados
