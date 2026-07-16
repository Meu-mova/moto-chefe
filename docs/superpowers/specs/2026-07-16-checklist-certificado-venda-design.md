# Spec: Checklist de Entrega e Certificado de Bateria para impressão (módulo de Vendas)

**Data:** 2026-07-16

## Problema

O usuário forneceu dois documentos em Word (`D:\ECOMOV\docs impressão mova.docx` e `D:\ECOMOV\Certificado Bateria MOVA.docx`) usados na entrega da moto ao cliente — um checklist de vistoria e um certificado de seguro de bateria — e quer que o sistema gere/imprima esses documentos com os dados da venda já preenchidos, disponíveis assim que a nota fiscal de saída é lançada.

## Conteúdo extraído dos templates

### Checklist de Entrega (`docs impressão mova.docx`)

- Título "CHECKLIST DE ENTREGA".
- Cabeçalho: Cliente, Data, Modelo, Chassi, Cor.
- Tabela de 15 itens de vistoria (Chave de ignição, Ignição pelo painel/controle/cartão, Acelerador, Freios em funcionamento, Comandos 1/2/3, Ré, Sensor de freio, Lanterna, Farol baixo/alto, Buzina, Setas dianteiras/traseiras, Alarmes e travas, Carenagens em perfeito estado, Carregador em funcionamento, Abertura do banco/compartimento da bateria), colunas OK/NÃO em branco para marcação manual.
- "Observações complementares: ___" em branco.
- Linha de assinatura do cliente.
- Bloco "DADOS DO PROPRIETÁRIO": Nome, CPF, Endereço.
- Bloco "DADOS MOTOCHEFE": Modelo, Chassi, Motor, Cor.
- Bloco "DADOS DA LOJA": Nome, Nº Nota Fiscal, Data Emissão.
- Nota do template "CIDADE E DATA PREENCHIDA AUTOMATICAMENTE" — indica que a linha de local/data (acima das assinaturas) deve vir preenchida automaticamente (ex.: "Varginha, 16/07/2026"); a nota em si não é impressa, é só instrução do modelo original.
- Linhas de assinatura: Cliente / Loja.

### Certificado Bateria MOVA (`Certificado Bateria MOVA.docx`)

- Logo MotoChefe + título "CERTIFICADO — SEGURO EXCLUSIVO BATERIAS" + "PRIMEIRO SEGURO DE BATERIA — GARANTIA QUE VAI ALÉM!".
- Parágrafo fixo sobre a garantia oferecida pela MotoChefe.
- Parágrafo fixo sobre a cobertura pela Yelum Seguradora (grupo HDI), apólice Nº 51.38.2025.0000324.
- Bloco "DADOS DO ASSEGURADO": Nome completo, CPF, Nº da Nota Fiscal, Modelo do veículo, Chassi, Cor, Loja.
- "SELO DA BATERIA" — espaço em branco na página impressa (selo físico colado depois; decisão do usuário).
- Dois parágrafos fixos de termos/condições e direito de rescisão.
- Número solto "8953508591550" próximo ao rodapé — **descartado**, não aparece na versão impressa (decisão do usuário).
- Rodapé fixo: SAC (21) 96679-0202 / MOTOCHEFEBRASIL.COM.BR / @MOTOCHEFEBRASIL.

## Solução

Recriar os dois documentos como páginas HTML/CSS de impressão, seguindo exatamente o padrão já usado em `(print)/ordens-servico` e `(print)/reservas` (Server Component, CSS inline pensado para A4, `PrintTrigger` disparando `window.print()` automaticamente, sem lib de PDF nem geração server-side — confirmado com o usuário, que preferiu o padrão simples de "página + salvar como PDF pelo navegador" em vez de Chromium headless no servidor).

### Novas rotas

- `(print)/vendas/[id]/checklist-entrega/page.tsx` (+ `print-trigger.tsx`)
- `(print)/vendas/[id]/certificado-bateria/page.tsx` (+ `print-trigger.tsx`)

Ambas usam uma nova query `buscarVenda(id)` (join `vendas` → `motos` → `modelos` → `lojas`), trazendo: `id`, `dataVenda`, `notaFiscalSaida`, `motoId`, `lojaNome`, `marca`, `modelo`, `chassi`, `cor`, `motor`, `clienteNome`, `clienteCpf`, `clienteLogradouro`/`Numero`/`Complemento`/`Bairro`/`Cidade`/`Estado`.

Checagem de acesso igual à de OS/reserva: `admin_geral`/`admin_socio` veem qualquer venda; demais papéis só se a venda for da própria loja, senão `notFound()`.

### Onde os links de impressão aparecem

1. **Aba "Venda" da ficha da moto** (`src/app/(dashboard)/estoque/[id]/components/venda-tab.tsx`): ao lado da linha "NF Saída", condicionado a `venda.notaFiscalSaida` estar preenchido (funciona tanto para NF emitida via Bling quanto lançada manualmente) — dois linkzinhos "Checklist de Entrega" e "Certificado Bateria", abrindo cada rota em nova aba.

2. **Logo após confirmar a NF** (`src/app/(dashboard)/estoque/components/nf-saida-button.tsx`, função `confirmar()`): em vez de fechar o dialog imediatamente após `confirmarNFSaidaAction`, mostrar uma tela de sucesso com os dois links de impressão + botão "Fechar" — mesmo padrão da tela de sucesso da reserva. Para isso, `confirmarNFSaidaAction` (em `src/app/(dashboard)/vendas/actions.ts`) passa a retornar `{ vendaId: string }` (hoje retorna `void`) — precisa localizar a venda pendente de NF (já faz isso hoje, só falta devolver o id).

## Fora do escopo

- Sem geração de PDF real no servidor — segue o padrão de `window.print()` do navegador, por decisão explícita do usuário.
- Sem upload/gerenciamento de template pela aplicação — os dois documentos ficam com layout fixo no código; para alterar, é preciso editar o código (decisão do usuário: "fixo por enquanto").
- Sem mudança no fluxo de emissão via Bling nem no `DanfeButton` existente.
- Sem preenchimento do "SELO DA BATERIA" (fica em branco) nem do número solto (descartado).
