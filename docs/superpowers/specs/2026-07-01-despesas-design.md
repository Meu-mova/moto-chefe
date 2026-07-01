# Módulo de Despesas Operacionais

**Data:** 2026-07-01  
**Status:** Aprovado

## Contexto

O sistema já possui um módulo **Caixa** que controla entradas e saídas de dinheiro físico por loja, e um módulo **Financeiro** que exibe receitas de vendas. Faltava uma camada para registrar todas as despesas operacionais da empresa (aluguel, salários, luz, etc.), que são pagas pelos sócios ou pelo responsável financeiro e não passam pelo caixa local de cada loja.

## Objetivo

Permitir que os sócios registrem despesas operacionais (custo por loja ou custo geral da empresa), visualizem o histórico filtrado por período e escopo, e vejam um resumo integrado no módulo Financeiro.

---

## Permissões

| Ação | Quem pode |
|---|---|
| Lançar, editar, excluir, visualizar | `admin_geral`, `admin_socio` |

Nenhum outro papel tem acesso ao módulo.

---

## Modelo de dados — tabela `despesas`

| Campo | Tipo | Observações |
|---|---|---|
| `id` | uuid | PK, defaultRandom() |
| `lojaId` | uuid **nullable** | null = custo geral da empresa |
| `usuarioId` | uuid | quem lançou (FK → usuarios) |
| `categoria` | text | valor de lista fixa (ver abaixo) |
| `descricao` | text nullable | detalhe livre |
| `valor` | numeric(12,2) | valor pago |
| `data` | date | data do pagamento |
| `formaPagamento` | text | PIX · Transferência · Boleto · Dinheiro · Cartão |
| `banco` | text | ex: Sicoob, Itaú, Bradesco, Caixa |
| `criadoEm` | timestamp with timezone | defaultNow() |

**Categorias fixas:**
Aluguel, Energia elétrica, Água, Internet, Combustível, Compra de veículos, Marketing, Salários, Impostos, Manutenção, Outros

Sem tabela de configuração por enquanto — lista hardcoded no frontend e validada no backend.

---

## Página `/despesas`

Acesso restrito a `admin_geral` e `admin_socio`. Redireciona para `/dashboard` caso contrário.

### Filtros (barra superior)
- **Mês** (padrão: mês atual)
- **Escopo:** Todas | Por loja (seletor de loja) | Somente gerais

### Cards de resumo
- Total do período
- Total por loja (breakdown)
- Total geral (empresa toda)

### Tabela de lançamentos
Colunas: Data · Categoria · Descrição · Loja (ou "Geral") · Forma de pagamento · Banco · Valor · Ações (editar / excluir)

### Dialog "Nova Despesa" / "Editar Despesa"
Campos:
- Categoria (select com lista fixa)
- Loja (select com todas as lojas + opção "Geral — empresa toda")
- Data (date picker, padrão hoje)
- Valor
- Forma de pagamento (select)
- Banco (select ou text com opções comuns)
- Descrição (textarea opcional)

Sem comprovante. Sem aprovação — lançamento vale na hora.

---

## Integração no Financeiro (`/financeiro`)

Adicionar card **"Despesas Operacionais"** no grid de resumo mostrando o total de despesas do mês filtrado (soma de todas as despesas, lojas + gerais).

Opcionalmente: mini-breakdown por categoria abaixo do card (linha por categoria com valor).

A query de despesas respeita o filtro de loja do Financeiro: se uma loja está selecionada, mostra despesas daquela loja + despesas gerais.

---

## Fora do escopo (por enquanto)

- Despesas recorrentes automáticas
- Anexo de comprovante
- Fluxo de aprovação
- Acesso para `aux_adm`
- Configuração de categorias via admin
