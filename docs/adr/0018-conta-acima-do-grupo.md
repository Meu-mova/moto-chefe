# 0018. Conta acima do grupo: isolamento por cliente do MOVA

- **Status:** Aceita
- **Data da decisão:** 2026-10-17
- **Fontes:** issue #164; call do Luis com o Cesar em 2026-10-16 ("Contrato e Operação do Mova",
  Read.ai); grilling da #164 em 2026-10-17; `docs/produto/2026-10-17-decisoes-mova-produto.md`
- **Revisa:** [0007](0007-multi-tenant-por-cnpj.md)

## Contexto

O MOVA passa a ser vendido a outros lojistas (#164, #165, #166). O ADR-0007 isola por grupo
(1 CNPJ), sem nível acima: os 3 grupos do Cesar só se ligam porque usuários têm
`usuarios.grupos_acesso` com mais de um grupo, sem registro de quem autorizou. Várias tabelas e
configurações são globais e apareceriam para qualquer cliente novo.

## Decisão

- **Conta** é o cliente do MOVA. Uma Conta tem um ou mais grupos; cada grupo pertence a uma só
  Conta. Os 3 grupos do Cesar são uma Conta, isenta.
- **Usuário** tem exatamente uma Conta de origem.
- **Dentro da Conta**, o `admin_socio` dela administra: vê todos os grupos da Conta e define, pelo
  `grupos_acesso`, o que cada usuário vê. `admin_socio` deixa de ser global e fica preso à Conta.
  `admin_geral` (Luis e Cesar, sócios do MOVA) continua vendo tudo.
- **Entre Contas**, só por **autorização de acesso**: o `admin_socio` da Conta dona concede um
  grupo inteiro com um papel existente a um usuário de outra Conta, pelo e-mail. A autorização
  guarda quem concedeu, para quem, grupo, papel, quando e quando foi revogada, com aceite por clique
  de um texto fixo. Vale até ser revogada; a revogação corta o acesso na requisição seguinte.
  Não gera cobrança; o bloqueio do grupo por falta de pagamento derruba também quem entra por ela.
- **Adesão de CNPJ novo**: o `admin_geral` escolhe "Conta nova" ou "Conta existente". O lojista
  não escolhe.
- **Isolamento**: banco único, filtro por Conta/grupo no app e RLS por Conta como segunda camada.
- **Antes do 1º cliente de fora**: filtro por Conta no app, #16 e `/estoque/[id]` checando o grupo.
  A RLS vem em seguida, sem bloquear.
- **Log**: acesso (quem, quando, grupo, IP) e ações sensíveis (cancelar venda, emitir ou cancelar
  NF, conceder ou revogar autorização, mudar permissão), incluindo a entrada de `admin_geral` em
  grupo de outra Conta. O `admin_socio` vê o log da própria Conta; o `admin_geral`, tudo. Guarda
  de 12 meses. O mesmo registro de acesso conta o 1º acesso para a cobrança (#166).

### Dono de cada coisa que hoje é global

| Item | Dono |
|---|---|
| `clientes` (compradores) | Conta |
| `servicos_catalogo`, `pecas_catalogo`, `categorias_caixa`, `categorias_despesa`, `simulador_precos` | Conta (cliente novo começa com cópia padrão) |
| `modelos` | Plataforma |
| `funcionarios_config`, folha e holerites | Grupo (conferir as FKs na execução) |
| `WHATSAPP_ALERTA_NUMERO` | Grupo, configurado pelo admin da Conta |
| Permissões por e-mail fixo no código | `/admin/usuarios`, por Conta |
| `CERT_MASTER_KEY`, Resend, `MCPAI_WHATSAPP_URL`, `BLING_REDIRECT_URI` | Plataforma |
| `MCPAI_ENDPOINT_URL` | Já é por grupo (ADR-0010); a env de fallback não vale para Conta de fora |
| Cron `/api/cron/pedidos-fabrica` | Plataforma, roda só para grupos com portal da fábrica |
| Kommo (`kommo_*`, `KOMMO_*`) | Fora do produto: CRM oculto por decisão do Cesar |

Buckets do Storage não foram inventariados nesta rodada.

## Por quê

- Conta, e não "cliente": "Cliente" já é o comprador no `CONTEXT.md`.
- Autorização entre Contas, e não juntar CNPJs numa Conta: é o que o Cesar descreveu ("termo de
  autorização", "quem permite é o administrador da empresa").
- Reaproveitar `admin_socio` evita mexer nos ~190 lugares que o usam; muda só o escopo.
- Banco único: o app já filtra por grupo em tudo; schema ou projeto por cliente multiplicam
  migrações manuais e custo.

## Alternativas descartadas

- **Schema por Conta** e **projeto Supabase por Conta**: migração e deploy por cliente.
- **Autorização assinada eletronicamente** (fluxo do contrato de adesão): pesada para algo que se
  concede e revoga a qualquer hora.
- **Autorização por módulo ou por loja**: sistema novo de permissão sem pedido de cliente.
- **Validade automática da autorização**: só geraria renovações.
- **Auditoria de toda alteração** (antes e depois): custo no banco e no código sem pedido.
- **RLS como pré-requisito do 1º cliente**: grande demais; o risco residual é o mesmo de hoje entre
  os grupos do Cesar.

## Quando revisar

Se um cliente exigir isolamento físico por contrato ou lei, ou pedir acesso recortado por módulo.
