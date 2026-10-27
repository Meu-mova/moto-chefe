// O que a tela de /admin/notas-fiscais recebe da credencial da NG (#439). Vai no
// HTML/RSC da página: token e empresaId nunca entram, só se estão cadastrados.

export type CredencialTela = {
  temToken: boolean
  temEmpresa: boolean
  ambiente: 'Homologacao' | 'Producao'
  serieNfe: string
  proximoNumero: number
  certificadoEnviadoEm: string | null
}

export function credencialParaTela(cfg: {
  token: string | null
  empresaId: string | null
  ambiente: string
  serieNfe: string
  proximoNumero: number
  certificadoEnviadoEm: Date | null
}): CredencialTela {
  return {
    temToken: !!cfg.token,
    temEmpresa: !!cfg.empresaId,
    ambiente: cfg.ambiente === 'Producao' ? 'Producao' : 'Homologacao',
    serieNfe: cfg.serieNfe,
    proximoNumero: cfg.proximoNumero,
    certificadoEnviadoEm: cfg.certificadoEnviadoEm?.toISOString() ?? null,
  }
}
