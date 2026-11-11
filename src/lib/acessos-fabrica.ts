// Logins da fábrica MotoChefe (papel `fabrica`, @/lib/painel-fabrica): regra pura do
// formulário de /admin/acessos-fabrica. A tela e a action validam pela mesma função.

export const SENHA_MINIMA_FABRICA = 8

export type DadosAcessoFabrica = { nome: string; email: string; senha: string }

/** Normaliza e confere. Devolve a frase de recusa, ou os dados limpos. */
export function validarAcessoFabrica(d: DadosAcessoFabrica): { ok: true; dados: DadosAcessoFabrica } | { ok: false; erro: string } {
  const nome = d.nome.trim()
  const email = d.email.trim().toLowerCase()
  if (!nome) return { ok: false, erro: 'Informe o nome do acesso (ex.: Fábrica MotoChefe — Comercial)' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'Informe um e-mail válido para o login' }
  const erroSenha = validarSenhaFabrica(d.senha)
  if (erroSenha) return { ok: false, erro: erroSenha }
  return { ok: true, dados: { nome, email, senha: d.senha } }
}

export function validarSenhaFabrica(senha: string): string | null {
  return senha.length >= SENHA_MINIMA_FABRICA ? null : `A senha precisa ter pelo menos ${SENHA_MINIMA_FABRICA} caracteres`
}
