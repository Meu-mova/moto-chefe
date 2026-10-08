# 0014. Venda com NF de saída autorizada não se cancela

- **Status:** Aceita
- **Data da decisão:** 2026-10-08
- **Fontes:** triagem da issue #66 (comentário de triagem); issues #73 e #74

## Contexto

Cancelar uma venda apaga a venda, mas a NF de saída autorizada continua valendo na SEFAZ: fica uma
nota válida, com imposto devido, para uma venda que não existe mais. O cancelamento da NF pela
Nota Gateway é assíncrono (a SEFAZ responde depois e pode recusar) e só é possível nas 24h
seguintes à autorização. Por isso, não dá para cancelar a nota e a venda num passo só com
garantia de que as duas coisas deram certo.

## Decisão

Enquanto a venda tiver NF de saída autorizada em produção, o "Cancelar venda" recusa e orienta:
dentro do prazo, cancelar a NF antes; fora dele, emitir a NF de devolução. É uma exceção ao
ADR-0011 ("avise, não bloqueie").

## Por quê

O ADR-0011 serve para validação que discorda do usuário, quando o custo de um aviso ignorado é
baixo. Aqui o efeito de um aviso ignorado é fiscal (nota válida para venda inexistente), aparece
só depois na contabilidade e é difícil de desfazer. Exigir a nota cancelada antes elimina esse
risco com pouco código.

## Alternativas descartadas

- **Só avisar e deixar cancelar** (seguir o ADR-0011): mantém o risco fiscal. Nenhum dos ERPs
  consultados na triagem (Omie, Olist, TOTVS Protheus) faz assim.
- **Cancelar a NF automaticamente e só depois a venda**: é o padrão desses ERPs, mas exige um
  estado de "venda em cancelamento" e o tratamento da recusa da SEFAZ. Fica para a #74.

## Situação em 2026-10-08

Não implementado: entra com a #66. Hoje o "Cancelar venda" ainda apaga a venda com NF autorizada,
e o histórico de NF da venda vai junto (#73).

## Quando revisar

Quando a #74 for feita: o "Cancelar venda" passa a cancelar a NF sozinho, e esta trava vira o caso
de fora do prazo ou de recusa da SEFAZ.
