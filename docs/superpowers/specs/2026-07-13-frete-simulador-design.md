# Simulação de Frete de Entrega — Design

## Contexto

O módulo Simulador (`/simulador`) já calcula condições de pagamento (cartão, débito, link, financiamento) para um modelo de moto selecionado. Falta uma forma de estimar o custo de entrega até o cliente, baseado na distância entre a loja de origem e o CEP de destino.

**Regra de cobrança:** R$3,00 por km rodado (ida e volta), com franquia grátis de 40km sobre o total ida-e-volta — ou seja, cobra-se apenas o excedente acima de 40km.

## Fórmula

```
distancia_km_ida = haversine(coord(CEP loja), coord(CEP destino)) × 1.3   // fator de correção estrada
km_ida_e_volta   = distancia_km_ida × 2
frete            = max(0, km_ida_e_volta - kmGratis) × valorPorKm
```

`valorPorKm` (padrão R$3,00) e `kmGratis` (padrão 40) são configuráveis por grupo — ver seção Configuração.

## Cálculo de distância (sem chave de API paga)

1. **ViaCEP** (`https://viacep.com.br/ws/{cep}/json/`) resolve o CEP em endereço estruturado (logradouro, bairro, localidade, uf). Já é o serviço usado no projeto para autocompletar endereço de cliente (`cliente-form.tsx`).
2. **Nominatim** (OpenStreetMap, `https://nominatim.openstreetmap.org/search`) geocodifica o endereço completo (não o CEP cru — cobertura melhor) em latitude/longitude. Requisição inclui header `User-Agent` identificando o app, respeitando a política de uso do Nominatim (máx. ~1 req/s, sem uso em massa — volume aqui é baixo, uma simulação por vez).
3. **Haversine** calcula a distância em linha reta entre as duas coordenadas.
4. Multiplica-se por **1.3** para aproximar do km real rodado (fator fixo no código, não configurável).

**Otimização:** a geocodificação da loja de origem é feita **uma única vez**, quando o CEP da loja é salvo em Admin > Lojas — resultado (lat/long) fica salvo em `lojas`. Cada simulação de frete só precisa geocodificar o CEP de destino (informado pelo usuário), não a loja.

**Erros tratados, sem travar a tela:**
- CEP de destino não encontrado (ViaCEP retorna `erro: true`) → mensagem "CEP não encontrado".
- Endereço não geocodificável pelo Nominatim → mensagem "Não foi possível calcular a distância para este CEP".
- Loja sem CEP cadastrado → bloco de frete mostra aviso "Configure o CEP desta loja em Admin > Lojas" no lugar do campo de simulação.

## Modelo de dados

### `lojas` — novas colunas
- `cep` (text, nullable) — CEP da loja, preenchido pelo admin via Admin > Lojas.
- `latitude` (numeric, nullable)
- `longitude` (numeric, nullable) — calculados automaticamente (geocodificação única) quando `cep` é salvo/alterado; `null` enquanto o CEP não é informado ou se a geocodificação falhar.

### `configuracao_taxas` — novas colunas (uma linha por grupo, já existente)
- `frete_valor_km` (numeric, not null, default `3.00`)
- `frete_km_gratis` (numeric, not null, default `40`)

Editáveis por grupo, mesmo padrão das taxas de cartão/débito/link/financiamento já existentes.

## Interface

### Simulador (`/simulador`)
Quando um modelo está selecionado, novo bloco "Frete de Entrega" abaixo do resumo de preços:
- **Loja de origem:**
  - Não-admin (vendedor/aux_adm): automática, a própria loja do usuário (`usuario.lojaId`) — sem seletor.
  - Admin (`admin_geral`/`admin_socio`, sem loja fixa): seletor com as lojas do grupo ativo (reaproveita `listarLojasDoGrupoAtivo`).
- **CEP de destino:** campo texto com máscara `00000-000`.
- Ao completar 8 dígitos válidos, calcula automaticamente (debounce) e mostra:
  - Distância ida e volta (km)
  - Frete: `R$ X` ou badge "Frete grátis" (dentro da franquia)
- O frete é **informativo, somado ao total** — não entra no cálculo de parcelas de cartão/financiamento (que continuam calculadas só sobre o valor da moto). Aparece como linha adicional: "Frete: R$ X — Total com frete: R$ Y", tanto na tela quanto no PDF impresso (`gerarHtmlPrint`).
- Se a loja de origem não tiver CEP cadastrado: aviso "Configure o CEP desta loja em Admin > Lojas" no lugar do bloco de cálculo.

### Admin > Lojas (`/admin/lojas`)
Hoje só existe criação (`NovaLojaDialog`) e desativação de loja — `editarLojaAction` já existe no código mas não tem nenhum botão associado. Este trabalho:
- Adiciona botão "Editar" por linha da tabela (visível só para `admin_geral`, mesmo padrão de `DesativarLojaButton`).
- `EditarLojaDialog` com os campos existentes (nome, cidade, endereço) + novo campo CEP.
- `editarLojaAction` passa a aceitar `cep`; ao salvar, se o CEP mudou, geocodifica (ViaCEP + Nominatim) e atualiza `latitude`/`longitude`. Se a geocodificação falhar, salva o CEP mesmo assim com lat/long `null` e avisa o usuário (não bloqueia o salvamento da loja por causa de uma falha externa).
- `NovaLojaDialog`/`criarLojaAction` também ganham o campo CEP (opcional na criação).

### Precificação (`/precificacao`)
Nova aba "Frete" em `TaxasForm`, ao lado de Cartão/Débito/Link/Financiamento:
- Campo "Valor por km (R$)" — número, 2 casas decimais.
- Campo "Km grátis (ida e volta)" — número inteiro.
- Salva via `salvarTaxasAction` (estendida com os 2 campos novos).

## Fora de escopo (não incluído nesta entrega)
- Fator de correção (1.3) não é configurável — é uma constante de código.
- Não recalcula automaticamente lat/long de lojas já existentes — só acontece quando o CEP é salvo/alterado pela primeira vez.
- Frete não é somado ao valor financiado (parcelas) — é sempre informativo.
- Sem cache de geocodificação do CEP de destino entre simulações (cada simulação com CEP novo faz uma chamada nova ao Nominatim; volume esperado é baixo).
