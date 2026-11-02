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

## Interface

- **`<Select>` cujo valor é id mostra o UUID depois de escolher** (#574). Conferir: todo
  `SelectValue` com valor id tem a função de render que devolve o texto (padrão de
  `admin/usuarios/components/usuarios-table.tsx`).
- **Botão de ação não pode usar uma regra de permissão diferente da do servidor** (#576: Editar
  venda exigia a loja do cadastro, e sócio/admin_rede não editavam vendas das outras lojas que
  operam). Conferir: a condição da tela é a mesma função do servidor, ou derivada dela.
- **Erro engolido em `catch` não pode virar "a opção sumiu"** (#578). Conferir: todo `catch`
  que devolve "indisponível" diz por quê na tela, sem expor segredo.
- **Tela nova ou mudada só vai para o código com protótipo aprovado pelo Luis, no desktop e no
  celular** (#597: três rodadas de revisão aprovaram uma tela que o Luis rejeitou no 1º preview).
  Conferir: o PR com tela cita o protótipo escolhido, e a tela bate com ele nas duas larguras.

## Fluxo de dados

- **Escolher um registro do cadastro tem que levar tudo o que os passos seguintes exigem** (#577:
  cliente escolhido na efetivação não levava o endereço, e a NF recusava). Conferir: seguir o
  fluxo até o último passo que usa o dado (para venda, até a NF).

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
- **Prova de vermelho de teste de tela com `mock.module('../x')`: crie o módulo `x` antes** e rode o
  teste contra o componente antigo. `ERR_MODULE_NOT_FOUND` não é vermelho: não prova nada sobre a
  tela (#597, `notas-tabela.test.tsx`). Desmonte e restaure os mocks num `afterEach` desde o 1º
  teste: teste que falha no meio não chega ao `unmount` e suja o seguinte.
- **`psql -c` não troca variável `:'x'`**: passe o SQL pela entrada padrão (`psql -v x=... <<EOF`).

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
