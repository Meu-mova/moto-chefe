# Credenciais da fábrica por loja

**Data:** 2026-08-05

## Problema

O portal da fábrica (`motochefebrasil.store`) passou a ter um login por loja, em vez
de um login por bandeira. O login antigo — hoje nas envs `FABRICA_EMAIL` /
`FABRICA_SENHA` e na coluna `grupos.fabrica_email` — virou a conta da loja de
**Pouso Alegre**, que ficou com todo o histórico de pedidos.

Consequência no sistema hoje:

- **Garantias** (`/garantias` → "Sincronizar" e "Importar da fábrica") entram com a
  conta única e passaram a enxergar só Pouso Alegre. As trocas de Varginha,
  Itajubá, Poços e BH Raja ficaram invisíveis.
- **Alerta de pedidos de compra no Telegram** (cron diário) usa
  `grupos.fabrica_email`, que é a mesma conta — as outras quatro lojas deixaram de
  receber o aviso de "aguardando pagamento", e a fábrica cancela pedido por prazo.

## Contas

| Loja | Grupo | Login |
|---|---|---|
| Pouso Alegre | Sul de Minas | o login antigo (envs atuais) |
| Varginha | Sul de Minas | `varginha@motochefebrasil.com.br` |
| Itajubá | Sul de Minas | `itajuba@motochefebrasil.com.br` |
| Poços de Caldas | Sul de Minas | `pocosdecaldas@motochefebrasil.com.br` |
| BH Raja | BH | `motochefe@icloud.com` |

Senha igual em todas. Ficam em texto puro no banco, mesmo padrão já usado para
ValidaPix e Bling — a senha repetida é fragilidade do lado da fábrica, a tratar
fora deste trabalho.

## Desenho

### 1. Credenciais na loja

Duas colunas novas em `lojas`, nuláveis, mesmo padrão de `grupos`:

```sql
alter table lojas add column fabrica_email text;
alter table lojas add column fabrica_senha text;
```

Migração aplicada via Supabase MCP (`apply_migration`), nunca por
`db:generate`/`db:migrate` — o journal do Drizzle deste repo está quebrado.

A migração já preenche as cinco lojas. Pouso Alegre recebe o valor que hoje está
em `FABRICA_EMAIL` / `FABRICA_SENHA`.

Edição em `/admin/lojas` → dialog "Editar Loja", dois campos a mais. A página já é
admin-guard, então a credencial não aparece para quem opera a loja.

`loginFabrica()` perde o fallback para as envs: a credencial passa a ser
argumento obrigatório. Não sobra caminho que entre no portal sem dizer por qual
loja. As colunas `fabrica_email` / `fabrica_senha` de `grupos` saem do form de
grupo, do código e do banco.

### 2. Escopo — quem enxerga qual conta

Módulo novo `src/lib/fabrica-contas.ts`, único lugar que decide escopo:

```ts
export type ContaFabrica = { lojaId: string; lojaNome: string; email: string; senha: string }

/** Lojas cuja conta o usuário pode usar, já com credencial preenchida. */
export async function listarContasFabrica(usuario): Promise<{
  contas: ContaFabrica[]
  semCredencial: string[]   // nomes das lojas no escopo que ainda não têm login
}>
```

Regra:

- usuário **com** `lojaId` (o aux_adm alocado na loja) → só a conta da loja dele;
- usuário **sem** `lojaId` (admin_geral / admin_socio) → todas as lojas ativas do
  grupo ativo que tenham credencial.

A regra em si é uma função pura (`filtrarContasDoUsuario(usuario, lojas)`),
separada da consulta, porque é onde um erro vazaria dado de uma loja para outra.

### 3. Garantias

**Sincronizar** (`sincronizarFabricaAction`): para cada conta do escopo, faz login
e atualiza apenas as garantias daquela loja (`garantias.loja_id = conta.lojaId`)
que têm `numero_pedido_fabrica`. Sequencial — o portal é frágil e paralelizar
login na mesma origem arrisca derrubar a sessão. Falha de uma loja não interrompe
as outras; o retorno passa a ser por loja:

```ts
{ porLoja: { loja: string; atualizadas: number; erros: number }[], semCredencial: string[] }
```

O toast resume o total e cita as lojas sem credencial.

**Importar da fábrica** (`importarGarantiasFabricaAction`, renomeada de
`importarUltimaGarantiaFabricaAction`): para cada conta do escopo, lista as trocas
do mais recente para o mais antigo, importa tudo que for novo e **para no primeiro
pedido já cadastrado**. Esse corte é o que hoje evita varrer o histórico inteiro do
portal, e continua valendo porque a lista vem em ordem de data. Pedido cujo chassi
não existe na base é pulado e contado.

A busca do chassi continua sobre a base toda, não restrita à loja da conta: o
chassi é único e a loja da garantia vem de `moto.loja_id`, não do login — assim uma
moto transferida entre lojas ainda abre a garantia no lugar certo.

A action hoje exige `admin_geral`/`admin_socio`; passa a liberar `aux_adm`, senão o
adm da loja não consegue importar a garantia dele — que é justamente o caso de uso
que motiva a mudança.

### 4. Alerta de pedidos de compra (Telegram)

`alertarPedidosFabrica` passa a iterar **lojas com credencial** de grupos ativos,
em vez de grupos. Uma mensagem por loja, com o nome da loja no título, enviada ao
`telegram_chat_id` do grupo daquela loja. `formatarAvisoPedidosFabrica` troca o
parâmetro `grupo` por `loja` — é só o rótulo.

`pedidos_fabrica_alerta` ganha `loja_id` e a unique passa de
`(grupo_id, numero_pedido)` para `(loja_id, numero_pedido)`. Sem isso, duas lojas
com o mesmo número de pedido se atropelam no controle de "pendente há N dias".
As linhas existentes recebem Pouso Alegre (Sul de Minas) e BH Raja (BH), que é de
onde vieram. `grupo_id` fica, para não perder o vínculo com o chat do grupo.

## Erros

- Loja sem credencial não é erro: sai do resultado como `semCredencial` e aparece no
  toast / no log do cron.
- Login recusado ou portal fora do ar afeta só aquela loja. O cron já nunca lança —
  as actions passam a ter a mesma disciplina, acumulando erro por loja.
- Sessão expirada no meio da varredura devolve o HTML de login com HTTP 200; a
  checagem que já existe em `listarPedidosCompraFabrica` continua valendo.

## Testes

- `src/lib/fabrica-contas.test.ts` (novo): `filtrarContasDoUsuario` — usuário de loja
  vê só a dele; admin vê o grupo ativo inteiro; loja sem credencial não entra em
  `contas` e entra em `semCredencial`.
- `src/lib/telegram/pedidos-fabrica.test.ts`: ajustar para o rótulo de loja.
- O parse de HTML do portal (`parsearPedidosCompra`) não muda.

## Fora de escopo

- Trocar a senha repetida das contas no portal da fábrica.
- Remover `FABRICA_EMAIL` / `FABRICA_SENHA` do Vercel — feito depois do deploy, com
  a leitura por loja já confirmada em produção.
