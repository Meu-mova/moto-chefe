// Rodada diária do Mercado Pago: importa cada grupo com credencial. Um grupo que falha
// não para os outros; o erro devolvido é só a mensagem conhecida (nunca token nem corpo cru).
import { RecusaUsuario } from '@/lib/resultado-action'
import { ErroMercadoPago } from './cliente'
import { gruposComMercadoPago, importarMercadoPagoDoGrupo, type ResultadoImportacaoMp } from './importar'

export type ResultadoRodadaMp = { grupo: string; ok: boolean; resultado?: ResultadoImportacaoMp; erro?: string }

export async function rodarTodosOsGrupos(deps: {
  grupos?: typeof gruposComMercadoPago
  importar?: typeof importarMercadoPagoDoGrupo
} = {}): Promise<ResultadoRodadaMp[]> {
  const grupos = deps.grupos ?? gruposComMercadoPago
  const importar = deps.importar ?? importarMercadoPagoDoGrupo
  const saida: ResultadoRodadaMp[] = []
  for (const g of await grupos()) {
    try {
      saida.push({ grupo: g.nome, ok: true, resultado: await importar(g.id) })
    } catch (e) {
      const erro = e instanceof ErroMercadoPago || e instanceof RecusaUsuario ? e.message : 'erro interno'
      console.error(`[conciliacao-mercadopago] ${g.nome}: ${erro}`)
      saida.push({ grupo: g.nome, ok: false, erro })
    }
  }
  return saida
}
