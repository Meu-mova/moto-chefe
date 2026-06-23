-- performance indexes: elimina full table scans nas queries do dashboard
CREATE INDEX IF NOT EXISTS vendas_data_venda_idx ON vendas (data_venda);
CREATE INDEX IF NOT EXISTS vendas_loja_id_idx ON vendas (loja_id);
CREATE INDEX IF NOT EXISTS vendas_vendedor_id_idx ON vendas (vendedor_id);
CREATE INDEX IF NOT EXISTS vendas_data_loja_idx ON vendas (data_venda, loja_id);

CREATE INDEX IF NOT EXISTS motos_loja_id_idx ON motos (loja_id);
CREATE INDEX IF NOT EXISTS motos_status_idx ON motos (status);
CREATE INDEX IF NOT EXISTS motos_disponibilidade_idx ON motos (disponibilidade);
CREATE INDEX IF NOT EXISTS motos_modelo_id_idx ON motos (modelo_id);

CREATE INDEX IF NOT EXISTS conciliacoes_venda_conciliado_idx ON conciliacoes_cartao (venda_id, conciliado);

CREATE INDEX IF NOT EXISTS transferencias_status_idx ON transferencias (status);
CREATE INDEX IF NOT EXISTS transferencias_loja_origem_idx ON transferencias (loja_origem_id);
CREATE INDEX IF NOT EXISTS transferencias_loja_destino_idx ON transferencias (loja_destino_id);

CREATE INDEX IF NOT EXISTS garantias_status_loja_idx ON garantias (status, loja_id);
CREATE INDEX IF NOT EXISTS garantias_data_fim_idx ON garantias (data_fim);

CREATE INDEX IF NOT EXISTS os_status_loja_idx ON ordens_servico (status, loja_id);
CREATE INDEX IF NOT EXISTS os_mecanico_id_idx ON ordens_servico (mecanico_id);
CREATE INDEX IF NOT EXISTS os_data_abertura_idx ON ordens_servico (data_abertura);
