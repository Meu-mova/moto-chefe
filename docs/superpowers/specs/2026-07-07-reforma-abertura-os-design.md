# Reforma do Formulário de Abertura de OS — Design

## Contexto

Terceira e última parte (dentro do escopo já combinado) da reforma de
Ordens de Serviço, depois de Catálogo de Serviços e Catálogo de Peças
(ambos já em produção). Cobre a lista original do usuário:

> Tipo de OS: não precisa ter distinção igual é hoje. Chassi do veículo:
> buscar em todas as nossas bases. Caso não encontre, abrir para cadastrar
> o veículo. Mesma coisa para o cliente. Mecânico responsável OK. Previsão
> de entrega OK. Serviços realizados: listar serviços cadastrados. Incluir
> campo KM. [Avarias fica para depois, spec separado.]

A busca por chassi (estoque + histórico) e o campo mecânico/previsão já
funcionam como pedido — não são tocados aqui.

## Decisões

### Remoção de `tipoOs`

- **Coluna `ordens_servico.tipo_os` é removida do banco.** Decisão
  explícita do usuário ("remover completamente"): OS existentes perdem a
  categorização `interna`/`pos_venda`/`externa` — não há substituto
  automático, é perda de dado histórico aceita conscientemente.
- **11 arquivos referenciam `tipoOs`** hoje — listados na seção Arquivos
  Afetados. O uso mais importante além do formulário de criação é em
  `os-editar-panel.tsx:121`, onde `tipoOs === 'externa'` decide se mostra
  os campos placa/km/cliente externo na tela de detalhe da OS. Esse
  condicional é substituído por:
  - **Placa e KM**: sempre visíveis e editáveis (qualquer veículo pode ter
    placa e km, independente de estar no estoque).
  - **Nome/telefone do cliente externo**: visíveis apenas quando a OS não
    tem `clienteId` (cliente não está cadastrado no sistema) — essa já é a
    condição real que a UI está tentando expressar, só que hoje passa por
    `tipoOs` em vez de checar `clienteId` diretamente.
- Listagem (`os-filtros.tsx`/`listarTodasOS`), card (`os-card.tsx`), tela
  de detalhe (badge de tipo) e impressão perdem o badge/filtro de tipo —
  removidos, não substituídos.
- `agenda/actions.ts:88` (`agendamentoVirarOSAction`) hoje insere
  `tipoOs: 'externa'` ao converter agendamento em OS — remove essa linha.
- `clientes/actions.ts:194` (histórico do cliente) remove `tipoOs` do
  select, já que a coluna deixa de existir.

### Busca e cadastro de veículo

- Busca por chassi já cobre estoque (`motos`, sem filtro de status — inclui
  vendidas) + histórico (`veiculosHistorico`) — comportamento mantido, sem
  mudança.
- **Quando não encontra**: `ChassiLookup` ganha um estado "cadastrar
  veículo", com campos marca, modelo, cor, motor (chassi já preenchido do
  campo de busca). Novo action `cadastrarVeiculoHistoricoAction` insere em
  `veiculosHistorico` e retorna um objeto no formato `VeiculoEncontrado`
  (`fonte: 'historico'`), para entrar no mesmo fluxo de estado que um
  veículo encontrado.
- Sem campo "ano" no formulário inline (usuário não pediu; a coluna
  `veiculosHistorico.ano` fica `null` nesse caso — já é nullable).

### Busca e cadastro de cliente

- Busca por CPF já existe em `ChassiLookup` — mantida sem mudança.
- **Quando não encontra**: `ChassiLookup` ganha um botão "Cadastrar
  cliente" que abre o `ClienteForm` já existente (`clientes/components/cliente-form.tsx`).
  `ClienteForm` ganha uma prop nova opcional `onCreated?: (id: string) => void`
  — chamada com o id retornado por `criarClienteAction` após salvar com
  sucesso, **além** do comportamento atual (toast + `router.refresh()`),
  sem quebrar os usos existentes do componente (`/clientes`).
  `ChassiLookup` usa esse callback para buscar o cliente recém-criado (via
  `buscarClientePorIdAction`, que já existe em `clientes/actions.ts`) e
  preencher o estado, replicando o que já acontece quando um cliente é
  encontrado por CPF.

### Campo KM

- Já existe no formulário; passa a ser **sempre visível** (hoje dependia
  da branch `tipoOs === 'externa'` vs veículo encontrado). Sem mudança de
  obrigatoriedade — continua opcional, como hoje.

### Serviços e Peças (aba pós-criação)

- `os-itens-panel.tsx` — o formulário de "Adicionar item" ganha, para o
  tipo `servico`, um seletor com os serviços **ativos** de
  `servicos_catalogo` (nome, com valor e — se existir — tempo previsto
  como texto auxiliar); ao escolher, pré-preenche descrição e valor
  unitário, **editáveis antes de adicionar** (mesmo padrão já usado nos
  dois catálogos: valor do catálogo é ponto de partida, não é travado).
  Mesma coisa para `peca`, com `pecas_catalogo`.
- `adicionarItemOSAction` (em `ordens-servico/actions.ts`) ganha
  parâmetros opcionais `servicoId`/`pecaId`, gravados em
  `os_itens.servico_id`/`os_itens.peca_id` respectivamente — resolve o
  achado da revisão do Catálogo de Peças (nada setava essas colunas até
  agora).
- Item continua podendo ser adicionado sem vínculo a catálogo (descrição
  livre, sem `servicoId`/`pecaId`) — cobre casos não cadastrados, evita
  travar o fluxo por um serviço/peça que ainda não está na lista.

## Arquivos afetados (mapa de mudança por arquivo)

| Arquivo | Mudança |
|---|---|
| `src/lib/db/schema.ts` | remove `tipoOs` de `ordensServico`; adiciona `servicoId`/`pecaId` já existem (de specs anteriores) |
| `src/lib/db/migrations/00XX_remocao_tipo_os.sql` | `ALTER TABLE ordens_servico DROP COLUMN tipo_os;` |
| `src/lib/queries/ordens-servico.ts` | remove `tipoOs` do `buildSelect`, do filtro `listarTodasOS`, do select de `listarOSPorMoto` |
| `src/app/(dashboard)/ordens-servico/actions.ts` | `AbrirOSInput` perde `tipoOs`; insert não grava mais a coluna; `adicionarItemOSAction` ganha `servicoId`/`pecaId` |
| `src/app/(dashboard)/ordens-servico/components/abrir-os-dialog.tsx` | remove seletor de tipo; placa/km sempre visíveis; cliente externo condicionado a `!cliente` |
| `src/app/(dashboard)/ordens-servico/components/chassi-lookup.tsx` | adiciona fluxo de cadastro inline de veículo e de cliente |
| `src/app/(dashboard)/ordens-servico/components/os-card.tsx` | remove badge de tipo |
| `src/app/(dashboard)/ordens-servico/components/os-filtros.tsx` | remove filtro de tipo |
| `src/app/(dashboard)/ordens-servico/page.tsx` | remove `tipoOs` da chamada a `listarTodasOS` |
| `src/app/(dashboard)/ordens-servico/[id]/page.tsx` | remove badge de tipo; `OSEditarPanel` não recebe mais `tipoOs` |
| `src/app/(dashboard)/ordens-servico/[id]/components/os-editar-panel.tsx` | remove prop `tipoOs`; placa/km sempre visíveis; cliente externo condicionado a ausência de `clienteId` (nova prop `temCliente: boolean`) |
| `src/app/(dashboard)/ordens-servico/[id]/components/os-itens-panel.tsx` | seletor de serviço/peça do catálogo |
| `src/app/(print)/ordens-servico/[id]/imprimir/page.tsx` | remove badge de tipo |
| `src/app/(dashboard)/clientes/actions.ts` | remove `tipoOs` do select de histórico |
| `src/app/(dashboard)/agenda/actions.ts` | remove `tipoOs: 'externa'` do insert em `agendamentoVirarOSAction` |
| `src/app/(dashboard)/clientes/components/cliente-form.tsx` | adiciona prop opcional `onCreated?: (id: string) => void` |
| `src/app/(dashboard)/ordens-servico/buscar-veiculo-action.ts` | novo `cadastrarVeiculoHistoricoAction` |

## Tratamento de erros

- Cadastro inline de veículo: mesma validação de `veiculosHistorico` hoje
  (chassi único — erro de constraint tratado com mensagem amigável, igual
  padrão de `criarClienteAction` para CPF duplicado).
- Cadastro inline de cliente: reaproveita a validação já existente do
  `ClienteForm`/`criarClienteAction` (nome obrigatório, CPF único).
- `adicionarItemOSAction`: validação de quantidade/valor > 0 já existe
  (client-side em `os-itens-panel.tsx`); mantida.

## Verificação

`npm run type-check`, `npm run build`. Migração (drop column) aplicada via
Supabase MCP `apply_migration`, com confirmação do usuário — **irreversível
sem backup**, já que apaga o histórico de categorização das OS existentes.
Verificação manual (mesma ressalva das specs anteriores: sem credenciais de
teste para QA interativa completa): abrir nova OS sem escolher tipo,
cadastrar veículo/cliente inline, adicionar item do catálogo na aba de
itens, confirmar que a OS de agendamento (`agendamentoVirarOSAction`)
continua funcionando sem a coluna.

## Fora de escopo

- Checklist de avarias com foto — spec separado, ainda não desenhado.
- Qualquer alteração em como a OS calcula valor total (`recalcularTotal`
  já soma os itens, independente de terem `servicoId`/`pecaId` ou não —
  sem mudança).
- Migração de dados de `tipoOs` para outro lugar (ex: tag) — explicitamente
  descartado, é remoção limpa.
