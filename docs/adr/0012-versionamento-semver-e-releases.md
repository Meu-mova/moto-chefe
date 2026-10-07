# 0012. Versionamento SemVer, uma release a cada promoção para a `main`

- **Status:** Aceita
- **Data da decisão:** 2026-10-06
- **Fontes:** sessão de definição de convenções de GitHub com o Luis (2026-10-06), `CONTRIBUTING.md`
  ("Issues, quadro e releases")

## Contexto

Não havia tag, release, milestone nem CHANGELOG. O `version` do `package.json` (`0.1.0`) nunca
foi usado. A promoção `dev → main` já era regra ([0002](0002-branches-dev-main-e-revisao.md)), mas
não tinha nome: o Cesar não tinha como saber o que entrou no ar e quando, nem quando algo pronto
na `dev` ia subir.

## Decisão

- **Cada PR `dev → main` é uma release.** Hotfix direto na `main` também.
- **SemVer** (`vMAJOR.MINOR.PATCH`), começando em **`v1.0.0`** na primeira promoção:
  - patch: a release só tem `fix`, `chore`, `docs`, `refactor`, `perf`, `build`, `ci`;
  - minor: tem ao menos um `feat`;
  - major: só por marco de negócio decidido pelo Luis e pelo Cesar (ex.: desligar o Bling,
    mudança que pede treinamento das lojas). Nunca automático.
- O `version` do `package.json` acompanha a tag, num commit `chore(release): vX.Y.Z` na `dev`
  antes do PR de promoção (no hotfix, na própria branch do hotfix).
- Notas da release **em português, escritas para o Cesar**, em três seções: Novidades,
  Correções, Interno. Rascunho pode ser de um agente; o Luis revisa antes de publicar. As notas
  ficam só na GitHub Release; não há `CHANGELOG.md`.
- A issue só fecha como "completed" quando chega em produção, no passo da release. PR e commits
  citam `Refs #N`, nunca `Closes #N`. Issue que não vai ser feita fecha como "not planned".

## Por quê

- O número conta o tamanho da mudança (`1.5.0` trouxe novidade, `1.4.3` só corrigiu), e a regra
  sai dos títulos de PR em Conventional Commits que o repo já usa. A data de cada release o
  GitHub já mostra.
- `v1.0.0`, e não `0.x`: o sistema roda em produção todo dia nas lojas.
- Notas em português e por área de negócio: os títulos de PR são técnicos e em inglês, e quem
  lê a release é o Cesar.
- Fechar a issue só em produção faz "fechada como completed" significar "no ar". `Closes #N` não
  serve para isso: na descrição de um PR para `dev` não fecha nada (o GitHub só fecha pela
  palavra-chave em PR para a branch padrão), e num commit fecha a issue quando o commit chega na
  `main`, sem o comentário da release.

## Alternativas descartadas

- **CalVer** (`v2026.10.13`): sem decisão a tomar e com a data no nome, mas não diz se a
  entrega foi grande ou pequena, e o hotfix ganha sufixo (`.1`).
- **release-please** ou notas automáticas do GitHub: geram notas em inglês a partir dos títulos
  de PR e agrupam por label; o repo não usa label de tipo em PR.
- **`CHANGELOG.md`**: segunda cópia das notas, a manter em sincronia com a release.

## Situação em 2026-10-06

Nenhuma release feita: a `dev` nunca foi promovida para a `main`. A primeira promoção será a
`v1.0.0`.

## Quando revisar

Se o sistema passar a ter consumidor externo (API pública, app instalado), em que "major"
signifique quebra de contrato.
