# Perguntar ao MOVA pelo Telegram — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perguntar em linguagem natural pelo Telegram e o Jarvis responde buscando dados reais (somente-leitura) do SaaS MOVA.

**Architecture:** Duas rotas novas no MOVA (`POST /api/jarvis/consulta` roda um SELECT em transação read-only; `GET /api/jarvis/schema` lista tabelas/colunas), protegidas por token. Duas ferramentas no Jarvis (`consultar_mova`, `schema_mova`) que o secretário (Claude) usa — o Claude escreve o SQL a partir do schema. Cross-repo: rotas no MOVA (`D:\Claude\Teste`), ferramentas no Jarvis (`D:\jarvis`).

**Tech Stack:** MOVA: Next.js 16 (App Router, route handlers), `postgres.js`, Supabase Postgres, deploy Vercel. Jarvis: Python 3.13, OpenJarvis, pytest, `uv run --no-sync`.

## Global Constraints

- **Somente LEITURA.** Nenhuma escrita no MOVA nesta etapa.
- Rota `consulta`: aceita **só** `SELECT` (regex `^select\b`, sem `;`) **E** roda em transação com `SET LOCAL transaction_read_only = on` (a garantia autoritativa contra qualquer escrita).
- `SET LOCAL statement_timeout = 5000` (5s) + cap de **200 linhas** (via subquery `LIMIT 201`, `truncated` se passar).
- Auth: header `Authorization: Bearer <JARVIS_API_TOKEN>`, comparação **timing-safe** (`node:crypto.timingSafeEqual`). Sem/errado → 401.
- Token e credenciais **nunca** em chat/log/commit. Token no vault do Jarvis + env do Vercel.
- Ferramentas do Jarvis `consultar_mova`/`schema_mova`: **`requires_confirmation=False`** (leitura passa livre).
- Cobertura: **todos os grupos** (sem filtro por grupo).
- Rotas usam `export const runtime = 'nodejs'` (postgres.js precisa de Node).
- MOVA sem test runner → rotas verificadas via `npm run dev` + `curl`. Jarvis usa `uv run --no-sync pytest`.
- URL do MOVA: `https://mova.motochefesuldeminas.com.br`.
- Windows/PowerShell; Jarvis com `uv` em `C:\Users\cesar\.local\bin`.

---

### Task 1: MOVA — helper de auth + exportar o client do banco

**Files:**
- Create: `D:\Claude\Teste\src\lib\jarvis-auth.ts`
- Modify: `D:\Claude\Teste\src\lib\db\index.ts` (exportar o `client`)

**Interfaces:**
- Produces: `tokenValido(authHeader: string | null): boolean`; e `client` (postgres.js) exportado de `@/lib/db`.

- [ ] **Step 1: Exportar o client em `src/lib/db/index.ts`**

Trocar a linha `const client = postgres(...)` por `export const client = postgres(...)`:
```ts
export const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })
```

- [ ] **Step 2: Criar `src/lib/jarvis-auth.ts`**
```ts
import { timingSafeEqual } from 'node:crypto'

/** Confere o header Authorization contra JARVIS_API_TOKEN (comparacao timing-safe). */
export function tokenValido(authHeader: string | null): boolean {
  const token = process.env.JARVIS_API_TOKEN
  if (!token) return false
  const prefixo = 'Bearer '
  if (!authHeader || !authHeader.startsWith(prefixo)) return false
  const recebido = Buffer.from(authHeader.slice(prefixo.length))
  const esperado = Buffer.from(token)
  if (recebido.length !== esperado.length) return false
  return timingSafeEqual(recebido, esperado)
}
```

- [ ] **Step 3: Verificar que compila (typecheck)**

Run:
```
cd D:\Claude\Teste
npx tsc --noEmit
```
Expected: sem novos erros nesses arquivos. (Se o projeto não usa `tsc --noEmit`, rodar `npm run build` e confirmar que não quebra — mas o build é lento; o typecheck basta.)

- [ ] **Step 4: Commit**
```
git add src/lib/jarvis-auth.ts src/lib/db/index.ts
git commit -m "feat(jarvis): helper de token e exporta client do banco"
```

---

### Task 2: MOVA — rota `POST /api/jarvis/consulta`

**Files:**
- Create: `D:\Claude\Teste\src\app\api\jarvis\consulta\route.ts`
- Create (verificação, descartável): `D:\Claude\Teste\scripts\test-readonly.mjs`

**Interfaces:**
- Consumes: `tokenValido` e `client` (Task 1).
- Produces: `POST /api/jarvis/consulta` → `{ rows, rowCount, truncated }`; 401/400/408.

- [ ] **Step 1: Criar `src/app/api/jarvis/consulta/route.ts`**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { client } from '@/lib/db'
import { tokenValido } from '@/lib/jarvis-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAP = 200

export async function POST(req: NextRequest) {
  if (!tokenValido(req.headers.get('authorization'))) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }

  let sqlText = ''
  try {
    const body = await req.json()
    sqlText = String(body?.sql ?? '').trim()
  } catch {
    return NextResponse.json({ erro: 'json invalido' }, { status: 400 })
  }

  if (!sqlText) return NextResponse.json({ erro: 'sql vazio' }, { status: 400 })
  if (!/^select\b/i.test(sqlText)) {
    return NextResponse.json({ erro: 'apenas SELECT e permitido' }, { status: 400 })
  }
  if (sqlText.includes(';')) {
    return NextResponse.json({ erro: 'apenas um comando (sem ;)' }, { status: 400 })
  }
  // Nada de blocklist de palavras (daria falso-positivo em texto pt-BR tipo
  // 'Joao do Vale'). A garantia de que NADA escreve e' a transacao
  // read-only abaixo — o Postgres recusa qualquer escrita de forma autoritativa,
  // e comandos de escrita nem comecam com 'select' (barrados acima).

  const inicio = Date.now()
  try {
    const rows = await client.begin(async (tx) => {
      await tx.unsafe('SET LOCAL transaction_read_only = on')
      await tx.unsafe('SET LOCAL statement_timeout = 5000')
      return await tx.unsafe(`SELECT * FROM ( ${sqlText} ) AS _jarvis_sub LIMIT ${CAP + 1}`)
    })
    const arr = Array.from(rows as Iterable<unknown>)
    const truncated = arr.length > CAP
    console.log(`jarvis/consulta ok: ${arr.length} linhas em ${Date.now() - inicio}ms | ${sqlText.slice(0, 120)}`)
    return NextResponse.json({
      rows: arr.slice(0, CAP),
      rowCount: Math.min(arr.length, CAP),
      truncated,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro'
    const timeout = /statement timeout|canceling statement/i.test(msg)
    console.error('jarvis/consulta erro:', msg)
    return NextResponse.json(
      { erro: timeout ? 'consulta demorou demais' : 'erro na consulta', detalhe: msg.slice(0, 200) },
      { status: timeout ? 408 : 400 },
    )
  }
}
```

- [ ] **Step 2: Subir o dev server e definir o token local**

Num terminal PowerShell separado (deixe rodando):
```
cd D:\Claude\Teste
$env:JARVIS_API_TOKEN = "token-de-teste-local-123"
npm run dev
```
(O `.env` do projeto já tem `DATABASE_URL`. Se `npm run dev` reclamar de porta, use a porta que ele indicar nos curls abaixo — padrão 3000.)

- [ ] **Step 3: Verificar os critérios via curl** (noutro terminal Git Bash)
```
B="http://localhost:3000/api/jarvis/consulta"
# 1) sem token -> 401
curl -s -o /dev/null -w "sem token: %{http_code}\n" -X POST "$B" -H "Content-Type: application/json" -d '{"sql":"select 1"}'
# 2) token errado -> 401
curl -s -o /dev/null -w "token errado: %{http_code}\n" -X POST "$B" -H "Authorization: Bearer errado" -H "Content-Type: application/json" -d '{"sql":"select 1"}'
# 3) SELECT valido -> 200 + rows
curl -s -X POST "$B" -H "Authorization: Bearer token-de-teste-local-123" -H "Content-Type: application/json" -d '{"sql":"select count(*) as total from vendas"}'; echo
# 4) INSERT -> 400
curl -s -o /dev/null -w "insert: %{http_code}\n" -X POST "$B" -H "Authorization: Bearer token-de-teste-local-123" -H "Content-Type: application/json" -d '{"sql":"insert into vendas (id) values (1)"}'
# 5) com ; -> 400
curl -s -o /dev/null -w "ponto-e-virgula: %{http_code}\n" -X POST "$B" -H "Authorization: Bearer token-de-teste-local-123" -H "Content-Type: application/json" -d '{"sql":"select 1; drop table vendas"}'
```
Expected: `401`, `401`, um JSON com `{"rows":[{"total":N}], ...}`, `400`, `400`.

- [ ] **Step 4: Provar a trava read-only do banco (defesa em profundidade)**

Criar `scripts/test-readonly.mjs`:
```js
// Prova que, dentro da transacao read-only, uma ESCRITA e' recusada pelo Postgres
// (mesmo que a validacao de string fosse burlada). Rodar: node scripts/test-readonly.mjs
import 'dotenv/config'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false })
try {
  await client.begin(async (tx) => {
    await tx.unsafe('SET LOCAL transaction_read_only = on')
    await tx.unsafe('CREATE TEMP TABLE _jarvis_ro_test (x int)') // escrita
  })
  console.log('FALHA: a escrita NAO foi bloqueada')
  process.exit(1)
} catch (e) {
  if (/read-only|somente leitura|cannot execute/i.test(e.message)) {
    console.log('OK: escrita bloqueada pela transacao read-only ->', e.message.slice(0, 80))
    process.exit(0)
  }
  console.log('ERRO inesperado:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
```
Run:
```
cd D:\Claude\Teste
node scripts/test-readonly.mjs
```
Expected: `OK: escrita bloqueada pela transacao read-only ...`

- [ ] **Step 5: Commit**
```
git add src/app/api/jarvis/consulta/route.ts scripts/test-readonly.mjs
git commit -m "feat(api): rota jarvis/consulta somente-leitura (token + read-only + timeout + cap)"
```

---

### Task 3: MOVA — rota `GET /api/jarvis/schema`

**Files:**
- Create: `D:\Claude\Teste\src\app\api\jarvis\schema\route.ts`

**Interfaces:**
- Consumes: `tokenValido`, `client` (Task 1).
- Produces: `GET /api/jarvis/schema` → `{ schema: Record<string, {coluna:string, tipo:string}[]> }`.

- [ ] **Step 1: Criar `src/app/api/jarvis/schema/route.ts`**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { client } from '@/lib/db'
import { tokenValido } from '@/lib/jarvis-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!tokenValido(req.headers.get('authorization'))) {
    return NextResponse.json({ erro: 'nao autorizado' }, { status: 401 })
  }
  try {
    const linhas = await client<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `
    const schema: Record<string, { coluna: string; tipo: string }[]> = {}
    for (const l of linhas) {
      ;(schema[l.table_name] ??= []).push({ coluna: l.column_name, tipo: l.data_type })
    }
    return NextResponse.json({ schema })
  } catch (e) {
    console.error('jarvis/schema erro:', e)
    return NextResponse.json({ erro: 'erro ao ler o schema' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar via curl** (com o `npm run dev` da Task 2 rodando)
```
curl -s -o /dev/null -w "schema sem token: %{http_code}\n" "http://localhost:3000/api/jarvis/schema"
curl -s "http://localhost:3000/api/jarvis/schema" -H "Authorization: Bearer token-de-teste-local-123" | head -c 400; echo
```
Expected: `401` sem token; com token, um JSON com `"schema"` contendo `"vendas"`, `"motos"`, etc. (só nomes/tipos).

- [ ] **Step 3: Commit**
```
git add src/app/api/jarvis/schema/route.ts
git commit -m "feat(api): rota jarvis/schema lista tabelas/colunas (sem dados)"
```

---

### Task 4: MOVA — token de produção + deploy

**Files:** nenhum de código (config + deploy).

**Interfaces:**
- Produces: `JARVIS_API_TOKEN` no vault do Jarvis E no Vercel; rotas ativas na URL pública.

- [ ] **Step 1: Gerar um token forte**

Run (Git Bash):
```
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
Guardar o valor (chame de `<TOKEN>`).

- [ ] **Step 2: Guardar no cofre do Jarvis**
```
$env:Path = "C:\Users\cesar\.local\bin;$env:Path"; cd D:\jarvis
uv run --no-sync jarvis vault set JARVIS_API_TOKEN "<TOKEN>"
uv run --no-sync jarvis vault set MOVA_API_URL "https://mova.motochefesuldeminas.com.br"
```
(guardar MOVA_API_URL no vault tambem simplifica os launchers.)

- [ ] **Step 3: Cadastrar o token no Vercel (passo do Cesar)**

No painel da Vercel do projeto MOVA → **Settings → Environment Variables** → adicionar
`JARVIS_API_TOKEN` = `<TOKEN>` (mesmo valor) para os ambientes usados (Production/Preview).
(É o Cesar que faz — a Vercel CLI não está instalada aqui.)

- [ ] **Step 4: Deploy (push → Vercel)**
```
cd D:\Claude\Teste
git push
```
Aguardar a Vercel terminar o deploy do commit.

- [ ] **Step 5: Verificar a rota EM PRODUÇÃO**
```
B="https://mova.motochefesuldeminas.com.br/api/jarvis/consulta"
curl -s -o /dev/null -w "prod sem token: %{http_code}\n" -X POST "$B" -H "Content-Type: application/json" -d '{"sql":"select 1"}'
curl -s -X POST "$B" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"sql":"select count(*) as total from vendas"}'; echo
```
Expected: `401` sem token; com o token real, `{"rows":[{"total":N}],...}`. Se der 401 COM o token, a env var não subiu no Vercel — reconferir Step 3 e re-deploy.

---

### Task 5: Jarvis — ferramentas `consultar_mova` e `schema_mova`

**Files:**
- Create: `D:\jarvis\src\openjarvis\tools\consultar_mova.py`
- Modify: `D:\jarvis\src\openjarvis\tools\__init__.py` (registrar imports)
- Test: `D:\jarvis\tests\tools\test_consultar_mova.py`

**Interfaces:**
- Produces: `ConsultarMovaTool` (id `consultar_mova`, param `sql`) e `SchemaMovaTool` (id `schema_mova`, sem params). Ambas `requires_confirmation=False`. Aceitam injeção `http_post`/`http_get` para teste.

- [ ] **Step 1: Escrever o teste que falha — `D:\jarvis\tests\tools\test_consultar_mova.py`:**
```python
"""Testes das ferramentas de consulta ao MOVA (so leitura)."""

from __future__ import annotations

import json

from openjarvis.core.types import ToolResult
from openjarvis.tools.consultar_mova import ConsultarMovaTool, SchemaMovaTool


class _Resp:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text or json.dumps(self._payload)

    def json(self):
        return self._payload


def test_consultar_nao_pede_confirmacao():
    t = ConsultarMovaTool(base_url="http://x", token="tk")
    assert t.spec.name == "consultar_mova"
    assert t.spec.requires_confirmation is False


def test_consultar_devolve_linhas():
    capturado = {}

    def fake_post(url, **kw):
        capturado["url"] = url
        capturado["headers"] = kw.get("headers")
        capturado["json"] = kw.get("json")
        return _Resp(200, {"rows": [{"total": 12}], "rowCount": 1, "truncated": False})

    t = ConsultarMovaTool(base_url="http://mova", token="tk", http_post=fake_post)
    r = t.execute(sql="select count(*) as total from vendas")
    assert isinstance(r, ToolResult) and r.success is True
    assert "12" in r.content
    assert capturado["url"] == "http://mova/api/jarvis/consulta"
    assert capturado["headers"]["Authorization"] == "Bearer tk"
    assert capturado["json"] == {"sql": "select count(*) as total from vendas"}


def test_consultar_sql_vazio_falha():
    t = ConsultarMovaTool(base_url="http://x", token="tk", http_post=lambda *a, **k: _Resp(200))
    assert t.execute(sql="  ").success is False


def test_consultar_401_avisa_sem_acesso():
    t = ConsultarMovaTool(base_url="http://x", token="tk", http_post=lambda *a, **k: _Resp(401, {"erro": "nao autorizado"}))
    r = t.execute(sql="select 1")
    assert r.success is False and "acesso" in r.content.lower()


def test_consultar_erro_de_rede_avisa():
    def boom(*a, **k):
        raise ConnectionError("sem rede")

    t = ConsultarMovaTool(base_url="http://x", token="tk", http_post=boom)
    r = t.execute(sql="select 1")
    assert r.success is False and "MOVA" in r.content


def test_schema_devolve_tabelas():
    def fake_get(url, **kw):
        return _Resp(200, {"schema": {"vendas": [{"coluna": "id", "tipo": "uuid"}]}})

    t = SchemaMovaTool(base_url="http://mova", token="tk", http_get=fake_get)
    r = t.execute()
    assert r.success is True and "vendas" in r.content
```

- [ ] **Step 2: Rodar e ver falhar**
```
$env:Path = "C:\Users\cesar\.local\bin;$env:Path"; cd D:\jarvis
uv run --no-sync pytest tests/tools/test_consultar_mova.py -q
```
Expected: FAIL — `ModuleNotFoundError: openjarvis.tools.consultar_mova`.

- [ ] **Step 3: Implementar — `D:\jarvis\src\openjarvis\tools\consultar_mova.py`:**
```python
"""Ferramentas de consulta SOMENTE-LEITURA ao ERP MOVA (via rota /api/jarvis/*).

consultar_mova(sql): roda um SELECT no MOVA e devolve as linhas.
schema_mova(): lista as tabelas/colunas do MOVA para o modelo escrever o SELECT.
Ambas sao leitura -> requires_confirmation=False (passam livre no portao).
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable, Optional

import requests

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_URL_PADRAO = "https://mova.motochefesuldeminas.com.br"


def _base_url(v: Optional[str]) -> str:
    return (v if v is not None else os.environ.get("MOVA_API_URL", _URL_PADRAO)).rstrip("/")


def _token(v: Optional[str]) -> str:
    return v if v is not None else os.environ.get("JARVIS_API_TOKEN", "")


@ToolRegistry.register("consultar_mova")
class ConsultarMovaTool(BaseTool):
    """Consulta somente-leitura ao MOVA (o modelo escreve o SELECT)."""

    tool_id = "consultar_mova"
    is_local = True

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        http_post: Optional[Callable[..., Any]] = None,
    ) -> None:
        self._base = _base_url(base_url)
        self._tok = _token(token)
        self._post = http_post or (lambda url, **kw: requests.post(url, **kw))

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="consultar_mova",
            description=(
                "Consulta SOMENTE-LEITURA ao ERP MOVA (Postgres) do negocio do usuario. "
                "Escreva UM unico SELECT (sem ';'). Antes, use 'schema_mova' para conferir "
                "as tabelas e colunas. Datas: use current_date / now(). Depois, diga ao "
                "usuario o numero E de onde tirou (a consulta usada)."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "Um unico SELECT em Postgres."}
                },
                "required": ["sql"],
            },
            category="negocio",
            requires_confirmation=False,
            timeout_seconds=25.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        sql = (params.get("sql") or "").strip()
        if not sql:
            return ToolResult(tool_name="consultar_mova", content="Nenhuma consulta informada.", success=False)
        try:
            r = self._post(
                f"{self._base}/api/jarvis/consulta",
                json={"sql": sql},
                headers={"Authorization": f"Bearer {self._tok}"},
                timeout=(10, 20),
            )
        except Exception:
            return ToolResult(tool_name="consultar_mova", content="Nao consegui falar com o MOVA agora.", success=False)
        if r.status_code == 401:
            return ToolResult(tool_name="consultar_mova", content="Sem acesso ao MOVA (token invalido).", success=False)
        if r.status_code >= 400:
            return ToolResult(tool_name="consultar_mova", content=f"O MOVA recusou a consulta: {r.text[:200]}", success=False)
        data = r.json()
        rows = data.get("rows", [])
        conteudo = json.dumps(rows, ensure_ascii=False, default=str)[:4000]
        if data.get("truncated"):
            conteudo += "\n(resultado truncado em 200 linhas)"
        return ToolResult(
            tool_name="consultar_mova",
            content=conteudo,
            success=True,
            metadata={"rowCount": data.get("rowCount")},
        )


@ToolRegistry.register("schema_mova")
class SchemaMovaTool(BaseTool):
    """Lista as tabelas e colunas do MOVA (sem dados)."""

    tool_id = "schema_mova"
    is_local = True

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        http_get: Optional[Callable[..., Any]] = None,
    ) -> None:
        self._base = _base_url(base_url)
        self._tok = _token(token)
        self._get = http_get or (lambda url, **kw: requests.get(url, **kw))

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="schema_mova",
            description="Lista as tabelas e colunas do ERP MOVA, para voce escrever o SELECT certo.",
            parameters={"type": "object", "properties": {}},
            category="negocio",
            requires_confirmation=False,
            timeout_seconds=25.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        try:
            r = self._get(
                f"{self._base}/api/jarvis/schema",
                headers={"Authorization": f"Bearer {self._tok}"},
                timeout=(10, 20),
            )
        except Exception:
            return ToolResult(tool_name="schema_mova", content="Nao consegui falar com o MOVA agora.", success=False)
        if r.status_code == 401:
            return ToolResult(tool_name="schema_mova", content="Sem acesso ao MOVA (token invalido).", success=False)
        if r.status_code >= 400:
            return ToolResult(tool_name="schema_mova", content=f"Erro ao ler o schema: {r.text[:200]}", success=False)
        schema = r.json().get("schema", {})
        return ToolResult(
            tool_name="schema_mova",
            content=json.dumps(schema, ensure_ascii=False)[:6000],
            success=True,
        )
```

- [ ] **Step 4: Registrar os imports em `src/openjarvis/tools/__init__.py`**

Junto aos outros imports de ferramentas (perto de `import openjarvis.tools.salvar_lembrete`), adicionar:
```python
    import openjarvis.tools.consultar_mova  # noqa: F401
```

- [ ] **Step 5: Rodar até passar**
```
uv run --no-sync pytest tests/tools/test_consultar_mova.py -q
```
Expected: 6 passed.

- [ ] **Step 6: Commit**
```
cd D:\jarvis
git add src/openjarvis/tools/consultar_mova.py src/openjarvis/tools/__init__.py tests/tools/test_consultar_mova.py
git commit -m "feat(mova): ferramentas consultar_mova e schema_mova (leitura, sem portao)"
```

---

### Task 6: Jarvis — secretário usa as ferramentas + launchers injetam a config

**Files:**
- Modify: `D:\jarvis\scripts\criar_secretario.py` (tools + system prompt) + reaplicar
- Modify: `D:\jarvis\jarvis-telegram.ps1`, `jarvis-web.ps1`, `jarvis-voz.ps1` (env MOVA)

**Interfaces:**
- Consumes: ferramentas da Task 5; token/URL no vault (Task 4).

- [ ] **Step 1: Adicionar as ferramentas e a orientação no secretário**

Em `D:\jarvis\scripts\criar_secretario.py`, em `AGENT_CONFIG`, trocar a linha `tools`:
```python
    "tools": ["salvar_lembrete", "think", "consultar_mova", "schema_mova"],
```
E, no `SYSTEM_PROMPT`, adicionar (antes de "Seja breve"):
```python
    "Para perguntas sobre o negocio (vendas, estoque, ranking de vendedores, "
    "financeiro, clientes, demandas...), consulte o ERP MOVA: primeiro use "
    "schema_mova para ver as tabelas/colunas e depois consultar_mova com UM SELECT. "
    "Responda com o numero e diga de onde tirou. "
```

- [ ] **Step 2: Injetar MOVA_API_URL e JARVIS_API_TOKEN nos launchers**

Em cada um dos 3 `.ps1` (`jarvis-telegram.ps1`, `jarvis-web.ps1`, `jarvis-voz.ps1`), logo após o
bloco que injeta `ANTHROPIC_API_KEY`, adicionar (ASCII puro):
```powershell
$movaTok = (& uv run --no-sync python scripts/get_secret.py JARVIS_API_TOKEN) 2>$null
if ($movaTok) { $env:JARVIS_API_TOKEN = $movaTok.Trim() }
$movaUrl = (& uv run --no-sync python scripts/get_secret.py MOVA_API_URL) 2>$null
if ($movaUrl) { $env:MOVA_API_URL = $movaUrl.Trim() }
```

- [ ] **Step 3: Validar sintaxe e ASCII dos launchers**
```
$env:Path = "C:\Users\cesar\.local\bin;$env:Path"; cd D:\jarvis
foreach ($f in "jarvis-telegram.ps1","jarvis-web.ps1","jarvis-voz.ps1") {
  $e=$null; $null=[System.Management.Automation.Language.Parser]::ParseFile("D:\jarvis\$f",[ref]$null,[ref]$e)
  $b=[System.IO.File]::ReadAllBytes("D:\jarvis\$f"); $na=($b|?{$_ -gt 127}).Count
  if ($e) { "ERRO $f"; $e|%{$_.Message} } else { "OK $f (nao-ASCII: $na)" }
}
```
Expected: `OK` para os 3 (nao-ASCII pode ser >0 nos que ja tinham acento em comentario; o importante e' sem ERRO de parser). Para os que voce editou, confira que o bloco novo e' ASCII.

- [ ] **Step 4: Reaplicar o secretário**
```
uv run --no-sync python scripts/criar_secretario.py
```
Expected: `atualizado: 3f7f2965e3c7`.

- [ ] **Step 5: Commit**
```
git add scripts/criar_secretario.py jarvis-telegram.ps1 jarvis-web.ps1 jarvis-voz.ps1
git commit -m "feat(mova): secretario consulta o MOVA; launchers injetam token/URL"
```

---

### Task 7: Validação de ponta a ponta

**Files:** nenhum (validação ao vivo).

- [ ] **Step 1: Subir Jarvis com a config do MOVA no ambiente**
```
$env:Path = "C:\Users\cesar\.local\bin;C:\Users\cesar\AppData\Local\Programs\Ollama;$env:Path"; cd D:\jarvis
$env:ANTHROPIC_API_KEY = (& uv run --no-sync python scripts/get_secret.py ANTHROPIC_API_KEY).Trim()
$env:JARVIS_API_TOKEN  = (& uv run --no-sync python scripts/get_secret.py JARVIS_API_TOKEN).Trim()
$env:MOVA_API_URL      = (& uv run --no-sync python scripts/get_secret.py MOVA_API_URL).Trim()
uv run --no-sync jarvis serve --host 127.0.0.1 --port 8000 --engine ollama --model qwen3.5:2b --agent simple
# noutro terminal: a ponte
uv run --no-sync python scripts/telegram_bridge.py
```

- [ ] **Step 2: Critério 6 — perguntar pelo Telegram**

No Telegram: *"quantas vendas foram feitas hoje?"*
Verify: o Jarvis responde com um número, e (se pedido) mostra a consulta usada. Conferir o número contra a tela do MOVA (dashboard).

- [ ] **Step 3: Critério 7 — pergunta que exige schema**

No Telegram: *"quem foi o vendedor que mais vendeu esse mes?"*
Verify: resposta plausível vinda do MOVA (o agente usou schema_mova + consultar_mova).

- [ ] **Step 4: Critério 8 — sem vazamento**

Conferir o log do backend/ponte: o token NÃO aparece; só a consulta e a contagem.

- [ ] **Step 5: Suíte do Jarvis (regressão)**
```
uv run --no-sync pytest tests/tools/test_consultar_mova.py tests/tools/test_salvar_lembrete.py -q
```
Expected: tudo passa.

---

## Notas de risco

- **Segurança:** a rota dá leitura do banco inteiro; o token é a única barreira → nunca commitar/logar; timing-safe já no helper. A trava `transaction_read_only` é a defesa se a validação de string for burlada (provada no Task 2 Step 4).
- **Número errado:** o Claude monta o SQL; instruímos a mostrar a consulta. Consultas verificadas para números críticos ficam pra uma próxima etapa.
- **`DATABASE_URL` no MOVA:** a rota usa o mesmo client do app; se o MOVA já sofre com pooler/porta (nota conhecida), isso é pré-existente, não desta feature.
- **Deploy:** o token no Vercel é passo manual do Cesar (Vercel CLI ausente). Sem ele, produção dá 401.
- **Fora de escopo:** escrever no MOVA; consultas verificadas; role read-only dedicado.
