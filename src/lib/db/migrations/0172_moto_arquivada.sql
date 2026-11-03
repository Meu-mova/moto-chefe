-- Moto arquivada: sai de toda tela, lista, contagem e busca, e só o RADAR a acha.
-- Para moto que não é mais da loja nem foi vendida, como as do golpe de link de
-- pagamento de outubro/2026 (venda cancelada, chassi marcado "GOLPE"). O registro e o
-- histórico ficam; apagar tiraria a moto do RADAR.
alter table motos add column if not exists arquivada_em timestamptz;
alter table motos add column if not exists arquivada_por uuid references usuarios(id);
alter table motos add column if not exists motivo_arquivo text;

-- Os três andam juntos: arquivada tem quem e por quê; não arquivada, nenhum dos dois.
alter table motos add constraint motos_arquivo_completo check (
  (arquivada_em is null and arquivada_por is null and motivo_arquivo is null)
  or (arquivada_em is not null and arquivada_por is not null and coalesce(btrim(motivo_arquivo), '') <> '')
);
