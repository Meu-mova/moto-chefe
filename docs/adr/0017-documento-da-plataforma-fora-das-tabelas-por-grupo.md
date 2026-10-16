# 0017. Documento da plataforma fica fora das tabelas por grupo

- **Status:** Aceita
- **Data da decisão:** 2026-10-15
- **Fontes:** issue #165 (grilling, Q10); PRs #169 (fluxo de assinatura separado) e o desta
  decisão (migração `0121_contratos_adesao.sql`)

## Contexto

O contrato de adesão ao MOVA é assinado por link, como o contrato de venda: código por e-mail,
selfie, traço e evidências com hash. A tabela da venda (`documentos_assinatura`) exige `venda_id`
e `grupo_id`, e o lojista que adere ainda não é um grupo. O contrato é entre a MOVA e o cliente,
não de uma empresa cliente.

## Decisão

- O contrato de adesão tem **tabelas próprias** (`contratos_adesao`, `contratos_adesao_codigos`,
  `contratos_adesao_eventos`) e **bucket próprio** (`contratos-adesao`), sem `grupo_id`.
- As **regras** da assinatura ficam num lugar só, `src/lib/assinatura/fluxo.ts`. Cada tipo de
  documento entra com o seu repositório (`repositorio-venda.ts`, `repositorio-adesao.ts`).
- As evidências da adesão têm tipo e hash próprios (`EvidenciasAdesao`, `docHashAdesao`).
- Só `admin_geral` trata adesões. As tabelas têm RLS ligado sem policy: nada passa pela chave
  pública do Supabase.

## Por quê

- Dado da plataforma e dado do cliente não se misturam. É a separação que o multi-tenant (#164)
  precisa deixar clara.
- O código de hoje filtra `documentos_assinatura` por grupo. Linha sem grupo ali sumiria ou
  apareceria no lugar errado sem o compilador avisar.
- Quem vê o contrato de venda (a loja) não é quem vê o de adesão (Luis e Cesar).

## Alternativas descartadas

- **Generalizar `documentos_assinatura`** (`venda_id` e `grupo_id` opcionais, `adesao_id` novo):
  menos tabelas, mas mistura dado da plataforma com dado do cliente e mexe numa tabela da venda
  em produção.
- **Tabela nova copiando também a lógica**: duas cópias das regras de segurança; uma melhoria
  teria de ser feita duas vezes.

## Quando revisar

Se aparecer um terceiro tipo de documento assinável, ou quando a #164 definir o nível "cliente"
acima do grupo e o contrato passar a apontar para ele.
