# 0015. CPF/CNPJ inválido do comprador bloqueia venda, reserva e demanda

- **Status:** Aceita
- **Data da decisão:** 2026-10-08
- **Fontes:** [Agent Brief da #65](https://github.com/Meu-mova/moto-chefe/issues/65#issuecomment-6069200939);
  revisão do PR #82

## Contexto

A #65 abre a venda de moto para pessoa jurídica: um campo único CPF/CNPJ, com o tipo deduzido pelo
tamanho. Até aqui, só a tela conferia o dígito verificador do CPF; o servidor aceitava qualquer
documento de 11 dígitos. Documento com dígito errado chega à NF de saída e a SEFAZ recusa a nota.

## Decisão

CPF/CNPJ do comprador com dígito verificador errado bloqueia venda, reserva e demanda com sinal,
na tela e no servidor. É uma exceção ao ADR-0011 ("avise, não bloqueie").

Fica fora da exceção:

- **CPF do representante legal**: não vai para a nota. Segue o ADR-0011; o servidor grava o que
  recebe.
- **Editar uma venda antiga** cujo documento não mudou: não é conferido de novo, para que corrigir
  outro campo não trave por causa de um CPF gravado antes da regra.

## Por quê

O efeito de um aviso ignorado aparece só na emissão da nota, longe de quem digitou, e custa uma
correção de cadastro e uma nova tentativa de NF. Barrar no momento da digitação é mais barato.

## Alternativas descartadas

- **Só avisar** (seguir o ADR-0011): o erro só aparece na recusa da SEFAZ.
- **Conferir só na emissão da NF**: mesmo problema, e a venda já estaria gravada com o documento
  errado.

## Adendo de 2026-10-26: venda de peças e OS (#399)

Decisão do Luis em 26/10/2026: CPF/CNPJ com dígito verificador errado também bloqueia, na tela e
no servidor, a venda de peças (criação e troca de cliente) e a OS (abertura e agendamento que vira
OS). Vale para o documento digitado no balcão; a regra fica em `validarDocumento`
(`src/lib/documento.ts`), que reaproveita o mesmo cálculo da venda de moto.

- Mesma exceção de registro antigo: na troca de cliente da venda de peças, o documento que não
  mudou não é conferido de novo.
- A OS com cliente escolhido do cadastro não passa por esta regra: o documento vem do cadastro.
- O cadastro de clientes segue sem conferir o dígito verificador; fica fora deste adendo.

## Quando revisar

Se o CNPJ alfanumérico da Receita entrar no escopo (fora da #65).
