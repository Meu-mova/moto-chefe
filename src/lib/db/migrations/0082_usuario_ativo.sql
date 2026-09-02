-- Flag de ativo/inativo no cadastro de usuário. Inativo continua no sistema
-- (histórico intacto) mas some dos relatórios de vendedor e do 1-a-1.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
