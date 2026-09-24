import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { db } from '@/lib/db'
import { modelos, motos, historicoEstoque, modeloApelidos } from '@/lib/db/schema'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { EntradaForm } from './components/entrada-form'

// Último preço de compra praticado em cada modelo, para servir de sugestão quando
// o cadastro do modelo está sem preço padrão. Só olha as entradas das lojas do
// grupo ativo — preço de compra de um grupo não é palpite válido para o outro.
async function ultimoPrecoPorModelo(lojaIds: string[]) {
  if (!lojaIds.length) return new Map<string, string>()

  const linhas = await db
    .selectDistinctOn([motos.modeloId], { modeloId: motos.modeloId, preco: motos.precoCompra })
    .from(motos)
    .innerJoin(
      historicoEstoque,
      and(eq(historicoEstoque.motoId, motos.id), eq(historicoEstoque.tipo, 'entrada')),
    )
    .where(and(isNotNull(motos.precoCompra), inArray(motos.lojaId, lojaIds)))
    .orderBy(motos.modeloId, desc(historicoEstoque.data))

  return new Map(linhas.filter(l => l.preco).map(l => [l.modeloId, l.preco as string]))
}

export default async function EntradaPage() {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) redirect('/dashboard')

  const lojasOpts = await listarLojasDoGrupoAtivo(usuario)

  const [modelosCadastrados, ultimosPrecos, apelidos] = await Promise.all([
    db
      .select({ id: modelos.id, modelo: modelos.modelo, marca: modelos.marca, precoCompraPadrao: modelos.precoCompraPadrao })
      .from(modelos)
      .orderBy(modelos.marca, modelos.modelo),
    ultimoPrecoPorModelo(lojasOpts.map(l => l.id)),
    // Apelidos que as notas usam ("DRIFT" para DRIFT CAR). Ligam o chassi do
    // infCpl ao item da nota na hora de ler a ficha fiscal. Nao sao por grupo:
    // e como o FORNECEDOR escreve, e ele vende para os dois CNPJs.
    db
      .select({ nome: modeloApelidos.apelido, canonico: modelos.modelo })
      .from(modeloApelidos)
      .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId)),
  ])

  const modelosOpts = modelosCadastrados.map(m => ({
    ...m,
    ultimoPrecoCompra: ultimosPrecos.get(m.id) ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Entrada de Motos</h1>
        <p className="text-slate-500 text-sm">Registrar motos recebidas da fábrica</p>
      </div>
      <EntradaForm modelos={modelosOpts} lojas={lojasOpts} apelidos={apelidos} />
    </div>
  )
}
