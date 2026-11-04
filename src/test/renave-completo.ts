import type { DadosRenave } from '@/lib/notagateway/veiculo'

/** Veículo novo sintético com todos os campos da RENAVE preenchidos, em faturamento direto (tpOp 2). */
export const RENAVE_COMPLETO_FATURAMENTO_DIRETO: DadosRenave = {
  chassi: '9C2ABC12345678901', tipoOperacao: 'FaturamentoDiretoConsumidorFinal',
  corCodigo: '11', corDescricao: 'PRETA', corDenatran: 'Preta', potenciaMotor: '1000', unidadePotencia: 'W',
  cilindradas: '0', pesoLiquido: '0.0850', pesoBruto: '0.2350', numeroSerie: '45678901',
  tipoCombustivel: '07', numeroMotor: 'TESTE650', capacidadeMaximaTracao: '0', distanciaEixos: '1300',
  anoModelo: '2027', anoFabricacao: '2026', tipoPintura: 'S', tipoVeiculo: '02', especie: 'Passageiro',
  condicaoVin: 'Normal', condicao: 'Acabado', codigoMarcaModelo: '012345', lotacao: '2', restricao: 'NaoHa',
}
