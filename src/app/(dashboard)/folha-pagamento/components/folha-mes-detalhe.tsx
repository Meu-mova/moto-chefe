import { descreverRegra } from '@/lib/folha-tela'
import { fmtBRL } from '@/lib/preco-minimo'
import type { FuncionarioFolha } from '@/lib/queries/folha'
import { ValorOuZero } from './folha-mes-valor'

function Bloco({ titulo, valor, valorClasse = '', className = '', children }: {
  titulo: string
  valor?: React.ReactNode
  /** Esconde o valor do topo onde a coluna dele já aparece na linha. */
  valorClasse?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section className={`min-w-0 rounded-lg border bg-card px-3 py-2.5 ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{titulo}</h3>
        {valor !== undefined && <b className={`whitespace-nowrap tabular-nums ${valorClasse}`}>{valor}</b>}
      </div>
      {children}
    </section>
  )
}

const Linhas = ({ children }: { children: React.ReactNode }) => <ul className="grid gap-0.5 text-[13px]">{children}</ul>
const Vazio = ({ texto }: { texto: string }) => <p className="text-[13px] text-muted-foreground">{texto}</p>
const Par = ({ rotulo, valor }: { rotulo: string; valor: number }) => (
  <li className="flex justify-between gap-3"><span>{rotulo}</span><span className="whitespace-nowrap tabular-nums">{fmtBRL(valor)}</span></li>
)

// O que a linha não mostra: de onde saiu cada valor. Celular: Salário e Ajuda de custo (curtos, lado
// a lado) e os outros em largura cheia; tablet: 2 colunas; desktop: 3 (Salário e Ajuda estão na linha).
export function FolhaMesDetalhe({ f }: { f: FuncionarioFolha }) {
  const comissao = f.regras.filter(r => r.tipo !== 'premiacao')
  const premiacao = f.regras.filter(r => r.tipo === 'premiacao')
  const cheio = 'col-span-full @[680px]/folha:col-auto'
  return (
    <div className="grid grid-cols-2 gap-2 @[960px]/folha:grid-cols-3">
      <Bloco titulo="Salário" valor={<ValorOuZero valor={f.salario} />} className="@[680px]/folha:hidden" />
      <Bloco titulo="Ajuda de custo" valor={<ValorOuZero valor={f.ajudaCusto} />} className="@[680px]/folha:order-1 @[960px]/folha:hidden">
        {f.ajudaCusto <= 0 && <Vazio texto="Sem ajuda de custo neste mês" />}
      </Bloco>
      <Bloco titulo="Comissão" valor={<ValorOuZero valor={f.comissao} />} valorClasse="@[680px]/folha:hidden" className={cheio}>
        {comissao.length > 0
          ? <Linhas>{comissao.map(r => <li key={r.id}>{descreverRegra(r)}</li>)}</Linhas>
          : <Vazio texto="Sem regra de comissão neste mês" />}
      </Bloco>
      <Bloco titulo="Premiação (OTE)" valor={<ValorOuZero valor={f.premiacao} />} valorClasse="@[960px]/folha:hidden" className={cheio}>
        {f.premiacaoFaixa > 0 || premiacao.length > 0
          ? <Linhas>
              {f.premiacaoFaixa > 0 && <Par rotulo="Faixa OTE atingida" valor={f.premiacaoFaixa} />}
              {premiacao.map(r => <li key={r.id}>{descreverRegra(r)}</li>)}
            </Linhas>
          : <Vazio texto="Sem premiação neste mês" />}
      </Bloco>
      <Bloco titulo="Adiantamento" valor={<ValorOuZero valor={f.adiantamento} negativo />} valorClasse="@[960px]/folha:hidden" className={`${cheio} @[680px]/folha:order-2`}>
        {f.adiantamento > 0
          ? <Linhas><Par rotulo="Fixo" valor={f.adiantamentoFixo} /><Par rotulo="Eventual" valor={f.adiantamentoEventual} /></Linhas>
          : <Vazio texto="Sem adiantamento neste mês" />}
      </Bloco>
    </div>
  )
}
