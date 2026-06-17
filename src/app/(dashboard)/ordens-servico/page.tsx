import { getUsuarioLogado } from '@/lib/auth'
import { listarOSPorLoja, listarTodasOS } from '@/lib/queries/ordens-servico'
import { db } from '@/lib/db'
import { motos, modelos, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { OSCard } from './components/os-card'
import { AbrirOSDialog } from './components/abrir-os-dialog'

export default async function OrdensServicoPage() {
  const usuario = await getUsuarioLogado()

  const [lista, mecanicos] = await Promise.all([
    ['admin_geral', 'admin_socio'].includes(usuario.papel)
      ? listarTodasOS()
      : listarOSPorLoja(usuario.lojaId!),
    db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.papel, 'mecanico')),
  ])

  const motosParaOS = ['admin_geral', 'admin_socio'].includes(usuario.papel)
    ? await db
        .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
        .from(motos)
        .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    : await db
        .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
        .from(motos)
        .innerJoin(modelos, eq(motos.modeloId, modelos.id))
        .where(eq(motos.lojaId, usuario.lojaId!))

  const abertas = lista.filter(o => o.status !== 'concluida')
  const concluidas = lista.filter(o => o.status === 'concluida')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-slate-500 text-sm">Acompanhamento de manutenções</p>
        </div>
        <AbrirOSDialog motos={motosParaOS} mecanicos={mecanicos} papel={usuario.papel} />
      </div>

      {abertas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Em Aberto ({abertas.length})</h2>
          {abertas.map(o => (
            <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {concluidas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Concluídas</h2>
          {concluidas.map(o => (
            <OSCard key={o.id} os={o} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhuma ordem de serviço registrada.</p>
      )}
    </div>
  )
}
