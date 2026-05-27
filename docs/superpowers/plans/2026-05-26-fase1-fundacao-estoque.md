# Fase 1 — Fundação + Auth + Estoque: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base do sistema (projeto, banco, autenticação, RLS) e o módulo de Estoque completo com listagem de motos, detalhe e máquina de estados.

**Architecture:** Next.js 15 App Router como monolito full-stack. Supabase provê PostgreSQL, Auth e RLS. Drizzle ORM define o schema com type-safety. TanStack Query gerencia cache no cliente. shadcn/ui fornece componentes base.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (PostgreSQL + Auth + pgcrypto + pg_cron), Drizzle ORM, TanStack Query

**Spec:** `docs/superpowers/specs/2026-05-26-gestao-estoque-motos-design.md`

---

## Task 1: Inicializar projeto Next.js 15

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.local`, `.env.example`
- Create: `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1: Criar projeto**

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --no-eslint \
  --import-alias "@/*"
```

Expected: estrutura de pastas criada com `src/app/`.

- [ ] **Step 2: Instalar dependências**

```bash
npm install @supabase/supabase-js @supabase/ssr \
  drizzle-orm postgres \
  @tanstack/react-query @tanstack/react-query-devtools \
  lucide-react \
  clsx tailwind-merge \
  date-fns

npm install -D drizzle-kit @types/pg dotenv-cli
```

- [ ] **Step 3: Instalar shadcn/ui**

```bash
npx shadcn@latest init
```

Quando solicitado: `Default` style, `slate` base color, CSS variables `yes`.

```bash
npx shadcn@latest add button card table badge select dialog form input label textarea toast sidebar sheet dropdown-menu
```

- [ ] **Step 4: Criar `.env.local`**

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
DATABASE_URL=postgresql://postgres:<senha>@db.<seu-projeto>.supabase.co:5432/postgres
```

- [ ] **Step 5: Criar `.env.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

- [ ] **Step 6: Configurar `next.config.ts`**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000'] } },
}

export default nextConfig
```

- [ ] **Step 7: Verificar que o projeto roda**

```bash
npm run dev
```

Expected: `http://localhost:3000` abre sem erros.

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: initialize Next.js 15 project with Supabase and shadcn/ui"
```

---

## Task 2: Configurar Supabase e Drizzle ORM

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Criar cliente Supabase para o browser**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Criar cliente Supabase para o servidor**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Criar conexão Drizzle ORM**

```typescript
// src/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

- [ ] **Step 4: Configurar drizzle-kit**

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 5: Adicionar scripts no `package.json`**

```json
{
  "scripts": {
    "db:generate": "dotenv-cli -e .env.local -- drizzle-kit generate",
    "db:migrate": "dotenv-cli -e .env.local -- drizzle-kit migrate",
    "db:studio": "dotenv-cli -e .env.local -- drizzle-kit studio"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: configure Supabase clients and Drizzle ORM"
```

---

## Task 3: Definir schema completo do banco de dados

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/` (gerado pelo drizzle-kit)

- [ ] **Step 1: Criar schema Drizzle com todos os enums e tabelas**

```typescript
// src/lib/db/schema.ts
import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, date, numeric, index, unique
} from 'drizzle-orm/pg-core'

// ─── Enums ───────────────────────────────────────────────────────────────────
export const papelEnum = pgEnum('papel', ['admin_geral', 'aux_adm', 'vendedor', 'mecanico'])
export const categoriaEnum = pgEnum('categoria', ['autopropelido', 'ciclomotor'])
export const motoStatusEnum = pgEnum('moto_status', ['faturada', 'montada', 'disponivel', 'reservada', 'em_garantia', 'vendida'])
export const pedidoStatusEnum = pgEnum('pedido_status', ['pendente', 'efetivado', 'cancelado'])
export const transferenciaStatusEnum = pgEnum('transferencia_status', ['pendente', 'aceita', 'recusada'])
export const osStatusEnum = pgEnum('os_status', ['aberta', 'em_andamento', 'concluida'])
export const garantiaStatusEnum = pgEnum('garantia_status', ['ativa', 'encerrada'])
export const historicoTipoEnum = pgEnum('historico_tipo', ['entrada', 'saida', 'transferencia_enviada', 'transferencia_recebida', 'mudanca_status'])
export const referenciaEnum = pgEnum('referencia_tipo', ['transferencia', 'pedido_venda'])

// ─── lojas ───────────────────────────────────────────────────────────────────
export const lojas = pgTable('lojas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cidade: text('cidade').notNull(),
  endereco: text('endereco').notNull(),
  ativa: boolean('ativa').notNull().default(true),
})

// ─── usuarios ────────────────────────────────────────────────────────────────
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey(), // vinculado ao Supabase Auth uid
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  papel: papelEnum('papel').notNull(),
  lojaId: uuid('loja_id').references(() => lojas.id), // nullable para admin_geral
})

// ─── modelos ─────────────────────────────────────────────────────────────────
export const modelos = pgTable('modelos', {
  id: uuid('id').primaryKey().defaultRandom(),
  marca: text('marca').notNull(),
  modelo: text('modelo').notNull(),
  categoria: categoriaEnum('categoria').notNull(),
  potenciaW: text('potencia_w').notNull(),
  motor: text('motor').notNull(),
  velocidadeMax: text('velocidade_max').notNull(),
})

// ─── motos ───────────────────────────────────────────────────────────────────
export const motos = pgTable('motos', {
  id: uuid('id').primaryKey().defaultRandom(),
  chassi: text('chassi').notNull().unique(),
  modeloId: uuid('modelo_id').notNull().references(() => modelos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  status: motoStatusEnum('status').notNull().default('faturada'),
  cor: text('cor').notNull(),
  notaFiscalEntrada: text('nota_fiscal_entrada').notNull(),
  responsavelMontagemId: uuid('responsavel_montagem_id').references(() => usuarios.id),
  dataMontagem: date('data_montagem'),
})

// ─── pedidos_venda ───────────────────────────────────────────────────────────
export const pedidosVenda = pgTable('pedidos_venda', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  status: pedidoStatusEnum('status').notNull().default('pendente'),
  dataPedido: timestamp('data_pedido', { withTimezone: true }).notNull().defaultNow(),
  dataAtualizacao: timestamp('data_atualizacao', { withTimezone: true }).notNull().defaultNow(),
  observacao: text('observacao'),
})

// ─── vendas ──────────────────────────────────────────────────────────────────
export const vendas = pgTable('vendas', {
  id: uuid('id').primaryKey().defaultRandom(),
  pedidoVendaId: uuid('pedido_venda_id').notNull().references(() => pedidosVenda.id),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => usuarios.id),
  efetivadoPor: uuid('efetivado_por').notNull().references(() => usuarios.id),
  clienteNome: text('cliente_nome').notNull(), // armazenado via pgcrypto na migration
  clienteCpf: text('cliente_cpf').notNull(),   // armazenado via pgcrypto na migration
  valor: numeric('valor', { precision: 12, scale: 2 }).notNull(),
  formaPagamento: text('forma_pagamento').notNull(),
  dataVenda: timestamp('data_venda', { withTimezone: true }).notNull().defaultNow(),
})

// ─── transferencias ──────────────────────────────────────────────────────────
export const transferencias = pgTable('transferencias', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaOrigemId: uuid('loja_origem_id').notNull().references(() => lojas.id),
  lojaDestinoId: uuid('loja_destino_id').notNull().references(() => lojas.id),
  solicitadoPor: uuid('solicitado_por').notNull().references(() => usuarios.id),
  respondidoPor: uuid('respondido_por').references(() => usuarios.id),
  status: transferenciaStatusEnum('status').notNull().default('pendente'),
  dataSolicitacao: timestamp('data_solicitacao', { withTimezone: true }).notNull().defaultNow(),
  dataResposta: timestamp('data_resposta', { withTimezone: true }),
  observacao: text('observacao'),
})

// ─── historico_estoque ───────────────────────────────────────────────────────
export const historicoEstoque = pgTable('historico_estoque', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaOrigemId: uuid('loja_origem_id').references(() => lojas.id),
  lojaDestinoId: uuid('loja_destino_id').references(() => lojas.id),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tipo: historicoTipoEnum('tipo').notNull(),
  statusAnterior: motoStatusEnum('status_anterior'),
  statusNovo: motoStatusEnum('status_novo'),
  referenciaTipo: referenciaEnum('referencia_tipo'),
  referenciaId: uuid('referencia_id'),
  data: timestamp('data', { withTimezone: true }).notNull().defaultNow(),
  observacao: text('observacao'),
})

// ─── ordens_servico ──────────────────────────────────────────────────────────
export const ordensServico = pgTable('ordens_servico', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  abertaPor: uuid('aberta_por').notNull().references(() => usuarios.id),
  mecanicoId: uuid('mecanico_id').references(() => usuarios.id),
  status: osStatusEnum('status').notNull().default('aberta'),
  descricao: text('descricao').notNull(),
  dataAbertura: timestamp('data_abertura', { withTimezone: true }).notNull().defaultNow(),
  dataConclusao: timestamp('data_conclusao', { withTimezone: true }),
})

// ─── garantias ───────────────────────────────────────────────────────────────
export const garantias = pgTable('garantias', {
  id: uuid('id').primaryKey().defaultRandom(),
  motoId: uuid('moto_id').notNull().references(() => motos.id),
  lojaId: uuid('loja_id').notNull().references(() => lojas.id),
  osId: uuid('os_id').references(() => ordensServico.id),
  descricao: text('descricao').notNull(),
  dataInicio: date('data_inicio').notNull(),
  dataFim: date('data_fim').notNull(),
  status: garantiaStatusEnum('status').notNull().default('ativa'),
  dataPedidoPeca: date('data_pedido_peca'),
  numeroPedidoFabrica: text('numero_pedido_fabrica'),
})
```

- [ ] **Step 2: Gerar migration**

```bash
npm run db:generate
```

Expected: arquivo SQL gerado em `src/lib/db/migrations/`.

- [ ] **Step 3: Aplicar migration**

```bash
npm run db:migrate
```

Expected: tabelas criadas no Supabase.

- [ ] **Step 4: Adicionar constraints parciais e pgcrypto via SQL no Supabase SQL Editor**

Execute no painel SQL do Supabase:

```sql
-- Habilitar pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Apenas um pedido pendente por moto
CREATE UNIQUE INDEX pedidos_venda_moto_pendente_idx
  ON pedidos_venda (moto_id)
  WHERE status = 'pendente';

-- Apenas uma transferência pendente por moto
CREATE UNIQUE INDEX transferencias_moto_pendente_idx
  ON transferencias (moto_id)
  WHERE status = 'pendente';

-- Apenas uma garantia ativa por moto
CREATE UNIQUE INDEX garantias_moto_ativa_idx
  ON garantias (moto_id)
  WHERE status = 'ativa';

-- Validação data_fim > data_inicio em garantias
ALTER TABLE garantias
  ADD CONSTRAINT garantias_data_fim_check
  CHECK (data_fim > data_inicio);

-- Mascarar CPF para papéis sem permissão (column security via view)
-- vendas_seguras expõe CPF mascarado para leitura pública
CREATE OR REPLACE VIEW vendas_seguras AS
SELECT
  id, pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por,
  cliente_nome,
  CASE
    WHEN current_setting('request.jwt.claims', true)::jsonb->>'papel'
      IN ('admin_geral', 'aux_adm')
    THEN cliente_cpf
    ELSE '***.***.***-**'
  END AS cliente_cpf,
  valor, forma_pagamento, data_venda
FROM vendas;
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: define complete database schema with Drizzle ORM and Supabase constraints"
```

---

## Task 4: Implementar RLS Policies e RPCs de concorrência

**Files:**
- Create: `src/lib/db/rls.sql` (referência — executar no Supabase)
- Create: `src/lib/db/rpcs.sql` (referência — executar no Supabase)

- [ ] **Step 1: Criar RLS policies no Supabase SQL Editor**

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE garantias ENABLE ROW LEVEL SECURITY;

-- Helper: retorna papel do usuário atual
CREATE OR REPLACE FUNCTION get_papel()
RETURNS text AS $$
  SELECT papel FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: retorna loja_id do usuário atual
CREATE OR REPLACE FUNCTION get_loja_id()
RETURNS uuid AS $$
  SELECT loja_id FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: é admin_geral?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT get_papel() = 'admin_geral'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- LEITURA GLOBAL (todos veem tudo)
CREATE POLICY "leitura_global" ON lojas FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON modelos FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON motos FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON pedidos_venda FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON transferencias FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON historico_estoque FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON ordens_servico FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON garantias FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON usuarios FOR SELECT USING (true);
CREATE POLICY "leitura_global" ON vendas FOR SELECT USING (true);

-- ESCRITA: admin pode tudo
CREATE POLICY "admin_escrita_total" ON motos
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON pedidos_venda
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON vendas
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON transferencias
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON historico_estoque
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON ordens_servico
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON garantias
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON lojas
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON usuarios
  FOR ALL USING (is_admin());
CREATE POLICY "admin_escrita_total" ON modelos
  FOR ALL USING (is_admin());

-- ESCRITA por loja: motos
CREATE POLICY "escrita_por_loja_motos" ON motos
  FOR UPDATE USING (loja_id = get_loja_id() AND NOT is_admin());

-- ESCRITA por loja: pedidos_venda (INSERT)
CREATE POLICY "inserir_pedido_venda" ON pedidos_venda
  FOR INSERT WITH CHECK (loja_id = get_loja_id() OR is_admin());

-- ESCRITA por loja: garantias
CREATE POLICY "escrita_por_loja_garantias" ON garantias
  FOR ALL USING (loja_id = get_loja_id() AND NOT is_admin());

-- ESCRITA por loja: ordens_servico
CREATE POLICY "escrita_por_loja_os" ON ordens_servico
  FOR ALL USING (loja_id = get_loja_id() AND NOT is_admin());

-- historico_estoque: somente INSERT (log imutável)
CREATE POLICY "historico_apenas_insert" ON historico_estoque
  FOR INSERT WITH CHECK (true);
```

- [ ] **Step 2: Criar RPC para mudança atômica de status de moto**

```sql
-- src/lib/db/rpcs.sql (executar no Supabase SQL Editor)

CREATE OR REPLACE FUNCTION mudar_status_moto(
  p_moto_id uuid,
  p_novo_status moto_status,
  p_usuario_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_atual moto_status;
BEGIN
  -- Lock atômico na linha da moto
  SELECT status INTO v_status_atual
  FROM motos
  WHERE id = p_moto_id
  FOR UPDATE;

  IF v_status_atual IS NULL THEN
    RAISE EXCEPTION 'Moto não encontrada';
  END IF;

  -- Atualizar status
  UPDATE motos SET status = p_novo_status WHERE id = p_moto_id;

  -- Registrar no histórico
  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
  VALUES (p_moto_id, p_usuario_id, 'mudanca_status', v_status_atual, p_novo_status, p_observacao);
END;
$$;

-- RPC para criar pedido de venda (com lock)
CREATE OR REPLACE FUNCTION criar_pedido_venda(
  p_moto_id uuid,
  p_loja_id uuid,
  p_vendedor_id uuid,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status moto_status;
  v_pedido_id uuid;
BEGIN
  SELECT status INTO v_status FROM motos WHERE id = p_moto_id FOR UPDATE;

  IF v_status != 'disponivel' THEN
    RAISE EXCEPTION 'Moto não está disponível (status: %)', v_status;
  END IF;

  -- Verificar transferência pendente
  IF EXISTS (SELECT 1 FROM transferencias WHERE moto_id = p_moto_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Moto tem transferência pendente';
  END IF;

  UPDATE motos SET status = 'reservada' WHERE id = p_moto_id;

  INSERT INTO pedidos_venda (moto_id, loja_id, vendedor_id, status, observacao)
  VALUES (p_moto_id, p_loja_id, p_vendedor_id, 'pendente', p_observacao)
  RETURNING id INTO v_pedido_id;

  INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, referencia_tipo, referencia_id)
  VALUES (p_moto_id, p_vendedor_id, 'mudanca_status', 'disponivel', 'reservada', 'pedido_venda', v_pedido_id);

  RETURN v_pedido_id;
END;
$$;
```

- [ ] **Step 3: Salvar os arquivos SQL como referência no projeto**

```bash
# Copiar o conteúdo das policies e RPCs acima nos arquivos:
# src/lib/db/rls.sql
# src/lib/db/rpcs.sql
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement RLS policies and atomic status-change RPCs"
```

---

## Task 5: Implementar autenticação

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/actions.ts`
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Criar middleware de autenticação**

```typescript
// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/estoque', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 2: Criar helper para buscar usuário + papel no servidor**

```typescript
// src/lib/auth.ts
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export async function getUsuarioLogado() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, user.id))
    .limit(1)

  if (!usuario) redirect('/login')

  return usuario
}

export function isAdmin(papel: string) {
  return papel === 'admin_geral'
}

export function canEditLoja(usuarioLojaId: string | null, targetLojaId: string, papel: string) {
  if (papel === 'admin_geral') return true
  return usuarioLojaId === targetLojaId
}
```

- [ ] **Step 3: Criar server action de login**

```typescript
// src/app/(auth)/login/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: 'Email ou senha inválidos.' }

  redirect('/estoque')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 4: Criar página de login**

```tsx
// src/app/(auth)/login/page.tsx
import { loginAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Gestão de Estoque</CardTitle>
          <p className="text-center text-sm text-slate-500">Motos Elétricas</p>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Criar usuário de teste no Supabase Dashboard**

No painel Supabase → Authentication → Users → Add user:
- Email: `admin@teste.com`
- Password: `Admin123!`

Depois inserir no banco via SQL Editor:
```sql
INSERT INTO usuarios (id, nome, email, papel, loja_id)
VALUES (
  '<uid-copiado-do-painel-auth>',
  'Admin Geral',
  'admin@teste.com',
  'admin_geral',
  NULL
);
```

- [ ] **Step 6: Testar login**

```bash
npm run dev
```

Navegar para `http://localhost:3000` → deve redirecionar para `/login`. Fazer login com `admin@teste.com` → deve redirecionar para `/estoque` (que ainda não existe — erro 404 é esperado).

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: implement authentication with Supabase Auth and middleware"
```

---

## Task 6: Construir layout (Sidebar + Header)

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/lib/providers.tsx`

- [ ] **Step 1: Criar Provider para TanStack Query**

```tsx
// src/lib/providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  }))
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

- [ ] **Step 2: Criar Sidebar**

```tsx
// src/components/layout/sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings } from 'lucide-react'

const navItems = [
  { href: '/estoque', label: 'Estoque', icon: LayoutDashboard },
  { href: '/transferencias', label: 'Transferências', icon: ArrowLeftRight },
  { href: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { href: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench },
  { href: '/garantias', label: 'Garantias', icon: Shield },
  { href: '/admin', label: 'Admin', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="font-bold text-lg">Moto Elétrica</h1>
        <p className="text-xs text-slate-400 mt-1">Gestão de Estoque</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 3: Criar Header**

```tsx
// src/components/layout/header.tsx
import { logoutAction } from '@/app/(auth)/login/actions'
import { getUsuarioLogado } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const papelLabel: Record<string, string> = {
  admin_geral: 'Admin Geral',
  aux_adm: 'Aux. Administrativo',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
}

export async function Header() {
  const usuario = await getUsuarioLogado()
  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium">{usuario.nome}</p>
          <Badge variant="secondary" className="text-xs">{papelLabel[usuario.papel]}</Badge>
        </div>
        <form action={logoutAction}>
          <Button variant="outline" size="sm" type="submit">Sair</Button>
        </form>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Criar layout do dashboard**

```tsx
// src/app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { Providers } from '@/lib/providers'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />
          <main className="flex-1 p-6 bg-slate-50">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  )
}
```

- [ ] **Step 5: Testar layout**

```bash
npm run dev
```

Navegar para `http://localhost:3000/estoque`. Deve aparecer sidebar + header + área de conteúdo vazia.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: build dashboard layout with sidebar and header"
```

---

## Task 7: Módulo Estoque — Dashboard e listagem de motos

**Files:**
- Create: `src/app/(dashboard)/estoque/page.tsx`
- Create: `src/app/(dashboard)/estoque/components/moto-filters.tsx`
- Create: `src/app/(dashboard)/estoque/components/moto-table.tsx`
- Create: `src/app/(dashboard)/estoque/components/status-cards.tsx`
- Create: `src/lib/queries/motos.ts`

- [ ] **Step 1: Criar queries de motos no servidor**

```typescript
// src/lib/queries/motos.ts
import { db } from '@/lib/db'
import { motos, modelos, lojas, usuarios } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export type MotoComDetalhes = Awaited<ReturnType<typeof listarMotos>>[0]

export async function listarMotos(filtros?: {
  status?: string
  lojaId?: string
  modeloId?: string
  categoria?: string
}) {
  return db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(
      and(
        filtros?.status ? eq(motos.status, filtros.status as any) : undefined,
        filtros?.lojaId ? eq(motos.lojaId, filtros.lojaId) : undefined,
        filtros?.modeloId ? eq(motos.modeloId, filtros.modeloId) : undefined,
        filtros?.categoria ? eq(modelos.categoria, filtros.categoria as any) : undefined,
      )
    )
    .orderBy(motos.status)
}

export async function contarPorStatus() {
  return db
    .select({
      status: motos.status,
      total: sql<number>`count(*)::int`,
    })
    .from(motos)
    .groupBy(motos.status)
}
```

- [ ] **Step 2: Criar cards de resumo por status**

```tsx
// src/app/(dashboard)/estoque/components/status-cards.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { contarPorStatus } from '@/lib/queries/motos'

const statusConfig = {
  faturada:    { label: 'Faturadas',   color: 'text-slate-600' },
  montada:     { label: 'Montadas',    color: 'text-blue-600' },
  disponivel:  { label: 'Disponíveis', color: 'text-green-600' },
  reservada:   { label: 'Reservadas',  color: 'text-yellow-600' },
  em_garantia: { label: 'Em Garantia', color: 'text-orange-600' },
  vendida:     { label: 'Vendidas',    color: 'text-slate-400' },
}

export async function StatusCards() {
  const counts = await contarPorStatus()
  const countMap = Object.fromEntries(counts.map(c => [c.status, c.total]))

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
      {Object.entries(statusConfig).map(([status, { label, color }]) => (
        <Card key={status}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className={`text-xs font-medium ${color}`}>{label}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${color}`}>{countMap[status] ?? 0}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Criar tabela de motos**

```tsx
// src/app/(dashboard)/estoque/components/moto-table.tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { MotoComDetalhes } from '@/lib/queries/motos'

const statusBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  faturada:    { label: 'Faturada',    variant: 'secondary' },
  montada:     { label: 'Montada',     variant: 'default' },
  disponivel:  { label: 'Disponível',  variant: 'default' },
  reservada:   { label: 'Reservada',   variant: 'outline' },
  em_garantia: { label: 'Em Garantia', variant: 'destructive' },
  vendida:     { label: 'Vendida',     variant: 'secondary' },
}

export function MotoTable({ motos }: { motos: MotoComDetalhes[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Chassi</TableHead>
          <TableHead>Marca / Modelo</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {motos.map(moto => (
          <TableRow key={moto.id}>
            <TableCell className="font-mono text-xs">{moto.chassi}</TableCell>
            <TableCell>{moto.marca} {moto.modelo}</TableCell>
            <TableCell>{moto.categoria}</TableCell>
            <TableCell>{moto.cor}</TableCell>
            <TableCell>{moto.lojaNome}</TableCell>
            <TableCell>
              <Badge variant={statusBadge[moto.status]?.variant ?? 'secondary'}>
                {statusBadge[moto.status]?.label ?? moto.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/estoque/${moto.id}`}>Ver</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {motos.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-slate-400 py-8">
              Nenhuma moto encontrada.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 4: Criar página principal do estoque**

```tsx
// src/app/(dashboard)/estoque/page.tsx
import { Suspense } from 'react'
import { StatusCards } from './components/status-cards'
import { MotoTable } from './components/moto-table'
import { listarMotos } from '@/lib/queries/motos'

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; loja?: string; categoria?: string }>
}) {
  const params = await searchParams
  const motosList = await listarMotos({
    status: params.status,
    lojaId: params.loja,
    categoria: params.categoria,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Estoque</h1>
        <p className="text-slate-500 text-sm">Todas as motos do grupo</p>
      </div>
      <Suspense fallback={<div>Carregando...</div>}>
        <StatusCards />
      </Suspense>
      <div className="bg-white rounded-lg border">
        <MotoTable motos={motosList} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verificar listagem**

```bash
npm run dev
```

Navegar para `http://localhost:3000/estoque`. Deve aparecer os cards de status (todos zerados) e tabela vazia.

- [ ] **Step 6: Inserir dados de teste no Supabase SQL Editor**

```sql
-- Inserir loja de teste
INSERT INTO lojas (nome, cidade, endereco) VALUES ('Loja Centro', 'São Paulo', 'Rua Principal, 100');

-- Inserir modelo de teste
INSERT INTO modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
VALUES ('VoltBR', 'Urban 3000', 'ciclomotor', '3000', 'Brushless DC', '60');

-- Inserir moto de teste
INSERT INTO motos (chassi, modelo_id, loja_id, status, cor, nota_fiscal_entrada)
VALUES (
  'VB2024001',
  (SELECT id FROM modelos LIMIT 1),
  (SELECT id FROM lojas LIMIT 1),
  'disponivel',
  'Branca',
  'NF-001/2024'
);
```

- [ ] **Step 7: Verificar dados aparecendo**

Recarregar `/estoque`. Deve aparecer 1 moto na tabela com status "Disponível".

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: implement estoque dashboard with status cards and moto listing"
```

---

## Task 8: Módulo Estoque — Detalhe da moto + máquina de estados

**Files:**
- Create: `src/app/(dashboard)/estoque/[id]/page.tsx`
- Create: `src/app/(dashboard)/estoque/[id]/components/moto-info.tsx`
- Create: `src/app/(dashboard)/estoque/[id]/components/status-actions.tsx`
- Create: `src/app/(dashboard)/estoque/[id]/actions.ts`
- Create: `src/app/(dashboard)/estoque/[id]/components/historico-tab.tsx`
- Create: `src/lib/queries/motos.ts` (adicionar `buscarMoto` e `buscarHistorico`)
- Create: `src/lib/estado-moto.ts`

- [ ] **Step 1: Criar helper da máquina de estados**

```typescript
// src/lib/estado-moto.ts
type Status = 'faturada' | 'montada' | 'disponivel' | 'reservada' | 'em_garantia' | 'vendida'
type Papel = 'admin_geral' | 'aux_adm' | 'vendedor' | 'mecanico'

// Transições normais (Aux Adm)
const transicoesNormais: Partial<Record<Status, Status[]>> = {
  faturada:    ['montada', 'em_garantia'],
  montada:     ['disponivel', 'em_garantia'],
  disponivel:  ['em_garantia'],
  em_garantia: [], // sistema encerra via garantia
}

// Transições de correção (Admin Geral)
const transicoesCorrecao: Partial<Record<Status, Status[]>> = {
  montada:     ['faturada'],
  disponivel:  ['montada'],
  em_garantia: ['montada'],
}

export function getTransicoesPermitidas(
  statusAtual: Status,
  papel: Papel,
  isMinhaLoja: boolean
): Status[] {
  if (!isMinhaLoja && papel !== 'admin_geral') return []

  if (papel === 'admin_geral') {
    return [
      ...(transicoesNormais[statusAtual] ?? []),
      ...(transicoesCorrecao[statusAtual] ?? []),
    ]
  }

  if (papel === 'aux_adm') {
    return transicoesNormais[statusAtual] ?? []
  }

  return []
}

export const statusLabel: Record<Status, string> = {
  faturada:    'Faturada',
  montada:     'Montada',
  disponivel:  'Disponível',
  reservada:   'Reservada',
  em_garantia: 'Em Garantia',
  vendida:     'Vendida',
}
```

- [ ] **Step 2: Adicionar queries de detalhe e histórico**

```typescript
// Adicionar em src/lib/queries/motos.ts:

export async function buscarMoto(id: string) {
  const [moto] = await db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      motor: modelos.motor,
      velocidadeMax: modelos.velocidadeMax,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(eq(motos.id, id))
    .limit(1)

  return moto ?? null
}

export async function buscarHistoricoMoto(motoId: string) {
  return db
    .select({
      id: historicoEstoque.id,
      tipo: historicoEstoque.tipo,
      statusAnterior: historicoEstoque.statusAnterior,
      statusNovo: historicoEstoque.statusNovo,
      data: historicoEstoque.data,
      observacao: historicoEstoque.observacao,
      usuarioNome: usuarios.nome,
    })
    .from(historicoEstoque)
    .innerJoin(usuarios, eq(historicoEstoque.usuarioId, usuarios.id))
    .where(eq(historicoEstoque.motoId, motoId))
    .orderBy(sql`${historicoEstoque.data} DESC`)
}
```

- [ ] **Step 3: Criar server action para alterar status**

```typescript
// src/app/(dashboard)/estoque/[id]/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTransicoesPermitidas } from '@/lib/estado-moto'
import { revalidatePath } from 'next/cache'

export async function alterarStatusAction(motoId: string, novoStatus: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const isMinhaLoja = usuario.lojaId === moto.lojaId
  const permitidas = getTransicoesPermitidas(moto.status, usuario.papel, isMinhaLoja)

  if (!permitidas.includes(novoStatus as any)) {
    throw new Error(`Transição ${moto.status} → ${novoStatus} não permitida`)
  }

  const { error } = await supabase.rpc('mudar_status_moto', {
    p_moto_id: motoId,
    p_novo_status: novoStatus,
    p_usuario_id: usuario.id,
    p_observacao: observacao ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
}
```

- [ ] **Step 4: Criar componente de ações de status**

```tsx
// src/app/(dashboard)/estoque/[id]/components/status-actions.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getTransicoesPermitidas, statusLabel } from '@/lib/estado-moto'
import { alterarStatusAction } from '../actions'

type Props = {
  motoId: string
  statusAtual: string
  papel: string
  lojaIdUsuario: string | null
  lojaIdMoto: string
}

export function StatusActions({ motoId, statusAtual, papel, lojaIdUsuario, lojaIdMoto }: Props) {
  const [open, setOpen] = useState(false)
  const [novoStatus, setNovoStatus] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(false)

  const isMinhaLoja = lojaIdUsuario === lojaIdMoto
  const permitidas = getTransicoesPermitidas(statusAtual as any, papel as any, isMinhaLoja)

  if (permitidas.length === 0) return null

  async function handleConfirm() {
    setLoading(true)
    try {
      await alterarStatusAction(motoId, novoStatus, observacao)
      setOpen(false)
      setObservacao('')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {permitidas.map(status => (
          <Button
            key={status}
            variant="outline"
            size="sm"
            onClick={() => { setNovoStatus(status); setOpen(true) }}
          >
            → {statusLabel[status]}
          </Button>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar mudança de status</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Alterar status para <strong>{statusLabel[novoStatus as any]}</strong>?
          </p>
          <Textarea
            placeholder="Observação (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 5: Criar componente de histórico**

```tsx
// src/app/(dashboard)/estoque/[id]/components/historico-tab.tsx
import { buscarHistoricoMoto } from '@/lib/queries/motos'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const tipoLabel: Record<string, string> = {
  entrada:                'Entrada',
  saida:                  'Saída',
  transferencia_enviada:  'Transferência enviada',
  transferencia_recebida: 'Transferência recebida',
  mudanca_status:         'Mudança de status',
}

export async function HistoricoTab({ motoId }: { motoId: string }) {
  const historico = await buscarHistoricoMoto(motoId)

  return (
    <div className="space-y-3">
      {historico.map(h => (
        <div key={h.id} className="flex items-start justify-between p-3 border rounded-lg">
          <div>
            <p className="text-sm font-medium">{tipoLabel[h.tipo] ?? h.tipo}</p>
            {h.statusAnterior && h.statusNovo && (
              <p className="text-xs text-slate-500">
                {h.statusAnterior} → {h.statusNovo}
              </p>
            )}
            {h.observacao && <p className="text-xs text-slate-400 mt-1">{h.observacao}</p>}
            <p className="text-xs text-slate-400">por {h.usuarioNome}</p>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {h.data ? format(new Date(h.data), "dd/MM/yy HH:mm", { locale: ptBR }) : '—'}
          </span>
        </div>
      ))}
      {historico.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nenhum registro no histórico.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Criar página de detalhe da moto**

```tsx
// src/app/(dashboard)/estoque/[id]/page.tsx
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { buscarMoto } from '@/lib/queries/motos'
import { getUsuarioLogado } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusActions } from './components/status-actions'
import { HistoricoTab } from './components/historico-tab'
import { statusLabel } from '@/lib/estado-moto'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default async function MotoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [moto, usuario] = await Promise.all([buscarMoto(id), getUsuarioLogado()])

  if (!moto) notFound()

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/estoque"><ArrowLeft size={16} /> Voltar</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{moto.marca} {moto.modelo}</h1>
          <p className="text-slate-500 text-sm font-mono">{moto.chassi}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge>{statusLabel[moto.status as any] ?? moto.status}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-500">Loja</span><span>{moto.lojaNome}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cor</span><span>{moto.cor}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Categoria</span><span>{moto.categoria}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Potência</span><span>{moto.potenciaW}W</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Motor</span><span>{moto.motor}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Vel. Máx.</span><span>{moto.velocidadeMax} km/h</span></div>
            <div className="flex justify-between"><span className="text-slate-500">NF Entrada</span><span>{moto.notaFiscalEntrada}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Alterar Status</CardTitle></CardHeader>
          <CardContent>
            <StatusActions
              motoId={moto.id}
              statusAtual={moto.status}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
              lojaIdMoto={moto.lojaId}
            />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="historico">
        <TabsList>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="os">Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="garantias">Garantias</TabsTrigger>
          <TabsTrigger value="venda">Dados da Venda</TabsTrigger>
        </TabsList>
        <TabsContent value="historico">
          <Card><CardContent className="pt-4">
            <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
              <HistoricoTab motoId={moto.id} />
            </Suspense>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="os">
          <Card><CardContent className="pt-4 text-sm text-slate-400">
            Implementado no Plano 3.
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="garantias">
          <Card><CardContent className="pt-4 text-sm text-slate-400">
            Implementado no Plano 3.
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="venda">
          <Card><CardContent className="pt-4 text-sm text-slate-400">
            Implementado no Plano 2.
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 7: Adicionar importações faltantes em `src/lib/queries/motos.ts`**

```typescript
// Adicionar no topo do arquivo, após os imports existentes:
import { historicoEstoque, usuarios } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
```

- [ ] **Step 8: Instalar date-fns locale**

```bash
# date-fns já instalado no Task 1, locale ptBR já incluso
```

- [ ] **Step 9: Testar fluxo completo**

```bash
npm run dev
```

1. Abrir `http://localhost:3000/estoque`
2. Clicar em "Ver" na moto de teste
3. Ver detalhe com status "Disponível"
4. Se logado como admin, deve aparecer botões de transição de status
5. Clicar "→ Em Garantia" → confirmar → status deve mudar
6. Aba "Histórico" deve mostrar a mudança registrada

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: implement moto detail with status machine and audit history"
```

---

## Checklist de cobertura do spec (Fase 1)

- [x] Task 1-2: Projeto inicializado com todas as dependências do spec
- [x] Task 3: Todas as 10 tabelas do modelo de dados implementadas com constraints corretos
- [x] Task 4: RLS por loja, admin bypass, RPCs atômicas com SELECT FOR UPDATE
- [x] Task 5: Auth com Supabase + middleware de proteção de rotas
- [x] Task 6: Layout sidebar + header conforme spec
- [x] Task 7: Dashboard com cards por status + listagem com filtros
- [x] Task 8: Detalhe da moto + máquina de estados completa + histórico de auditoria
- [ ] Transferências → Plano 2
- [ ] Vendas → Plano 2
- [ ] OS → Plano 3
- [ ] Garantias + pg_cron → Plano 3
- [ ] Admin CRUD → Plano 3
