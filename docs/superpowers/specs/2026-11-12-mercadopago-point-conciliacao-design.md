# Maquininha Mercado Pago (Point) na conciliação — design

- **Data:** 2026-11-12
- **Grupo piloto:** BH (CNPJ 63.009.605/0001-63)
- **Status:** rascunho para aprovação do César

## Intenção

O grupo BH passou a usar a maquininha do Mercado Pago (Point). As vendas feitas nela, no cartão
e no Pix, devem entrar sozinhas na conciliação do MOVA, como já entram as de InfinitePay, Stone
e PagueVeloz. Ninguém deve precisar baixar relatório nem lançar à mão o que a maquininha já sabe.

## Objetivos

1. Ler as transações da conta Mercado Pago do grupo pela API (`/v1/payments/search`) com o
   access token do grupo.
2. Cartão (crédito e débito) entra em `conciliacoes_cartao` com operadora `mercadopago` e passa
   pelo mesmo casamento automático das outras operadoras.
3. Pix recebido na maquininha entra em `pix_recebimentos_mcp` com `banco = 'Mercado Pago'` e é
   vinculado na tela `/pix-mcp`, como os outros Pix.
4. A importação roda de dois jeitos: um botão "Importar Mercado Pago" e uma rodada diária
   automática (cron da Vercel).
5. A credencial fica no banco, por grupo, cifrada com `src/lib/cripto.ts` (ADR 0010), e é
   cadastrada por tela de admin.

## Fora do escopo

- Mandar a cobrança do MOVA para a maquininha (modo integrado / PDV). A maquininha continua
  sendo usada como hoje.
- Webhook em tempo real. Pode entrar depois, em cima desta base (o cliente e o casamento ficam
  prontos para reaproveitar).
- Liquidação e recebíveis (quando o dinheiro cai na conta). Aqui só a venda.
- Outros grupos além do BH no primeiro momento. O desenho já é por grupo; ligar outro grupo é
  cadastrar a credencial dele.

## Anti-objetivos (falharia mesmo "funcionando")

- Misturar com a conta Mercado Pago da Infinity Fit (`MP_ACCESS_TOKEN`, mensalidade). A
  mensalidade não pode enxergar vendas da loja, nem a conciliação enxergar mensalidades.
- Gravar transação no grupo errado. O grupo vem da credencial usada, nunca do conteúdo.
- Duplicar transação a cada rodada.
- Logar o token, o header de autorização ou o corpo cru da resposta.
- Tratar o Mercado Pago diferente das outras operadoras no casamento. Ele usa exatamente a
  regra de hoje (ver "Casamento").

## Como funciona hoje (o que esta mudança toca)

- `src/app/api/conciliacao/cartao/route.ts` recebe transações já normalizadas
  (`TransacaoCartao`, em `src/lib/conciliacao-cartao.ts`) do agente local
  (`scripts/conciliacao/agente.ts`), deduplica por NSU ou id (`chaveDedup`) e casa com vendas,
  vendas de peças e OS pelo valor (±R$ 0,05), parcelas e data (±1 dia).
- Pix: `src/lib/pix-sync.ts` puxa os Pix do banco via MCPAI para `pix_recebimentos_mcp`
  (`transacao_id` único), e a equipe vincula em `/pix-mcp`.
- `src/lib/operadoras.ts` já lista `mercadopago`, mas fora de `COM_RELATORIO`: hoje ele é
  conciliado à mão.
- `maquininhas` tem `unique(grupo_id, operadora)`: uma linha `mercadopago` por grupo.
- `src/lib/mercadopago/cliente.ts` é o cliente da mensalidade, preso ao env global.

## Abordagens consideradas

1. **Botão + rodada diária no servidor (escolhida).** O MOVA consulta a API do Mercado Pago
   direto da Vercel. É simples, não depende do PC da loja, e uma rodada que falhar é coberta
   pela próxima, porque a busca reolha uma janela de dias e a dedup segura as repetidas.
2. **Webhook em tempo real.** A venda aparece conciliada na hora, mas exige configurar o aviso no
   painel do MP, validar a assinatura e manter a rodada diária como reserva. Fica para depois.
3. **Robô no PC da loja (agente local).** É o que as outras operadoras usam por falta de API.
   Aqui não acrescenta nada: o token já dá acesso direto. Descartada.

## Desenho

### Credencial

- Migração nova: colunas em `grupos`: `mp_access_token` (text, cifrado `iv:tag:dados`) e
  `mp_public_key` (text, em claro: é pública; guardada para uso futuro, não é usada agora).
  Mais `mp_user_id` (text), preenchido no cadastro a partir de `GET /users/me`. Serve para
  mostrar de qual conta é o token e para recusar colar o token da Infinity Fit.
- Tela: um bloco "Mercado Pago (maquininha)" na edição do grupo (`admin/grupos`, mesmo lugar do
  endpoint MCPAI), visível só para admin. Salvar valida o token chamando `GET /users/me`. Se der
  401, recusa com mensagem clara. A tela mostra só "configurado — conta <nickname/id>", nunca o
  token.
- `src/lib/mercadopago/cliente.ts` ganha uma variante que recebe o token como parâmetro, ou um
  módulo irmão `src/lib/mercadopago/point.ts`. A da mensalidade continua lendo o env e não muda.

### Busca

- `GET /v1/payments/search?range=date_last_updated&begin_date=…&end_date=…&sort=date_last_updated&criteria=asc&limit=…&offset=…`,
  paginando até acabar. Janela padrão: pagamentos **alterados** nos últimos 7 dias. Venda nova
  conta como alteração, então uma busca só pega as vendas novas e também os estornos de vendas
  antigas, mesmo semanas depois. Os 7 dias cobrem rodadas perdidas.
- Filtrar só o que veio da maquininha: `point_of_interaction.type` = POS/Point, ou a presença
  do serial do terminal. Pagamentos de link ou checkout na mesma conta, se houver, ficam de
  fora nesta fase.
- Timeout e erro como no cliente da mensalidade: só o status vai para a mensagem.

### Normalização (função pura, testada)

`src/lib/conciliacao-mercadopago.ts` transforma o pagamento do MP em:

- **Cartão** (`payment_type_id` `credit_card` / `debit_card`) → `TransacaoCartao`:
  `dataTransacao = dataBrt(date_approved ?? date_created)`, `valorBruto = transaction_amount`,
  `valorLiquido = transaction_details.net_received_amount`, `parcelas = installments`,
  `tipo` pelo `payment_type_id`, `status` mapeado (`approved` → aprovado; `refunded` /
  `charged_back` / `cancelled` → status correspondente), `nsu` = id do pagamento no MP (chave
  estável de dedup), `autorizacao = authorization_code`, `rawData` só com os campos úteis
  (id, bandeira `payment_method_id`, serial do terminal, `last_four_digits`), nunca dados do
  pagador além do necessário.
- **Pix** (`payment_method_id = 'pix'` / `payment_type_id = 'bank_transfer'`) → linha de
  `pix_recebimentos_mcp`: `transacao_id = 'mp-<id>'` (prefixo para não colidir com ids do Open
  Finance), `banco = 'Mercado Pago'`, `conta_id = mp_user_id`, `data = date_approved`, `valor`,
  `pagador_nome` se vier, `tipo_operacao = 'PIX'`.
- Só `approved` entra como linha nova. Pagamento que já chega estornado, sem ter sido gravado
  antes, é ignorado.

### Estorno (decisão do César, 2026-11-12)

- Pagamento já gravado que volta como `refunded`, `charged_back` ou `cancelled` passa a ter
  status "estornado" na própria linha. Isso vale para cartão (`conciliacoes_cartao.status`) e
  para Pix: `pix_recebimentos_mcp` ganha uma coluna de status na migração, com padrão
  "aprovado" para as linhas que já existem.
- A venda, a peça e a OS no MOVA **não são mexidas**. O vínculo da conciliação continua, e quem
  cuida do caso decide o que fazer.
- O valor estornado **sai das somas do financeiro**. Hoje `src/lib/queries/valor-liquido.ts`,
  `dre.ts` e as consultas de `financeiro` somam `conciliado = true` sem olhar o status. Elas
  passam a excluir os estornados, por uma regra só em `src/lib` (por exemplo, uma condição SQL
  exportada), não repetida em cada consulta. Quem constrói levanta, por `git grep`, todos os
  lugares que somam essas tabelas.
- A tela mostra a transação estornada com um selo. Como isso é tela, entra no protótipo do Luis.

### Casamento

- Extrair o miolo de `route.ts` (dedup + casamento com venda / peça / OS) para uma função em
  `src/lib/`, chamada tanto pela rota do agente quanto pela importação do MP. O comportamento
  da rota atual não muda (os testes existentes continuam passando).
- Achado de passagem, fora deste escopo: o casamento atual usa `.find(...)`, pega o primeiro
  candidato mesmo havendo dois iguais e não exclui venda já casada com outra transação. Duas
  vendas de R$ 500 no mesmo dia podem cair na mesma venda. Vira issue própria, porque mudar
  isso muda InfinitePay, Stone e PagueVeloz também.
- `Operadora` passa a incluir `'mercadopago'`, e `COM_RELATORIO` também, para a maquininha MP
  sair da lista "concilia à mão".

### Grupo errado

A credencial é do grupo, então a conta MP só devolve vendas do próprio grupo: não há como uma
venda de outro grupo entrar por aqui. A checagem por serial fica **fora desta fase** (call do
Claude). O serial é gravado em `raw_data->>'serial'`, a mesma chave que
`src/lib/terminal-da-conta.ts` já lê, para a checagem poder entrar depois sem migração de dado.

### Isolamento entre Contas

- Toda gravação usa o `grupo_id` da credencial que fez a busca.
- `pix_recebimentos_mcp.transacao_id` é único no banco inteiro: o upsert leva `setWhere` com o
  mesmo `grupo_id`, e a contagem mostrada é só das linhas que de fato entraram.
- A dedup de `conciliacoes_cartao` procura só dentro do grupo.
- Teste de banco: o grupo B importando não lê, não sobrescreve e não concilia contra vendas do
  grupo A, e a credencial de A nunca é usada para B.

### Disparo

- **Botão** na tela de conciliação, visível quando o grupo ativo tem credencial MP: chama um
  Route Handler (`/api/conciliacao/mercadopago`, com `maxDuration` como em `pix-mcp`), com
  permissão de quem acessa a conciliação. Mostra o resultado: importadas, duplicadas,
  conciliadas, Pix novos.
- **Cron** `/api/cron/conciliacao-mercadopago` no `vercel.json`, uma vez por dia de madrugada
  (BRT), protegido por `CRON_SECRET`, rodando para cada grupo com credencial MP.
- Falha do cron avisa no Telegram do grupo, como o agente faz.

## Decisões do César

- Só leitura e conciliação; nada de mandar cobrança para a maquininha.
- Começar pelo grupo BH.
- Busca por botão + rodada diária (não webhook, por ora).
- A conta MP do BH não está no Open Finance (MCPAI), então o Pix da maquininha entra por esta
  integração, sem risco de duplicar.
- Estorno: grava "estornado", tira das somas do financeiro e não mexe na venda (seção "Estorno").
- Checagem pelo número de série fica para depois; o serial é gravado desde já.

## Calls do Claude (pode corrigir)

- Pix da maquininha vai para `pix_recebimentos_mcp` / `/pix-mcp`, não para a conciliação de
  cartão, porque as vendas registram Pix como pagamento Pix e a equipe já vincula Pix ali.
- Janela de 7 dias por rodada.
- NSU = id do pagamento no Mercado Pago.
- Credencial na edição do grupo, ao lado do MCPAI.
- Recomendação de segurança: o token colado no chat em 2026-11-12 deve ser trocado no painel do
  MP, e só o novo cadastrado pela tela.

## Processo do projeto

- Toca migração, isolamento e conciliação de venda/caixa: vira issue-mãe por `/to-spec` (com o
  Luis responsável) e tickets por `/to-tickets`, a partir deste design.
- O bloco de credencial, o botão e o selo de estornado são tela: protótipo aprovado pelo Luis
  (desktop e celular) antes do código.
- Commits e PR sem autoria de IA; PR para `dev` com `Refs #N`.

## Deixado para quem constrói

- Nome exato das colunas e da migração (próximo número livre na `dev`, nos PRs abertos e no
  staging).
- Paginação e limites da API (`limit` máximo, rate limit).
- Texto e lugar exato do botão na tela de conciliação.
- Horário do cron.
