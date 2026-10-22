-- Histórico de veículos por Conta (#325). A base existente foi importada pela rede
-- original e fica com a Conta dela, achada pelo CNPJ de um grupo seu (só dígitos: a
-- produção grava o CNPJ formatado). Se não achar, o not null abaixo falha e nada muda.
alter table veiculos_historico add column conta_id uuid references contas(id);

update veiculos_historico
   set conta_id = (select conta_id from grupos where regexp_replace(cnpj, '\D', '', 'g') = '57113017000172')
 where conta_id is null;

alter table veiculos_historico alter column conta_id set not null;

create index veiculos_historico_conta_id_idx on veiculos_historico (conta_id);
