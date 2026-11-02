// O que a tela de /admin/notas-fiscais recebe da credencial da NG (#439). Vai no
// HTML/RSC da página: token e empresaId nunca entram, só se estão cadastrados.

import { ambienteDaNg } from './ambiente'

export type CredencialTela = {
  temToken: boolean
  temEmpresa: boolean
  ambiente: 'Homologacao' | 'Producao'
  certificadoEnviadoEm: string | null
}

export function credencialParaTela(cfg: {
  token: string | null
  empresaId: string | null
  ambiente: string
  certificadoEnviadoEm: Date | null
}): CredencialTela {
  return {
    temToken: !!cfg.token,
    temEmpresa: !!cfg.empresaId,
    ambiente: ambienteDaNg(cfg.ambiente),
    certificadoEnviadoEm: cfg.certificadoEnviadoEm?.toISOString() ?? null,
  }
}
