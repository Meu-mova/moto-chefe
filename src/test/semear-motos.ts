import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario } from '@/test/semear-conta'

type Executor = Parameters<typeof semearContaBase>[0]

const idDe = async (tx: Executor, q: ReturnType<typeof sql>) =>
  ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0].id

/**
 * Conta com dois grupos, sócio de todos, sócio "parcial" (só o 1º grupo), aux_adm e um modelo, para os
 * testes de Arquivar e Remover moto. O chassi é `prefixo + nome + sufixo`; a NF de entrada, `NF<nome>77`.
 */
export async function semearContaComMotos(tx: Executor, prefixo: string, nome: string, cnpj: string, cnpj2: string) {
  const base = await semearContaBase(tx, { prefixo, nome, cnpj })
  // Segundo grupo da mesma Conta, que o sócio "parcial" não tem marcado.
  const outro = await semearGrupo(tx, base.contaId, { prefixo, nome: nome + '2', cnpj: cnpj2 })
  const auxId = await semearUsuario(tx, base, { papel: 'aux_adm', rotulo: 'aux' })
  const socioId = await semearUsuario(tx, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const modeloId = await idDe(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${prefixo + ' ' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const novaMoto = (sufixo: string, lojaId = base.lojaId, disp = 'disponivel') =>
    idDe(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${`${prefixo}${nome}${sufixo}`}, ${modeloId}, ${lojaId}, 'CINZA', ${'NF' + nome + '77'}, 'montada', ${disp}::disponibilidade_moto) returning id`)
  return {
    base, outro, auxId, socioId, novaMoto,
    socio: { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId, outro.grupoId], contaId: base.contaId },
    socioParcial: { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId },
    aux: { id: auxId, papel: 'aux_adm', lojaId: base.lojaId, gruposAcesso: [], contaId: base.contaId },
  }
}
