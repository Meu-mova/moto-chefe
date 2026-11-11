-- Papel fabrica: login da fábrica MotoChefe, que só enxerga o Painel da Fábrica (/fabrica).
-- Sem Conta e sem loja (como o admin_geral, mas sem poder nenhum): o middleware prende
-- o papel em /fabrica e recusa Server Action (regra em src/lib/painel-fabrica.ts).
-- Sozinho no arquivo: o valor novo de um enum não pode ser usado na mesma transação.
alter type papel add value if not exists 'fabrica';
