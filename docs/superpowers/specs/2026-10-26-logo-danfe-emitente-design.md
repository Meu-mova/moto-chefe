# Logo da loja no DANFE da NF de saída (#428)

Decisões do grilling com o Luis em 26/10/2026. Pesquisa da Nota Gateway em
`docs/pesquisa/2026-10-26-logo-danfe-nota-gateway.md`.

## Problema

O DANFE da NF de saída sai sem a logo da loja no quadro "Identificação do emitente". Cuiabá
(grupo Mato Grosso) pediu; Teresina vem depois. O do Sul de Minas já sai com logo, enviada à
NG por fora do MOVA (origem desconhecida).

O PDF não é do MOVA: vem pronto da Nota Gateway (`linkDanfe`). A NG guarda uma logo por empresa
e a imprime sozinha ([Vincular Logotipo](https://docs.notagateway.com.br/v2/reference/vincular-logotipo)):
`POST /v2/empresas/{empresaId}/logo`, multipart, campo `logotipo`, JPG/PNG/GIF, 340x120
recomendado. Não há como consultar nem apagar a logo; reenviar substitui.

## Quem

Só `admin_geral` (todos os grupos) e `admin_socio` (grupos da Conta dele). Nenhum outro papel vê
o card nem chama as actions, nem `aux_adm`. Grupo de outra Conta e grupo inexistente recebem a
mesma frase: "Grupo não encontrado" (como o `assertGrupo` de `/admin/notas-fiscais`).

## Tela (variante D do protótipo, aprovada)

Em Configuração → Notas Fiscais (`/admin/notas-fiscais`), um **card novo "Logo no DANFE"**,
abaixo e separado do card de credencial/tributação, que não muda.

- O card lista os grupos visíveis ao usuário: grupo, logo atual (miniatura ou "Nenhuma"),
  enviada em e por quem, botão "Enviar logo".
- "Enviar logo" abre um diálogo (`sm:max-w-*`):
  1. escolher arquivo (PNG ou JPG);
  2. o servidor devolve a prévia: arquivo enviado → logo ajustada (340x120, com tamanho em KB);
  3. abaixo, a simulação do topo do DANFE no padrão do DANFE real do Sul de Minas: quadro
     "IDENTIFICAÇÃO DO EMITENTE" com a logo à esquerda e, à direita, razão social, endereço,
     CEP, cidade/UF, fone, site e e-mail do grupo, uma informação por linha; ao lado, o bloco
     DANFE e a chave. Legenda: "simulação; a nota real é gerada pela Nota Gateway";
  4. aviso: vale para notas emitidas depois do envio; não dá para apagar, para trocar envie outra;
  5. Cancelar / Enviar para a nota fiscal.
- Sem botão de remover.
- Só cores pelo nome (`globals.css`). A simulação do DANFE imita papel (preto no branco): usa
  `bg-card`/`text-foreground`/`border-foreground`, sem cor nova.

## Imagem

Função pura (`src/lib/notagateway/logo.ts`), com `sharp` como dependência direta:

- Entrada: PNG ou JPG, até 5 MB. Fora disso, recusa com aviso.
- Recorta a margem: pixels transparentes ou quase brancos nas bordas.
- Encaixa no centro de um PNG 340x120, fundo transparente, sem distorcer.
- Saída precisa ter até 64 KB (limite da doc v1 da NG; a v2 não cita). Passou: recusa com aviso.
- Referência visual e dado de teste: a logo de Cuiabá (1254x1254 → 340x120, 7,6 KB).

## Guarda e registro

- Bucket privado novo `logos-danfe`, caminho `{grupoId}/logo.png` montado no servidor, nunca de
  entrada do usuário. Só a atual, sobrescrita a cada envio. Miniatura e prévia por link assinado
  de vida curta. Sem expiração nem cron: logo não é dado pessoal nem fiscal.
- Migração `0147` (confirmar o próximo número livre na hora): bucket + colunas em
  `notagateway_config`: `logo_enviada_em timestamptz`, `logo_enviada_por uuid` (usuário).
- `log_acoes`: tipo novo `logo_danfe_enviada` com grupo e tamanho; nunca token nem `empresaId`.
  Resumo na tela do log.

## Fluxo do envio

```text
enviarLogoDanfe(grupoId, arquivo)
  usuário é admin_geral ou admin_socio?      senão: recusa
  grupo existe e é da Conta do usuário?      senão: "Grupo não encontrado"
  grupo tem notagateway_config com empresa?  senão: avisa que falta configurar a NG
  ajustarLogo(arquivo)                       recusa formato/tamanho
  POST NG /empresas/{empresaId}/logo         erro: mensagem sem token/empresaId
  grava no Storage {grupoId}/logo.png
  grava logo_enviada_em/por
  registra log_acoes
```

A ordem NG → Storage → banco faz o MOVA só mostrar como atual a logo que a NG aceitou.

## Testes

- Unitário (`logo.test.ts`): recorte de margem transparente e branca, encaixe 340x120 sem
  distorção, recusa > 5 MB, formato errado e saída > 64 KB.
- Unitário do envio multipart no `client.ts` (corpo com campo `logotipo`, sem token na mensagem
  de erro).
- Banco (`*.db.test.ts`): sócio da Conta B não lista nem envia para grupo da Conta A e recebe a
  mesma frase de grupo inexistente; `aux_adm` é recusado; envio grava quem/quando e o log.
- Navegador (staging, empresa de teste da NG): enviar a logo, emitir nota de homologação, abrir o
  DANFE; conferir também se o PDF de uma nota antiga mudou.

## Fora do escopo

- Remover a logo (a NG não tem).
- O MOVA gerar o próprio DANFE de saída.
- Logo em DANFE de nota recebida.
- Envio para Cuiabá e Teresina em produção: o sócio faz pela tela depois do deploy.

## Plano de PRs (até ~400 linhas cada, todos para a `dev`, Refs #428)

1. **Spec** (este arquivo + pesquisa).
2. **Imagem e banco:** `sharp` no `package.json`, `logo.ts` + testes, migração do bucket e das
   colunas, `schema.ts`.
3. **Envio:** multipart no `client.ts`, Server Actions (prévia e envio), Storage, log, teste de
   banco do isolamento.
4. **Tela:** card "Logo no DANFE" e diálogo com a simulação. Teste no navegador.
