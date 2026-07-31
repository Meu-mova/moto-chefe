# Forçar conciliação de pagamento (admin_geral)

**Data:** 2026-07-31
**Status:** aprovado

## Problema

O status de conciliação é sempre **derivado**: soma dos lançamentos de
`conciliacoes_cartao` vinculados + recebimentos PIX vinculados, comparada com o
total de cartão/PIX lançado na venda. Quando o dinheiro entrou de verdade mas
não existe lançamento correspondente no sistema (relatório da operadora não
importado, PIX que não veio pelo Open Finance, transferência avulsa), não há
como fechar a pendência — a venda fica "Pendente" pra sempre.

Existe ainda um segundo caso: a transação existe, mas o valor/autorização não
bate com nada e a lupa de sugestões (que filtra por valor exato, tolerância de
R$ 0,05) não a encontra.

## Solução

Duas frentes, ambas restritas a quem é dono do problema:

1. **Forçar** — marcar um pagamento como conciliado na mão, com motivo
   obrigatório, reversível. Só `admin_geral`.
2. **Busca livre** — procurar qualquer transação não vinculada por nº de
   autorização, data ou valor aproximado, sem o filtro de valor exato.
   Disponível para quem já enxerga a lupa hoje (admins + `aux_adm`).

## Dado

Nenhuma migração de schema. As três colunas de pagamento
(`vendas.pagamentos`, `ordens_servico.pagamentos`, `vendas_pecas.pagamentos`)
já são `jsonb`. Cada item do array pode ganhar:

```ts
conciliadoManual: {
  motivo:  string   // obrigatório, mín. 3 caracteres
  porId:   string   // usuarios.id
  porNome: string   // desnormalizado — o nome não muda o suficiente pra justificar um join
  em:      string   // ISO 8601
}
```

Ausência do campo = comportamento atual, inalterado.

**Consequência aceita:** editar a venda reescreve o array e apaga a marcação.
Isso é o comportamento correto — se a forma de pagamento mudou, a conciliação
precisa ser reavaliada.

## Cálculo

O status é recalculado em 6 lugares (tabela de vendas, tabela de peças, lista
de OS, card de OS, dashboard de pendências, painel de detalhes), mas todos
passam por duas funções em `src/lib/conciliacao-status.ts`. Mudando as duas, a
marcação propaga sozinha:

- `matchPagamentos` — item com `conciliadoManual` entra como conciliado
  **antes** dos laços de match automático, para não consumir uma transação real
  que pertence a outro pagamento pendente.
- `calcStatusMultiPagamento` — soma o valor dos itens forçados (só cartão/PIX,
  que são os que contam para o total a conciliar) ao total já conciliado.
- `valorConciliadoManual(pagamentos)` — helper exportado para os dois pontos
  que fazem a conta em JS sem passar por `calcStatusMultiPagamento`:
  os KPIs de `/vendas` (`calcConcStats`) e o `calcStatus` local da tabela de
  vendas.

Melhoria de escopo: o `calcStatus` duplicado dentro de `vendas-table.tsx` passa
a delegar para `calcStatusMultiPagamento`, preservando só o que é específico de
venda de moto (o fallback para `vendas.status_conciliacao` quando não há array
de pagamentos).

## Actions

Em `src/app/(dashboard)/conciliacao/actions.ts`, compartilhadas pelas 3 telas.
`AlvoTipo = 'moto' | 'peca' | 'os'`.

- `forcarConciliacaoAction(tipo, alvoId, idx, motivo)` — exige `admin_geral`,
  valida que o alvo pertence a uma loja do grupo ativo, motivo com mín. 3
  caracteres, índice dentro do array. Em OS antiga que só tem `formaPagamento`
  (sem array), grava o array sintetizado por `pagamentosEfetivosOS`.
- `desfazerConciliacaoForcadaAction(tipo, alvoId, idx)` — mesma permissão,
  remove o campo.
- `buscarConciliacoesLivres(query)` — transações não vinculadas, busca por
  autorização/NSU (`ILIKE`), data (`YYYY-MM-DD`) ou valor, sem filtro de valor
  exato. Limitada ao grupo ativo.
- `buscarConciliacoesDoAlvo(tipo, id)` / `buscarPixDoAlvo(tipo, id)` — versões
  genéricas das funções que hoje existem só para venda e OS, para que peças
  também consiga carregar seus lançamentos.

Todas revalidam `/vendas`, `/ordens-servico`, `/ordens-servico/<id>`, `/pecas`,
`/dashboard` e `/conciliacao`.

## UI

Componente compartilhado novo: `src/components/pagamentos-conciliacao.tsx`,
que absorve as ~90 linhas hoje duplicadas quase idênticas entre
`detalhes-venda-dialog.tsx` e `os-conciliacao-panel.tsx`.

- `useConciliacaoAlvo(alvo, ativo)` — hook que carrega `concs` e `pixRecs`. O
  dialog de vendas precisa dos `concs` por fora (calcula taxas e valor
  líquido), por isso o estado fica no hook e não escondido dentro do
  componente.
- `<PagamentosConciliacao alvo pagamentos dados papel somenteConciliaveis />`

Por linha de pagamento pendente:

| Ação | Quem vê |
|---|---|
| 🔍 sugestões por valor exato + busca livre | admin_geral, admin_socio, aux_adm |
| ⚡ Forçar (dialog com motivo) | **admin_geral** |
| Desfazer forçado | **admin_geral** |

Pagamento forçado aparece verde com selo "forçado" e o motivo/quem/quando
visível na própria linha.

Usado em:
- **Vendas** → dentro do dialog de detalhes (onde a lista já estava)
- **OS** → no painel de conciliação (onde a lista já estava)
- **Peças** → ícone novo na coluna Conciliação, abrindo o mesmo painel num
  dialog. Exige passar `papel` de `pecas/page.tsx` para a tabela.

Dois efeitos colaterais registrados de propósito:
- peças ganha a lupa de conciliação que hoje não tem (o `aux_adm` passa a ver);
- forçar vale também para PIX, não só cartão — a lupa continua só para cartão,
  porque PIX se concilia em `/pix-mcp`.

## Testes

`src/lib/conciliacao-status.test.ts` (`node --test`, registrado no script
`test` do package.json):

- pagamento forçado sozinho → `conciliada`
- 1 de 2 formas forçada → `parcial`
- sem o campo → status atual preservado (não-regressão)
- forçado não rouba a transação por valor de um pagamento pendente irmão
- match por autorização continua funcionando com um irmão forçado
- valor forçado em dinheiro não é somado (não conta pro total a conciliar)
