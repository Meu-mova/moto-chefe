# Importação automática de vendas de cartão (3 operadoras, por botão)

**Data:** 2026-08-04
**Status:** aprovado

## Problema

As vendas de cartão só entram no MOVA se alguém baixar o CSV no painel da
operadora e subir em `/conciliacao`. Enquanto ninguém sobe, toda venda paga no
cartão fica "Pendente" — o dinheiro entrou, mas o sistema não sabe.

São três operadoras: **InfinitePay**, **Stone** e **PagueVeloz**. O Cesar quer
um **botão no dashboard**: abriu o MOVA, clicou, importou as três.

## O que já existe

- `conciliacoes_cartao` (`schema.ts:537`) — a tabela de destino.
- `POST /api/conciliacao/cartao` — recebe `{ operadora, transacoes[] }`,
  deduplica por NSU, tenta casar com venda de moto → peça → OS (tolerância de
  R$ 0,05, janela de ±1 dia) e grava conciliado/pendente. Autenticado por
  `x-cron-secret`. **Toda a lógica de conciliação já está aqui e não muda.**
- `/conciliacao` com upload manual de CSV — continua existindo como plano B.
- `conciliacao-terminal.ts` — extrai o serial da maquininha do CSV da
  InfinitePay para detectar arquivo importado no grupo errado.
- ~~`.github/workflows/conciliacao-cartao.yml`~~ — apagado em 2026-08-04.
  Rodava 2×/dia com endpoint e campos chutados e um token colado em GitHub
  Secret; o token da InfinitePay dura 30 minutos, então nunca poderia funcionar.
- `scripts/conciliacao/infinitypay.mjs` — resto da mesma tentativa, a apagar.

## A restrição que define tudo

**Nenhuma das três oferece API pública para o lojista listar vendas.** Os dados
existem só nos endpoints internos que cada painel usa. E o login de cada uma é
pensado para uma pessoa, não para um servidor:

| | InfinitePay | Stone | PagueVeloz |
|---|---|---|---|
| Login | **QR Code no app** | e-mail + senha (Keycloak) | e-mail + senha |
| Token | Bearer, **30 min** | Bearer, **15 min** | cookie de sessão |
| Sessão morre em | 7 dias | — | **10 min parado** |
| Escopo do token | tudo `/read` | **amplo** (`pix:*`, `card:*`) | sessão completa |

Guardar essas credenciais num servidor significaria guardar acesso que
movimenta dinheiro (Stone e PagueVeloz), reproduzir três fluxos de
autenticação não documentados, e ainda assim depender do QR semanal da
InfinitePay. Por isso a coleta roda na máquina do Cesar, com o navegador
fazendo o trabalho de autenticação — **nenhuma credencial é lida, copiada ou
armazenada**.

Mas o botão precisa estar no MOVA, que roda na Vercel. Máquinas diferentes:
o botão não consegue mandar o PC fazer nada. Daí a fila.

## Arquitetura

```
[Vercel]                                    [PC da loja]
 /dashboard
   botão "Importar vendas de cartão"
        │ cria pedido                        agente (sobe com o Windows)
        ↓                                       │ pergunta a cada 15s
   importacoes_cartao ─── GET /api/conciliacao/fila ──┘
   (pendente)                                   │ marca "rodando"
        │                                       ↓
        │                          navegador com perfil persistente
        │                          ├─ InfinitePay  → sales/search
        │                          ├─ Stone        → sales/v1 + details/{id}
        │                          └─ PagueVeloz   → ObterRelatorioOperacoes
        │                                       │
        │                          POST /api/conciliacao/cartao (por operadora)
        │                                       │ conciliação existente
        │                          POST /api/conciliacao/fila/{id} ← resultado
        ↓ a tela consulta o pedido a cada 2s
   "InfinitePay: 12 • Stone: 2 • PagueVeloz: 5 — 15 conciliadas"
```

O botão nunca fala com as operadoras. Ele só deixa um recado e espera resposta.

## A fila

Tabela nova `importacoes_cartao`:

| coluna | |
|---|---|
| `id` | uuid pk |
| `grupo_id` | uuid → `grupos`, notNull |
| `solicitado_por` | uuid → `users` |
| `status` | `pendente` \| `rodando` \| `concluida` \| `erro` |
| `criado_em`, `iniciado_em`, `concluido_em` | timestamptz |
| `resultado` | jsonb — `{ infinitypay: {importadas, duplicadas, conciliadas}, ... }` |
| `erro` | text |

**O agente pega o pedido de forma atômica** (`UPDATE ... WHERE id = (SELECT id
... FOR UPDATE SKIP LOCKED)`), para que dois agentes rodando por engano não
processem o mesmo pedido duas vezes.

**Estados que a tela precisa distinguir:**

| Situação | O que a tela mostra |
|---|---|
| `pendente` há mais de 60s | "Agente offline no PC da loja" |
| `rodando` há mais de 5 min | "A importação travou" (agente morreu no meio) |
| `erro` | a mensagem do agente, incluindo qual operadora falhou |
| `concluida` | o resumo por operadora |

Um pedido novo enquanto existe um `pendente`/`rodando` do mesmo grupo
**reaproveita o pedido existente** em vez de enfileirar outro — clicar duas
vezes não coleta duas vezes.

## Os três coletores

Cada operadora é um módulo com a mesma assinatura, recebendo uma página já
aberta e devolvendo `TransacaoCartao[]`. A tradução (dado da operadora →
payload da conciliação) fica em funções puras, em `src/lib/`, testadas sem
navegador.

**Como o coletor autentica, nas três:** ele intercepta o cabeçalho
`Authorization` da requisição que a **própria página** faz ao carregar, e reusa
esse cabeçalho nas chamadas seguintes. Não procura token em `localStorage` —
na Stone as chaves são ofuscadas e isso não funcionaria. Na PagueVeloz nem
cabeçalho existe: a chamada é same-origin com cookie, então basta disparar de
dentro da página.

### InfinitePay

`GET sales-index/v1/sales/search?from_date&to_date&pg=true&limit=100`,
paginando por `pagination.next_page`. Traz tudo numa chamada:

```json
{ "id": 2611297499, "datetime": "2026-08-03T19:28:52.425Z", "amount": 26000,
  "net_amount": 24706, "brand": "visa", "method": "credit", "installments": 4,
  "serial_number": "PB1F248T73089", "status": "approved", "fee_percentage": 4.98,
  "nsu": "SPB1F248T7308922050320260803160002" }
```

Descartar `status !== 'approved'` e `method === 'money'` (venda em dinheiro
digitada na maquininha). Datas em UTC.

### Stone

`GET payments-web-bff/sales/v1/organizations/{cnpj}?size=100&start_date&end_date`
— o CNPJ vai na URL, o que já escopa o grupo. A lista **não tem NSU nem valor
líquido**; para cada venda é preciso `GET .../details/{id}`, que traz
`authorization_code`, `net_amount`, `mdr_amount` e `origin.serial_number`.
Cabeçalho extra obrigatório: `x-institution: stone`.

Aprovada é `status === 'paid'`. Datas em UTC. Volume baixo (5 vendas em 7
dias), então a chamada por venda não é problema.

### PagueVeloz

`GET /api/v2/PagamentoCartao/ObterRelatorioOperacoes?TipoData=venda&equipamento=todos&inicio=DD/MM/AAAA&fim=DD/MM/AAAA`
— **datas em `DD/MM/AAAA`**, diferente das outras duas. Devolve o array direto,
sem paginação. Aprovada é `Status.Nome === 'Pago'`.

```json
{ "NSU": 508833108, "CodigoAutorizacao": "799092", "ValorBruto": 6531.12,
  "ValorLiquido": 5790.77, "QtdeParcelas": 15, "Bandeira": "VISA",
  "DataVenda": "2026-07-07T14:59:04.928-03:00",
  "POS": { "Identificador": "A0088080", "Apelido": "Loja PA" },
  "CupomEstabelecimento": "... VISA CREDITO 15x - Aprovado por senha ..." }
```

Três diferenças que exigem código próprio:

1. **Valores já vêm em reais**, não em centavos (`6531.12`, não `653112`).
2. **Datas já vêm em −03:00**, não em UTC.
3. **Não existe campo de crédito/débito.** A informação só está no texto do
   `CupomEstabelecimento` (`"VISA CREDITO 15x"`, `"DEBITO"`). Regra: procurar
   `DEBITO`/`CREDITO` no cupom; cupom ausente ou ilegível → `QtdeParcelas > 1`
   é crédito, senão débito. É a única das três com essa fragilidade, e é
   assumida conscientemente: errar aqui troca o rótulo da transação, não o
   valor nem o casamento com a venda.

## Mudanças no app

1. **`grupoCnpj` no payload** — `POST /api/conciliacao/cartao` hoje grava tudo
   com `grupoId` fixo em Sul de Minas (`route.ts:120`). Passa a exigir o CNPJ e
   resolver contra `grupos.cnpj`, com 400 se não achar. Sem isso, no dia em que
   BH entrar, a venda de lá cai em Sul de Minas — o erro que o
   `conciliacao-terminal.ts` existe para pegar.
2. **Dedup com chave reserva** — hoje só deduplica quando há NSU; sem NSU,
   reinsere a cada rodada. A Stone não manda NSU, então isso deixou de ser
   hipótese: passa a usar o `id` da operadora (guardado em `rawData`).
3. **Fila** — tabela nova + rotas para o agente (`GET`/`POST
   /api/conciliacao/fila`, ambas com `x-cron-secret`) + server actions para a
   tela.
4. **Botão no dashboard** — visível para `admin_geral`, `admin_socio` e
   `aux_adm`. Roda as três operadoras de uma vez; o resultado aparece por
   operadora.
5. **Apagar** `scripts/conciliacao/infinitypay.mjs`.
6. **Dependência nova:** `playwright` como devDependency, usada só pelo agente
   local. Nunca importada por código dentro de `src/app/`.

O valor de `operadora` continua `'infinitypay'` (grafia já gravada no banco),
e as outras duas ficam `'stone'` e `'pagueveloz'`, como já previsto no tipo.

## Falhas

| Situação | Comportamento |
|---|---|
| Sessão vencida em qualquer uma (o QR da InfinitePay vence em 7 dias) | Falha rápido naquela operadora, **deixa a janela aberta** na tela de login/QR para alguém entrar ali mesmo, avisa no Telegram e marca o pedido como `erro` dizendo qual operadora. Depois de logar, é só clicar o botão de novo |
| Uma operadora falha, as outras não | As que deram certo são gravadas; o resultado diz o que faltou. Falha parcial nunca vira "deu tudo certo" |
| Formato de resposta mudou | Aborta **aquela** operadora sem enviar nada dela, e reporta |
| PC desligado | O pedido fica `pendente` e a tela diz "agente offline" |

Reprocessar é barato — a busca é por período e o endpoint deduplica. Corrigir
conciliação errada não é. Por isso, na dúvida, o coletor não envia.

## Testes

Puros, sem navegador e sem banco, no padrão do repositório (`node:test`):

- **Tradutor de cada operadora**, contra os JSON reais capturados em
  2026-08-04: centavos → reais (InfinitePay/Stone) e valor já em reais
  (PagueVeloz); data em BRT nos três formatos, incluindo a venda depois das
  21h; descarte de negadas, de `money` e de `Recusado`; parcelas; NSU vs
  `authorization_code`; e a extração de crédito/débito do cupom da PagueVeloz,
  com os dois caminhos (cupom presente e cupom vazio).
- **Chave de dedup**: NSU quando existe, `id` da operadora quando não.
- **Estados da fila**: pendente vencido → offline; rodando vencido → travou;
  pedido novo com um já em aberto → reaproveita.

E a validação de verdade, com o Cesar: clicar o botão e conferir os números
contra os três painéis, depois clicar de novo para provar que o dedup segura.

## Fora de escopo

- Taxa da maquininha no financeiro. `fee_percentage`/`mdr_amount` ficam
  guardados em `rawData`, mas nada é construído em cima agora.
- Amarrar venda de cartão à loja pelo `POS.Apelido` da PagueVeloz
  (`Loja PA`, `Loja Varginha`, `Poços de Caldas`, `Loja Lavras`) — anotado
  como possibilidade real, não implementado.
- Cruzar com o extrato do Open Finance para ver se o repasse caiu.
- Detectar venda que passou na maquininha e não foi lançada no MOVA.
- Rodar a coleta na nuvem (exigiria guardar credenciais no servidor).
