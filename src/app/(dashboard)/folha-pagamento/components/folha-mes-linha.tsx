'use client'
import { useState } from 'react'
import { situacaoValorReal } from '@/lib/folha-tela'
import { fmtBRL } from '@/lib/preco-minimo'
import type { FuncionarioFolha } from '@/lib/queries/folha'
import { CELULA, GRADE, NUMERO, SO_DESKTOP, SO_TABLET } from './folha-mes-grade'
import { FolhaMesDetalhe } from './folha-mes-detalhe'
import { SetaDetalhe } from './folha-seta-detalhe'
import { ValorOuZero } from './folha-mes-valor'
import { ValorRealInput } from './valor-real-input'

export type LinhaFolhaDados = FuncionarioFolha & { papelLabel: string }

const COR_DA_SITUACAO = { sem: 'text-muted-foreground', confere: 'text-success', diverge: 'text-destructive' } as const

// O estado "aberta" mora aqui: a linha tem `key` estável na tabela, então salvar o valor real
// (revalidatePath) não fecha o detalhe.
export function LinhaFolha({ f, mes }: { f: LinhaFolhaDados; mes: string }) {
  const [aberta, setAberta] = useState(false)
  const situacao = situacaoValorReal(f.valorReal, f.totalPagar)
  const idDetalhe = `detalhe-${f.id}`
  return (
    <div role="row" className={`${GRADE} border-t ${aberta ? 'bg-muted' : ''}`}>
      <div role="cell" className={CELULA}>
        <p className="wrap-anywhere font-medium hyphens-none">{f.nome}</p>
        <p className="text-xs text-muted-foreground"><span className="whitespace-nowrap">{f.papelLabel}</span> · <span className="whitespace-nowrap">{f.lojaNome}</span></p>
      </div>
      <div role="cell" className={`${NUMERO} ${SO_TABLET}`}><ValorOuZero valor={f.salario} /></div>
      <div role="cell" className={`${NUMERO} ${SO_TABLET}`}><ValorOuZero valor={f.comissao} /></div>
      <div role="cell" className={`${NUMERO} ${SO_DESKTOP}`}><ValorOuZero valor={f.premiacao} /></div>
      <div role="cell" className={`${NUMERO} ${SO_DESKTOP}`}><ValorOuZero valor={f.ajudaCusto} /></div>
      <div role="cell" className={`${NUMERO} ${SO_DESKTOP}`}><ValorOuZero valor={f.adiantamento} negativo /></div>
      <div role="cell" className={`${NUMERO} font-semibold`}>
        <span className={f.totalPagar < 0 ? 'text-destructive' : f.totalPagar === 0 ? 'text-muted-foreground' : ''}>{fmtBRL(f.totalPagar)}</span>
        {/* No celular a coluna do valor real não cabe: a situação dela vai embaixo do total. */}
        <span className={`block text-xs font-medium @[680px]/folha:hidden ${COR_DA_SITUACAO[situacao.tipo]}`}>{situacao.texto}</span>
      </div>
      {/* A seta aparece duas vezes, uma por posição, e a tela mostra só uma: no celular ela vem
          antes do campo (que fica dentro do detalhe, embaixo) e do tablet em diante vem depois
          dele, na ponta da linha. Assim a ordem do Tab é a ordem que o olho vê, sem `order`. */}
      <div role="cell" className="flex items-center justify-center @[680px]/folha:hidden">
        <SetaDetalhe nome={f.nome} aberta={aberta} alternar={() => setAberta(a => !a)} idDetalhe={idDetalhe} />
      </div>
      {/* O MESMO campo nos dois lugares: na coluna a partir do tablet; no celular, só dentro do
          detalhe aberto, embaixo dos blocos. Em branco, a folha segue valendo o calculado
          (ver valorEfetivo em queries/folha). */}
      <div role="cell" className={`${aberta ? 'order-2 col-span-full px-2.5 pb-3' : 'hidden'} @[680px]/folha:order-none @[680px]/folha:col-auto @[680px]/folha:block @[680px]/folha:px-2.5 @[680px]/folha:py-2.5`}>
        <p className="mb-1 text-xs text-muted-foreground @[680px]/folha:hidden">Valor real pago</p>
        <ValorRealInput usuarioId={f.id} nome={f.nome} mes={mes} valorReal={f.valorReal} totalPagar={f.totalPagar} />
      </div>
      <div role="cell" className="hidden items-center justify-center @[680px]/folha:flex">
        <SetaDetalhe nome={f.nome} aberta={aberta} alternar={() => setAberta(a => !a)} idDetalhe={idDetalhe} />
      </div>
      {aberta && (
        <div role="cell" id={idDetalhe} className="order-1 col-span-full px-2.5 pb-3 @[680px]/folha:order-none">
          <FolhaMesDetalhe f={f} />
        </div>
      )}
    </div>
  )
}
