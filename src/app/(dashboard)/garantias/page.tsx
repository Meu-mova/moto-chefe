import { getUsuarioLogado } from '@/lib/auth'
import { listarGarantiasPorLoja, listarTodasGarantias } from '@/lib/queries/garantias'
import { db } from '@/lib/db'
import { motos, modelos, ordensServico } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { GarantiaCard } from './components/garantia-card'
import { AbrirGarantiaDialog } from './components/abrir-garantia-dialog'

export default async function GarantiasPage() {
  const usuario = await getUsuarioLogado()

  const motosParaGarantia = usuario.papel === 'admin_geral'
    ? await db
        .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
        .from(motos)
        .innerJoin(modelos, eq(motos.modeloId, modelos.id))
        .where(inArray(motos.status, ['faturada', 'montada', 'disponivel', 'em_garantia']))
    : await db
        .select({ id: motos.id, chassi: motos.chassi, marca: modelos.marca, modelo: modelos.modelo })
        .from(motos)
        .innerJoin(modelos, eq(motos.modeloId, modelos.id))
        .where(and(
          inArray(motos.status, ['faturada', 'montada', 'disponivel', 'em_garantia']),
          eq(motos.lojaId, usuario.lojaId!),
        ))

  const [lista, ordensAbertas] = await Promise.all([
    usuario.papel === 'admin_geral'
      ? listarTodasGarantias()
      : listarGarantiasPorLoja(usuario.lojaId!),
    db
      .select({ id: ordensServico.id, descricao: ordensServico.descricao, motoId: ordensServico.motoId })
      .from(ordensServico)
      .where(inArray(ordensServico.status, ['aberta', 'em_andamento'])),
  ])

  const ativas = lista.filter(g => g.status === 'ativa')
  const encerradas = lista.filter(g => g.status === 'encerrada')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Garantias</h1>
          <p className="text-slate-500 text-sm">Acompanhamento de garantias</p>
        </div>
        <AbrirGarantiaDialog motos={motosParaGarantia} ordens={ordensAbertas} papel={usuario.papel} />
      </div>

      {ativas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Ativas ({ativas.length})</h2>
          {ativas.map(g => (
            <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {encerradas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Encerradas</h2>
          {encerradas.map(g => (
            <GarantiaCard key={g.id} garantia={g} papel={usuario.papel} lojaIdUsuario={usuario.lojaId ?? null} />
          ))}
        </section>
      )}

      {lista.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhuma garantia registrada.</p>
      )}
    </div>
  )
}
