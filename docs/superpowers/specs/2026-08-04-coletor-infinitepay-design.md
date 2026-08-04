# Coletor automático de vendas de cartão — InfinitePay

**Data:** 2026-08-04
**Status:** aprovado

## Problema

As vendas de cartão só entram no MOVA se alguém baixar o CSV no painel da
operadora e subir em `/conciliacao`. Enquanto ninguém sobe, toda venda paga no
cartão fica "Pendente" — o dinheiro entrou, mas o sistema não sabe.

Existem várias operadoras (InfinitePay, Stone, PagueVeloz). Este spec resolve
**só a InfinitePay**; as outras entram depois, uma a uma, reaproveitando a
mesma estrutura.

## O que já existe

- `conciliacoes_cartao` (schema.ts:537) — a tabela de destino.
- `POST /api/conciliacao/cartao` — recebe `{ operadora, transacoes[] }`,
  deduplica por NSU, tenta casar com venda de moto → peça → OS (tolerância de
  R$ 0,05, janela de ±1 dia) e grava conciliado/pendente. Autenticado por
  `x-cron-secret`. **Toda a lógica de conciliação já está aqui e não muda.**
- `/conciliacao` com upload manual de CSV — continua existindo como plano B.
- `conciliacao-terminal.ts` — extrai o serial da maquininha (`NS: PB1F254M76675`)
  para detectar arquivo importado no grupo errado.
- `scripts/conciliacao/infinitypay.mjs` + `.github/workflows/conciliacao-cartao.yml`
  — tentativa anterior, **morta**: endpoint e campos chutados, e token colado à
  mão num GitHub Secret. Não tinha como funcionar (ver abaixo).

## Descobertas da investigação (2026-08-04, painel ao vivo)

**Não existe API pública para o lojista listar vendas.** A documentação oficial
da InfinitePay cobre só *receber* pagamento (InfiniteTap e Checkout Integrado).
A lista de vendas vem de um serviço interno do painel:

```
GET https://infinitepay-sales-indexer.services.production.infinitepay.io
    /sales-index/v1/sales/search?from_date=<ISO>&to_date=<ISO>&pg=true&limit=100
```

Resposta: `{ pagination: { entries, next_page, next_page_id }, results: [...] }`.
Cada item:

```json
{ "id": 2611297499, "datetime": "2026-08-03T19:28:52.425Z", "type": "contactless",
  "amount": 26000, "net_amount": 24706, "brand": "visa", "method": "credit",
  "installments": 4, "serial_number": "PB1F248T73089", "status": "approved",
  "nsu": "SPB1F248T7308922050320260803160002", "transaction_origin": "pos",
  "fee_percentage": 4.98, "plan_or_description": "d_1_anticipation" }
```

Amostra de 30 dias: 166 vendas, 4 maquininhas, 77 aprovadas / 23 negadas nas
100 primeiras.

**Autenticação — a restrição que define o desenho:**

| Credencial | O que é | Validade |
|---|---|---|
| `jwtReadToken` (Bearer) | JWT, todos os escopos terminam em `/read` | **30 minutos** |
| `ifp_jwt` (cookie) | token opaco de sessão, mina o de cima | **7 dias** (`ifp_token_exp`) |

O login da conta web é **só por QR Code no app do celular** — não há
usuário/senha nem chave de API. Por isso o script antigo não funcionava: o
token colado no GitHub Secret expira em 30 minutos.

Consequências aceitas:
- Nenhuma automação roda mais de 7 dias sem alguém reescanear o QR.
- A credencial é read-only: uma automação com ela não movimenta dinheiro.
- É API interna, não documentada. Pode mudar sem aviso — o desenho tem que
  falhar de forma visível, não silenciosa.

## Solução

Coletor rodando na máquina do Cesar, agendado pelo Agendador de Tarefas do
Windows. O script **não reproduz o login**: ele abre o painel num perfil de
navegador persistente já logado e dispara a chamada de dentro da página, de
modo que o próprio app da InfinitePay cuida de renovar o token de 30 minutos.
Nenhuma credencial é lida, copiada ou armazenada.

```
[PC do Cesar — Agendador de Tarefas, 1×/dia]
  scripts/conciliacao/infinitepay.ts   (tsx + Playwright, perfil por grupo)
    ├─ abre app.infinitepay.io/sales (perfil persistente, já logado)
    ├─ page.evaluate → fetch sales/search, paginando até o fim
    ├─ normaliza e descarta o que não é cartão aprovado
    └─ POST {MOVA_URL}/api/conciliacao/cartao  (x-cron-secret)
                    │
         [Vercel — endpoint existente, lógica intocada]
                    └─ dedup → casa venda/peça/OS → conciliacoes_cartao
```

Rota alternativa considerada e **descartada por ora**: guardar o `ifp_jwt`
cifrado no banco e rodar um cron na Vercel. Roda sem PC, mas coloca credencial
de acesso à conta financeira dentro do banco e exige reproduzir um fluxo de
autenticação não documentado. O parser e o envio são os mesmos, então essa
troca continua possível depois sem recomeçar nada.

## Detalhamento

### Perfil por grupo

Um diretório de perfil por grupo, porque cada grupo tem sua própria conta
InfinitePay (a conectada hoje é `$motochefesuldeminas`):

```
%LOCALAPPDATA%\mova-coletor\infinitepay-<slug-do-grupo>\
```

O grupo **não** é inferido do dado — vem do parâmetro que escolheu o perfil.
O `serial_number` de cada venda serve como conferência: se um serial já visto
em outro grupo aparecer, o script aborta e avisa, em vez de gravar no grupo
errado.

### Janela de busca

Padrão: últimos 7 dias (`--dias=7`), o que cobre o PC ter ficado desligado.
`--desde=YYYY-MM-DD` para carga histórica. Reprocessar é seguro: o endpoint
deduplica.

### Mapeamento

| InfinitePay | `TransacaoCartao` |
|---|---|
| `nsu` | `nsu` |
| `datetime` | `dataTransacao` — data em **BRT**, não UTC |
| `amount / 100` | `valorBruto` |
| `net_amount / 100` | `valorLiquido` |
| `installments` | `parcelas` |
| `method` (`credit`/`debit`) | `tipo` (`credito`/`debito`) |
| objeto inteiro | `rawData` (preserva `id`, `brand`, `serial_number`, `fee_percentage`) |

`autorizacao` fica nulo: a InfinitePay não devolve código de autorização
separado do NSU.

**Descartes no coletor:** `status !== "approved"` (negadas) e
`method === "money"` (venda em dinheiro digitada na maquininha, não é cartão).

**Timezone:** `2026-08-04T01:20Z` é dia **03** em Brasília. Converter em UTC
joga a venda para o dia seguinte e o casamento erra a janela de ±1 dia. Usar a
conversão para BRT, no espírito do `parseDataInput()` já usado no projeto.

### Mudanças no app

1. **`grupo` no payload** — `POST /api/conciliacao/cartao` hoje grava tudo com
   `grupoId` fixo em Sul de Minas (`route.ts:120`). Passa a exigir `grupoCnpj`
   no corpo e resolver contra `grupos.cnpj`, devolvendo 400 se não achar. Sem
   isso, no dia em que BH entrar, a venda de lá cai em Sul de Minas — exatamente
   o erro que o `conciliacao-terminal.ts` foi escrito para pegar.
2. **Dedup com chave reserva** — hoje a checagem de duplicata só roda quando há
   NSU; sem NSU, insere duplicado a cada rodada. Passa a usar o `id` da
   operadora (guardado em `rawData`) quando o NSU vier vazio.
3. **Aposentar a tentativa anterior** — apagar
   `.github/workflows/conciliacao-cartao.yml` e
   `scripts/conciliacao/infinitypay.mjs`, substituídos pelo novo
   `scripts/conciliacao/infinitepay.ts`. Deixar o workflow no ar significa uma
   execução falhando 2×/dia para sempre.
4. **Dependência nova** — `playwright` como `devDependency` (o repo ainda não
   tem; `tsx` já existe). Ela só é usada por script local, nunca no build da
   Vercel.

O valor de `operadora` continua `'infinitypay'` (grafia já gravada no banco).
Nenhuma UI nova.

### Falhas e avisos

| Situação | Comportamento |
|---|---|
| Sessão de 7 dias vencida (caiu na tela do QR) | Não envia nada, sai com código ≠ 0 e avisa no Telegram: "InfinitePay: reescaneie o QR" |
| Endpoint mudou / resposta fora do formato | Aborta sem enviar, avisa no Telegram com o status HTTP |
| MOVA fora do ar | Sai com erro; a próxima rodada busca o mesmo período de novo |
| Serial de maquininha de outro grupo | Aborta antes de enviar |

Os avisos usam o `enviarMensagem()` de `src/lib/telegram/api.ts`, que já existe,
com o `telegramChatId` do grupo (coluna já presente em `grupos`).

O princípio: **nunca enviar dado parcial ou de grupo duvidoso**. Reprocessar é
barato, corrigir conciliação errada não é.

## Testes

- Mapeador, contra o JSON real capturado (100 vendas): centavos → reais, data
  em BRT (inclusive o caso da venda após 21h), `money` e `denied` descartados,
  parcelas, `rawData` preservando `fee_percentage` e `serial_number`.
- Endpoint com `grupoCnpj`: grava no grupo certo; 400 quando o CNPJ não existe;
  dedup por `id` quando não há NSU.
- Ponta a ponta: rodar `--dias=30` e conferir a contagem de aprovadas contra o
  painel.

## Fora de escopo

- Taxa da maquininha no financeiro. O `fee_percentage` fica guardado em
  `rawData`, mas nada é construído em cima agora.
- Conferir se o repasse caiu na conta (cruzar com o extrato do Open Finance).
- Detectar venda que passou na maquininha e não foi lançada no MOVA.
- Stone e PagueVeloz — próximas operadoras, mesma estrutura.
- Migrar o coletor para a nuvem (rota do token no banco).
