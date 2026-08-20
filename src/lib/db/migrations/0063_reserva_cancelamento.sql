-- Cancelamento de reserva.
--
-- O enum reserva_status já tinha 'cancelada', mas não havia como chegar lá pelo
-- sistema: sem botão, quem precisava liberar a moto revertia a disponibilidade
-- na mão pelo "Editar moto" e deixava a reserva viva. Foi assim que o chassi
-- 192922510890343 acabou com duas reservas ativas ao mesmo tempo.
--
-- As três colunas guardam a auditoria no próprio registro — o histórico do
-- estoque é da moto, não da reserva.
--
-- Falta ainda o índice único de "uma reserva ativa por moto" (0064): ele não
-- entra enquanto houver moto com duas ativas na base. Até lá quem segura é a
-- trava em registrarReservaAction.
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS cancelada_em         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por        uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS cancelamento_motivo  text;
