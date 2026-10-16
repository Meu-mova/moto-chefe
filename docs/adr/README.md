# Decisões de arquitetura (ADRs)

Cada arquivo registra **uma** decisão que molda o sistema: o contexto, o que foi decidido, por
quê, o que foi descartado e quando revisar. Serve para quem chega entender por que as coisas são
como são antes de "consertar" algo que foi escolhido de propósito.

## Formato

```markdown
# NNNN. Título curto no imperativo ou como afirmação

- **Status:** Proposta | Aceita | Substituída por NNNN | Obsoleta
- **Data da decisão:** AAAA-MM-DD (ou "antes de AAAA-MM-DD" quando só se sabe o limite)
- **Fontes:** documento, commit ou PR de onde a decisão vem

## Contexto
## Decisão
## Por quê
## Alternativas descartadas
## Situação em AAAA-MM-DD   (opcional: o que ainda não foi feito ou está prejudicado)
## Quando revisar
```

- **Status** diz respeito à decisão, não à execução. Decisão tomada e ainda não implementada é
  "Aceita", com o que falta em "Situação".

- Numeração sequencial, nunca reaproveitada. Nome do arquivo: `NNNN-titulo-em-kebab.md`.
- Decisão mudou? Novo ADR que substitui o antigo; o antigo ganha "Substituída por NNNN" e fica.
- Os ADRs 0001–0011 foram **registrados em 2026-10-06, depois de as decisões existirem**. A data
  da decisão vem da fonte citada; o que a fonte não diz fica marcado como não registrado.

## Lista

| Nº | Decisão | Status |
|---|---|---|
| [0001](0001-staging-em-projeto-separado.md) | Staging em projeto Supabase separado, com schema por dump da produção | Aceita |
| [0002](0002-branches-dev-main-e-revisao.md) | Branches `dev`/`main`, PR com squash e quem revisa | Aceita |
| [0003](0003-ci-como-portao-vercel-como-entrega.md) | CI do GitHub como portão, Vercel como entrega | Aceita |
| [0004](0004-migracoes-versionadas.md) | Migrações SQL à mão, versionadas em `schema_migrations` | Aceita |
| [0005](0005-zero-dado-real-fora-de-producao.md) | Zero dado real fora de produção | Aceita |
| [0006](0006-revisao-por-ia-com-assinatura.md) | Revisão por IA no PR, com a assinatura do Claude | Aceita |
| [0007](0007-multi-tenant-por-cnpj.md) | Multi-tenant por CNPJ (`grupo_id`) | Aceita |
| [0008](0008-nome-fiscal-literal-da-entrada.md) | Nome do produto na NF de saída = literal da nota de entrada | Aceita |
| [0009](0009-driver-pg-com-attach-database-pool.md) | Driver `pg` com `attachDatabasePool` | Aceita |
| [0010](0010-credencial-de-integracao-no-banco-cifrada.md) | Credencial de integração no banco, por grupo, cifrada | Aceita |
| [0011](0011-avise-nao-bloqueie.md) | Avise, não bloqueie | Aceita |
| [0012](0012-versionamento-semver-e-releases.md) | Versionamento SemVer, uma release a cada promoção para a `main` | Aceita |
| [0013](0013-prefixo-livre-e-branch-apagada-a-mao.md) | Prefixo de branch = tipo do Conventional Commits; branch apagada à mão | Aceita |
| [0014](0014-venda-com-nf-autorizada-nao-se-cancela.md) | Venda com NF de saída autorizada em produção não se cancela (exceção ao 0011) | Aceita |
| [0015](0015-documento-invalido-do-comprador-bloqueia.md) | CPF/CNPJ inválido do comprador bloqueia venda, reserva e demanda (exceção ao 0011) | Aceita |
| [0016](0016-identidade-visual-e-tema-claro-escuro.md) | Identidade visual do MOVA, cores com nome e tema claro/escuro | Aceita |
| [0017](0017-documento-da-plataforma-fora-das-tabelas-por-grupo.md) | Documento da plataforma fica fora das tabelas por grupo | Aceita |
