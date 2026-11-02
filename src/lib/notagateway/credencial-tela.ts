// O que a tela de /admin/notas-fiscais recebe da credencial da NG (#439). Vai no
// HTML/RSC da página: token e empresaId nunca entram, só se estão cadastrados.

import { ambienteDaNg } from './ambiente'

/**
 * Token e empresa gravados: é o que configNotaGateway exige para chamar a NG, e a mesma
 * condição que o loader da inutilização usa para dizer se o grupo tem credencial (#597).
 */
export function credencialCompleta(cfg: { token: string | null; empresaId: string | null }): boolean {
  return !!cfg.token && !!cfg.empresaId
}

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
