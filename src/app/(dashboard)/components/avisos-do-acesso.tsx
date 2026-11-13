'use client'
import { useState } from 'react'
import { gravarCookieDeUmAno } from '@/lib/cookie-do-navegador'
import { nomeDoCookieDaNovidade } from '@/lib/novidades/cookie'
import type { NovidadeDaVersao } from '@/lib/novidades/tipos'
import { ComunicadoModal, type Comunicado } from './comunicado-modal'
import { NovidadeModal } from './novidade-modal'

type Props = { novidade: NovidadeDaVersao | null; usuarioId: string; comunicados: Comunicado[] }

/**
 * Janelas de quem entra: as Novidades da versão primeiro e, depois do Entendi, os comunicados não
 * lidos. Uma de cada vez. A etapa é estado daqui, não da prop: o LIDO recarrega o layout, a
 * novidade volta nula, e o comunicado aberto não pode desmontar (AGENTS.md, Interface).
 */
export function AvisosDoAcesso({ novidade, usuarioId, comunicados }: Props) {
  const [viuNovidade, setViuNovidade] = useState(false)
  const mostrarNovidade = novidade !== null && !viuNovidade

  function entendi(versao: string) {
    try {
      gravarCookieDeUmAno(nomeDoCookieDaNovidade(usuarioId), versao)
    } catch (e) {
      // Sem o cookie a janela volta no próximo acesso; os comunicados não esperam por isso.
      console.error('[novidades] cookie:', e instanceof Error ? e.message : e)
    }
    setViuNovidade(true)
  }

  return (
    <>
      {mostrarNovidade && <NovidadeModal novidade={novidade} aoEntendi={() => entendi(novidade.versao)} />}
      {!mostrarNovidade && <ComunicadoModal comunicados={comunicados} />}
    </>
  )
}
