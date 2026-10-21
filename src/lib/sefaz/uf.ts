// src/lib/sefaz/uf.ts
// UF do autor da consulta à SEFAZ: da sigla que a pessoa escolhe na tela para o
// código IBGE que o XML exige (`cUFAutor`).
//
// Esta tabela é constante do país, não configuração de cliente — por isso mora
// no código. O que é config (QUAL UF cada empresa usa) vive no banco, junto do
// certificado, e é editável em /admin/certificados. Antes desta separação a UF
// era um mapa por CNPJ aqui dentro: cada CNPJ novo exigia deploy, e o grupo
// esquecido só aparecia quando a sincronização quebrava.

export const UFS = [
  { sigla: 'AC', nome: 'Acre',                codigo: '12' },
  { sigla: 'AL', nome: 'Alagoas',             codigo: '27' },
  { sigla: 'AP', nome: 'Amapá',               codigo: '16' },
  { sigla: 'AM', nome: 'Amazonas',            codigo: '13' },
  { sigla: 'BA', nome: 'Bahia',               codigo: '29' },
  { sigla: 'CE', nome: 'Ceará',               codigo: '23' },
  { sigla: 'DF', nome: 'Distrito Federal',    codigo: '53' },
  { sigla: 'ES', nome: 'Espírito Santo',      codigo: '32' },
  { sigla: 'GO', nome: 'Goiás',               codigo: '52' },
  { sigla: 'MA', nome: 'Maranhão',            codigo: '21' },
  { sigla: 'MT', nome: 'Mato Grosso',         codigo: '51' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul',  codigo: '50' },
  { sigla: 'MG', nome: 'Minas Gerais',        codigo: '31' },
  { sigla: 'PA', nome: 'Pará',                codigo: '15' },
  { sigla: 'PB', nome: 'Paraíba',             codigo: '25' },
  { sigla: 'PR', nome: 'Paraná',              codigo: '41' },
  { sigla: 'PE', nome: 'Pernambuco',          codigo: '26' },
  { sigla: 'PI', nome: 'Piauí',               codigo: '22' },
  { sigla: 'RJ', nome: 'Rio de Janeiro',      codigo: '33' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', codigo: '24' },
  { sigla: 'RS', nome: 'Rio Grande do Sul',   codigo: '43' },
  { sigla: 'RO', nome: 'Rondônia',            codigo: '11' },
  { sigla: 'RR', nome: 'Roraima',             codigo: '14' },
  { sigla: 'SC', nome: 'Santa Catarina',      codigo: '42' },
  { sigla: 'SP', nome: 'São Paulo',           codigo: '35' },
  { sigla: 'SE', nome: 'Sergipe',             codigo: '28' },
  { sigla: 'TO', nome: 'Tocantins',           codigo: '17' },
] as const

export type SiglaUf = (typeof UFS)[number]['sigla']

export function ufValida(sigla: string): sigla is SiglaUf {
  return UFS.some(uf => uf.sigla === sigla)
}

/**
 * Falha EXPLÍCITO para sigla que não existe, em vez de cair num padrão.
 *
 * Mandar UF errada pra SEFAZ não devolve "UF errada": devolve rejeição
 * genérica, que já custou tempo de diagnóstico aqui. Melhor a consulta nem
 * sair — o erro fica gravado em `ultimo_erro` e aparece no /radar-fiscal.
 */
export function codigoDaUf(sigla: string): string {
  const uf = UFS.find(u => u.sigla === sigla)
  if (!uf) {
    throw new Error(
      `UF "${sigla}" não é uma sigla válida — cadastre a UF do certificado em /admin/certificados. ` +
      'Sem isso a consulta não sai pra SEFAZ, que devolveria rejeição genérica em vez de dizer que é a UF.',
    )
  }
  return uf.codigo
}

/** UF pelo fim do endereço da sede ("Cuiabá – MT", "Cuiabá/MT"); null se não der para saber. */
export function ufDoEndereco(endereco: string | null): SiglaUf | null {
  const ultima = (endereco ?? '').trim().match(/(?:^|[\s,/–-])([A-Za-z]{2})\.?$/)?.[1]?.toUpperCase()
  return ultima && ufValida(ultima) ? ultima : null
}
