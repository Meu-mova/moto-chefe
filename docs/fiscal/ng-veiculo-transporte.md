# Veículo novo, faturamento direto e transporte na Nota Gateway

## Regra fiscal oficial

O MOC 7.0, Grupo JA/J02, define `tpOp=1` como venda concessionária e `tpOp=2` como faturamento direto para consumidor final. A regra C18-20 prevê rejeição 478 quando `tpOp=2` e a UF do local de entrega (G09) não é informada. No Grupo G, quando o endereço de entrega é enviado, documento (CPF ou CNPJ), logradouro, número, bairro, código IBGE do município, nome do município e UF são campos obrigatórios; nome do recebedor e CEP são opcionais.

Fontes oficiais:

- [MOC 7.0, Anexo I, leiaute e regras de validação](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf): Grupo G, p. 16; Grupo JA/J02, p. 22; regra C18-20, p. 82.
- [Convênio ICMS 51/00](https://www.confaz.fazenda.gov.br/legislacao/convenios/2000/CV051_00): faturamento direto ao consumidor pela montadora/importador com participação da concessionária na entrega.

O MOC especifica o XML e a validação SEFAZ, não as chaves JSON da Nota Gateway.

## Contrato JSON da Nota Gateway

A referência pública localizada é a [página oficial de exemplos de NF-e Produto da NG](https://docs.notagateway.com.br/v2/docs/exemplos-de-emiss%C3%A3o-de-nf-e-produto-ou-conjugada). Ela exemplifica `transporte.enderecoEntrega` com `cidade`, UF, logradouro, número, bairro e documento. Os exemplos não são uma especificação pública completa dos campos mínimos ou do mapeamento XML.

Os exemplos 1 e 4 dessa página também mostram `tipoPessoaDestinatario` e `pais` dentro de `enderecoEntrega`; por isso o MOVA envia `pais: null` e deriva `tipoPessoaDestinatario` do documento (11 dígitos = `F`, 14 = `J`).

Em resposta escrita de suporte Hermes recebida em 04/11/2026, a NG orientou que o campo JSON aceito para o município é somente `cidade`. Ele aceita o nome da cidade ou o código IBGE de sete dígitos; a NG resolve o valor e preenche `cMun` e `xMun` no XML. Para evitar ambiguidade no caso fiscal, o MOVA coleta o código IBGE e o envia no campo `cidade`. Não envia `codigoMunicipio`, `codigoIbge` nem `cMun` como propriedades JSON.

O exemplo do Hermes mostra o código IBGE em `cidade` e um XML com as tags `cMun` e `xMun`. Isso é orientação escrita de suporte, não uma especificação pública oficial da NG. Não foi transmitida NF para obter esse exemplo.

### Modalidade de frete

O MOC (Grupo X/X02) define os códigos DANFE 0, 1, 2, 3, 4 e 9. O nome JSON de cada código está no artigo da
base de conhecimento da NG [170207, "Como os campos do grupo de transporte devem ser informados no JSON?"](https://atendimento.notagateway.com.br/kb/pt-br/article/170207/duvidas-sobre-nf-e-como-os-campos-do-grupo-de-transporte-devem-s)
("Atualizado por Joana Castro em 29/10/2024"). A tabela "versão 4.0 da NFe" do artigo liga `transporte.frete.modalidade`
ao `<modFrete>` do XML, por exemplo `"modalidade": "ContratacaoPorContaDoRemetente"` a
`<modFrete>0</modFrete>` ("0 - Contratação do Frete por conta do Remetente (CIF)"):

| Código | Nome JSON (4.0) | Texto na tela do MOVA |
|---|---|---|
| 0 | `ContratacaoPorContaDoRemetente` | Loja contrata e paga a transportadora |
| 1 | `ContratacaoPorContaDoDestinatario` | Cliente contrata e paga a transportadora |
| 2 | `ContratacaoPorContaDeTerceiros` | Outra pessoa contrata o frete |
| 3 | `TransporteProprioPorContaDoRemetente` | Loja leva com veículo próprio |
| 4 | `TransporteProprioPorContaDoDestinatario` | Cliente leva com veículo próprio |
| 9 | `SemOcorrenciaDeTransporte` | Sem frete |

O mesmo artigo mantém os nomes da versão 3.10: `"PorContaDoEmitente"= 0`, `"PorContaDoDestinatario" = 1`,
`"PorContaDeTerceiros" = 2` e `"SemFrete" = 9`. O manual da NG para NF-e modelo 55 (fora do repo) lista como
"Opções válidas" os 6 nomes 4.0 e `"SemFrete"`, sem os `PorConta...` da 3.10. `SemTransporte` não está na KB nem no manual.

- O MOVA envia só os nomes 4.0. A lista mora em `MODALIDADES_FRETE` (`src/lib/notagateway/transporte.ts`), com
  texto, código e nome; tela, validação e payload saem dela (#723).
- A modalidade 0 entrou depois da resposta escrita do suporte (Hermes, 05/11/2026: "Pode seguir conforme a
  documentação"; #662).
- Da v1.21.1 até o #723 o MOVA mandava `SemTransporte` para a 9 e os nomes 3.10 `PorContaDoDestinatario` e
  `PorContaDeTerceiros` para a 1 e a 2. Nota recusada gravada com um desses três nomes reabre com o nome 4.0 do
  mesmo código, e o reenvio sai com ele. Outro nome antigo (que o MOVA nunca gravou) reabre sem modalidade.
- Omitir a modalidade não é possível no faturamento direto: o suporte escreveu (05/11/2026) que a API manda 0 à
  SEFAZ quando ela falta.

## Escopo no MOVA

- O tipo RENAVE continua sendo uma escolha do operador. Este hotfix não sobrescreve `VendaConcessionaria`, `Outros` ou outros valores salvos com `FaturamentoDiretoConsumidorFinal`.
- Para `FaturamentoDiretoConsumidorFinal` (2), a tela exige endereço de entrega e envia CPF/CNPJ, logradouro, número, bairro, código IBGE em `cidade` e UF. A NG completa o nome do município no XML conforme a orientação de suporte.
- A modalidade de frete é obrigatória no faturamento direto e escolhida sem valor pré-selecionado. "Sem frete" (`SemOcorrenciaDeTransporte`) não dispensa o endereço quando `tpOp=2`.
- Fora de `tpOp=2` (decisão do Luis: não generalizar para outras revendas), nada muda: a tela não pede frete nem entrega e o payload não leva `transporte`. O hotfix não define a regra comercial/fiscal da operação de revenda.
- O payload segue no JSON já armazenado por `notas_fiscais_saida`; não há migração. O reenvio reaproveita o fluxo existente de tentativa e recebe o payload corrigido.

## Rejeições 841, 842 e 843 (tipo e espécie do veículo)

Na recusa, os códigos 841, 842 e 843 abrem o grupo "Veículo" da tela de correção (`src/lib/notagateway/recusa.ts`), para editar os dados do RENAVE e reenviar com o mesmo número (#673).

- 841: "Código do Tipo de Veículo Inexistente [nItem:nnn]" (`veicProd/tpVeic`, formato `[0-9]{1,2}`, "utilizar tabela RENAVAM").
- 842: código da espécie de veículo (`espVeic`) inexistente.
- 843: "Código da espécie de Veículo incompatível com o tipo do Veículo [nItem:nnn]".
- Origem: a NT 2021.004 v1.20, item 2.3.1, diz que `tpVeic` e `espVeic` passam a ser validados por tabelas externas; a Tabela de Tipo e Espécie de Veículo fica no Portal da NF-e, aba Documentos, Diversos.

**Fonte não oficial.** O texto oficial da NT/MOC (Anexo I, grupo J) não foi lido: o PDF do MOC não abriu como texto e as URLs da NT deram erro de redirecionamento em 05/11/2026. Os trechos acima vêm de fontes secundárias que citam a NT: [oobj, 841](https://oobj.com.br/bc/rejeicao-841-como-resolver), [oobj, 843](https://oobj.com.br/bc/rejeicao-843-como-resolver/), [Omie, 843](https://ajuda.omie.com.br/pt-BR/articles/6719408-843-rejeicao-codigo-da-especie-de-veiculo-incompativel-com-o-tipo-do-veiculo), [descrição do campo tpVeic](https://buscadorncm.com.br/nfe/tags-xml/tpveic) e [resumo da NT 2021.004](https://portalspedbrasil.com.br/?p=17458). Conferir no texto oficial antes de mapear qualquer outro código do `veicProd`.

**Limite.** Em 04/11/2026 os mesmos valores de RENAVE (tipo 02, espécie 1, combustível 07, `cMod` 000001) foram autorizados em MG e recusados com 841 em PR (homologação). Editar o RENAVE na tela é a saída para o operador; não é garantia de que o 841 de PR seja dado do RENAVE. Causa em apuração com o Hermes.

Arquivos principais: `src/lib/notagateway/transporte.ts`, `src/lib/notagateway/payload.ts`, `src/app/(dashboard)/vendas/nfe-propria-actions.ts` e `src/app/(dashboard)/estoque/components/nfe-propria-painel.tsx`.

Validação fiscal ponta a ponta ainda depende de teste autorizado em homologação e conferência do XML/DANFE. Nenhuma validação em produção foi feita ou está autorizada.
