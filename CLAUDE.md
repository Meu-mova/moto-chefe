@AGENTS.md
@docs/agents/review.md

## Issues, quadro e releases

Regras em `CONTRIBUTING.md` ("Issues, quadro e releases"); o porquê nos ADRs 0012 e 0013. O que
mais se erra:

- Mudança com valor visível para o Cesar **nasce de issue**, com o Luis (`LuisCarlos01`) como
  responsável, e entra no Project com Módulo e Prioridade. Tarefa miúda vira checklist dentro da issue.
- **Spec antes do código** (`/to-spec` + `/to-tickets`) quando a entrega vira 2+ PRs dependentes,
  traz regra de negócio nova para o Cesar validar, toca fiscal, isolamento, venda/caixa/estoque ou
  migração, ou envolve mais de uma dupla. Detalhes no `AGENTS.md` ("Antes do código").
- Tipo da issue é o **Issue Type**, não label. Só as labels da tabela do `CONTRIBUTING.md`; nova,
  só combinando com o Luis.
- PR e commits citam **`Refs #N`, nunca `Closes #N`**: a issue só fecha no passo da release.
- **Toda promoção `dev → main` é uma release SemVer.** Nunca promova sem seguir o passo da
  release.
- **Antes do merge `dev → main`, aplique na produção todas as migrações pendentes da `dev`,
  não só as do PR que motivou a release.** Rode `migrate.ts --status --prod` a partir de um
  checkout exato da `origin/dev` e aplique tudo o que aparecer. Na v1.4.0 (16/10/2026) só a
  `0120` foi aplicada; a `0118` e a `0119`, já na `dev`, ficaram de fora e a tela de adesões
  subiu lendo colunas que não existiam.
- **Depois que a release sobe, confira cada issue citada nos PRs dela** (`Refs #N` no corpo e
  nos commits) antes de fechar: compare o checklist e o pedido da issue com o que os PRs
  entregaram. Entregou tudo: feche como "completed" com "Saiu na vX.Y.Z". Entregou só parte:
  deixe aberta e comente o que saiu na vX.Y.Z, o que falta e que por isso não foi fechada.
  Em seguida, confira no Project cada issue e PR da release: fechada fica em "Em produção" com
  **Release** `vX.Y.Z`; parcial volta para "Em andamento"; nenhuma fica em "No Status" nem sem
  Módulo, Prioridade e Issue Type. O quadro não se mexe sozinho (workflows desligados). Na v1.18.0 a #552 entrou só com o PR A (#559), sem a
  emissão; fechar pelo `Refs` daria a NF pelo grupo de entrada como pronta.
- Não ligue "apagar branch após o merge" no repo: sem proteção de branch, isso apaga a `dev`.

## Sem co-autoria de IA

- **Nenhum commit, mensagem de squash ou PR leva autoria de IA**: sem `Co-Authored-By: Claude`,
  `Co-authored-by: Claude`, `Claude-Session:`, `Generated with Claude Code` ou equivalente de
  outra ferramenta. Vale para quem abre o PR (Luis, Cesar, agente) e para quem mescla.
- Antes do merge, confira o corpo do PR e a mensagem do squash (o GitHub junta os trailers dos
  commits). Achou a linha: apague no PR e na caixa de mensagem do squash antes de confirmar.
- Por quê: o repo é público e a `main` é o histórico de produção. Em 29/10/2026 o #459 entrou
  na `dev` (360844e7) com essas linhas, e commit na `dev` não se reescreve sem force-push.

## Isolamento entre Contas: regra absoluta

- **Jamais uma Conta lê, sobrescreve ou se liga a dado de outra Conta**, qualquer que seja o
  dado: tela, busca, importação, upsert, contagem, mensagem de erro. Sem exceção.
- Como aplicar: seção "Multi-grupo e permissões" do `AGENTS.md`. Em revisão de PR, conferir isso
  primeiro; achado aqui bloqueia o merge.
- Opção que depende do cliente (maquininha, banco, categoria, modelo, integração) é dado do
  grupo no banco, nunca lista fixa no código, que todas as Contas veriam (#460). Em revisão,
  procurar `const`/`type`/`<option>` com opção de cliente e nome, CNPJ ou e-mail escrito no código.

## Cores: nenhuma cor hardcoded

- **Nenhuma cor hardcoded no projeto.** Cor só pelo nome (variável do `src/app/globals.css`):
  `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`,
  `text-primary-text`, `text-destructive`, `border-input` etc. Proibido: paleta do Tailwind
  (`bg-slate-900`, `text-emerald-500`, `bg-white`), hex/rgb/oklch em `className`, `style` ou CSS
  de componente, e valor arbitrário (`bg-[#047a4f]`).
- Valores de cor existem só em dois lugares: as variáveis do `globals.css` (claro e escuro) e os
  arquivos de marca (`public/brand/`, `src/app/icon.svg`). Cor nova entra primeiro no
  `globals.css` e na tabela de contraste de `docs/produto/identidade-visual.md` (ADR-0016).
- Arquivo que você tocar sai sem cor hardcoded nas linhas que mudou. As telas antigas migram pela
  épica #90; não misture migração em massa num PR de outra coisa.

## Vercel CLI

- **Nunca rode `vercel env pull` sem informar o arquivo de destino.** Sem arquivo, ele sobrescreve
  o `.env.local` (o staging) com o ambiente Development da Vercel (sem nenhuma variável em
  2026-10-07). Para conferir algo, use um arquivo descartável fora do git e não imprima valores.
- Mudar o ambiente de uma variável: pela API, como em `docs/infra/segredos.md` ("Regras"); não
  com `vercel env rm`.

## Agent skills

### Issue tracker

GitHub Issues + Project "MOVA — Desenvolvimento". Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Contexto único (`CONTEXT.md` + `docs/adr/`). Ver `docs/agents/domain.md`.
