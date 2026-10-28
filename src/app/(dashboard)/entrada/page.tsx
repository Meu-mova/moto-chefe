import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, contaDoGrupoAtivo } from '@/lib/grupo'
import { listarApelidosDaConta, listarModelosDaConta } from '@/lib/modelos-da-conta'
import { redirect } from 'next/navigation'
import { EntradaForm } from './components/entrada-form'

export default async function EntradaPage() {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) redirect('/dashboard')

  const lojasOpts = await listarLojasDoGrupoAtivo(usuario)

  const conta = await contaDoGrupoAtivo(usuario)
  const [modelosCadastrados, apelidos] = await Promise.all([
    // Só as marcas da Conta: modelo da nota de marca escondida aparece como não cadastrado.
    listarModelosDaConta(conta),
    // Apelidos que as notas usam ("DRIFT" para DRIFT CAR). Ligam o chassi do
    // infCpl ao item da nota na hora de ler a ficha fiscal.
    listarApelidosDaConta(conta),
  ])

  const visiveis = new Set(modelosCadastrados.map(m => m.id))
  const apelidosVisiveis = apelidos.filter(a => visiveis.has(a.modeloId)).map(({ nome, canonico, modeloId }) => ({ nome, canonico, modeloId }))

  const modelosOpts = modelosCadastrados.map(({ id, modelo, marca, nomeOriginal }) => ({ id, modelo, marca, nomeOriginal }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Entrada de motos e peças</h1>
        <p className="text-muted-foreground text-sm">Registrar motos e peças recebidas pela nota fiscal</p>
      </div>
      <EntradaForm modelos={modelosOpts} lojas={lojasOpts} apelidos={apelidosVisiveis} />
    </div>
  )
}
