import { FileSignature } from 'lucide-react'
import { AdminGuard, exigirAcessoPagina } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { categoriasDoGrupo, listarContratosDoGrupo, podeEditarContratos } from '@/lib/contratos-grupo'
import { ContratosClient } from './components/contratos-client'

/**
 * Contrato de compra e venda do grupo ativo, por categoria da moto (#502). O texto é do
 * grupo; o MOVA preenche os campos pela venda. aux_adm vê; sócio e admin_geral editam.
 */
export default async function ContratosPage() {
  await exigirAcessoPagina('/admin/contratos')
  const usuario = await getUsuarioLogado()
  const grupo = await grupoAtivoDaRequisicao(usuario)
  const versoes = await listarContratosDoGrupo(usuario, grupo.id)
  const categorias = await categoriasDoGrupo(grupo.id)

  return (
    <AdminGuard href="/admin/contratos">
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature size={22} /> Contratos
          </h1>
          <p className="text-muted-foreground text-sm">
            Contrato de venda de {grupo.nome}, por categoria da moto. Contrato já assinado continua com o texto da versão que valia na hora.
          </p>
        </div>
        {versoes
          ? (
            <ContratosClient
              categorias={categorias}
              versoes={versoes.map(v => ({ ...v, criadoEm: v.criadoEm.toISOString() }))}
              podeEditar={podeEditarContratos(usuario.papel)}
            />
          )
          : <p className="text-sm text-muted-foreground">Sem acesso a este grupo.</p>}
      </div>
    </AdminGuard>
  )
}
