-- Endereço da sede da adesão em campos (#292): o CEP preenche o resto na tela.
-- endereco_sede continua sendo a linha que vai no contrato, montada destes campos.
alter table adesoes_mova
  add column sede_cep         text,
  add column sede_logradouro  text,
  add column sede_numero      text,
  add column sede_complemento text,
  add column sede_bairro      text,
  add column sede_cidade      text,
  add column sede_uf          text;
