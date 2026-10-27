# Spec #341: entrada de peças e acessórios pela NF-e

Refs #341. Depende da #195: `pecas_catalogo.conta_id` e leituras por Conta (#419, #420, já na `dev`) e **estoque por loja (item 2 da #195), pré-requisito ainda sem PR**.

## Decisões (grilling 26/10, Luis: A em todas)

1. Cada cor ou tamanho é uma peça própria; não há modelo de variação.
2. Vínculo "CNPJ do fornecedor + cProd + xProd → peça", por Conta, sugerido nas próximas notas e editável.
3. Peça nova exige preço de venda na conferência; peça existente mantém o preço; o custo (vUnCom) é gravado em `custo`, sem mexer no preço.
4. Permissão: a mesma de `/entrada` (inclui `aux_adm`).
5. Motos e peças da mesma nota entram numa confirmação só, numa transação.
6. Chave de acesso guardada por Conta; nota repetida gera aviso "já entrou em DD/MM" e grava depois de uma confirmação explícita.
7. "Não dar entrada" por linha.

Já fixado pela #195: o catálogo e o vínculo são da Conta da loja de destino; o estoque é da loja de destino.

## Comportamento

- Importar o XML em `/entrada`: as motos (chassi no infCpl) seguem como hoje. Toda linha `<det>` que não é moto aparece numa tabela de conferência com: nome do XML, código, quantidade, custo unitário, peça sugerida (pelo vínculo) ou "cadastrar nova" (nome editável, preço de venda obrigatório) e "não dar entrada".
- Confirmar: numa transação, grava as motos, cria as peças novas na Conta, grava/atualiza o vínculo, soma a quantidade ao estoque da loja de destino, grava o custo e registra a nota (chave + Conta + loja + data).
- Isolamento: a sugestão, a busca de peça, o vínculo e o aviso de nota repetida só olham a Conta da loja de destino. O servidor confere que toda peça escolhida é dessa Conta.

## Modelo (migração: próximo número livre na hora do PR; hoje 0147)

- `pecas_catalogo.custo numeric(10,2) null`.
- `pecas_vinculo_fornecedor (id, conta_id not null, fornecedor_cnpj, codigo, nome_xml, peca_id → pecas_catalogo, unique(conta_id, fornecedor_cnpj, codigo, nome_xml))`.
- `notas_entrada (id, conta_id not null, loja_id, chave_acesso, numero, fornecedor_cnpj, criado_em, criado_por)`, com índice (conta_id, chave_acesso), sem unique, porque a nota repetida é aviso e não bloqueio.

## Fora do escopo

Variações, markup, filtro por CFOP/NCM, NF de entrada fiscal (escrituração), devolução ao fornecedor, edição em lote de preço.

## Pendências

Propostas da Turmalina, com a concordância do Maestro; **a confirmar pelo Luis**:

- **P1 Unidade:** se o `uCom` for CX ou KIT com N unidades dentro, a quantidade da nota entra como está, mas fica editável na conferência.
- **P2 Custo da peça existente:** é sobrescrito pelo custo da última nota. O histórico de custo fica para depois.
- **P3 Quantidade fracionada** (qCom 1.5): só avisa.

Pré-requisito:

- **P4 Estoque por loja:** é o item 2 da #195 e precisa estar na `dev` antes do PR 2 desta spec.

## Entrega

1. Leitura das linhas de peça do XML (só teste unitário).
2. Migração e gravação numa transação, com `test:db` Conta B x Conta A.
3. Tela de conferência em `/entrada`, com teste no navegador.
