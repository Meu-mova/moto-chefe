-- O portal da fábrica passou a ter um cadastro por loja, não mais por bandeira.
-- O login antigo do Sul de Minas virou a conta da loja de Pouso Alegre.
alter table "lojas" add column if not exists "fabrica_email" text;
alter table "lojas" add column if not exists "fabrica_senha" text;

-- O BH já tinha a credencial no grupo; traz pra loja para não redigitar.
-- As contas do Sul de Minas são cadastradas pela tela (senha não entra em
-- arquivo commitado).
update "lojas" l
set "fabrica_email" = g."fabrica_email",
    "fabrica_senha" = g."fabrica_senha"
from "grupos" g
where l."grupo_id" = g."id"
  and g."fabrica_email" is not null
  and l."nome" = 'Raja BH';
