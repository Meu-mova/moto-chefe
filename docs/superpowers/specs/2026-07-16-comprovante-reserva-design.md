# Spec: Comprovante de reserva para impressão

**Data:** 2026-07-16

## Problema

No módulo de Vendas, ao reservar uma moto para um cliente, não existe nenhum documento para entregar como comprovante — o cliente só tem a palavra do vendedor de que o sinal foi pago e o veículo está reservado.

## Solução

Seguir o padrão já existente de impressão de Ordem de Serviço (`src/app/(print)/ordens-servico/[id]/imprimir/`): uma rota dedicada em `(print)`, sem chrome do dashboard, CSS inline pensado para A4, com `window.print()` automático ao abrir. Nenhuma lib de PDF é usada — "salvar como PDF" é feito pelo próprio navegador na janela de impressão.

O ícone/botão de impressão fica disponível em dois pontos:

1. **Logo após confirmar a reserva**, dentro do dialog do `VenderButton` (`src/app/(dashboard)/estoque/components/vender-button.tsx`).
2. **A qualquer momento depois**, como ícone ao lado do botão "Finalizar Venda" onde quer que a moto reservada apareça (listagem de estoque e ficha da moto).

## Mudanças

### 1. Query — `buscarReserva`

Novo arquivo `src/lib/queries/reservas.ts`, função `buscarReserva(id: string)`, join `reservas` → `motos` → `modelos` → `lojas` → `usuarios` (vendedor), no mesmo estilo de `buscarPedido` (`src/lib/queries/vendas.ts:136-164`). Traz: `id`, `numero`, `status`, `criadoEm`, `motoId`, `lojaId`, `lojaNome`, `marca`, `modelo`, `cor`, `chassi`, `vendedorNome`, `valorReserva`, `valorTotalVenda`, `meioPagamento`, `cartaoOperadora`, `cartaoParcelas`, `dataPrevistaFinalizacao`, e os campos `cliente*` já existentes na tabela.

### 2. Nova rota de impressão

`src/app/(print)/reservas/[id]/imprimir/page.tsx` (Server Component) + `print-trigger.tsx` (reaproveita o mesmo componente genérico já usado pela OS, sem alterações — pode ser importado direto de `ordens-servico/[id]/imprimir/print-trigger.tsx` ou duplicado por colocation, seguindo a convenção existente).

Checagem de acesso igual à da OS:
```ts
const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
if (!isAdmin && reserva.lojaId !== usuario.lojaId) notFound()
```

Conteúdo da página (CSS inline, mesmo visual de cards/badges da OS):
- Cabeçalho: logo (`/motochefe-logo.png`), nome da loja, "Reserva #{numero}", data de criação.
- Card **Cliente**: nome, CPF, celular, e-mail, endereço completo.
- Card **Veículo**: marca/modelo, cor, chassi.
- Card **Condições da reserva**: valor de entrada, valor total negociado, forma de pagamento (+ operadora/parcelas se cartão), data prevista de finalização, vendedor.
- Texto de termos (fixo): *"Este comprovante formaliza a reserva do veículo acima mediante o sinal pago. A reserva é válida até a data prevista de finalização informada, após a qual poderá ser cancelada a critério da loja."*
- Área de assinatura: "Assinatura do Cliente" / "Assinatura do Vendedor".
- Rodapé: "MOVA — Sistema de Gestão · MotoChefe Sul de Minas" + "Gerado em {data/hora}".

Se `status !== 'ativa'` (reserva já convertida em venda ou cancelada), a página imprime normalmente mesmo assim — é só um comprovante histórico, não trava a reimpressão.

### 3. `registrarReservaAction` passa a retornar o id criado

`src/app/(dashboard)/vendas/actions.ts` — o `tx.insert(reservas).values({...})` ganha `.returning({ id: reservas.id })`, e a action retorna `{ id }` no final, para o client poder montar o link de impressão assim que a reserva é confirmada com sucesso.

### 4. Tela de sucesso no `VenderButton` após reservar

Em `handleSubmit`, no branch `else` (reserva), em vez de só `toast.success(...)` + `setOpen(false)`, guarda o `id` retornado num novo estado `reservaCriadaId: string | null` e **não fecha o dialog**. O corpo do dialog passa a renderizar uma tela de sucesso quando `reservaCriadaId` está preenchido:

- Ícone de confirmação + "Reserva #{numero} registrada com sucesso!"
- Botão **"Imprimir comprovante"** — `<a href={`/reservas/${reservaCriadaId}/imprimir`} target="_blank">` estilizado como botão.
- Botão **"Fechar"** — fecha o dialog e reseta o estado (`reservaCriadaId = null`).

O fluxo de venda normal (`tipo === 'venda'`) e o de pedido de aprovação continuam fechando o dialog como hoje, sem tela de sucesso — essa mudança é exclusiva do caminho de reserva confirmada direto (sem aprovação pendente).

Como a action retorna só `{ id }` e a página de impressão busca o `numero` sozinha via `buscarReserva`, a tela de sucesso não precisa saber o número da reserva — pode mostrar um texto genérico ("Reserva registrada com sucesso!") sem o número, evitando um retorno maior da action.

### 5. Ícone de reimpressão nas telas de estoque

Duas queries precisam expor o id da reserva ativa, hoje ausente nos subselects correlacionados de `src/lib/queries/motos.ts` (`listarMotos` e `buscarMoto`):

```ts
reservaId: sql<string | null>`(
  SELECT r.id FROM reservas r
  WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
  ORDER BY r.criado_em DESC LIMIT 1
)`,
```

Propagar o campo `reservaId` nos tipos `Moto` de:
- `src/app/(dashboard)/estoque/components/moto-table.tsx`
- `src/app/(dashboard)/estoque/[id]/components/moto-actions.tsx`

Em ambos, ao lado do `VenderButton` renderizado para `disponibilidade === 'reservada'`, adicionar um ícone `Printer` (lucide-react) como link (`<a target="_blank" href={`/reservas/${moto.reservaId}/imprimir`}>`), estilizado como os demais botões-ícone (`variant="ghost" size="icon"`), visível apenas quando `moto.reservaId` existe.

## Fora do escopo

- Sem geração de PDF server-side (lib tipo `@react-pdf/renderer`/`puppeteer`) — segue o padrão existente de `window.print()`.
- Sem mudança de schema — todos os campos usados já existem em `reservas`.
- Sem comprovante para o fluxo de "Finalizar Venda" (conversão de reserva em venda) — isso já não tem impressão hoje e não foi pedido; pode virar uma spec futura se necessário.
- Sem envio automático (e-mail/WhatsApp) do comprovante — só impressão/PDF manual pelo navegador.
