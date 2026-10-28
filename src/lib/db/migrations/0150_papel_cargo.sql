-- Papel interno de quem tem cargo da Conta (#449). Arquivo próprio: o valor novo do enum não
-- pode ser usado na mesma transação em que nasce, e a 0151 usa.
alter type papel add value if not exists 'cargo';
