# Importação automática de despesas via Open Finance

## Contexto

Hoje as despesas são lançadas 100% manualmente em `/despesas`. O grupo já tem uma
integração com o mcp.ai (Open Finance) usada para puxar **recebimentos** PIX
(`/pix-mcp`) — o usuário só precisa vincular cada recebimento a uma venda/OS/
pedido/PA existente. A ideia agora é o espelho para o lado de **saída**: puxar
os débitos da conta bancária automaticamente, e o usuário só atribui categoria
e loja pra cada um virar uma despesa de verdade.

Diferença estrutural importante: no fluxo de PIX, a venda já existe antes do
recebimento chegar — o PIX só é *vinculado* a ela. Aqui não existe uma despesa
prévia — a transação bancária de saída **é** a origem da despesa. "Lançar"
significa criar a despesa a partir da transação, não só linká-la.

## Escopo

- Puxar **todo tipo de débito/saída** da conta (PIX enviado, boleto, TED,
  débito automático, tarifa bancária, etc.) — não só PIX.
- Nova aba **"Importar do Banco"** dentro da página `/despesas` existente
  (mantém a aba "Lançamentos" como está hoje).
- Transferências para contas internas do próprio grupo (Motochefe, Ecomov)
  **não** recebem tratamento especial aqui — aparecem como qualquer saída e
  podem ser categorizadas normalmente (diferente do que fizemos no PIX de
  recebimento, por decisão explícita do usuário).
- Uma transação só vira despesa (linha na tabela `despesas`) quando o usuário
  escolhe categoria + loja e clica em "Lançar". Até lá, não aparece em
  Despesas nem no Financeiro.
- Fora de escopo por agora: detecção automática de duplicidade com despesas
  já lançadas manualmente (ex: um boleto digitado à mão que depois aparece
  também via Open Finance) — o usuário simplesmente ignora a linha da
  importação nesse caso. Também fora de escopo: categorização automática por
  padrão de descrição (pode vir depois).

## Modelo de dados

Nova tabela `despesas_open_finance` (mesma migration manual + Supabase MCP
`apply_migration` já usada nas mudanças anteriores desta sessão):

```
id              uuid pk default gen_random_uuid()
grupo_id        uuid not null references grupos(id)
conta_id        text not null
banco           text not null
transacao_id    text not null unique   -- evita duplicar na sincronização
data            timestamptz not null
valor           numeric(12,2) not null
favorecido_nome text                    -- pra quem foi pago, quando a API informar
descricao       text
tipo_operacao   text                    -- 'PIX' | 'TED' | 'BOLETO' | 'TARIFA' | outros, quando disponível
categoria       text                    -- nulo até lançar; mesmo texto livre de despesas.categoria
loja_id         uuid references lojas(id)  -- nulo = despesa geral da empresa
despesa_id      uuid references despesas(id)  -- preenchido quando lançada
lancado_por_id  uuid references usuarios(id)
lancado_em      timestamptz
criado_em       timestamptz not null default now()
```

Reaproveita a tabela `pix_mcp_sync_status` já existente como controle de
cache de sincronização (mesma janela de 10 min) — é a mesma conexão com o
mcp.ai, não precisa de uma segunda tabela de status.

## Sincronização (mcp.ai)

Hoje `buscarPixRecebidos` (`src/lib/mcpai.ts`) busca as transações de cada
conta e descarta tudo que não for `type === 'CREDIT' && operationType === 'PIX'`.
Vou extrair a parte comum (inicializar sessão, listar contas, forçar sync,
listar transações da conta) pra uma função compartilhada, e criar
`buscarSaidasOpenFinance` que usa a mesma listagem já buscada mas filtra
`type === 'DEBIT'` — assim uma única chamada por conta serve tanto pra
recebimentos quanto pra saídas, sem bater duas vezes na API do mcp.ai.

A página `/despesas` (aba "Importar do Banco") dispara essa sincronização do
mesmo jeito que `/pix-mcp` já faz: se o cache estiver velho (>10 min) ou
`?sync=1` na URL, busca de novo; senão lê só do banco.

## UX da aba "Importar do Banco"

- Filtro de data (De/Até), padrão dia 01 do mês corrente até hoje (mesmo
  padrão já corrigido no PIX).
- Cards de resumo: Total em Saídas do período, Já Lançadas, Pendentes de
  Categorização.
- Tabela: Data | Favorecido/Descrição | Valor | Categoria (select, mesma
  lista de `categoriasDespesa` já usada em Despesas) | Loja (select, com
  opção "Geral/Empresa") | botão "Lançar".
- Botão "Lançar" fica desabilitado até categoria E loja estarem preenchidos
  (loja pode ser explicitamente "Geral/Empresa" — isso conta como
  preenchido, não é o mesmo que "em branco").
- Ao lançar: cria a linha em `despesas` (grupo, loja, categoria, valor, data,
  banco iguais aos da despesa manual hoje; `forma_pagamento` recebe o
  `tipo_operacao` bruto da transação — ex. "PIX", "TED", "BOLETO" — sem
  tradução/mapeamento especial, já que `despesas.forma_pagamento` já é texto
  livre), marca `despesa_id`/`lancado_por_id`/`lancado_em` na linha de
  `despesas_open_finance`, e a linha some da lista de pendentes (fica só no
  histórico "já lançada", com "lançado por / quando", igual ao padrão do PIX).
- Erro de sincronização: mesmo aviso nao-bloqueante já usado no PIX (mostra
  os dados já salvos com um aviso, sem quebrar a tela).

## Permissões

Mesma regra que já existe em `/despesas` hoje: só `admin_geral`/`admin_socio`.

## Verificação

- Rodar a sincronização manualmente e confirmar que saídas reais da conta
  aparecem na aba, com valor/data batendo com o extrato.
- Lançar uma saída de teste (categoria + loja) e confirmar que ela aparece
  em Despesas e no card de Lucro Líquido do Financeiro do mesmo mês.
- Confirmar que uma transação já lançada não aparece mais como pendente após
  o lançamento.
- Confirmar que rodar a sincronização de novo não duplica transações já
  importadas (unicidade por `transacao_id`).
