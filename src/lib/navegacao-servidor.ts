// Liga a tabela pura de navegação às regras que dependem de e-mail. Fica em
// arquivo separado porque @/lib/auth importa o db no topo, e navegacao.ts
// precisa continuar testável sem banco.
import { podeRegistrarEntradaMotos } from '@/lib/auth'
import { itensVisiveis, podeAcessar, type ItemNav, type UsuarioNav } from '@/lib/navegacao'

export type UsuarioServidor = UsuarioNav & { email: string }

function regrasDe(usuario: UsuarioServidor) {
  return { entrada: podeRegistrarEntradaMotos(usuario) }
}

export function itensDoUsuario(usuario: UsuarioServidor): ItemNav[] {
  return itensVisiveis(usuario, regrasDe(usuario))
}

export function usuarioPodeAcessar(usuario: UsuarioServidor, href: string): boolean {
  return podeAcessar(usuario, href, regrasDe(usuario))
}
