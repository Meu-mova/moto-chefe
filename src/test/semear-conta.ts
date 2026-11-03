import { sql } from 'drizzle-orm'

/**
 * Parte comum da semente dos testes de banco: Conta, grupo, loja e usuários.
 * Cada arquivo passa o seu `prefixo` e o helper o põe em todo nome e e-mail. Ele tem que ser único
 * entre os `*.db.test.ts` (o teste em `semear-conta.test.ts` confere): os arquivos rodam em paralelo
 * no mesmo banco e `usuarios.email` é UNIQUE.
 *
 * Não importa `@/lib/db`: a URL do banco só vale depois do `before` de cada teste. Por isso `tx` é
 * tipado pelo que o helper usa (`execute`), que serve ao `Tx` de qualquer arquivo.
 */
type Executor = { execute(q: ReturnType<typeof sql>): Promise<unknown> }

export type Base = { prefixo: string; nome: string; contaId: string; grupoId: string; lojaId: string }

function exigirPrefixo(prefixo: string) {
  if (!prefixo.trim()) throw new Error('prefixo da semente é obrigatório (nomes e e-mails ficam únicos por arquivo)')
}

export function nomeDeTeste(prefixo: string, nome: string, rotulo?: string): string {
  exigirPrefixo(prefixo)
  return [rotulo, prefixo, nome].filter(Boolean).join(' ')
}

// O hífen entre as partes impede que prefixos que começam igual (CG, CG449) colidam.
export function emailDeTeste(prefixo: string, nome: string, rotulo: string): string {
  exigirPrefixo(prefixo)
  return `${rotulo}-${prefixo}-${nome}@teste.invalid`.toLowerCase()
}

const idDoInsert = async (tx: Executor, q: ReturnType<typeof sql>) =>
  ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0].id

export const semearLoja = (tx: Executor, grupoId: string, nome: string) =>
  idDoInsert(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${nome}, 'C', 'R', ${grupoId}) returning id`)

export const semearContaVazia = (tx: Executor, { prefixo, nome }: { prefixo: string; nome: string }) =>
  idDoInsert(tx, sql`insert into contas (nome) values (${nomeDeTeste(prefixo, nome)}) returning id`)

export async function semearGrupo(tx: Executor, contaId: string, { prefixo, nome, cnpj }: { prefixo: string; nome: string; cnpj: string }) {
  const grupoId = await idDoInsert(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${nomeDeTeste(prefixo, nome)}, ${cnpj}, ${contaId}) returning id`)
  return { grupoId, lojaId: await semearLoja(tx, grupoId, nomeDeTeste(prefixo, nome, 'Loja')) }
}

export async function semearContaBase(tx: Executor, { prefixo, nome, cnpj }: { prefixo: string; nome: string; cnpj: string }): Promise<Base> {
  const contaId = await semearContaVazia(tx, { prefixo, nome })
  return { prefixo, nome, contaId, ...(await semearGrupo(tx, contaId, { prefixo, nome, cnpj })) }
}

type OpcoesDeUsuario = {
  papel: string
  /** Nome e parte do e-mail; precisa mudar quando a mesma Conta tem 2 usuários do mesmo papel. */
  rotulo?: string
  /** Nome gravado em `usuarios.nome`; padrão: o rótulo. */
  nomeDoUsuario?: string
  /** Sem loja (sócio e admin). */
  semLoja?: boolean
  /** Acesso ao grupo da base (`grupos_acesso`). */
  comGrupo?: boolean
  /** Vinculado direto à Conta (`conta_id`). */
  comConta?: boolean
}

export function semearUsuario(tx: Executor, base: Base, { papel, rotulo = papel, nomeDoUsuario = rotulo, semLoja = false, comGrupo = false, comConta = false }: OpcoesDeUsuario) {
  return idDoInsert(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, grupos_acesso, conta_id)
    values (gen_random_uuid(), ${nomeDoUsuario}, ${emailDeTeste(base.prefixo, base.nome, rotulo)}, ${papel},
      ${semLoja ? null : base.lojaId}, ${comGrupo ? sql`array[${base.grupoId}]::uuid[]` : sql`'{}'::uuid[]`}, ${comConta ? base.contaId : null})
    returning id`)
}
