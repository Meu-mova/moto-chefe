# 0014. Venda com NF de saída autorizada em produção não se cancela

- **Status:** Aceita
- **Data da decisão:** 2026-10-08
- **Fontes:** [comentário de triagem da #66](https://github.com/Meu-mova/moto-chefe/issues/66#issuecomment-6065781140);
  issues #73 e #74

## Contexto

Cancelar uma venda apaga a venda, mas a NF de saída autorizada continua valendo na SEFAZ: fica uma
nota válida para uma venda que não existe mais. O cancelamento da NF pela Nota Gateway é assíncrono
(a SEFAZ responde depois e pode recusar) e só é possível dentro do prazo legal. Por isso, não dá
para cancelar a nota e a venda num passo só com garantia de que as duas coisas deram certo.

## Decisão

Enquanto a venda tiver NF de saída autorizada em produção, o "Cancelar venda" recusa e orienta:
dentro do prazo, cancelar a NF antes; fora dele, emitir a NF de devolução. É uma exceção ao
ADR-0011 ("avise, não bloqueie").

Conta a nota viva, não só a autorizada: a que ainda está em emissão pode sair autorizada a qualquer
momento, e a que está com o cancelamento pendente ainda vale. Precisado em 2026-10-09, na
implementação (#66).

## Por quê

O ADR-0011 serve para validação que discorda do usuário. Aqui, o efeito de um aviso ignorado é
fiscal (nota válida para venda inexistente) e difícil de desfazer. Exigir a NF cancelada antes
elimina esse risco usando o cancelamento de NF que a #66 já constrói.

## Alternativas descartadas

- **Só avisar e deixar cancelar** (seguir o ADR-0011): mantém o risco fiscal.
- **Cancelar a NF automaticamente e só depois a venda**: é como os ERPs pesquisados na #74 (Omie,
  Olist, TOTVS Protheus) tratam o pedido com NF, mas exige um estado de "venda em cancelamento" e
  o tratamento da recusa da SEFAZ. Fica para a #74.

## Situação em 2026-10-09

Implementado com a #66: o diálogo do "Cancelar venda" confere a trava ao abrir e mostra a
orientação, e o servidor confere de novo ao confirmar. Só conta nota do MOVA de produção viva; a
NF do Bling continua só com o aviso de que o cancelamento dela é feito no Bling. Fora do prazo, a
venda fica travada até a NF de devolução existir no MOVA (#75), sem saída manual. Cancelar a
venda depois de cancelar a NF ainda apaga o histórico de NF dela (#73).

## Adendo de 2026-10-17: aux_adm (#191)

O `aux_adm` passa a ter o "Cancelar venda" (pedido do Cesar em 16/10), no grupo da loja da venda.
Para ele, a trava é mais larga: além da NF do MOVA viva, recusa também a venda com número de NF
preenchido (`vendas.nota_fiscal_saida`: NF do Bling ou digitada em "Confirmar NF"), com a orientação
de falar com o Cesar. Cancelar a NF do MOVA limpa esse número, então a ordem "cancela a NF, depois
a venda" vale para ele também. Os admins seguem só com a trava deste ADR. A regra fica em
`src/lib/cancelar-venda.ts`.

## Quando revisar

Quando a #74 for decidida.
