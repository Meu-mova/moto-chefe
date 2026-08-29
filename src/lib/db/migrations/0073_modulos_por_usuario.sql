-- 0073_modulos_por_usuario.sql
-- Exceção de acesso por pessoa, em cima do padrão do papel. Mesmo molde de
-- papeis_extras: array de texto, nunca nulo. Guardam o `id` do item de
-- navegação (ex.: 'marketing'), não o href — mover uma página não pode
-- invalidar a permissão de ninguém.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS modulos_extras     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS modulos_bloqueados text[] NOT NULL DEFAULT '{}';
