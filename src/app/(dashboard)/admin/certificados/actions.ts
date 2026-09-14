'use server'

import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { salvarCertificado, lerDadosDoPfx } from '@/lib/sefaz/certificado'
import { revalidatePath } from 'next/cache'

export async function enviarCertificado(formData: FormData): Promise<{ ok: true; titular: string } | { ok: false; erro: string }> {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') return { ok: false, erro: 'Sem permissão' }

  const arquivo = formData.get('arquivo')
  const senha = String(formData.get('senha') ?? '')
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: 'Escolha o arquivo .pfx ou .p12' }
  if (!senha) return { ok: false, erro: 'Informe a senha do certificado' }

  const grupo = await getGrupoAtivo(usuario)
  const pfx = Buffer.from(await arquivo.arrayBuffer())

  try {
    // Lê ANTES de gravar. Certificado do grupo errado tem que ser recusado sem
    // encostar no banco — gravar e depois reclamar deixaria o CNPJ errado
    // guardado, e a falha só apareceria na SEFAZ, como rejeição genérica.
    const dados = lerDadosDoPfx(pfx, senha)
    const cnpjDoGrupo = grupo.cnpj.replace(/\D/g, '')
    if (dados.cnpj !== cnpjDoGrupo) {
      return { ok: false, erro: `Este certificado é de ${dados.titular} (CNPJ ${dados.cnpj}), e o grupo ativo é ${grupo.nome} (CNPJ ${cnpjDoGrupo}). Troque de grupo no topo da tela ou envie o certificado certo.` }
    }

    await salvarCertificado(grupo.id, pfx, senha)
    revalidatePath('/admin/certificados')
    return { ok: true, titular: dados.titular }
  } catch (e) {
    // Nunca ecoar `senha` ou `pfx` aqui — só a mensagem do erro, que já vem sem
    // o conteúdo sensível (ver lerDadosDoPfx).
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao ler o certificado' }
  }
}
