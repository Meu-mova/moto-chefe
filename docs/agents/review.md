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
- **API pública externa chamada do servidor manda User-Agent próprio e é testada com chamada real**
  (#588: o teste com resposta fixa passou e a BrasilAPI recusava o `fetch` do Node sem User-Agent
  com 403). Conferir: o `fetch` tem `User-Agent` do MOVA, e o PR registra uma chamada real feita
  (navegador ou script) além do teste com mock.
- **`psql -c` não troca variável `:'x'`**: passe o SQL pela entrada padrão (`psql -v x=... <<EOF`).

## Release

- **Issue só fecha se tudo o que ela pede subiu** (regra em `CLAUDE.md`, "Issues, quadro e
  releases"). Parcial: comentar o que saiu e o que falta, e manter aberta.
