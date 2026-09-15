-- src/lib/db/migrations/0098_certificado_uf.sql
-- UF do autor da consulta à SEFAZ (cUFAutor), junto do certificado do grupo.
--
-- Antes isto era um mapa por CNPJ dentro de src/lib/sefaz/distribuicao.ts:
-- empresa nova exigia deploy, e o grupo esquecido só aparecia quando a
-- sincronização quebrava. Agora quem sobe o certificado escolhe a UF na mesma
-- tela.
--
-- Fica em certificados_digitais, e não em grupos, porque é a UF do CNPJ que
-- ASSINA a consulta — é o certificado que define esse CNPJ, e é o mesmo
-- registro que `carregarCertificado` já devolve pra quem fala com a SEFAZ.
--
-- Backfill pelos valores que estavam no mapa: MG (31) para Sul de Minas e BH,
-- SP (35) para o Vale, cuja única loja é a Motochefe Pinda, em
-- Pindamonhangaba. Sem o backfill o NOT NULL abaixo não passaria — e um
-- default ('MG', digamos) mandaria UF errada pra SEFAZ em silêncio, que é
-- exatamente o que este desenho existe pra evitar.

ALTER TABLE certificados_digitais ADD COLUMN IF NOT EXISTS uf text;

UPDATE certificados_digitais SET uf = 'MG' WHERE uf IS NULL AND cnpj IN ('57113017000172', '63009605000163');
UPDATE certificados_digitais SET uf = 'SP' WHERE uf IS NULL AND cnpj = '65126949000188';

-- Certificado de CNPJ fora da lista acima (nenhum hoje) trava a migração aqui,
-- de propósito: o SET NOT NULL já falharia sozinho, mas com mensagem do
-- Postgres que não diz o que fazer. APAGAR a linha seria pior — o certificado
-- só volta com a senha, que o sistema não tem.
DO $$
DECLARE orfas text;
BEGIN
  SELECT string_agg(cnpj, ', ') INTO orfas FROM certificados_digitais WHERE uf IS NULL;
  IF orfas IS NOT NULL THEN
    RAISE EXCEPTION 'Certificado sem UF no backfill (CNPJ %) — acrescente o UPDATE dele acima antes de rodar esta migração', orfas;
  END IF;
END $$;

ALTER TABLE certificados_digitais ALTER COLUMN uf SET NOT NULL;
