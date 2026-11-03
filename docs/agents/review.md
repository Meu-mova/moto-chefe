# Revisão: erros já cometidos e como não repetir

Carregado em toda sessão (importado no `CLAUDE.md`). Cada item é um erro real, com a regra e
como conferir. Vale para quem escreve código, quem revisa e quem testa. Regra que vira lei de
uma área (fiscal, isolamento, banco) sobe para o `AGENTS.md` pela skill `registrar-licao`;
aqui fica a lista curta de conferência.

## Antes de afirmar

- **Leia a função antes de dizer o que ela faz por fora (rede, SEFAZ, Nota Gateway, e-mail).**
  Em 31/10/2026 o agente disse que a prévia da NF não chamava a Nota Gateway, lendo só um
  comentário; a prévia lê a empresa na NG. Conferir: abrir a função e seguir cada `await` até
  um `fetch`/cliente externo.

- **Função, helper ou constante nova: o revisor procura pelo comportamento** (#628, #629: as
  revisões acharam `diaCurtoBrt` reescrito e `mesAdjacente` repetido só porque buscaram o que a
  função faz). Conferir: para cada `function`/`const` novo exportado ou repetido em mais de um
  arquivo, `git grep` pelo trecho típico do código; cópia achada é "deveria".

## Interface

- **`<Select>` cujo valor é id mostra o UUID depois de escolher** (#574). Conferir: todo
  `SelectValue` com valor id tem a função de render que devolve o texto (padrão de
  `admin/usuarios/components/usuarios-table.tsx`).
- **Tela e servidor decidem pela mesma função** (#576: Editar venda exigia a loja do cadastro, e
  sócio/admin_rede não editavam vendas das outras lojas que operam; #600: a regra "pode inutilizar"
  morava em SQL cru na lista e em Drizzle no servidor, e as duas divergiam). Conferir: botão, selo
  e aviso chamam a mesma função pura de `src/lib` que o servidor, sem SQL que a repita.
- **Erro engolido em `catch` não pode virar "a opção sumiu"** (#578). Conferir: todo `catch`
  que devolve "indisponível" diz por quê na tela, sem expor segredo.
- **Tela nova ou mudada só vai para o código com protótipo aprovado pelo Luis, no desktop e no
  celular** (#597: três rodadas de revisão aprovaram uma tela que o Luis rejeitou no 1º preview).
  Conferir: o PR com tela cita o protótipo escolhido, e a tela bate com ele nas duas larguras.

## Fluxo de dados

- **Escolher um registro do cadastro tem que levar tudo o que os passos seguintes exigem** (#577:
  cliente escolhido na efetivação não levava o endereço, e a NF recusava). Conferir: seguir o
  fluxo até o último passo que usa o dado (para venda, até a NF).
- **Ação sem volta usa o dado do registro, nunca o filtro da tela** (#600: o diálogo de inutilizar
  mostrava o ambiente do filtro, não o da nota). Conferir: ambiente, número, série e grupo saem do
  registro lido no servidor.
- **Erro de serviço externo não vai cru para a tela, o motivo gravado nem o log** (#607: o corpo de
  um 4xx da Nota Gateway ia para `motivo_status` e para o `log_acoes`; um 404 que ecoe o caminho
  leva junto o `empresaId`). Use só as mensagens da lista documentada; fora dela, `HTTP <status>`.

## Permissão de página

- **Checar a permissão no topo da página, antes de buscar dados** (#579: a busca recusava antes do
  guard e a página mostrava erro em vez de voltar ao Dashboard). Conferir: primeira linha útil
  da página é o `usuarioPodeAcessar`/guard.

## Teste

- **Teste no navegador vai até o fim do fluxo, com o papel real de quem usa.** O fluxo da rede
  (transferir → vender em outra loja → NF) achou #576, #577 e #578, que nenhum teste de unidade
  pegou. Use a cópia local da produção (`prod-local/copiar-prod.py`); fora da produção o MOVA só
  chama a Nota Gateway em homologação. Credencial real só o Luis cola, na tela, só na cópia; ao
  fim rode `copiar-prod.py` de novo para apagar.
- **`npm run dev` contra a cópia da produção não pode ler o `.env.local`** (#597: o Next completou
  com o `.env.local` do staging as variáveis que a cópia não define, como Resend e Mercado Pago).
  Renomeie o `.env.local` antes de subir e confira que o log não mostra "Environments: .env.local".
- **Correção vem com teste que falhou antes dela.** Mostre a saída vermelha; refatoração sem mudança
  de comportamento diz "sem vermelho" (#607: o vermelho da correção do 4xx mostrou o `empresaId`
  ecoado). Vermelho por import ou arquivo ausente não conta.
- **Mock só na fronteira de fora** (Nota Gateway, rede, `next/navigation`). O que lê o banco roda no
  banco do `test:db` (#607: o cenário "grupo sem configuração" simulava a leitura da config e
  provava o mock, não o código).
- **Formulário com a Server Action mockada: confira o que cada caminho envia** (criar e editar),
  não só que a action foi chamada (#616: o editar não mandava `cargoId`; dar cargo a usuário
  existente dava "Cargo não encontrado", e só o navegador pegou).
- **Mudou quem pode? Teste de banco com a persona real** (#607: admin_rede só chega ao servidor em
  grupo liberado; o teste prova que pede no liberado e não pede no não liberado).
- **Ação sem volta tem teste da trava enquanto envia**: botões desabilitados e Escape não fecha. O
  índice único do banco é só a última rede contra o clique duplo (#608).
- **Prova de vermelho de teste de tela com `mock.module('../x')`: crie o módulo `x` antes** e rode o
  teste contra o componente antigo. `ERR_MODULE_NOT_FOUND` não é vermelho: não prova nada sobre a
  tela (#597, `notas-tabela.test.tsx`). Desmonte e restaure os mocks num `afterEach` desde o 1º
  teste: teste que falha no meio não chega ao `unmount` e suja o seguinte.
- **Matriz rota × papel roda na máquina, antes da release, se algum PR mexeu em rota, permissão
  ou navegação**: `npm run e2e:acesso:local`, com a cópia da produção de pé e o app em
  `localhost:3600` (passo a passo no topo de `scripts/e2e-acesso-rotas-local.ts`). Saiu do CI
  porque a fila do staging cancelava a matriz do PR ao lado (#594).
- **`psql -c` não troca variável `:'x'`**: passe o SQL pela entrada padrão (`psql -v x=... <<EOF`).

## Rodadas de implementação e revisão

- **1ª versão é rascunho: releia o próprio diff como revisor e reescreva antes de pedir revisão**
  (#607: a releitura achou um log que derrubava a resposta de um pedido já enviado à Nota Gateway;
  #609: a barra do celular contava só a página, não a lista inteira).
- **Estrutura errada se refaz do zero; estrutura certa se remenda.** O #600 tinha a regra em três
  lugares e foi fechado sem merge; refeito do zero com a lista dos achados no ticket, os #607 a
  #609 resolveram 12 dos 13. Remendo só quando a revisão confirma regra num lugar só e casca fina.
- **Um commit por achado, e o revisor relê o diff inteiro em toda rodada**, não só o que mudou. No
  #600 a revisão antiga aprovou em 5 rodadas sem achado; 4 revisores novos, com o diff inteiro,
  acharam até 3 bloqueios.

## PRs em pilha

- **Depois do squash do PR de baixo, o `git merge origin/dev` no de cima dá conflito** nos arquivos
  que os dois mexeram, porque o merge-base continua o antigo (#607 e #608). Confira que a `dev` tem
  a árvore do PR de baixo (`git diff <ponta do PR de baixo> origin/dev` vazio), rode
  `git merge -X ours origin/dev` e confira que nada mudou (`git diff <ponta anterior> HEAD` vazio).
- **Trocar a base do PR para a `dev` não dispara o CI**: feche e reabra o PR. O smoke do preview só
  roda em deploy novo; se a fila o cancelou, `gh run rerun <id>`.

## Release

- **Issue só fecha se tudo o que ela pede subiu** (regra em `CLAUDE.md`, "Issues, quadro e
  releases"). Parcial: comentar o que saiu e o que falta, e manter aberta.
