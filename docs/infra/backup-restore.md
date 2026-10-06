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

- **Até ~24h de dado.** Restaurar volta ao backup das 05h: tudo o que as lojas lançaram depois
  some (vendas, OS, pagamentos, conciliação).
- **Arquivos do Storage.** O banco guarda só a referência. Os buckets `assinaturas`,
  `comprovantes`, `holerites` e `modelos` não voltam: arquivo apagado continua apagado, e arquivo
  enviado depois do backup fica órfão (existe no bucket, o banco não aponta para ele).
- **Projeto apagado.** Apagar o projeto apaga os backups junto. Não há cópia fora do Supabase.
- **Senha de role customizado.** Se algum existir, a senha precisa ser redefinida depois.

## Antes de restaurar: qual caminho

**Restaurar o projeto inteiro** (Scheduled backups → Restore) troca o banco de todas as lojas dos
três grupos pelo estado das 05h. O projeto fica **fora do ar** durante o processo (tempo
proporcional ao tamanho do banco; ainda não medido). Só faz sentido quando o banco todo está
comprometido.

**Restaurar num projeto novo** (aba **Restore to new project**, beta) cria um projeto separado
com o banco do backup, e a produção continua no ar. É o caminho para recuperar um dado pontual
(um registro apagado, um `update` errado): consulta-se a cópia e devolve-se só o que falta. O
projeto novo é cobrado à parte enquanto existir; apague depois de usar. A cópia leva banco,
usuários do Auth e senhas, mas não leva Storage, chaves de API nem configurações do Auth.

Em dúvida, prefira o projeto novo: não desfaz o dia de ninguém.

## Restaurar o projeto inteiro

1. Quem faz: Cesar ou Luis, com o outro avisado.
2. Avise as lojas que o sistema vai ficar fora e que o lançado desde as 05h vai precisar ser
   refeito. Anote antes o que der: vendas e OS do dia, notas emitidas.
3. **Database → Backups → Scheduled backups**: escolha o backup mais recente **anterior** ao
   problema → **Restore** → confirme.
4. Espere a notificação de conclusão no painel.
5. Siga o checklist abaixo **antes** de liberar as lojas.

## Restaurar num projeto novo

1. No projeto de produção: **Database → Backups → Restore to new project** → escolha o backup →
   **Restore**. O painel mostra o custo antes de confirmar.
2. Consulte pelo SQL Editor do painel do projeto novo. É dado real de cliente: mesmo cuidado
   da produção.
3. Devolver dado à produção é escrita na prod: monte o `insert`/`update`, rode antes um `select`
   com o mesmo `where`, e combine com o Cesar.
4. Apague o projeto novo quando terminar.

## Checklist depois de restaurar o projeto inteiro

- [ ] **Número da venda.** `numero_venda_seq` volta ao valor das 05h. As vendas novas
      repetiriam números de vendas perdidas, e o id que vai para a Nota Gateway
      (`mova-<número da venda>-<tentativa>`, `src/lib/notagateway/venda.ts`) é a chave de
      idempotência dela: reenviar um id conhecido consulta a nota antiga em vez de emitir outra.
      Antes de liberar a venda, avance a sequência para além do maior número já usado (confira
      no painel da Nota Gateway os ids `mova-*` emitidos depois do backup).
- [ ] **Número da OS.** Mesma coisa com `ordens_servico_numero_seq`: OS impressa no dia teria o
      número reaproveitado.
- [ ] **Notas fiscais.** NF-e autorizada depois do backup continua válida na SEFAZ, mas some de
      `notas_fiscais_saida`. Liste no painel da Nota Gateway o que foi emitido no dia e
      reconcilie com as vendas antes de emitir de novo.
- [ ] **Migrações.** `migrate.ts --status` com o env da prod e `--prod`: migração aplicada
      depois do backup aparece como pendente e precisa ser reaplicada pelo `migrate.ts`.
- [ ] **Storage.** Comprovantes, assinaturas e holerites enviados no dia ficaram órfãos; os
      registros que apontavam para eles precisam ser refeitos.
- [ ] **Integrações.** Leads do Kommo e mensagens de WhatsApp do dia não voltam sozinhos;
      confira se algum sync precisa rodar de novo. O cron `/api/cron/pedidos-fabrica`
      (`vercel.json`, 12h UTC) roda normalmente no dia seguinte.
- [ ] **Lojas.** Libere e peça para relançarem o que foi perdido.

## Lacunas em aberto

- **Cópia fora do Supabase** (`pg_dump` diário cifrado, guardado em outro provedor). Cobriria
  projeto apagado e conta comprometida. Depende do Cesar: a credencial da prod sairia do
  Supabase e da Vercel.
- **Teste de restauração.** Nunca foi feito. Um "Restore to new project" de teste mede o tempo e
  prova que o backup volta; apague o projeto em seguida.
- **Storage** não tem cópia nenhuma.
