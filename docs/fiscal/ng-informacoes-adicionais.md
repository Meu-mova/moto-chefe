# Informações adicionais (observação) da NF-e na Nota Gateway

## Regra fiscal oficial

O MOC 7.0 define o campo Z03 `infCpl` ("Informações Complementares de interesse do Contribuinte") com tamanho de 1 a 5000 caracteres.

- Fonte: [MOC 7.0, Anexo I, leiaute e regras de validação](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf), p. 63, linha 401: "Z03 infCpl Informações Complementares de interesse do Contribuinte E Z01 C 0-1 1 - 5000". Lido em 12/11/2026.

## Contrato JSON da Nota Gateway

[Emitir NF-e](https://docs.notagateway.com.br/v2/reference/emitir-nota-fiscal-nfe) (`updatedAt` 2026-06-16): `POST /v2/empresas/{empresaId}/nf-e`; o corpo traz `"informacoesAdicionais": "string"` no nível da nota. A [página de exemplos](https://docs.notagateway.com.br/v2/docs/exemplos-de-emiss%C3%A3o-de-nf-e-produto-ou-conjugada) (`updatedAt` 2026-07-13) mostra o campo com texto livre, com quebra de linha `\r\n`.

## O que a doc NÃO diz

- **Limite de tamanho** de `informacoesAdicionais`: nem a referência, nem os exemplos, nem o manual da NG para NF-e modelo 55. Vale o do leiaute (5000).
- **Que a NG acrescenta texto no campo.** Fonte: commit 0577647b ("total aproximado de tributos (IBPT) na NF própria"): com `percentualAproximadoTributos` no item, "a Nota Gateway escreve o texto nas informações complementares. Conferido em homologação na NF 3003". O texto do "Valor aprox. dos Tributos" divide os 5000 com o nosso.

## Onde vive no MOVA

- Texto padrão (garantia + dados da moto): `src/lib/nfe-observacoes.ts`, `observacoesVendaMoto`.
- Texto editado na prévia (#849): `observacaoDaNota` limita a **4.500** caracteres (decisão do Luis, 12/11/2026), folga de 500 para o texto da NG. Vazio = padrão. Vale só para a nota; o reenvio após recusa lê o texto do payload gravado (`observacaoDoPayload`).
- Actions: `transmitirNfePropriaAction` e `corrigirEReenviarNfAction` (`src/app/(dashboard)/vendas/nfe-propria-actions.ts`); tela: bloco Tributos de `nfe-propria-painel.tsx`.
