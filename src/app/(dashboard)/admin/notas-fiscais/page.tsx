import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { notagatewayConfig, regrasFiscaisSaida, certificadosDigitais, motos, motosFiscal, lojas } from '@/lib/db/schema'
import { eq, sql, and, isNull } from 'drizzle-orm'
import { NotasFiscaisClient } from './components/notas-fiscais-client'
import { getUsuarioLogado } from '@/lib/auth'
import { listarGruposVisiveis } from '@/lib/grupo'
import { credencialParaTela } from '@/lib/notagateway/credencial-tela'

/**
 * Configuração fiscal por grupo, para a emissão de NF-e própria.
 *
 * Por grupo e não global porque cada um é um CNPJ com contabilidade separada —
 * e porque o MOVA vai ser vendido para outros lojistas, cada um com a sua
 * credencial, o seu certificado e a regra que o contador dele definir.
 */
export default async function NotasFiscaisPage() {
  const usuario = await getUsuarioLogado()
  const [todosGrupos, configs, regras, certificados, prontidao] = await Promise.all([
    // Só os grupos que o usuário vê: o sócio não enxerga nem mexe na configuração fiscal de outro CNPJ.
    listarGruposVisiveis(usuario),
    db.select().from(notagatewayConfig),
    db.select().from(regrasFiscaisSaida),
    db
      .select({
        grupoId: certificadosDigitais.grupoId,
        titular: certificadosDigitais.titular,
        cnpj: certificadosDigitais.cnpj,
        validoAte: certificadosDigitais.validoAte,
        uf: certificadosDigitais.uf,
      })
      .from(certificadosDigitais),
    // Quantas motos em estoque já têm ficha fiscal — é o que diz se o grupo
    // consegue emitir hoje ou vai esbarrar em conferência manual.
    db
      .select({
        grupoId: lojas.grupoId,
        emEstoque: sql<number>`count(*)::int`,
        comFicha: sql<number>`count(${motosFiscal.motoId})::int`,
      })
      .from(motos)
      .innerJoin(lojas, eq(lojas.id, motos.lojaId))
      .leftJoin(motosFiscal, eq(motosFiscal.motoId, motos.id))
      .where(eq(motos.disponibilidade, 'disponivel'))
      .groupBy(lojas.grupoId),
  ])

  const porGrupo = new Map(configs.map(c => [c.grupoId, c]))
  const regraPorGrupo = new Map(regras.map(r => [r.grupoId, r]))
  const certPorGrupo = new Map(certificados.map(c => [c.grupoId, c]))
  const prontoPorGrupo = new Map(prontidao.map(p => [p.grupoId, p]))

  const linhas = todosGrupos.map(g => {
    const cfg = porGrupo.get(g.id)
    const regra = regraPorGrupo.get(g.id)
    const cert = certPorGrupo.get(g.id)
    const pr = prontoPorGrupo.get(g.id)
    return {
      grupoId: g.id,
      grupoNome: g.nome,
      credencial: cfg ? credencialParaTela(cfg) : null,
      regra: regra
        ? {
            naturezaOperacao: regra.naturezaOperacao,
            cfopInterno: regra.cfopInterno,
            cstIcmsInterno: regra.cstIcmsInterno,
            cfopInterestadual: regra.cfopInterestadual,
            cstIcmsInterestadual: regra.cstIcmsInterestadual,
            aliquotaIcmsInterestadual: regra.aliquotaIcmsInterestadual ?? '',
            cstPis: regra.cstPis,
            aliquotaPis: regra.aliquotaPis ?? '',
            cstCofins: regra.cstCofins,
            aliquotaCofins: regra.aliquotaCofins ?? '',
            cstIpi: regra.cstIpi ?? '',
            cstIbsCbs: regra.cstIbsCbs ?? '',
            classTribIbsCbs: regra.classTribIbsCbs ?? '',
            crt: regra.crt,
            origemFixa: regra.origemFixa ?? '',
            ibptFederal: regra.ibptFederal ?? '',
            ibptEstadual: regra.ibptEstadual ?? '',
          }
        : null,
      certificado: cert
        ? {
            titular: cert.titular,
            cnpj: cert.cnpj,
            uf: cert.uf,
            validoAte: cert.validoAte.toISOString(),
          }
        : null,
      estoque: { total: pr?.emEstoque ?? 0, comFicha: pr?.comFicha ?? 0 },
    }
  })

  return (
    <AdminGuard href="/admin/notas-fiscais">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Notas Fiscais</h1>
          <p className="text-muted-foreground text-sm">
            Credencial, certificado e regra de tributação de saída — um conjunto por grupo, porque
            cada grupo é um CNPJ com contabilidade própria.
          </p>
        </div>
        <NotasFiscaisClient grupos={linhas} />
      </div>
    </AdminGuard>
  )
}
