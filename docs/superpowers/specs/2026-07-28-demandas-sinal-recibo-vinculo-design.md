# Demandas: sinal com recibo, cliente completo e vínculo com venda

**Data:** 2026-07-28

## Contexto

Hoje uma **demanda** é um registro enxuto (`modelo` texto + `cor` + loja + solicitante) com um flag opcional `sinal_recebido` que só serve para priorizar/ordenar. Não guarda cliente e não gera recibo. Não há vínculo entre demanda e venda/reserva.

A reserva no estoco (`registrarReservaAction`) guarda o cliente completo desnormalizado e gera um recibo imprimível em `(print)/reservas/[id]/imprimir`. A venda faz upsert em `clientes` por CPF (`criarVendaTx`).

## Objetivo

1. Quando um **sinal** é registrado numa demanda, exigir o **cadastro completo do cliente** e gerar um **recibo** análogo ao da reserva.
2. Trocar o campo de texto livre de modelo por um **seletor da base de modelos**.
3. Quando a moto correspondente chegar no estoque, permitir **vincular a demanda a uma venda/reserva** a partir do fluxo do estoque.

## Decisões (confirmadas com o usuário)

- Cadastro completo do cliente + recibo **só quando há sinal**. Demandas sem sinal seguem enxutas.
- Conexão demanda→venda é disparada **pelo fluxo de venda/reserva do estoque** ("Vincular a uma demanda existente").
- Recibo mostra o **veículo pretendido = marca+modelo+cor** (sem chassi) + **texto de encomenda** ("Sinal referente à encomenda de veículo a ser disponibilizado").
- Sinal já pago entra na venda de forma **informativa** (vendedor lança o valor manualmente).
- Depois de vinculada, a demanda vira **`atendida`** (sai da lista de pendentes, mantém histórico com `venda_id`). Nada é apagado.
- Sinal da demanda **não gera lançamento no caixa** (espelha a reserva).
- Cliente guardado como **colunas desnormalizadas na `demandas`** (espelho da `reservas`) — Opção A. Materialização em `clientes` acontece no vínculo com a venda (upsert por CPF já existente).

## Mudanças de schema (`demandas`)

Novo enum `demanda_status` = `['aberta', 'atendida']`.

Colunas adicionadas (todas nullable, exceto onde indicado):
- `modelo_id uuid → modelos.id` — FK do seletor. `modelo` (texto) permanece e passa a guardar o **label** (marca+modelo) para exibição; legado com só texto continua válido.
- `numero integer` — número do recibo, atribuído via `nextval('numero_venda_seq')` quando o sinal é registrado.
- `meio_pagamento text`, `sinal_recebido_em timestamptz`.
- `status demanda_status NOT NULL default 'aberta'`.
- `venda_id uuid → vendas.id`.
- Snapshot do cliente: `cliente_nome, cliente_cpf, cliente_celular, cliente_email, cliente_cep, cliente_logradouro, cliente_numero, cliente_complemento, cliente_bairro, cliente_cidade, cliente_estado` (text).

Migração via Supabase MCP (`apply_migration`), conforme padrão do repo.

## Server actions (`demandas/actions.ts`)

- `criarDemandaAction` passa a aceitar `modeloId`, `modeloLabel` e, quando `sinalRecebido`, o bloco de cliente + `meioPagamento`. Numa transação grava a demanda com snapshot, `numero=nextval`, `sinal_recebido_em=now()`. Retorna `{ id }` para o link de recibo. Sem sinal → insert simples como hoje.
- `atualizarSinalDemandaAction` ao **marcar** passa a exigir o bloco de cliente + valor + meio (grava snapshot, `numero`, `sinal_recebido_em`). Desmarcar continua só admin.
- Novo `buscarDemandaParaRecibo(id)` (query para a página de recibo).
- Novo `listarDemandasCompativeis(lojaIds)` → demandas `status='aberta'` + `sinal_recebido=true`, para o estoque.

## Vínculo no estoque

- `criarVendaTx` e `registrarReservaAction` passam a aceitar `demandaVinculadaId` opcional. Ao concluir, marcam a demanda `status='atendida'` (venda também grava `venda_id`).
- `VenderButton` recebe `demandasCompativeis?` (mesmas `modeloId` + loja da moto). Quando houver, mostra seletor "Vincular a uma demanda existente"; ao escolher, pré-preenche os campos de cliente pelo snapshot e exibe um aviso informativo do sinal já recebido (recibo #N). `demandaVinculadaId` vai no payload.
- A página `estoque` carrega as demandas compatíveis e as passa ao `MotoTable` → `VenderButton`.
- **Limitação documentada:** o vínculo só marca a demanda como atendida no caminho de venda/reserva **direto**. Se a venda cair em fluxo de aprovação, a demanda permanece aberta (baixa manual).

## Recibo

Nova rota `(print)/demandas/[id]/imprimir/page.tsx` + `print-trigger.tsx`, clonada do padrão da reserva. Mostra cliente completo, veículo pretendido (marca+modelo+cor, sem chassi), valor do sinal, meio de pagamento, solicitante/vendedor, data, texto de encomenda e assinaturas.

## UI

- `nova-demanda-form.tsx`: seletor nativo de modelo (base `modelos`, `<select>` nativo pois base-ui mostra UUID cru); cor continua texto. Ao marcar sinal, expande o bloco de cliente (CPF com busca via `buscarClientePorCpfAction`, celular, nome, email, CEP/ViaCEP) + valor + meio. Sucesso → botão "Imprimir recibo".
- `marcar-sinal-button.tsx`: marcar abre dialog com o mesmo bloco de cliente + valor + meio; sucesso → link de recibo.
- `demandas-table.tsx`: badge de status; link "Recibo" nas demandas com sinal; atendidas saem do topo.
- `demandas/page.tsx`: query com novos campos + lista de modelos para o form.
