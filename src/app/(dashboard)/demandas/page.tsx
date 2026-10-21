import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { db } from '@/lib/db'
import { demandas, lojas, usuarios, modelos, motos } from '@/lib/db/schema'
import { eq, inArray, and, desc, asc } from 'drizzle-orm'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, contaDoGrupoAtivo } from '@/lib/grupo'
import { listarModelosDaConta } from '@/lib/modelos-da-conta'
import { NovaDemandaForm } from './components/nova-demanda-form'
import { DemandasTable } from './components/demandas-table'
import { DemandasFiltros } from './components/demandas-filtros'

const ADMINS = ['admin_geral', 'admin_socio']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

export default async function DemandasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; modelo?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/demandas')) redirect('/dashboard')
  const isAdmin = ADMINS.includes(usuario.papel)

  const lojasOpts = await listarLojasDoGrupoAtivo(usuario)

  // Escopo de loja: admin vê o grupo ativo inteiro, os demais só a própria loja.
  // O filtro da URL só pode restringir dentro do que a pessoa já podia ver.
  const lojasPermitidas = isAdmin
    ? await listarLojaIdsDoGrupoAtivo(usuario)
    : (usuario.lojaId ? [usuario.lojaId] : [])
  const lojaSel = parseParam(params.loja).filter(id => lojasPermitidas.includes(id))
  const lojaValues = lojaSel.length > 0 ? lojaSel : lojasPermitidas

  // Sem loja nenhuma no escopo não há o que listar (e inArray com [] não é opção).
  if (lojaValues.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Demandas</h1>
          <p className="text-slate-500 text-sm">Pedidos de motos que não estão no estoque</p>
        </div>
        <p className="text-sm text-slate-400 text-center py-12">
          Seu usuário não está vinculado a nenhuma loja.
        </p>
      </div>
    )
  }

  // UUID inválido na URL derruba a query no Postgres — filtra antes.
  const modeloSel = parseParam(params.modelo).filter(id => UUID_RE.test(id))

  // Só demandas abertas — atendidas saem da lista (histórico fica ligado à venda)
  const where = and(
    eq(demandas.status, 'aberta'),
    inArray(demandas.lojaId, lojaValues),
    modeloSel.length > 0 ? inArray(demandas.modeloId, modeloSel) : undefined,
  )

  const [lista, modelosOpts, modelosComDemanda, coresOpts] = await Promise.all([
    db
      .select({
        id: demandas.id,
        modelo: demandas.modelo,
        cor: demandas.cor,
        lojaNome: lojas.nome,
        solicitanteNome: usuarios.nome,
        criadoEm: demandas.criadoEm,
        sinalRecebido: demandas.sinalRecebido,
        valorSinal: demandas.valorSinal,
      })
      .from(demandas)
      .innerJoin(lojas, eq(demandas.lojaId, lojas.id))
      .innerJoin(usuarios, eq(demandas.solicitanteId, usuarios.id))
      .where(where)
      .orderBy(desc(demandas.sinalRecebido), asc(demandas.criadoEm)),
    contaDoGrupoAtivo(usuario).then(c => listarModelosDaConta(c)),
    // Opções do filtro: só os modelos que têm demanda aberta no escopo do usuário.
    // Ignora o filtro de modelo/loja de propósito — senão a lista encolhe e trava
    // a seleção de um segundo modelo.
    db
      .selectDistinct({ id: modelos.id, marca: modelos.marca, modelo: modelos.modelo })
      .from(demandas)
      .innerJoin(modelos, eq(demandas.modeloId, modelos.id))
      .where(and(eq(demandas.status, 'aberta'), inArray(demandas.lojaId, lojasPermitidas)))
      .orderBy(asc(modelos.marca), asc(modelos.modelo)),
    // Cores fechadas: a lista canônica é a das motos que já entraram no sistema.
    db.selectDistinct({ cor: motos.cor }).from(motos).orderBy(asc(motos.cor)),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Demandas</h1>
        <p className="text-slate-500 text-sm">
          Pedidos de motos que não estão no estoque
        </p>
      </div>

      <NovaDemandaForm
        lojas={lojasOpts}
        lojaIdFixa={isAdmin ? null : (usuario.lojaId ?? null)}
        modelos={modelosOpts}
        cores={coresOpts.map(c => c.cor)}
      />

      <DemandasFiltros
        lojas={lojasOpts}
        modelos={modelosComDemanda.map(m => ({ id: m.id, nome: `${m.marca} ${m.modelo}` }))}
        mostrarLoja={isAdmin}
      />

      <DemandasTable demandas={lista} isAdmin={isAdmin} />
    </div>
  )
}
