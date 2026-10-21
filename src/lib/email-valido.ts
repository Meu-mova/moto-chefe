// Fora de @/lib/email de propósito: aquele módulo importa o Resend, e esta
// checagem roda também em componente de cliente (/adesao).

// Validação simples e conservadora — o objetivo é barrar vazio/lixo antes de
// gastar uma chamada no Resend, não validar RFC 5322 inteira.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(email: string | null | undefined): boolean {
  return !!email && RE_EMAIL.test(email.trim())
}
