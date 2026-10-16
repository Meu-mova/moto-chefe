// Quem presta o serviço no contrato de adesão ao MOVA e quanto se cobra (#165).
// Fixo no código de propósito: é uma empresa só e muda quase nunca; trocar passa
// por PR e revisão. Decisões de 16/10/2026 (comentários na #165).

export const CONTRATADA = {
  razaoSocial: 'INFINITY FIT TREINAMENTO E DESENVOLVIMENTO LTDA',
  cnpj: '13481112000153',
  endereco: 'Av. Getúlio Vargas, 232, apto. 202, Centro, Pouso Alegre/MG, CEP 37.550-037',
  marca: 'MOVA',
  cidadeFecho: 'Pouso Alegre/MG',
  comarcaForo: 'Pouso Alegre/MG',
} as const

export type Preco = { implantacao: number; mensalidade: number }

// Franqueado MotoChefe tem R$ 200 de desconto na implantação e R$ 100 na mensalidade.
export const PRECOS: { padrao: Preco; franqueado: Preco } = {
  padrao: { implantacao: 999, mensalidade: 499 },
  franqueado: { implantacao: 799, mensalidade: 399 },
}

export function precoSugerido(franqueadoMotochefe: boolean): Preco {
  return franqueadoMotochefe ? PRECOS.franqueado : PRECOS.padrao
}
