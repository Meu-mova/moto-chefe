import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { db } from '@/lib/db'
import { modelos, modeloApelidos } from '@/lib/db/schema'
import { listarLojasDoGrupoAtivo, contaDoGrupoAtivo } from '@/lib/grupo'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { EntradaForm } from './components/entrada-form'

export default async function EntradaPage() {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) redirect('/dashboard')

  const lojasOpts = await listarLojasDoGrupoAtivo(usuario)

  const [modelosCadastrados, apelidos] = await Promise.all([
    // Só as marcas da Conta: modelo da nota de marca escondida aparece como não cadastrado.
    contaDoGrupoAtivo(usuario).then(c => listarModelosDaConta(c)),
    // Apelidos que as notas usam ("DRIFT" para DRIFT CAR). Ligam o chassi do
    // infCpl ao item da nota na hora de ler a ficha fiscal. Nao sao por grupo:
    // e como o FORNECEDOR escreve, e ele vende para os dois CNPJs.
    db
      .select({ nome: modeloApelidos.apelido, canonico: modelos.modelo, modeloId: modelos.id })
      .from(modeloApelidos)
      .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId)),
  ])

  const visiveis = new Set(modelosCadastrados.map(m => m.id))
  const apelidosVisiveis = apelidos.filter(a => visiveis.has(a.modeloId)).map(({ nome, canonico }) => ({ nome, canonico }))

  const modelosOpts = modelosCadastrados.map(({ id, modelo, marca }) => ({ id, modelo, marca }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Entrada de Motos</h1>
        <p className="text-slate-500 text-sm">Registrar motos recebidas da fábrica</p>
      </div>
      <EntradaForm modelos={modelosOpts} lojas={lojasOpts} apelidos={apelidosVisiveis} />
    </div>
  )
}
