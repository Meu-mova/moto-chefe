-- Cidade da sede da empresa, para o fecho do contrato ("Pouso Alegre, 11/08/2026").
-- Antes o fecho usava a cidade da LOJA, o que fazia o contrato do Sul de Minas
-- sair como "Poços de Caldas" ou "Varginha". O local do ato é o da pessoa
-- jurídica que assina, não o da loja que atendeu.
--
-- Campo próprio, e não derivado de comarca_foro: comarca e cidade nem sempre
-- coincidem (cidade pequena costuma pertencer à comarca da vizinha).

ALTER TABLE grupos ADD COLUMN IF NOT EXISTS cidade_sede text;

UPDATE grupos SET cidade_sede = 'Pouso Alegre'
WHERE cnpj = '57.113.017/0001-72' AND cidade_sede IS NULL;
