-- Conciliação da maquininha Mercado Pago Point (ADR 0010: credencial por grupo).
-- grupos: credencial do Mercado Pago de cada grupo (access token cifrado, public key, user id).
-- pix_recebimentos_mcp.status: estado do Pix ('aprovado' por padrão) para tratar estorno.
alter table grupos
  add column if not exists mp_access_token text,
  add column if not exists mp_public_key text,
  add column if not exists mp_user_id text;

alter table pix_recebimentos_mcp
  add column if not exists status text not null default 'aprovado';

-- Uma conta do Mercado Pago pertence a um grupo só. A mesma conta em dois grupos importaria cada
-- venda no cartão nos dois (o índice do cartão é por grupo) e deixaria cada Pix só no grupo que
-- importou primeiro (transacao_id é único no sistema): dado de uma Conta gravado em outra.
create unique index if not exists idx_grupos_mp_user_id on grupos (mp_user_id) where mp_user_id is not null;
