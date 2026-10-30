-- Nome que aparece no "De" dos e-mails de assinatura da venda (#542). Nulo = nome do EMAIL_FROM.
alter table grupos add column if not exists email_remetente_nome text;
