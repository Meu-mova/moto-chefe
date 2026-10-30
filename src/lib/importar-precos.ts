import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { precificacao } from '@/lib/db/schema'
import { listarApelidosDaConta, listarModelosDaConta } from '@/lib/modelos-da-conta'
import { casarComModelos, lerPlanilhaDePrecos } from '@/lib/planilha-precos'
import { chaveNome } from '@/lib/precificacao-modelos'

type Executor = Pick<typeof db, 'select'>

export type LinhaDaPrevia = {
  modeloId: string
  nome: string
  precoAtual: string | null
  precoNovo: string
  tipo: 'novo' | 'muda'
}

type Dados = { grupoId: string; contaId: string; matriz: unknown[][] }

/**
 * Planilha de preço do sócio (#522) contra a Precificação do grupo. Casa só com o catálogo
 * da Conta (nome ajustado, original e apelidos dela e da plataforma); o preço grava no
 * nome original, que é a chave da Precificação.
 */
export async function previaDaImportacao(dados: Dados, exec: Executor = db) {
  const lida = lerPlanilhaDePrecos(dados.matriz)
  if (!lida.linhas.length) return { ok: false as const, erro: lida.erros[0] ?? 'Planilha sem nenhum preço' }

  const [catalogo, apelidos, precos] = await Promise.all([
    listarModelosDaConta(dados.contaId, exec),
    listarApelidosDaConta(dados.contaId, exec),
    exec.select({ id: precificacao.id, nome: precificacao.nome, valorMinimo: precificacao.valorMinimo })
      .from(precificacao).where(eq(precificacao.grupoId, dados.grupoId)),
  ])
  const casaveis = catalogo.map(m => ({
    id: m.id,
    nomes: [m.modelo, m.modeloOriginal, ...apelidos.filter(a => a.modeloId === m.id).map(a => a.nome)],
  }))
  const { casados, avisos } = casarComModelos(lida.linhas, casaveis)

  const nomeOriginal = new Map(catalogo.map(m => [m.id, m.modeloOriginal]))
  const precoPorNome = new Map(precos.map(p => [chaveNome(p.nome), p]))
  const linhas: (LinhaDaPrevia & { precId: string | null })[] = []
  let iguais = 0
  for (const c of casados) {
    const nome = chaveNome(nomeOriginal.get(c.modeloId)!)
    const atual = precoPorNome.get(nome)
    const precoNovo = c.preco.toFixed(2)
    if (atual && Number(atual.valorMinimo) === Number(precoNovo)) { iguais++; continue }
    linhas.push({
      modeloId: c.modeloId,
      nome,
      precId: atual?.id ?? null,
      precoAtual: atual?.valorMinimo ?? null,
      precoNovo,
      tipo: atual ? 'muda' : 'novo',
    })
  }
  return { ok: true as const, linhas, iguais, avisos: [...lida.erros, ...avisos] }
}

/**
 * Grava a importação conferida na prévia. A planilha é lida de novo aqui: o navegador só
 * diz quais trocas aceita. Modelo sem preço no grupo sempre entra.
 */
export async function gravarImportacao(
  dados: Dados & { trocar: string[] },
  exec: Pick<typeof db, 'select' | 'transaction'> = db,
) {
  return exec.transaction(async tx => {
    const previa = await previaDaImportacao(dados, tx)
    if (!previa.ok) return previa
    const aceitas = new Set(dados.trocar)
    let gravados = 0
    for (const l of previa.linhas) {
      if (l.precId) {
        if (!aceitas.has(l.modeloId)) continue
        await tx.update(precificacao).set({ valorMinimo: l.precoNovo })
          .where(and(eq(precificacao.id, l.precId), eq(precificacao.grupoId, dados.grupoId)))
      } else {
        // Sem índice único em (grupo, nome): outra gravação pode ter criado a linha depois da prévia.
        const [existe] = await tx.select({ id: precificacao.id }).from(precificacao)
          .where(and(eq(precificacao.grupoId, dados.grupoId), sql`upper(btrim(${precificacao.nome})) = ${l.nome}`)).limit(1)
        if (existe) continue
        await tx.insert(precificacao).values({ grupoId: dados.grupoId, nome: l.nome, valorMinimo: l.precoNovo })
      }
      gravados++
    }
    return { ok: true as const, gravados }
  })
}
