-- Fase 2 do Atendimento (Kommo): atividade + tempo de resposta, em agregados
-- diários por colaborador (não guardamos mensagem a mensagem — volume enorme).

CREATE TABLE IF NOT EXISTS kommo_atividade_diaria (
  dia               date NOT NULL,
  kommo_user_id     text NOT NULL,
  mensagens         integer NOT NULL DEFAULT 0,   -- outgoing_chat_message do colaborador
  tarefas           integer NOT NULL DEFAULT 0,   -- task_completed do colaborador
  resp_soma_seg     bigint  NOT NULL DEFAULT 0,   -- soma dos tempos de 1ª resposta (s)
  resp_qtd          integer NOT NULL DEFAULT 0,   -- nº de respostas medidas
  PRIMARY KEY (dia, kommo_user_id)
);
CREATE INDEX IF NOT EXISTS idx_kommo_atividade_dia ON kommo_atividade_diaria (dia);
