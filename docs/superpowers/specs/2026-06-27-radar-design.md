# RADAR — Design Spec

**Data:** 2026-06-27  
**Status:** Aprovado

---

## Objetivo

Permitir que qualquer usuário do sistema localize uma moto pelo chassi (busca parcial), independente de ela estar em estoque ou já ter sido vendida.

---

## Rota e Acesso

- **URL:** `/radar`
- **Acesso:** todos os papéis (`admin_geral`, `admin_socio`, `aux_adm`, `vendedor`, `mecanico`)
- **Arquivo:** `src/app/(dashboard)/radar/page.tsx` (Server Component)
- **Sidebar:** ícone `Radar` (lucide-react), label "RADAR", sem restrição de papel

---

## Busca

- Campo de texto simples dentro de um `<form method="GET">`
- Parâmetro de URL: `?q=<texto>`
- Query no banco: `ILIKE '%q%'` no campo `motos.chassi`
- Busca em **todas as motos**, incluindo vendidas (diferença-chave em relação ao Showroom)
- Join com `modelos` (para marca/modelo) e `lojas` (para nome da loja)

---

## Estados da Página

| Estado | O que exibe |
|--------|-------------|
| Sem `?q` | Campo de busca centralizado com instrução |
| `?q` sem resultados | Mensagem "Nenhuma moto encontrada para o chassi informado" |
| `?q` com resultados | Tabela compacta com os resultados |

---

## Tabela de Resultados

Layout compacto, seguindo o padrão visual do Showroom (`/estoque`).

**Colunas:**
1. Chassi (fonte mono, compacta)
2. Modelo (marca + modelo)
3. Cor
4. Loja
5. Status (badge)
6. Disponibilidade (badge, se preenchida)
7. Ação: botão/link "Ver" → navega para `/estoque/[id]`

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/app/(dashboard)/radar/page.tsx` | Criar — página Server Component |
| `src/components/layout/sidebar.tsx` | Modificar — adicionar item RADAR |

---

## Fora de Escopo

- Busca por outros campos (modelo, NF, cor) — apenas chassi
- Ações sobre a moto dentro do RADAR (vender, transferir etc.) — apenas visualização
- Paginação — resultado simples sem limite fixo (chassi parcial já filtra bem)
