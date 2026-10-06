# 0010. Credencial de integração no banco, por grupo, cifrada

- **Status:** Aceita (aplicação parcial; ver "Situação")
- **Data da decisão:** credencial por grupo no banco em 2026-07-01; cifra (`cripto.ts`) em
  2026-09-14 (commit `8b638bd`)
- **Fontes:** `docs/superpowers/specs/2026-07-01-multi-grupo-design.md`, `src/lib/cripto.ts`,
  `AGENTS.md` ("Fiscal"), `docs/infra/segredos.md`

## Contexto

Cada grupo ([0007](0007-multi-tenant-por-cnpj.md)) tem contas próprias nas integrações (Bling,
ValidaPix, fábrica, Nota Gateway, MCPAI). Env var global não comporta várias contas, e
certificado A1 em claro no banco daria a quem lê o banco o poder de emitir nota em nome das
empresas.

## Decisão

- Credencial de integração mora **no banco, por grupo** (ou por loja), configurada pelas telas
  de admin. Nunca env var global.
- Segredo guardado no banco é cifrado com `src/lib/cripto.ts`: AES-256-GCM, chave
  `CERT_MASTER_KEY`, formato `iv:tag:dados` numa coluna `text`.

## Por quê

Isola as contas de cada CNPJ e deixa o administrador trocar a credencial sem deploy. O GCM
autentica: um blob adulterado falha na hora, em vez de virar um `.pfx` inválido três camadas
adiante (`cripto.ts`).

## Alternativas descartadas

Não registradas na fonte.

## Situação em 2026-10-06

Cifrados: MCPAI, Nota Gateway e certificado A1. Não encontrei uso de `cripto.ts` em `bling.ts`,
`kommo.ts` nem `fabrica-por-loja.ts` (`docs/infra/segredos.md`).

## Quando revisar

Se a `CERT_MASTER_KEY` vazar: trocar exige recifrar tudo antes. Ou se o Supabase Vault passar a
atender o caso.
