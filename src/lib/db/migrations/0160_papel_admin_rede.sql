-- Papel admin_rede (#517, adendo de 29/10/2026 ao ADR-0018). Sozinho no arquivo: o valor
-- novo de um enum não pode ser usado na mesma transação em que nasce.
alter type papel add value if not exists 'admin_rede';
