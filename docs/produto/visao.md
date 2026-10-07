# Visão do produto

O que o MOVA é, para quem e o que ele faz. É um PRD retroativo: o sistema veio antes do
documento. Foi levantado em 2026-10-06 do código da `dev` (menu em `src/lib/navegacao.ts`) e dos
specs em [`superpowers/specs/`](../superpowers/specs/). Vocabulário em
[`CONTEXT.md`](../../CONTEXT.md); peças técnicas em [`arquitetura.md`](../arquitetura.md).

Objetivos e "fora do escopo" foram tirados dos specs, não de uma conversa com o dono do negócio:
estão marcados **a validar com o Cesar**.

## O problema

As lojas MotoChefe vendem e consertam motos elétricas em vários pontos, de mais de um CNPJ. Antes
do MOVA, boa parte da rotina vivia fora de um sistema:

- **Papel e Word:** contrato e checklist de entrega assinados à mão; a via assinada "some, molha,
  fica na gaveta da loja errada" ([assinatura digital](../superpowers/specs/2026-08-11-assinatura-digital-design.md)).
- **WhatsApp e memória:** dados de funcionários "no WhatsApp e na cabeça de quem paga"
  ([dados de funcionários](../superpowers/specs/2026-08-04-dados-funcionarios-design.md)).
- **Trabalho manual:** despesas lançadas 100% à mão, vendas de cartão só entravam se alguém
  baixasse o CSV da operadora, folha separada por loja feita na mão
  ([despesas](../superpowers/specs/2026-07-14-despesas-open-finance-design.md),
  [cartão](../superpowers/specs/2026-08-04-importacao-vendas-cartao-design.md),
  [folha](../superpowers/specs/2026-08-04-folha-impressao-filtro-loja-design.md)).
- **Depender de alguém lembrar:** notas de entrada descobertas quando alguém avisava; pedido na
  fábrica cancelado por prazo porque ninguém entrou no portal
  ([notas recebidas](../superpowers/specs/2026-09-14-radar-nfe-recebidas-design.md),
  [credenciais da fábrica](../superpowers/specs/2026-08-05-fabrica-credenciais-por-loja-design.md)).
- **Relatório avulso:** o fechamento do mês existia só como análise montada à parte
  ([fechamento](../superpowers/specs/2026-08-31-fechamento-mensal-design.md)).

O Bling era o sistema anterior (dele vieram os 2.016 clientes iniciais) e ainda convive durante a
transição; a NF-e de saída já é própria, pela Nota Gateway.

## Para quem

**Grupos.** Cada grupo é um CNPJ com suas lojas, contas e integrações: hoje Sul de Minas, BH e
Vale. Os dados de um grupo não aparecem para outro.

**Quem entra no sistema:**

| Papel | Quem é | O que faz no MOVA |
|---|---|---|
| `admin_geral` | Administrador do sistema | Tudo, inclusive grupos, usuários e certificados |
| `admin_socio` | Sócio | Acompanha resultados e aprova exceções (ex.: venda abaixo do mínimo); não opera a rotina |
| `aux_adm` | Quem opera a loja | Rotina da loja: estoque físico, finalizar vendas, caixa, conciliação, oficina |
| vendedor | Vendedor da loja | Comercial (vendas, demandas, clientes), showroom, transferências, PIX e oficina |
| mecânico | Mecânico | Oficina: OS, agenda, garantias, cupons e peças |
| motorista | Motorista | Só os próprios holerites (mais dashboard e calendário) |

O que cada papel acessa está em `src/lib/navegacao.ts`; quem aprova o quê se configura em
`/admin/usuarios`. Papéis extras só somam permissão.

**Quem usa sem login:**
- o **cliente**, que assina contrato e checklist pelo celular (`/assinar`) e agenda serviço na
  oficina de uma loja (`/agendar/[loja]`);
- o **lojista visitante** da convenção da MotoChefe, que pede uma demonstração (`/convencao`).

## Módulos

Na ordem do menu. Para todos os papéis: **Dashboard** (indicadores, meta do mês, pendências da
loja, contas a pagar, pedidos à fábrica) e **Meus Documentos** (holerites do próprio funcionário).

### Comercial

| Módulo | Para que serve |
|---|---|
| Vendas | Pedidos e histórico de vendas de motos, com aprovação de venda abaixo do mínimo |
| Demandas | Pedido de cliente por moto que não está no estoque |
| Clientes | Cadastro e histórico dos clientes |
| Atendimento | Métricas por vendedor vindas do Kommo: leads atendidos, conversão, leads sem resposta |
| Marketing | Leads e conversão por canal, custo por lead e retorno da verba de mídia |
| Simulador | Tabela de valores e condições de pagamento para o vendedor consultar |
| RADAR | Acha qualquer moto pelo chassi, inclusive as já vendidas |

### Oficina

| Módulo | Para que serve |
|---|---|
| Ordens de Serviço | Abre e acompanha as OS de pós-venda e oficina |
| Agenda Oficina | Agendamentos da oficina por dia ou semana |
| Garantias | Garantias das motos, com urgências e pedidos importados do portal da fábrica |
| Cupons de Revisão | Cupons de revisão gratuita (cobrem a mão de obra da OS) |
| Serviços | Catálogo de serviços usados nas OS |
| Montagens | Motos montadas por mecânico no período |
| Peças | Catálogo, estoque e venda de peças, acessórios e capacetes |
| Retirada de Peças | Peças já separadas na fábrica para retirar no galpão |

### Estoque & Fábrica

| Módulo | Para que serve |
|---|---|
| Showroom | Estoque de motos da loja ou do grupo: vender, reservar, transferir |
| Entrada | Registro das motos recebidas da fábrica |
| Notas Recebidas | NF-e emitidas contra o CNPJ do grupo, consultadas na SEFAZ |
| Transferências | Pedir, aceitar ou recusar moto entre lojas |
| Precificação | Taxas gerais e valor mínimo de venda de cada modelo |
| Compras | Sugestão de reposição pelo giro dos últimos 15 dias |
| Relatório Fábrica | Vendas por loja para enviar à fábrica |

### Financeiro

| Módulo | Para que serve |
|---|---|
| Caixa | Entradas e saídas do caixa da loja |
| PIX | PIX e TED recebidos (Open Finance), ligados à venda ou OS |
| Conciliação | Liga cada transação de cartão à venda e mostra o que está pendente |
| Cartões de Crédito | Faturas dos cartões da empresa (Open Finance) |
| Contas a Pagar | Agenda dos pagamentos do mês |
| Despesas | Despesas do mês: lançamento manual e categorização das saídas do banco |
| Financeiro | Faturamento, taxas, despesas, custo das motos e lucro do período |
| DRE | Resultado por loja ou dos últimos 12 meses, exportável para a contabilidade |
| Folha de Pagamento | Salários, comissões, premiação e adiantamentos; gera os holerites |

### Gestão

| Módulo | Para que serve |
|---|---|
| Reunião de Vendas | Apresentação do mês para o time: ranking, quem mais cresceu, modelos |
| Fechamento | Relatório mensal do grupo para os sócios: meta × realizado, loja a loja |
| Desempenho Individual | Números do mês por vendedor, comparados ao mês anterior |
| Metas | Quanto cada loja precisa faturar no mês |
| Calendário | Pagamentos, aniversários, eventos e ausências do grupo |
| Comunicados | Comunicados oficiais para a equipe |
| Histórico de Veículos | Importa a relação de motos já vendidas para completar as OS |
| Ações | Correções administrativas (ex.: trocar a loja de uma moto já faturada, com motivo) |

### Configuração

| Módulo | Para que serve |
|---|---|
| Lojas, Grupos | Cadastro das lojas e dos CNPJs |
| Usuários | Quem acessa e com quais permissões |
| Dados de Funcionários | Dados pessoais preenchidos no primeiro acesso |
| Modelos | Catálogo de modelos de moto e apelidos usados nas notas de entrada |
| Categorias de Caixa, Categorias de Calendário | Categorias do caixa/despesas e dos eventos |
| Bancos | Saldo das contas do grupo (Open Finance) |
| Canais, Origens | Canais do relatório de Marketing; origens da venda ("por onde o cliente chegou") |
| Kommo | Conexão com o CRM |
| Notas Fiscais, Certificados | Configuração fiscal do grupo e certificado A1 para emitir a NF-e |
| Bling | Conexão com o ERP antigo, em desligamento |

## Integrações

Do ponto de vista de quem usa: a NF-e de saída sai pela **Nota Gateway**; as notas de entrada
vêm da **SEFAZ**; PIX, despesas, saldos e faturas vêm do **Open Finance**; avisos de venda e de
pedidos da fábrica vão por **WhatsApp**; leads vêm do **Kommo**; pedidos, peças e garantias são
lidos do **portal da fábrica**; vendas de cartão vêm das **operadoras**. Detalhes, credenciais e
riscos em [`arquitetura.md`](../arquitetura.md#integrações).

## Objetivos de negócio

> **A validar com o Cesar.** Hipóteses tiradas dos specs; cada uma cita onde está escrita.

1. **Controlar o ciclo de cada moto**, da entrada até a venda, passando por montagem,
   transferência, OS e garantia ([estoque](../superpowers/specs/2026-05-26-gestao-estoque-motos-design.md)).
2. **Vários CNPJs no mesmo sistema, com dados isolados**: "mesmo banco de dados e mesmo login,
   com dados completamente isolados entre grupos" ([multi-grupo](../superpowers/specs/2026-07-01-multi-grupo-design.md)).
3. **Proteger a margem**: custo × receita por venda, valor mínimo por modelo com exceção aprovada
   por sócio, resultado do mês ([custo e lucro](../superpowers/specs/2026-07-05-custo-lucro-vendas-design.md),
   [venda abaixo do mínimo](../superpowers/specs/2026-07-10-aprovacao-venda-abaixo-minimo-design.md),
   [fechamento](../superpowers/specs/2026-08-31-fechamento-mensal-design.md)).
4. **Saber que o dinheiro entrou**: conciliar cartão e PIX com venda e OS
   ([cartão](../superpowers/specs/2026-08-04-importacao-vendas-cartao-design.md),
   [pendências](../superpowers/specs/2026-07-20-pendencias-conciliacao-aux-adm-design.md)).
5. **Trazer dado externo sozinho em vez de redigitar**: Open Finance, SEFAZ, portal da fábrica,
   operadoras ([despesas](../superpowers/specs/2026-07-14-despesas-open-finance-design.md),
   [notas recebidas](../superpowers/specs/2026-09-14-radar-nfe-recebidas-design.md)).
6. **Formalizar a venda**: contrato, checklist e comprovante gerados pelo sistema, assinados pelo
   celular, e NF travada sem contrato assinado ([assinatura digital](../superpowers/specs/2026-08-11-assinatura-digital-design.md),
   [comprovante de reserva](../superpowers/specs/2026-07-16-comprovante-reserva-design.md)).
7. **Medir marketing e funil**: qual canal traz volume e faturamento
   ([origem da venda](../superpowers/specs/2026-08-08-origem-venda-design.md),
   [marketing](../superpowers/specs/2026-08-06-marketing-leads-kommo-design.md)).
8. **Fechar folha e comissão no sistema** ([folha](../superpowers/specs/2026-08-03-folha-base-comissao-design.md)).
9. **Sair do Bling**: NF-e própria já em uso; o Bling vai ser desligado ([`AGENTS.md`](../../AGENTS.md)).
10. **Virar produto para lojistas de fora**, com mensalidade por CNPJ
    ([assinatura do MOVA](../superpowers/specs/2026-09-14-assinatura-mova-design.md)). Em
    2026-10-06 é só design, sem código.

## Fora do escopo

> **A validar com o Cesar.** Cortes declarados nos specs, no nível do produto.

- **Aviso fora do app** (e-mail, push): avisos ficam dentro do MOVA. A exceção é o WhatsApp, só
  de saída ([WhatsApp](../superpowers/specs/2026-08-10-whatsapp-disparador-design.md)).
- **PDF gerado no servidor**: documentos saem pela impressão do navegador
  ([comprovante de reserva](../superpowers/specs/2026-07-16-comprovante-reserva-design.md)).
- **Escrever no MOVA por bot ou chat**: assistentes só consultam
  ([consulta na nuvem](../superpowers/specs/2026-07-28-telegram-consulta-mova-nuvem-design.md)).
- **Cadastrar moto no estoque a partir da nota recebida**: decisão do Cesar; a entrada continua
  manual ([notas recebidas](../superpowers/specs/2026-09-14-radar-nfe-recebidas-design.md)).
- **Ratear despesa no lucro por venda** ([custo e lucro](../superpowers/specs/2026-07-05-custo-lucro-vendas-design.md)).
- **Medir campanha (UTM) e casar lead do Kommo com a venda**: projeto próprio
  ([origem da venda](../superpowers/specs/2026-08-08-origem-venda-design.md)).
- **Assinatura com certificado ICP-Brasil ou provedor externo**: a assinatura é própria do MOVA
  ([assinatura digital](../superpowers/specs/2026-08-11-assinatura-digital-design.md)).
- **Portal do cliente** ([clientes](../superpowers/specs/2026-06-26-clientes-design.md)) e
  **relatório consolidado entre grupos** ([multi-grupo](../superpowers/specs/2026-07-01-multi-grupo-design.md)).
- **Como produto**: cadastro self-service de lojista novo, planos, trial e cobrança recorrente no
  cartão ([assinatura do MOVA](../superpowers/specs/2026-09-14-assinatura-mova-design.md)).

## Pendências conhecidas

Issues abertas no GitHub que afetam o uso:

- **#21**: "Criar Pedido de Venda" dá erro e há incoerências entre status e disponibilidade.
- **#11**: "Solicitar Transferência" aparece com venda aguardando aprovação.
- **#24**: leitura do portal da fábrica (anti-robô) e lojas sem credencial.
- **#13**: Notas Recebidas, estudar e aprimorar a tela.
- **#3**: estoque de peças e acessórios por loja.
