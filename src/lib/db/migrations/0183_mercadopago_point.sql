-- Conciliação da maquininha Mercado Pago Point (ADR 0010: credencial por grupo).
-- grupos: credencial do Mercado Pago de cada grupo (access token cifrado, public key, user id).
-- pix_recebimentos_mcp.status: estado do Pix ('aprovado' por padrão) para tratar estorno.
alter table grupos
  add column if not exists mp_access_token text,
  add column if not exists mp_public_key text,
  add column if not exists mp_user_id text;

alter table pix_recebimentos_mcp
  add column if not exists status text not null default 'aprovado';
