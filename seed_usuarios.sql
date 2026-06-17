INSERT INTO public.usuarios (id, nome, email, papel, loja_id) VALUES
  ('f9a8679b-5ac0-44bc-a510-44ee8d33a54b', 'César Admin', 'admin@motochefe.com', 'admin_geral', NULL),
  ('ee48ccc2-8d68-41a2-bc67-3c39a640007f', 'Ana Auxiliar', 'auxadm@motochefe.com', 'aux_adm', '11111111-1111-1111-1111-111111111111'),
  ('9649bdd2-c177-427d-89c2-8a639923599b', 'João Vendedor', 'vendedor@motochefe.com', 'vendedor', '11111111-1111-1111-1111-111111111111'),
  ('3afc4d64-cad9-4ba7-8b7e-fef3d684ce47', 'Pedro Mecânico', 'mecanico@motochefe.com', 'mecanico', '22222222-2222-2222-2222-222222222222');

UPDATE public.motos SET responsavel_montagem_id = '3afc4d64-cad9-4ba7-8b7e-fef3d684ce47'
WHERE responsavel_montagem_id IS NULL AND status != 'faturada';
