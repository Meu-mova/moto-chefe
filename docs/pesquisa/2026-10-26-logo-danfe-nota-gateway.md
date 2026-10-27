# Logo no DANFE da NF-e de saída (Nota Gateway)

Pesquisa de 26/10/2026, para a esteira "Logo no DANFE" (Cuiabá primeiro, depois Teresina).

## Resposta curta

A NG aceita logo **por empresa**, pela API v2. Depois de vinculada, a logo sai nas notas
da empresa sem mudar nada no payload de emissão. Não precisa o MOVA gerar o DANFE.

## Fonte oficial

- [Vincular Logotipo (API v2)](https://docs.notagateway.com.br/v2/reference/vincular-logotipo),
  atualizada em 2026-06-10:
  - `POST https://api.notagateway.com.br/v2/empresas/{empresaId}/logo`, campo `logotipo`.
  - "O arquivo da imagem deve ser enviado usando codificação multipart/form-data. Formatos
    suportados: JPG, PNG e GIF. As dimensões recomendadas são de 340X120 pixels."
  - Não roda pelo "Try it" da doc (415); tem que ser por Postman ou código.
- [Inserir uma logo na nota fiscal (NFS-e, v1)](https://docs.notagateway.com.br/docs/como-inserir-a-logo-na-nota-fiscal):
  recomenda 160 x 130 px e **máximo de 64 KB**; diz que a imagem é ajustada sozinha. É a doc da
  v1 (NFS-e); a v2 não cita limite de peso. Tratar 64 KB como teto prudente (não verificado na v2).

Não achei, na doc, opção de logo no painel da NG nem endpoint para consultar ou remover a
logo (só vincular; mandar de novo substitui, segundo a página v1).

## Requisitos para a logo

| Item | NG | Logo de Cuiabá (PNG transparente, 2ª versão) |
|---|---|---|
| Formato | JPG, PNG ou GIF | PNG ✓ |
| Dimensão | 340 x 120 recomendada (≈ 2,8:1) | 1254 x 1254 (1:1); desenho recortado 1160 x 781 |
| Peso | ≤ 64 KB (v1) | 213 KB original; 7,6 KB em 340 x 120 ✓ |

**Recortar a margem: sim.** A 1ª versão (JPEG 1080 x 1080) foi substituída pela PNG. Quadrada com muita margem branca, encaixada num quadro
340 x 120, a marca fica minúscula. Recortar ao conteúdo e salvar em ~340 x 120 (PNG ou JPG),
conferindo o peso.

## Alternativa: o MOVA gerar o DANFE

O MOVA já gera DANFE só de nota **recebida** (`src/app/api/nfe/[chave]/danfe/route.ts`). Gerar
o da saída seria manter um layout fiscal (incluindo os campos de IBS/CBS que mudam) só para pôr
uma imagem, e trocar o `linkDanfe` da NG em tela e e-mail. Custo alto, sem ganho; descartar.

## Impacto no MOVA

- Hoje o `client.ts` só fala JSON (`chamar`). Vincular logo pede um envio multipart novo.
- Só configuração por grupo (cada grupo tem a sua empresa NG). Caminhos possíveis, para o grilling:
  1. Tela em `/admin/notas-fiscais` para enviar a logo do grupo (guarda ou não cópia no Storage).
  2. Script único rodado à mão, pelo mascarador de `scripts/lib/postman-ng.ts`, sem tela.
- Testar primeiro em homologação, emitindo uma nota e abrindo o `linkDanfe`.
