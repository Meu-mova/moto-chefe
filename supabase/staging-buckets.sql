-- Buckets do MOVA no staging, iguais aos da produção (conferido em 2026-10-05).
-- Bucket é dado de storage.buckets, não schema: o dump do baseline não traz.
-- assinaturas, holerites e nfe-bling vêm das migrações 0051, 0077 e 0116; comprovantes e modelos
-- foram criados pelo painel e não têm migração. Nenhum dos quatro tem policy de
-- storage na produção (acesso só por service role e URL assinada).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('assinaturas',  'assinaturas',  false, null,     null),
  ('comprovantes', 'comprovantes', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('holerites',    'holerites',    false, null,     null),
  ('modelos',      'modelos',      true,  10485760, array['image/png','image/jpeg','image/webp']),
  ('nfe-bling',    'nfe-bling',    false, null,     null)
ON CONFLICT (id) DO NOTHING;
