'use server'
import { db } from '@/lib/db'
import { modelos, modeloBlingCodigos } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { contaDoGrupoAtivo, getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { normalizarModelo } from '@/lib/nfe-entrada'
import { avisoDeNomeRepetido, excluirModelo, salvarApelidosDoModelo, salvarMarcasDaConta } from '@/lib/modelos-da-conta'
import { contaDoModeloNovo, podeEditarModelo } from '@/lib/gestao-modelos'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

async function quemEdita() {
  const u = await getUsuarioLogado()
  return { papel: u.papel, contaId: u.papel === 'admin_geral' ? null : await contaDoGrupoAtivo(u) }
}

// Carrega o modelo e recusa se ele não é de quem edita (sócio só os da própria Conta).
async function modeloEditavel(id: string) {
  const quem = await quemEdita()
  const [modelo] = await db.select({ id: modelos.id, contaId: modelos.contaId }).from(modelos).where(eq(modelos.id, id)).limit(1)
  if (!modelo || !podeEditarModelo(quem, modelo)) throw new Error('Modelo não encontrado')
  return modelo
}

function camposDoForm(formData: FormData) {
  const texto = (campo: string) => String(formData.get(campo) ?? '').trim()
  const categoria = texto('categoria') as typeof modelos.categoria.enumValues[number]
  if (!modelos.categoria.enumValues.includes(categoria)) throw new Error('Categoria inválida')
  const campos = { marca: texto('marca'), modelo: texto('modelo'), categoria, potenciaW: texto('potencia_w') }
  if (!campos.marca || !campos.modelo || !campos.potenciaW) throw new Error('Preencha marca, modelo e potência')
  return campos
}

export async function criarModeloAction(formData: FormData): Promise<{ aviso: string | null }> {
  const quem = await quemEdita()
  const contaId = contaDoModeloNovo(quem)
  const campos = camposDoForm(formData)
  // Antes do insert, senão o próprio modelo novo conta como repetido.
  const aviso = await avisoDeNomeRepetido(contaId, campos.modelo, null)
  await db.insert(modelos).values({
    ...campos,
    // Motor e velocidade máx. não são do modelo (motor vem por moto no XML;
    // velocidade não é usada). Colunas NOT NULL, então gravam vazio.
    motor: '',
    velocidadeMax: '',
    contaId,
  })
  revalidatePath('/admin/modelos')
  return { aviso }
}

export async function editarModeloAction(id: string, formData: FormData): Promise<{ aviso: string | null }> {
  const modelo = await modeloEditavel(id)
  const campos = camposDoForm(formData)
  // `motor` e `velocidadeMax` ficam de fora do set de propósito — preservam o
  // valor dos modelos antigos que ainda os têm preenchidos.
  await db.update(modelos).set(campos).where(eq(modelos.id, id))
  revalidatePath('/admin/modelos')
  return { aviso: await avisoDeNomeRepetido(modelo.contaId, campos.modelo, id) }
}

export async function excluirModeloAction(id: string) {
  await modeloEditavel(id)
  await excluirModelo(id)
  revalidatePath('/admin/modelos')
}

export async function atualizarBlingCodigoAction(modeloId: string, codigo: string) {
  const u = await assertAdmin()
  const [modelo] = await db.select({ contaId: modelos.contaId }).from(modelos).where(eq(modelos.id, modeloId)).limit(1)
  if (!modelo) throw new Error('Modelo não encontrado')
  // Modelo da Conta não tem código Bling: o cliente novo emite pela Nota Gateway.
  if (modelo.contaId) throw new Error('Modelo da Conta não tem código Bling')
  const grupo = await getGrupoAtivo(u)

  if (!codigo.trim()) {
    await db.delete(modeloBlingCodigos)
      .where(and(eq(modeloBlingCodigos.modeloId, modeloId), eq(modeloBlingCodigos.grupoId, grupo.id)))
  } else {
    await db.insert(modeloBlingCodigos)
      .values({ modeloId, grupoId: grupo.id, codigo: codigo.trim() })
      .onConflictDoUpdate({
        target: [modeloBlingCodigos.modeloId, modeloBlingCodigos.grupoId],
        set: { codigo: codigo.trim() },
      })
  }
  revalidatePath('/admin/modelos')
}

/**
 * Cadastra os apelidos que as notas de entrada usam para um modelo.
 *
 * Existe porque o `infCpl` de alguns fornecedores usa um nome que não está no
 * catálogo — a LAIOUNS escreve "DRIFT" para o DRIFT CAR e "G5" para o PATINETE
 * G5 — e sem o de-para o chassi não encontra a ficha fiscal do item. Não dá
 * para resolver por semelhança de texto: adivinhar ali daria a classificação
 * de outro produto à moto.
 *
 * Recebe a lista inteira do modelo e substitui: é o que a edição inline manda,
 * e assim apagar um apelido é só tirá-lo do campo. Apelido já usado por OUTRO
 * modelo é recusado com o nome do dono — deixar passar reintroduziria a
 * ambiguidade que a tabela existe para eliminar.
 */
export async function salvarApelidosAction(modeloId: string, texto: string) {
  await modeloEditavel(modeloId)

  const apelidos = [...new Set(
    texto.split(',').map(a => normalizarModelo(a)).filter(Boolean),
  )]

  await salvarApelidosDoModelo(modeloId, apelidos)

  revalidatePath('/admin/modelos')
}

// Marcas que a Conta enxerga nas listas de escolha (#287). Nenhuma marcada = todas.
export async function salvarMarcasDaContaAction(contaId: string, marcas: string[]) {
  await assertAdmin()
  await salvarMarcasDaConta(contaId, marcas)
  revalidatePath('/admin/modelos')
}
