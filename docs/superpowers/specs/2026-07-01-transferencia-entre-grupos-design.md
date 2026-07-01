# Transferência entre Grupos — Design

**Data:** 2026-07-01
**Status:** Aprovado

## Contexto

O multi-grupo (Sul de Minas + BH) isola dados por grupo — inclusive os seletores de loja do módulo de Transferências, que hoje só mostram lojas do grupo ativo. O spec original do multi-grupo deixou "transferências entre grupos" fora de escopo.

Na prática, uma importação de motos para BH acabou registrando 4 motos numa loja do Sul de Minas por engano. A correção foi feita manualmente no banco, mas o operador (`cesar.rodrigues@motochefesuldeminas.com.br`) quer poder fazer esse tipo de movimentação pela própria interface no futuro, sem precisar de intervenção manual no banco.

## Objetivo

Permitir que **um único usuário específico** solicite transferência de moto entre lojas de grupos diferentes, mantendo o isolamento por grupo para todos os outros usuários (inclusive outros `admin_geral`).

## Escopo

- Liberado **apenas** para o e-mail `cesar.rodrigues@motochefesuldeminas.com.br`.
- Afeta **somente** a tela de solicitação de transferência (`/transferencias`): o seletor de moto de origem e o seletor de loja de destino passam a listar todas as lojas ativas do sistema (todos os grupos), não só do grupo ativo.
- A **listagem** de transferências (pendentes/histórico) continua escopada ao grupo ativo, igual para todo mundo — inclusive para o usuário liberado. Se ele quiser ver uma transferência de outro grupo, troca de aba normalmente.
- Aceitar/recusar transferência não muda — a função do banco (`aceitar_transferencia`, `recusar_transferencia`) já não faz nenhuma checagem de grupo, então o fluxo de aceite do lado do destino já funciona sem alteração.

## Design

### Verificação centralizada

Um único ponto de checagem em `src/lib/grupo.ts`:

```ts
const EMAIL_ACESSO_MULTI_GRUPO = 'cesar.rodrigues@motochefesuldeminas.com.br'

export function podeTransferirEntreGrupos(usuario: { email: string }): boolean {
  return usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}
```

Nenhum outro arquivo guarda esse e-mail — tudo passa por essa função.

### Página `/transferencias`

Em `src/app/(dashboard)/transferencias/page.tsx`, quando `podeTransferirEntreGrupos(usuario)` for `true`:
- A query de `motosTransferiveis` (moto picker do diálogo de solicitar) não aplica o filtro `inArray(motos.lojaId, lojaIdsGrupo)` — busca todas as motos com status transferível, de qualquer loja/grupo.
- A lista `todasLojas` passada para `SolicitarDialog` vem de todas as lojas ativas do sistema (`db.select().from(lojas).where(eq(lojas.ativa, true))`), não de `listarLojasDoGrupoAtivo(usuario)`.

Para qualquer outro usuário, o comportamento atual (escopado ao grupo ativo) permanece idêntico.

### Fora de escopo

- Não altera a listagem de transferências pendentes/histórico.
- Não cria um papel/permissão genérica reutilizável — é uma exceção pontual e hardcoded, por decisão explícita do usuário.
- Não altera as funções de banco `solicitar_transferencia`/`aceitar_transferencia`/`recusar_transferencia`.

## Teste

Projeto não tem suite automatizada. Validação manual: logado como `cesar.rodrigues@motochefesuldeminas.com.br`, solicitar transferência de uma moto de loja do Sul de Minas para a Raja BH (BH) e confirmar que a transferência aparece corretamente na listagem de ambos os grupos (via troca de aba). Confirmar também que outro usuário `admin_geral` não vê lojas/motos de outro grupo nos seletores.
