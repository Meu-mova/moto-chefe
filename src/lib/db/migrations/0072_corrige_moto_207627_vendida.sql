-- A JetMax preta LYDAE3936T1207627 voltou pro Showroom depois de vendida.
--
-- Linha do tempo reconstruída pelo historico_estoque:
--   20/08 18:35  caixa → montada (Adrielly, mecânico Murilo Belo)
--   20/08 21:00  venda 31118 — Kelly Alves Martins Sarto, R$ 12.390,00 (João Brito)
--                → status='vendida', disponibilidade=NULL
--        ...     NF de saída 2263 confirmada → disponibilidade='vendida'
--   24/08 17:08  caixa → montada (Luiz Paulo, mecânico Jhon Lenon)
--
-- O evento de 24/08 registra status_anterior='caixa'. Como mudar_status_moto lê o
-- status real com FOR UPDATE antes de gravar, a moto ESTAVA em 'caixa' naquele
-- momento — quatro dias depois de vendida e faturada. Não há registro no histórico
-- da volta 'vendida' → 'caixa': o único caminho que faz isso em silêncio é
-- editarMotoAction, que gravava status/disponibilidade sem validar transição e sem
-- histórico. Em seguida a montagem normal setou disponibilidade='disponivel' e
-- devolveu a moto ao Showroom, disponível para ser vendida de novo.
--
-- Estado correto de uma moto vendida COM NF de saída é status='vendida' +
-- disponibilidade='vendida' — é como estão todas as outras vendidas da base.
--
-- responsavel_montagem_id volta para Murilo Belo, que foi quem de fato montou em
-- 20/08; a remontagem indevida de 24/08 o havia sobrescrito por Jhon Lenon.
-- data_montagem já estava correta (2026-08-20) e por isso não é tocada.
--
-- A trava que impede isso de repetir está em podeAlterarEstoqueComVenda()
-- (src/lib/estado-moto.ts), aplicada em alterarStatusAction e editarMotoAction.
UPDATE motos
   SET status                  = 'vendida',
       disponibilidade         = 'vendida',
       responsavel_montagem_id = 'c6de600e-93ac-402f-bb6a-912e0abde143'  -- Murilo Belo
 WHERE chassi = 'LYDAE3936T1207627';

-- Registra a correção no histórico. A ausência de rastro da alteração de 24/08 foi
-- justamente o que cegou o diagnóstico — esta não repete o erro.
-- NOT EXISTS: correção de dado, não pode duplicar se o arquivo rodar duas vezes.
INSERT INTO historico_estoque (moto_id, usuario_id, tipo, status_anterior, status_novo, observacao)
SELECT m.id,
       '537e8ded-9440-4355-acf5-010f0212d518',  -- Cesar Rodrigues
       'mudanca_status',
       'montada',
       'vendida',
       'Correção de dado: moto reapareceu no Showroom após remontagem indevida em 24/08, já vendida na venda 31118 (NF de saída 2263). Estado restaurado para vendida/vendida e montador devolvido a Murilo Belo.'
  FROM motos m
 WHERE m.chassi = 'LYDAE3936T1207627'
   AND NOT EXISTS (
     SELECT 1 FROM historico_estoque h
      WHERE h.moto_id = m.id
        AND h.observacao LIKE 'Correção de dado: moto reapareceu no Showroom%'
   );
