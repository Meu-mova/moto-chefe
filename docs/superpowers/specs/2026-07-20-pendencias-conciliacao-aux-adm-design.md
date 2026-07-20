# Pendências de Conciliação para Aux Adm — Design

**Data:** 2026-07-20
**Status:** Aprovado

## Contexto

Hoje, pra saber se a loja tem vendas sem nota fiscal emitida ou pagamentos ainda não conciliados (cartão/PIX), o aux_adm precisa visitar `/vendas`, `/ordens-servico` e `/pecas` separadamente e cruzar as informações manualmente. Não existe nenhum aviso consolidado por loja.

O critério de "pagamento pendente de conciliação" já existe e é usado hoje em `/vendas` (painel de estatísticas) e na tela de OS/peças: `calcStatusMultiPagamento` e `calcStatusPagamentoUnicoOS`, em `src/lib/conciliacao-status.ts`.

## Objetivo

Mostrar ao aux_adm, assim que ele abre o Dashboard, um resumo das pendências da própria loja: vendas sem NF de saída, e vendas/serviços/peças com pagamento ainda não conciliado.

## Escopo

- Afeta só o Dashboard (`/dashboard`), só o papel `aux_adm` (com `lojaId` definido).
- Sem notificação externa (WhatsApp, e-mail, push) — é um card dentro do app.
- Sem job agendado nem tabela nova — os números são calculados na hora, a cada carregamento da página, com o mesmo critério já usado no resto do sistema.
- Janela fixa: últimos 30 dias (por data da venda/abertura da OS), independente do filtro de data que o Dashboard já tem para outras seções.
- Não muda o critério de conciliação existente, não adiciona "marcar como lido"/histórico.
- Não atende `admin_geral`/`admin_socio` (eles não têm uma loja fixa de operação diária — ver decisão explícita durante o brainstorming).

## Design

### Consulta de dados

Nova função `getPendenciasConciliacaoLoja(lojaId: string, desde: Date)` em `src/lib/queries/dashboard.ts`:

- **Vendas de moto** (`vendas`): busca `pagamentos`, `valor`, `notaFiscalSaida` e os mesmos subselects de `conciliadoValor`/`pixConciliadoValor` já usados em `listarVendas` (`src/lib/queries/vendas.ts:43-54`), filtrando por `lojaId` e `dataVenda >= desde`.
  - `semNotaFiscal` = contagem de linhas com `notaFiscalSaida` nulo/vazio.
  - `vendasPendentes` = contagem de linhas onde `calcStatusMultiPagamento(pagamentos, conciliadoValor, pixConciliadoValor, valor)` retorna `'pendente'` ou `'parcial'`.
- **OS** (`ordensServico`): busca `formaPagamento`, `valorTotal` e os mesmos subselects de conciliação já usados em `buildSelect` (`src/lib/queries/ordens-servico.ts:27-38`), filtrando por `lojaId` e `dataAbertura >= desde`.
  - `osPendentes` = contagem de linhas onde `calcStatusPagamentoUnicoOS(formaPagamento, valorTotal, conciliadoValor, pixConciliadoValor)` retorna `'pendente'` ou `'parcial'`.
- **Peças** (`vendasPecas`): busca `pagamentos`, `valorTotal` e os mesmos subselects de conciliação já usados em `listarVendasPecasAction` (`src/app/(dashboard)/pecas/actions.ts:216-226`), filtrando por `lojaId` e `dataVenda >= desde`. É uma query dedicada nova (não reaproveita a action, que é uma server action com seu próprio gate de auth e sem filtro de data) mas usa exatamente os mesmos subselects SQL.
  - `pecasPendentes` = contagem de linhas onde `calcStatusMultiPagamento(...)` retorna `'pendente'` ou `'parcial'`.

Retorno:
```ts
{ semNotaFiscal: number; vendasPendentes: number; osPendentes: number; pecasPendentes: number }
```

Cada categoria reaproveita literalmente o helper de status já usado nas telas correspondentes — nenhuma regra de conciliação nova é criada.

### Componente

`PendenciasLojaCard` em `src/app/(dashboard)/dashboard/components/pendencias-loja-card.tsx` — server component simples, recebe os 4 números prontos.

- Se a soma das 4 categorias for 0, não renderiza nada (`return null`), igual ao padrão já usado em `AprovacoesPendentesPanel`.
- Caso contrário, um card âmbar (mesmo padrão visual do painel de aprovações pendentes) com título "Pendências da loja (últimos 30 dias)" e uma linha por categoria com contagem > 0, cada uma como link:
  - "N venda(s) sem nota fiscal" → `/vendas`
  - "N venda(s) com pagamento pendente de conciliação" → `/vendas`
  - "N serviço(s) com pagamento pendente de conciliação" → `/ordens-servico`
  - "N peça(s) com pagamento pendente de conciliação" → `/pecas`
- Categorias com contagem 0 simplesmente não aparecem na lista.

### Integração no Dashboard

Em `src/app/(dashboard)/dashboard/page.tsx`:
- `isAuxAdm = usuario.papel === 'aux_adm'`.
- Se `isAuxAdm && usuario.lojaId`, busca `getPendenciasConciliacaoLoja(usuario.lojaId, <hoje - 30 dias>)` e renderiza `<PendenciasLojaCard />` acima da seção de KPIs.
- Fica em sua própria seção com `Suspense` + `SectionErrorBoundary`, mesmo padrão já usado pelas outras seções da página (`KpiSection`, `GraficosSection`, etc.) — se essa query falhar ou demorar, não derruba o resto do dashboard.

## Fora de escopo

- WhatsApp, e-mail ou qualquer canal externo.
- `admin_geral`/`admin_socio` não recebem esse card.
- "Marcar como visto"/histórico de avisos — o card reflete o estado atual, some sozinho quando resolvido.
- Mudança no critério de conciliação (`pendente`/`parcial`/`conciliada`).

## Teste

Projeto não tem suite automatizada. Validação manual:
1. Logado como `aux_adm` de uma loja com vendas sem NF e/ou pagamentos não conciliados nos últimos 30 dias → conferir que os números do card batem com o que aparece em `/vendas`, `/ordens-servico` e `/pecas`.
2. Logado como `aux_adm` de uma loja sem nenhuma pendência → card não aparece.
3. Logado como `admin_geral`/`admin_socio`/`vendedor` → card não aparece, independente de pendências.
4. Resolver uma pendência (emitir NF ou conciliar um pagamento) → recarregar o Dashboard e conferir que o número correspondente cai.
