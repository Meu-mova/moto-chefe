// Ponto único do menu e das rotas para o servidor. Hoje nenhum item tem regra própria
// (a Entrada virou módulo liberável na #488); quem precisar de uma informa aqui.
import { itensDoMenu, podeAcessar, type ItemNav, type UsuarioNav } from '@/lib/navegacao'

export type UsuarioServidor = UsuarioNav & { email: string }

const SEM_REGRAS_PROPRIAS = {}

export function itensDoUsuario(usuario: UsuarioServidor): ItemNav[] {
  return itensDoMenu(usuario, SEM_REGRAS_PROPRIAS)
}

export function usuarioPodeAcessar(usuario: UsuarioServidor, href: string): boolean {
  return podeAcessar(usuario, href, SEM_REGRAS_PROPRIAS)
}
