// ─── Quem gerencia quais usuários (#322, adendo ao ADR-0018) ──────────────────
// Regra pura, sem banco nem sessão. As actions de /admin/usuarios montam o gestor
// (grupos que ele vê, de @/lib/acesso-grupo) e o alvo, e recusam o que daqui vier.
//
// O sócio gerencia só quem está inteiro dentro dos grupos que ele vê, não a Conta
// inteira (adendo #193). "Inteiro": loja, grupos de acesso e de aprovação. Basta um
// grupo de fora para o usuário sair do alcance; senão o sócio trocaria a senha de um
// par com mais grupos e entraria por ele.

import { CARGO_INDISPONIVEL, CARGOS_VISIVEIS } from '@/lib/cargos-opcoes'

export type Gestor = {
  id: string
  papel: string
  gruposVisiveis: string[]
  /** Grupos onde o próprio gestor aprova (o da loja dele e os marcados). */
  gruposAprovacao: string[]
  itensLiberaveis: string[]
  aprovaPagamentoSensivel: boolean
}

export type AlvoGestao = {
  papel: string
  grupoDaLoja: string | null
  gruposAcesso: string[]
  gruposAprovacao: string[]
}

export type CadastroGestao = AlvoGestao & {
  modulosExtras: string[]
  modulosBloqueados: string[]
  aprovaPagamentoSensivel: boolean
  ativo: boolean
}

// Na persona do admin_rede (#517) também: ele vê só o grupo liberado, e podeGerenciar
// já deixa de fora quem tem qualquer outro grupo da Conta dona.
export function ehGestorDeUsuarios(gestor: { papel: string }): boolean {
  return gestor.papel === 'admin_geral' || gestor.papel === 'admin_socio'
}

function gruposDe(alvo: AlvoGestao): string[] {
  return [...(alvo.grupoDaLoja ? [alvo.grupoDaLoja] : []), ...alvo.gruposAcesso, ...alvo.gruposAprovacao]
}

export function podeGerenciar(gestor: Pick<Gestor, 'papel' | 'gruposVisiveis'>, alvo: AlvoGestao): boolean {
  if (gestor.papel === 'admin_geral') return true
  if (gestor.papel !== 'admin_socio') return false
  // admin_geral deveria estar sem loja, mas nada impõe isso: com loja num grupo do
  // sócio, ele trocaria a senha do admin_geral e entraria como tal.
  if (alvo.papel === 'admin_geral') return false
  // admin_rede fica acima do sócio (ADR-0019): só o admin_geral mexe nele.
  if (alvo.papel === 'admin_rede') return false
  const grupos = gruposDe(alvo)
  return grupos.length > 0 && grupos.every(g => gestor.gruposVisiveis.includes(g))
}

/** Mensagem de recusa, ou null se o gestor pode gravar. `antes` null = criação. */
export function recusaDaGravacao(
  gestor: Gestor,
  antes: (CadastroGestao & { id: string }) | null,
  depois: CadastroGestao,
): string | null {
  if (!CARGOS_VISIVEIS && depois.papel === 'cargo') return CARGO_INDISPONIVEL
  if (gestor.papel === 'admin_geral') return null
  if (gestor.papel !== 'admin_socio') return 'Sem permissão para gerenciar usuários'
  if (antes && !podeGerenciar(gestor, antes)) return 'Usuário fora do seu alcance'
  // Para a Conta não ficar sem sócio.
  if (antes?.id === gestor.id && (depois.papel !== antes.papel || !depois.ativo)) {
    return 'Você não pode desativar nem trocar o papel de si mesmo'
  }
  if (depois.papel === 'admin_geral') return 'Só o Admin Geral dá o papel Admin Geral'
  if (depois.papel === 'admin_rede') return 'Só o Admin Geral dá o papel Admin de Rede'
  // Sem loja nem grupo, o usuário sairia do alcance do próprio sócio que o criou.
  // Só o sócio usa grupos de acesso; os demais papéis precisam de loja.
  if (depois.grupoDaLoja === null && (depois.papel !== 'admin_socio' || depois.gruposAcesso.length === 0)) {
    return 'Escolha a loja do usuário'
  }
  if (!podeGerenciar(gestor, depois)) return 'Você só pode usar lojas e grupos que você mesmo vê'
  // Só o que o sócio acrescenta passa pelo limite de telas: o que o admin_geral já deu
  // ao usuário fica, senão o sócio não conseguiria nem corrigir o nome dele.
  const telasNovas = depois.modulosExtras.filter(id => !(antes?.modulosExtras ?? []).includes(id))
  // Tirar um bloqueio também devolve a tela: vale o mesmo limite.
  const desbloqueadas = (antes?.modulosBloqueados ?? []).filter(id => !depois.modulosBloqueados.includes(id))
  if (![...telasNovas, ...desbloqueadas].every(id => gestor.itensLiberaveis.includes(id))) {
    return 'Você só pode liberar telas que você mesmo tem'
  }
  // Ver um grupo não é aprovar nele: aprovação só onde o próprio sócio aprova.
  const aprovacoesNovas = depois.gruposAprovacao.filter(g => !(antes?.gruposAprovacao ?? []).includes(g))
  if (!aprovacoesNovas.every(g => gestor.gruposAprovacao.includes(g))) {
    return 'Você só pode dar aprovação nos grupos onde você mesmo aprova'
  }
  if (depois.aprovaPagamentoSensivel && !antes?.aprovaPagamentoSensivel && !gestor.aprovaPagamentoSensivel) {
    return 'Você só pode dar aprovação de pagamento sensível se você mesmo aprova'
  }
  return null
}

const PAPEIS = ['admin_geral', 'admin_rede', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo']

/** O que a tela de /admin/usuarios oferece: os mesmos limites que recusaDaGravacao confere. */
export function limitesDaTela(gestor: Gestor) {
  const geral = gestor.papel === 'admin_geral'
  return {
    meuId: gestor.id,
    podeExcluir: podeExcluir(gestor),
    papeis: (geral ? PAPEIS : PAPEIS.filter(p => p !== 'admin_geral' && p !== 'admin_rede')).filter(p => CARGOS_VISIVEIS || p !== 'cargo'),
    /** null = todas as telas. */
    itensLiberaveis: geral ? null : gestor.itensLiberaveis,
    aprovaPagamentoSensivel: geral || gestor.aprovaPagamentoSensivel,
    /** null = todos os grupos. */
    gruposAprovacao: geral ? null : gestor.gruposAprovacao,
    travaASiMesmo: !geral,
  }
}

export type LimitesDaTela = ReturnType<typeof limitesDaTela>

// Excluir apaga o login e esbarra no histórico (vendas, OS) que aponta para o usuário.
export function podeExcluir(gestor: { papel: string }): boolean {
  return gestor.papel === 'admin_geral'
}
