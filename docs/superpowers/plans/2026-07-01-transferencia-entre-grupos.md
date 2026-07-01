# Transferência entre Grupos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um único usuário (`cesar.rodrigues@motochefesuldeminas.com.br`) solicite transferência de moto entre lojas de grupos diferentes, mantendo o isolamento por grupo para todos os outros usuários.

**Architecture:** Um helper central em `src/lib/grupo.ts` (`podeTransferirEntreGrupos`) checa o e-mail do usuário. Em `src/app/(dashboard)/transferencias/page.tsx`, quando esse helper retorna `true`, a query de motos transferíveis e a lista de lojas passada ao diálogo de solicitação deixam de ser filtradas pelo grupo ativo. Nada mais muda.

**Tech Stack:** Next.js App Router, Drizzle ORM, Supabase (Postgres).

## Global Constraints

- Liberado apenas para `cesar.rodrigues@motochefesuldeminas.com.br` — hardcoded, não é uma permissão/role genérica.
- A listagem de transferências (pendentes/histórico) e o filtro de origem/destino continuam escopados ao grupo ativo, sem exceção — inclusive para o usuário liberado.
- Nenhuma mudança nas funções de banco (`solicitar_transferencia`, `aceitar_transferencia`, `recusar_transferencia`).
- Projeto não tem suite de testes automatizada — verificação é `npm run type-check` + teste manual.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/grupo.ts` | Modificar — adicionar `podeTransferirEntreGrupos` e `listarTodasLojasAtivas` |
| `src/app/(dashboard)/transferencias/page.tsx` | Modificar — usar os dois helpers acima só para a criação (moto picker + destino), quando o usuário liberado estiver logado |

---

## Task 1: Helper de exceção + escopo condicional na página de Transferências

**Files:**
- Modify: `src/lib/grupo.ts`
- Modify: `src/app/(dashboard)/transferencias/page.tsx`

**Interfaces:**
- Consumes: `db`, `lojas`, `motos` (schema), padrões já existentes no arquivo.
- Produces:
  - `podeTransferirEntreGrupos(usuario: { email: string }): boolean`
  - `listarTodasLojasAtivas(): Promise<{ id: string; nome: string }[]>`

- [ ] **Step 1: Adicionar os dois helpers em `src/lib/grupo.ts`**

No final do arquivo `src/lib/grupo.ts` (após `listarLojaIdsDoGrupoAtivo`), adicionar:

```ts
// ─── Exceção pontual: transferência entre grupos ──────────────────────────────
// Liberado apenas para este usuário, por decisão explícita — não é uma role
// genérica. Ver docs/superpowers/specs/2026-07-01-transferencia-entre-grupos-design.md
const EMAIL_ACESSO_MULTI_GRUPO = 'cesar.rodrigues@motochefesuldeminas.com.br'

export function podeTransferirEntreGrupos(usuario: { email: string }): boolean {
  return usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

export async function listarTodasLojasAtivas(): Promise<{ id: string; nome: string }[]> {
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(eq(lojas.ativa, true))
    .orderBy(lojas.nome)
}
```

- [ ] **Step 2: Verificar que `getUsuarioLogado()` retorna `email`**

Ler `src/lib/auth.ts` e confirmar que o objeto `usuario` retornado por `getUsuarioLogado()` inclui o campo `email` (a tabela `usuarios` tem essa coluna — `getUsuarioLogado` faz `select()` completo da linha, então já deve vir junto). Se por algum motivo a função selecionar campos específicos sem incluir `email`, ajustar o `select` para incluir. Não deve ser necessário nenhum ajuste — é só uma checagem de segurança antes do próximo passo.

- [ ] **Step 3: Usar os helpers em `transferencias/page.tsx`**

Editar `src/app/(dashboard)/transferencias/page.tsx`. Trocar o import (linha 3):

```ts
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, podeTransferirEntreGrupos, listarTodasLojasAtivas } from '@/lib/grupo'
```

Logo após a linha `const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []` (linha 27), adicionar:

```ts
  const acessoMultiGrupo = isAdmin && podeTransferirEntreGrupos(usuario)
```

Trocar o bloco do `Promise.all` (linhas 34-57) por:

```ts
  const [lista, todasLojas, lojasParaSolicitar, motosTransferiveis, modelosOpts] = await Promise.all([
    listarTransferencias({
      lojaId:        !isAdmin ? (usuario.lojaId ?? undefined) : undefined,
      lojaOrigemId:  isAdmin ? (origemValida.length  ? origemValida  : lojaIdsGrupo) : undefined,
      lojaDestinoId: isAdmin ? (destinoValida.length ? destinoValida : lojaIdsGrupo) : undefined,
      modeloId:      parseParam(params.modelo),
      status:        parseParam(params.status),
      chassiBusca:   params.q,
    }),
    listarLojasDoGrupoAtivo(usuario),
    acessoMultiGrupo ? listarTodasLojasAtivas() : listarLojasDoGrupoAtivo(usuario),
    db
      .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo, lojaId: motos.lojaId })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(
        acessoMultiGrupo
          ? inArray(motos.status, ['caixa', 'faturada', 'montada', 'disponivel', 'reservada', 'em_garantia'])
          : isAdmin
            ? and(
                inArray(motos.status, ['caixa', 'faturada', 'montada', 'disponivel', 'reservada', 'em_garantia']),
                inArray(motos.lojaId, lojaIdsGrupo),
              )
            : inArray(motos.status, ['caixa', 'faturada', 'montada', 'disponivel', 'reservada', 'em_garantia']),
      ),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(asc(modelos.modelo)),
  ])
```

Note: `todasLojas` (grupo-scoped) continua existindo — é usado pelo `TransferenciasFiltros` (linha 85) e permanece sem alteração para todo mundo, inclusive o usuário liberado. `lojasParaSolicitar` é a lista nova, só usada no diálogo de criação.

Trocar o `<SolicitarDialog>` (linhas 77-82) para usar `lojasParaSolicitar` em vez de `todasLojas`:

```tsx
        <SolicitarDialog
          lojas={lojasParaSolicitar}
          motos={motosTransferiveis}
          lojaUsuarioId={usuario.lojaId ?? null}
          papel={usuario.papel}
        />
```

Não alterar a linha do `<TransferenciasFiltros lojas={todasLojas} .../>` — continua igual, escopada ao grupo ativo.

- [ ] **Step 4: Rodar type-check**

Run: `npm run type-check`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

Rodar `npm run dev`. Logado como `cesar.rodrigues@motochefesuldeminas.com.br` (`admin_geral`), ir em `/transferencias`, clicar em "Solicitar" — o seletor de moto e o seletor de loja de destino devem mostrar motos/lojas de **ambos** os grupos (Sul de Minas e BH). Solicitar uma transferência de uma moto de uma loja Sul de Minas para a Raja BH. Confirmar que a transferência aparece na listagem ao trocar para a aba do grupo de destino.

Depois, logar como outro `admin_geral` (ou trocar o e-mail temporariamente na sessão de teste, se não houver outro usuário admin) e confirmar que os seletores de moto/loja continuam mostrando só o grupo ativo — sem a exceção.

- [ ] **Step 6: Commit**

```bash
git add src/lib/grupo.ts "src/app/(dashboard)/transferencias/page.tsx"
git commit -m "feat: permitir transferencia entre grupos para usuario especifico"
```

---

## Verificação final

- [ ] `npm run type-check` limpo.
- [ ] Usuário liberado consegue solicitar transferência entre lojas de grupos diferentes.
- [ ] Qualquer outro usuário continua vendo só o grupo ativo nos seletores de transferência.
- [ ] Listagem de transferências (pendentes/histórico) continua escopada ao grupo ativo para todos, sem exceção.
