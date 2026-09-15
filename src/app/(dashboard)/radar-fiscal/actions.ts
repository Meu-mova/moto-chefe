'use server'

import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { sincronizarGrupo } from '@/lib/sefaz/sincronizar'
import { CSTAT_DOCUMENTO_LOCALIZADO, CSTAT_NENHUM_DOCUMENTO, CSTAT_CONSUMO_INDEVIDO } from '@/lib/sefaz/nsu'
import { revalidatePath } from 'next/cache'

export type ResultadoAtualizacao = { ok: boolean; mensagem: string }

/**
 * Atualização manual da leitura da SEFAZ, para o grupo ativo.
 *
 * Roda o MESMO `sincronizarGrupo` do cron — inclusive a reivindicação atômica
 * da janela. A trava de 1 hora não é reimplementada aqui, nem contornada: se a
 * janela estiver fechada, `sincronizarGrupo` devolve 'esperando' sem mandar
 * nada pra SEFAZ. O botão desabilitado na tela é conveniência, não é a defesa
 * — quem garante é o UPSERT condicional lá dentro, que é o único ponto capaz
 * de barrar duas execuções simultâneas (esta e a do cron, por exemplo).
 */
export async function atualizarLeituraSefaz(): Promise<ResultadoAtualizacao> {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/radar-fiscal')) return { ok: false, mensagem: 'Sem permissão' }

  const grupo = await getGrupoAtivo(usuario)
  const r = await sincronizarGrupo(grupo)
  revalidatePath('/radar-fiscal')

  if (r.status === 'esperando') {
    return { ok: false, mensagem: 'Ainda dentro da janela de 1 hora da SEFAZ — nada foi consultado.' }
  }
  if (r.status === 'sem_certificado') {
    return { ok: false, mensagem: 'Este grupo não tem certificado digital cadastrado. Envie em /admin/certificados.' }
  }
  if (r.status === 'erro') {
    return { ok: false, mensagem: r.erro ?? 'Falha ao falar com a SEFAZ.' }
  }

  // status 'ok' NÃO quer dizer que a SEFAZ aceitou: a chamada foi bem-sucedida
  // e o cStat foi gravado, mas 656 (consumo indevido) chega exatamente assim —
  // 'ok' com zero documento. Dizer "nenhuma nota nova" aqui esconderia uma
  // recusa que precisa de ação. Foi o caso real do grupo Vale em 14/09.
  if (r.cStat === CSTAT_CONSUMO_INDEVIDO) {
    return {
      ok: false,
      mensagem: 'A SEFAZ recusou por consumo indevido (656) — a fila deste CNPJ já foi lida ' +
        'recentemente, possivelmente por outro sistema. A próxima tentativa só sai daqui a 1 hora.',
    }
  }
  if (r.cStat !== undefined && r.cStat !== CSTAT_DOCUMENTO_LOCALIZADO && r.cStat !== CSTAT_NENHUM_DOCUMENTO) {
    return { ok: false, mensagem: `A SEFAZ respondeu cStat ${r.cStat}, que não é um retorno normal. Nada foi lido.` }
  }

  if (r.documentos === 0) return { ok: true, mensagem: 'Nenhum documento novo na SEFAZ.' }
  return {
    ok: true,
    mensagem: r.documentos === 1
      ? '1 documento lido da SEFAZ.'
      : `${r.documentos} documentos lidos da SEFAZ.`,
  }
}
