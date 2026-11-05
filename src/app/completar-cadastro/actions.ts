'use server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { usuariosDados } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import {
  normalizarCpf, validarPix, normalizarChavePix, nascimentoValido,
  type TipoChavePix,
} from '@/lib/dados-funcionario'
import { cpfValido } from '@/lib/documento'

type Entrada = {
  cpf: string
  pixTipo: TipoChavePix
  pixChave: string
  dataNascimento: string   // "YYYY-MM-DD"
}

export async function salvarDadosFuncionarioAction(
  dados: Entrada,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const usuario = await getUsuarioLogado()

  if (!cpfValido(dados.cpf)) return { ok: false, erro: 'CPF inválido — confira os números.' }
  const erroPix = validarPix(dados.pixTipo, dados.pixChave)
  if (erroPix) return { ok: false, erro: erroPix }
  if (!nascimentoValido(dados.dataNascimento, new Date())) {
    return { ok: false, erro: 'Data de nascimento inválida.' }
  }

  const valores = {
    cpf: normalizarCpf(dados.cpf),
    pixTipo: dados.pixTipo,
    pixChave: normalizarChavePix(dados.pixTipo, dados.pixChave),
    dataNascimento: dados.dataNascimento,
    atualizadoEm: new Date(),
  }

  // Mesma tela serve para preencher e para corrigir depois.
  await db.insert(usuariosDados)
    .values({ usuarioId: usuario.id, ...valores })
    .onConflictDoUpdate({ target: usuariosDados.usuarioId, set: valores })

  // A trava que barra o acesso mora no layout do dashboard. Sem invalidar o
  // layout, a navegação seguinte pode reaproveitar a árvore já renderizada —
  // que foi montada quando a pessoa ainda não tinha dados — e devolvê-la ao
  // formulário.
  revalidatePath('/', 'layout')

  return { ok: true }
}
