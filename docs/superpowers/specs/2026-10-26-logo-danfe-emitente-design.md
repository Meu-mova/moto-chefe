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

- O card lista os grupos visíveis ao usuário, filtrados pela Conta **dentro da consulta SQL**
  (`contaDoGrupoAtivo()`), não depois no JS; a miniatura só é assinada para grupo dessa lista: grupo, logo atual (miniatura ou "Nenhuma"),
  enviada em e por quem, botão "Enviar logo".
- "Enviar logo" abre um diálogo (`sm:max-w-*`):
  1. escolher arquivo (PNG ou JPG);
  2. campo opcional "Site" do grupo (o resto dos dados vem da NG, ver "Imagem");
  3. o servidor devolve a prévia: arquivo enviado → **a própria imagem que vai para a NG**
     (976x316, logo e dados do emitente juntos, com tamanho em KB). Não há mais simulação
     desenhada pela tela: a prévia é o arquivo final;
  4. aviso: vale para notas emitidas depois do envio; não dá para apagar, para trocar envie outra;
  5. Cancelar / Enviar para a nota fiscal.
- Sem botão de remover.
- Só cores pelo nome (`globals.css`).

## Imagem

### O que a NG faz com a logo (homologação, 26/10)

Medido dentro dos PDFs dos DANFEs (pdfplumber), notas de homologação 429 a 433 e a nota real
3106 do Sul de Minas:

- A NG desenha a logo numa **caixa fixa de 244x79 pt (3,09:1)** no quadro do emitente, qualquer
  que seja o tamanho da imagem, **esticando sem manter a proporção**: uma imagem quadrada sai
  achatada.
- Com logo, a NG **não escreve** razão social nem endereço no quadro. No Sul de Minas, esses
  dados estão **desenhados dentro da imagem** (1560x400 px); o único texto do quadro é o título.
- Fundo **transparente sai preto**. PNG de 213 KB foi recusado (HTTP 400).
- Notas emitidas antes do envio não mudam.

### O que o MOVA gera

Decisão do Luis em 26/10/2026 (opção A, registrada na #428), depois do teste em homologação.


`src/lib/notagateway/logo.ts`, com `sharp` e a fonte Arimo (SIL OFL 1.1) em `assets/fonts/`,
desenhada pelo Pango (`sharp` `text` com `fontfile`; não depende de fonte do sistema na Vercel):

- PNG **976x316** (3,09:1, 4x a caixa), **fundo branco opaco**.
- À esquerda, a logo do arquivo com a margem recortada, na altura que couber.
- À direita, uma informação por linha, no padrão do Sul de Minas: razão social (negrito),
  logradouro, número e complemento, bairro, `CEP - cidade - UF`, CNPJ, fone, site e e-mail.
  Linha sem dado não aparece.
- Entrada: PNG ou JPG, até 5 MB. Saída até 64 KB (limite da doc v1 da NG): PNG com paleta
  (o teste com a logo de Cuiabá e 5 linhas deu 29,8 KB). Passou de 64 KB, tenta de novo com menos
  cores; ainda acima, recusa com aviso.
- Todo dado que vai para o Pango (vindo da NG ou digitado, como o site) é escapado antes
  (`&`, `<`, `>`, aspas): o Pango interpreta marcação, e texto cru quebraria a imagem ou mudaria
  o desenho.

### De onde vêm os dados

- Razão social, endereço, fone e e-mail: do cadastro da empresa na NG,
  [Consultar Empresa](https://docs.notagateway.com.br/v2/reference/consultar-empresa)
  (`GET /v2/empresas/{Id}`: `razaoSocial`, `email`, `telefoneComercial`, `endereco` com
  `logradouro`, `numero`, `complemento`, `bairro`, `cep`, `cidade`, `uf`). Assim o endereço da
  imagem não diverge do fiscal e ninguém digita de novo. Mesma chamada do `ufDaEmpresa`.
  A doc não afirma que esse cadastro é o emitente da NF; a nota 415 de homologação saiu com esse
  endereço (evidência indireta).
- CNPJ: o da NG (`cnpj` da Consultar Empresa), que é o do emitente da nota. Se divergir do CNPJ do
  grupo no MOVA, a prévia avisa e não gera a imagem: a divergência é erro de configuração.
- Site: coluna nova `site_danfe` em `notagateway_config` (a NG não tem). Opcional. Fica na tabela
  da configuração fiscal do grupo, que já tem o isolamento por Conta e a permissão deste card.
- A prévia só chama o GET da NG **depois** da checagem de papel e de Conta e do
  `ambienteLiberado`. Grupo de outra Conta não dispara chamada nenhuma à NG.
- Se a consulta à NG falhar, a prévia avisa com frase fixa e não gera a imagem. Nada da resposta
  da NG (nem o `empresaId`) vai para a tela, o erro ou o log; no log do servidor, só o status HTTP.

## Guarda e registro

- Bucket privado novo `logos-danfe`, caminho `{grupoId}/logo.png` montado no servidor, nunca de
  entrada do usuário. Só a atual, sobrescrita a cada envio. Miniatura e prévia por link assinado
  de vida curta. Sem expiração nem cron, decisão do Luis (26/10): logo não é dado pessoal nem
  fiscal, então fica fora da regra de expiração do `AGENTS.md` (#402).
- Coluna nova `notagateway_config.site_danfe` (texto, opcional), na migração do PR da imagem
  composta, no próximo número livre. Editada só por `admin_geral` e `admin_socio` da Conta, como
  o resto do card.
- Migração `0148` (ou o próximo número livre na `origin/dev` ao abrir o PR; a `0147` é do estoque
  por loja): bucket + colunas em `notagateway_config`: `logo_enviada_em timestamptz`,
  `logo_enviada_por uuid` (usuário) + refaz a `log_acoes_tipo_check` com o tipo novo.
- `log_acoes`: tipo novo `logo_danfe_enviada` com grupo e tamanho; nunca token nem `empresaId`.
  A `log_acoes_tipo_check` lista os tipos aceitos (última versão na `0145`): a migração a refaz
  com a lista inteira mais o tipo novo.
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

**Falha parcial** (a NG aceitou, o Storage ou o banco falhou): a NG é a fonte da verdade. A tela
diz que a logo já vale nas próximas notas, mas a cópia do MOVA não foi salva, e pede para enviar
de novo (reenviar substitui na NG, é seguro).

**Segredos:** a URL com `empresaId` e a resposta da NG nunca vão para `console`, log, erro nem
tela. Teste manual por Postman só pelo mascarador de `scripts/lib/postman-ng.ts`.

## Testes

- Unitário (`logo.test.ts`): saída 976x316 sem pixel transparente; logo recortada à esquerda;
  linha sem dado não aparece; texto com `<` e `&` sai desenhado literalmente; recusa > 5 MB,
  formato errado, arquivo ilegível e saída > 64 KB.
- Banco: sócio da Conta B pedindo a prévia de grupo da Conta A recebe "Grupo não encontrado" e
  a NG não é chamada; CNPJ da NG diferente do grupo recusa a prévia.
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
2. **Imagem e banco:** `sharp` no `package.json`, `logo.ts` + testes, migração do bucket, das
   colunas e da `log_acoes_tipo_check`, `schema.ts`.
3. **Envio:** multipart no `client.ts`, Server Actions (prévia e envio), Storage, log, teste de
   banco do isolamento.
4. **Tela:** card "Logo no DANFE" e diálogo com a prévia. Teste no navegador.
5. **Imagem composta** (depois do teste em homologação de 26/10): fonte no repo, `ajustarLogo`
   gera o 976x316 com os dados da NG e o site, coluna `site`, prévia = a imagem gerada. Teste
   final em homologação com print.
