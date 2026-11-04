# Veículo novo, faturamento direto e transporte na Nota Gateway

## Regra fiscal oficial

O MOC 7.0, Grupo JA/J02, define `tpOp=1` como venda concessionária e `tpOp=2` como faturamento direto para consumidor final. A regra C18-20 prevê rejeição 478 quando `tpOp=2` e a UF do local de entrega (G09) não é informada. No Grupo G, quando o endereço de entrega é enviado, documento (CPF ou CNPJ), logradouro, número, bairro, código IBGE do município, nome do município e UF são campos obrigatórios; nome do recebedor e CEP são opcionais.

Fontes oficiais:

- [MOC 7.0, Anexo I, leiaute e regras de validação](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf): Grupo G, p. 16; Grupo JA/J02, p. 22; regra C18-20, p. 82.
- [Convênio ICMS 51/00](https://www.confaz.fazenda.gov.br/legislacao/convenios/2000/CV051_00): faturamento direto ao consumidor pela montadora/importador com participação da concessionária na entrega.

O MOC especifica o XML e a validação SEFAZ, não as chaves JSON da Nota Gateway.

## Contrato JSON da Nota Gateway

A referência pública localizada é a [página oficial de exemplos de NF-e Produto da NG](https://docs.notagateway.com.br/v2/docs/exemplos-de-emiss%C3%A3o-de-nf-e-produto-ou-conjugada). Ela exemplifica `transporte.enderecoEntrega` com `cidade`, UF, logradouro, número, bairro e documento. Os exemplos não são uma especificação pública completa dos campos mínimos ou do mapeamento XML.

Em resposta escrita de suporte Hermes recebida em 04/11/2026, a NG orientou que o campo JSON aceito para o município é somente `cidade`. Ele aceita o nome da cidade ou o código IBGE de sete dígitos; a NG resolve o valor e preenche `cMun` e `xMun` no XML. Para evitar ambiguidade no caso fiscal, o MOVA coleta o código IBGE e o envia no campo `cidade`. Não envia `codigoMunicipio`, `codigoIbge` nem `cMun` como propriedades JSON.

O exemplo do Hermes mostra o código IBGE em `cidade` e um XML com as tags `cMun` e `xMun`. Isso é orientação escrita de suporte, não uma especificação pública oficial da NG. Não foi transmitida NF para obter esse exemplo.

### Modalidade de frete

O MOC (Grupo X/X02) define os códigos DANFE 0, 1, 2, 3, 4 e 9. A resposta anterior do Hermes listou os tokens JSON `PorContaDoRemetente`, `PorContaDoDestinatario`, `PorContaDeTerceiros`, `TransporteProprioPorContaDoRemetente`, `TransporteProprioPorContaDoDestinatario` e `SemTransporte`, respectivamente, e disse que omitir modalidade resulta em 0. O token do código 4, utilizado no caso inicial, foi confirmado como `TransporteProprioPorContaDoDestinatario`.

**Modalidade 0 fora deste hotfix (decisão do Luis, 04/11/2026).** Há três nomes conflitantes para o código 0: `PorContaDoRemetente` (primeira resposta do Hermes), `ContratacaoPorContaDoRemetente` (exemplo posterior do Hermes) e `PorContaDoEmitente` (exemplo público da NG). A 0 só volta com confirmação escrita da NG do token e do XML `modFrete=0` resultante. Até lá o MOVA oferece 1, 2, 3, 4 e 9, e a omissão de modalidade não é possível (a NG assume 0 quando omitida).

## Escopo no MOVA

- O tipo RENAVE continua sendo uma escolha do operador. Este hotfix não sobrescreve `VendaConcessionaria`, `Outros` ou outros valores salvos com `FaturamentoDiretoConsumidorFinal`.
- Para `FaturamentoDiretoConsumidorFinal` (2), a tela exige endereço de entrega e envia CPF/CNPJ, logradouro, número, bairro, código IBGE em `cidade` e UF. A NG completa o nome do município no XML conforme a orientação de suporte.
- A modalidade de frete é obrigatória e escolhida sem valor pré-selecionado. `SemTransporte` não desativa o endereço quando `tpOp=2`.
- Fora de `tpOp=2`, o payload mantém o frete e omite `enderecoEntrega`; o hotfix não define a regra comercial/fiscal da operação de revenda.
- O payload segue no JSON já armazenado por `notas_fiscais_saida`; não há migração. O reenvio reaproveita o fluxo existente de tentativa e recebe o payload corrigido.

Arquivos principais: `src/lib/notagateway/transporte.ts`, `src/lib/notagateway/payload.ts`, `src/app/(dashboard)/vendas/nfe-propria-actions.ts` e `src/app/(dashboard)/estoque/components/nfe-propria-painel.tsx`.

Validação fiscal ponta a ponta ainda depende de teste autorizado em homologação e conferência do XML/DANFE. Nenhuma validação em produção foi feita ou está autorizada.
