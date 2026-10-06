# Runbook — backup e restauração da produção

O que o Supabase guarda da produção, o que fica de fora e como restaurar sem piorar o problema.
Fonte: painel do projeto (conferido em 2026-10-06) e a doc oficial
([Database Backups](https://supabase.com/docs/guides/platform/backups),
[Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)).

| | |
|---|---|
| Projeto | "Estoque Chassi", ref `bzlaradpofaecqzawyym` |
| Org / plano | "Motochefe Sul de Minas" (Pro) |
| Backup | diário, automático, por volta de 08h UTC (05h de Brasília) |
| Retenção | 7 dias (Pro) |
| Tipo | físico: restaura pelo painel, **não dá para baixar** |
| Onde ver | **Database → Backups → Scheduled backups** |
| PITR | desligado (add-on de ~US$ 100/mês + compute Small; não contratado) |

## O que o backup NÃO cobre

- **Dado lançado depois do backup.** Restaurar volta ao backup escolhido: tudo o que as lojas
  lançaram depois some (vendas, OS, pagamentos, conciliação). Problema notado no mesmo dia custa
  até ~24h; notado dias depois, o backup "anterior ao problema" é mais velho e a perda cresce.
- **Arquivos do Storage.** O banco guarda só a referência. Os buckets `assinaturas`,
  `comprovantes`, `holerites` e `modelos` não voltam: arquivo apagado continua apagado, e arquivo
  enviado depois do backup fica órfão (existe no bucket, o banco não aponta para ele).
- **Projeto apagado.** Apagar o projeto apaga os backups junto. Não há cópia fora do Supabase.
- **Senha de role customizado.** Se algum existir, a senha precisa ser redefinida depois.

## Antes de restaurar: qual caminho

**Restaurar o projeto inteiro** (Scheduled backups → Restore) troca o banco de todas as lojas dos
três grupos pelo estado do backup. O projeto fica **fora do ar** durante o processo (tempo
proporcional ao tamanho do banco; ainda não medido). Pesa contra:

- NF-e autorizada depois do backup continua valendo na SEFAZ, mas some de
  `notas_fiscais_saida`; o sistema perde o rastro do que já foi faturado (ver checklist);
- as sequências de numeração voltam atrás (ver checklist).

Só faz sentido quando o banco todo está comprometido.

**Restaurar num projeto novo** (aba **Restore to new project**, marcada beta no painel e na doc)
cria um projeto separado com o banco do backup, e a produção continua no ar. É o caminho para
recuperar um dado pontual (um registro apagado, um `update` errado): consulta-se a cópia e
devolve-se só o que falta. O projeto novo é cobrado à parte enquanto existir; apague depois de
usar. A cópia leva banco, roles e usuários do Auth com as senhas; não leva Storage, chaves de
API, configurações do Auth e do Realtime nem Edge Functions. Projeto restaurado não serve de
origem para outro clone. A prod não usa `pg_cron` nem `pg_net` (conferido em 2026-10-06),
então a cópia não dispara nada sozinha.

Em dúvida, prefira o projeto novo: não desfaz o dia de ninguém.

## Restaurar o projeto inteiro

1. Quem faz: Cesar ou Luis, com o outro avisado.
2. Avise as lojas que o sistema vai ficar fora e que o lançado desde o backup vai precisar ser
   refeito. Anote antes o que der: vendas e OS do dia, notas emitidas.
3. **Database → Backups → Scheduled backups**: escolha o backup mais recente **anterior** ao
   problema → **Restore** → confirme.
4. Espere a notificação de conclusão no painel.
5. Siga o checklist abaixo **antes** de liberar as lojas.

## Restaurar num projeto novo

1. Quem faz: Cesar ou Luis, com o outro avisado.
2. No projeto de produção: **Database → Backups → Restore to new project** → escolha o backup →
   **Restore**. O painel mostra o custo antes de confirmar.
3. Consulte pelo SQL Editor do painel do projeto novo. É dado real de cliente: mesmo cuidado
   da produção.
4. Devolver dado à produção é escrita na prod. Monte o `insert`/`update`, rode antes um `select`
   com o mesmo `where`, combine com o Cesar e aplique com
   `scripts/sql.ts --query "..." --prod` (env da prod). Não pelo SQL Editor nem pelo MCP.
5. Apague o projeto novo quando terminar.

## Checklist depois de restaurar o projeto inteiro

- [ ] **Numeração de venda.** `numero_venda_seq` volta ao valor do backup. Ela numera vendas,
      reservas, pedidos de venda, vendas de peça e recibos de demanda (`src/lib/db/schema.ts`,
      `demandas/actions.ts`). Número repetido é perigoso porque o id enviado à Nota Gateway
      (`mova-<número da venda>-<tentativa>`, `src/lib/notagateway/venda.ts`) é a chave de
      idempotência dela: reenviar um id conhecido devolve a nota antiga em vez de emitir outra.
      A maior parte dos números perdidos nunca virou nota, então o painel da Nota Gateway não
      mostra o maior usado. Antes de liberar as lojas, avance a sequência com folga larga
      (`setval` para o maior `numero` restante + 1000, por exemplo); buraco na numeração não
      quebra nada.
- [ ] **Numeração de OS.** Mesmo procedimento em `ordens_servico_numero_seq`: OS impressa no dia
      teria o número reaproveitado.
- [ ] **Notas fiscais.** NF-e autorizada depois do backup continua válida na SEFAZ, mas some de
      `notas_fiscais_saida`. A próxima tentativa sai do maior sufixo dessa tabela
      (`proximaTentativa`): reemitir uma venda anterior ao backup reusa o id `-1` e recebe de
      volta a nota já emitida (ou a negada). Liste no painel da Nota Gateway os ids
      `mova-<n>-<t>` (os de homologação são `mova-homolog-*`) emitidos depois do backup e
      reconcilie com as vendas antes de emitir de novo.
- [ ] **Migrações.** `migrate.ts --status` com o env da prod e `--prod`: migração aplicada
      depois do backup aparece como pendente e precisa ser reaplicada pelo `migrate.ts`.
- [ ] **Storage.** Comprovantes, assinaturas e holerites enviados no dia ficaram órfãos; os
      registros que apontavam para eles precisam ser refeitos.
- [ ] **Kommo.** Não há cron: o sync roda quando alguém abre `/atendimento` ou `/marketing`
      (cache de 15 min, `sincronizarSeNecessario` em `src/lib/kommo.ts`). Abra uma das telas e
      confira se os leads do dia aparecem.
- [ ] **Pedidos da fábrica.** O cron `/api/cron/pedidos-fabrica` (`vercel.json`, 12h UTC = 9h
      de Brasília) grava `avisado_em` quando avisa no WhatsApp. Restaurando para um backup
      anterior ao aviso do dia, a próxima rodada repete o aviso dos mesmos pedidos. O botão
      "Atualizar" do dashboard só relê o portal e não evita a repetição: avise o grupo.
- [ ] **Lojas.** Libere e peça para relançarem o que foi perdido.

## Ainda não existe

- **Cópia fora do Supabase** (`pg_dump` diário cifrado, guardado em outro provedor). Cobriria
  projeto apagado e conta comprometida. Depende do Cesar: a credencial da prod sairia do
  Supabase e da Vercel.
- **Teste de restauração.** Nunca foi feito. Um "Restore to new project" de teste mede o tempo e
  prova que o backup volta; apague o projeto em seguida.
- **Storage** não tem cópia nenhuma.
