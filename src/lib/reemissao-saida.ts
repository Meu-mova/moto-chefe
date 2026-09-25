// O Sicoob às vezes reemite as transações de um dia com ID novo: em 24/09/2026 as
// saídas de 21/09 voltaram com o horário real (antes vinham à meia-noite) e a
// descrição em caixa alta sem os "@". O sync deduplica só pelo transacao_id, então
// gravou tudo de novo e cada saída já lançada passou a contar duas vezes — o PIX de
// R$ 12.528,91 entre elas.
//
// Reemissão = linha nova com a mesma conta, dia (Brasília), valor e descrição
// normalizada de uma linha antiga cujo ID SUMIU da resposta do banco. Exigir que o
// ID antigo tenha sumido é o que protege pedágios legítimos de mesmo valor no mesmo
// dia: nesses casos as duas IDs continuam vindo do banco.

export type SaidaParaParear = {
  id: string
  contaId: string
  data: Date
  valor: string
  descricao: string | null
}

const TRES_HORAS_MS = 3 * 60 * 60 * 1000

function diaEmBrasilia(data: Date): string {
  return new Date(data.getTime() - TRES_HORAS_MS).toISOString().slice(0, 10)
}

function descricaoNormalizada(descricao: string | null): string {
  return (descricao ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9*]/g, '')
}

export function chaveReemissao(s: SaidaParaParear): string {
  return [s.contaId, diaEmBrasilia(s.data), Number(s.valor).toFixed(2), descricaoNormalizada(s.descricao)].join('|')
}

/** Pareia cada linha nova com uma antiga sumida da mesma chave, uma a uma. */
export function parearReemissoes(
  novas: SaidaParaParear[],
  antigasSumidas: SaidaParaParear[],
): { nova: SaidaParaParear; antiga: SaidaParaParear }[] {
  const filas = new Map<string, SaidaParaParear[]>()
  for (const a of [...antigasSumidas].sort((x, y) => x.data.getTime() - y.data.getTime())) {
    const chave = chaveReemissao(a)
    const fila = filas.get(chave)
    if (fila) fila.push(a)
    else filas.set(chave, [a])
  }

  const pares: { nova: SaidaParaParear; antiga: SaidaParaParear }[] = []
  for (const n of [...novas].sort((x, y) => x.data.getTime() - y.data.getTime())) {
    const antiga = filas.get(chaveReemissao(n))?.shift()
    if (antiga) pares.push({ nova: n, antiga })
  }
  return pares
}
