# 0002. Branches `dev`/`main`, PR com squash e quem revisa

- **Status:** Aceita
- **Data da decisão:** 2026-10-01; regra de revisão de PR escrito por IA ajustada em 2026-10-06
- **Fontes:** `docs/seguranca/2026-10-01-plano-staging-ci.md` (D10, D11, D12), `CONTRIBUTING.md`

## Contexto

Todo push na `main` ia ao ar (deploy automático). Antes do plano, o repo não tinha nenhum PR
(plano, §2): o trabalho ia direto para a `main`, sem lugar para integrar e validar antes da
produção.

## Decisão

- `main` = produção; `dev` = integração e staging.
- `feat/*`, `fix/*` e `chore/*` nascem de `dev` e voltam por PR com **squash**.
- `dev → main` por PR com **merge commit**, no mínimo uma vez por semana.
- Hotfix nasce de `main`, PR para `main`, depois PR `main → dev`.
- Ninguém dá push direto em `dev` ou `main`.
- **Revisão:**
  - PR de outra pessoa, **inclusive PR escrito por agente de IA**: o responsável técnico (Luis)
    revisa no GitHub antes do merge;
  - PR do Cesar: o Luis revisa;
  - PR que o Luis escreve sem agente: CI verde e comentários da revisão por IA lidos, sem
    aprovador obrigatório (D12);
  - revisão automática por IA ([0006](0006-revisao-por-ia-com-assinatura.md)) é insumo, não
    substitui a revisão humana.

## Por quê

Lote pequeno e frequente para a produção, com um lugar (`dev` + staging) para validar antes. O
squash deixa uma linha por mudança no histórico da `dev`. O merge commit em `dev → main`
preserva quais mudanças subiram juntas. Código escrito por agente passa por revisão humana
porque, pela divisão do `CONTRIBUTING.md`, design, regra de negócio e impacto no sistema são
papel do humano.

## Alternativas descartadas

Não registradas na fonte.

## Quando revisar

Quando entrarem mais pessoas desenvolvendo, ou quando os rulesets do GitHub (D11, fase 8)
passarem a impor a regra: hoje ela é combinada, não imposta pela ferramenta.

## Situação em 2026-10-06

Ampliada pelo [0013](0013-prefixo-livre-e-branch-apagada-a-mao.md): prefixo de branch passa a ser
qualquer tipo do Conventional Commits, e branch de trabalho se apaga à mão.

## Adendo de 2026-10-29: release por squash

`dev → main` passa a ser **squash com mensagem escrita à mão**, seguido do PR `main → dev` com
merge commit (passo a passo no `CONTRIBUTING.md`). O #459 entrou na `dev` (360844e7) com linhas
de co-autoria de IA juntadas pelo squash, e commit da `dev` não se reescreve sem force-push. Com
merge commit, esse commit iria para a `main`, que é o histórico de produção num repo público. O
squash troca o "quais mudanças subiram juntas" do merge commit por um commit limpo por release;
a lista de mudanças continua nas notas da GitHub Release.
