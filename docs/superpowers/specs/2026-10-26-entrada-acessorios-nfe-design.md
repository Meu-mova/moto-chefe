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

- Importar o XML em `/entrada`: as motos (chassi no infCpl) seguem como hoje. Toda linha `<det>` que não é moto (NCM 8711; o 8714, peça de moto, entra como peça) aparece numa tabela de conferência com: nome do XML, código, quantidade, custo unitário, peça sugerida (pelo vínculo) ou "cadastrar nova" (nome editável, preço de venda obrigatório) e "não dar entrada".
- Confirmar: numa transação, grava as motos, cria as peças novas na Conta, grava/atualiza o vínculo, soma a quantidade ao estoque da loja de destino (`quantidade = quantidade + n` no SQL, não lida e regravada no JS), grava o custo e registra a nota (chave + Conta + loja + data).
- Conta: em peças, vínculo e `notas_entrada`, a Conta gravada **sai da loja de destino**, nunca do payload. O servidor confere que o usuário tem acesso à loja (como o `resolverLojaDestino` de hoje faz para as motos).
- Isolamento: a sugestão, a busca de peça, o vínculo e o aviso de nota repetida só olham a Conta da loja de destino, com o filtro dentro da consulta. O servidor confere que toda peça escolhida é dessa Conta. A leitura da sugestão faz join com `pecas_catalogo.conta_id = vinculo.conta_id`.

## Fiscal (ADR-0008)

- `nome_xml` guarda o `xProd` **pelo mesmo leitor do `motos_fiscal.x_prod`**: aparado nas pontas, sem mudar caixa, sem normalizar e com as entidades XML (`&amp;`) como vieram. "Literal" quer dizer a mesma coisa nos dois. Serve só para casar o vínculo.
- O nome sugerido para a peça nova é o `nome_xml` com as entidades decodificadas (`&amp;` vira `&`), e a pessoa pode editá-lo.
- As motos seguem como hoje: `motos_fiscal.x_prod` fica intacto e é o nome que sai na NF de saída (ADR-0008).
- O nome editável da peça nova é comercial: `vendas_pecas` não emite nota fiscal, então o ADR-0008 não se aplica a ele.

## Modelo (migração: próximo número livre na hora do PR; hoje 0147)

- `pecas_catalogo.custo numeric(10,2) null`.
- `pecas_catalogo`: `unique (conta_id, id)`, alvo da FK composta abaixo.
- `pecas_vinculo_fornecedor (id, conta_id not null, fornecedor_cnpj, codigo, nome_xml, peca_id, unique(conta_id, fornecedor_cnpj, codigo, nome_xml))` com **FK composta `(conta_id, peca_id) → pecas_catalogo(conta_id, id)`**: o banco não aceita vínculo da Conta A apontando para peça da Conta B. O upsert do vínculo usa `onConflictDoUpdate` com `setWhere` pela mesma Conta.
  - Limite aceito: com `nome_xml` na chave, se o fornecedor mudar um caractere do `xProd`, a sugestão some e a pessoa escolhe a peça de novo. Como é só sugestão, o custo é baixo.
- `notas_entrada (id, conta_id not null, loja_id, chave_acesso, numero, fornecedor_cnpj, criado_em, criado_por)`, com índice (conta_id, chave_acesso), sem unique, porque a nota repetida é aviso e não bloqueio.

### Fonte do aviso de nota repetida

- **Fonte única: `notas_entrada`, pela chave de acesso e pela Conta**, para nota só de motos, só de peças ou mista. Cada linha registra um evento (a nota foi lançada nesta data, por esta pessoa), não um estado derivado. Por isso não é a "segunda verdade" que o comentário de `nfe_recebidas` no `schema.ts` evita.
- `motos.nota_fiscal_entrada` guarda só o número (nNF), que se repete entre fornecedores, e não serve para isso. Ela continua como está; a moto repetida segue barrada pelo chassi.
- `nfe_recebidas` (SEFAZ, por grupo) não muda nesta spec. O "já lançada" daquela tela continua pela junção com as motos; passar a olhar `notas_entrada` fica para depois.
- Nota lançada antes desta entrega não está em `notas_entrada` e não gera aviso. Sem backfill.

## Fora do escopo

Variações, markup, filtro por CFOP/NCM, NF de entrada fiscal (escrituração), devolução ao fornecedor, edição em lote de preço.

## Pendências

Decididas pelo Luis em 26/10 (comentários na #341):

- **P1 Unidade:** se o `uCom` for CX ou KIT com N unidades dentro, a quantidade da nota entra como está, mas fica editável na conferência.
- **P2 Custo da peça existente:** é sobrescrito pelo custo da última nota. O histórico de custo fica para depois.
- **P3 Quantidade fracionada** (qCom 1.5): o estoque de peças é em unidades inteiras. A linha fica destacada na conferência e a pessoa corrige a quantidade para um inteiro (o campo é editável pela P1). O sistema não arredonda sozinho e não confirma a entrada enquanto houver decimal. É exceção ao "avise, não bloqueie", porque não existe estoque fracionado.

Pré-requisito:

- **P4 Estoque por loja:** é o item 2 da #195 e precisa estar na `dev` antes do PR 2 desta spec.

## Entrega

1. Leitura das linhas de peça do XML (só teste unitário).
2a. Migração e gravação de peças, vínculo, estoque e nota, com `test:db` Conta B x Conta A: o vínculo não aponta para peça de outra Conta, o upsert não sobrescreve vínculo de outra Conta e a loja de destino de outra Conta é recusada.
2b. Junção com a transação das motos (Q5: tudo ou nada), com `test:db` provando que, se uma peça falhar, nenhuma moto é gravada.
3. Tela de conferência em `/entrada`, com teste no navegador e `test:db` das leituras: a Conta B não recebe sugestão, busca de peça nem aviso "já entrou" de nota da Conta A.
