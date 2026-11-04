import { fmtBRL } from '@/lib/preco-minimo'
import type { FolhaDoMes } from '@/lib/queries/folha'
import { CELULA, GRADE, NUMERO, SO_DESKTOP, SO_TABLET, TITULO } from './folha-mes-grade'
import { ValorOuZero } from './folha-mes-valor'
import { LinhaFolha, type LinhaFolhaDados } from './folha-mes-linha'

// Tabela da Folha do Mês: celular mostra nome e total; tablet acrescenta salário, comissão e valor
// real; desktop mostra tudo. Faixas pela largura do conteúdo (container `folha`, ver FolhaCasca).
export function FolhaMesTabela({ ativos, totais, mes }: { ativos: LinhaFolhaDados[]; totais: FolhaDoMes['totais']; mes: string }) {
  return (
    <div role="table" aria-label="Folha do mês" className="overflow-hidden rounded-lg border bg-card text-sm">
      <div role="row" className={`${GRADE} bg-muted ${TITULO}`}>
        <div role="columnheader" className={CELULA}>Funcionário</div>
        <div role="columnheader" className={`${NUMERO} ${SO_TABLET}`}>Salário</div>
        <div role="columnheader" className={`${NUMERO} ${SO_TABLET}`}>Comissão</div>
        <div role="columnheader" className={`${NUMERO} ${SO_DESKTOP}`}>Premiação</div>
        <div role="columnheader" className={`${CELULA} ${SO_DESKTOP} text-right`}>Ajuda de custo</div>
        <div role="columnheader" className={`${NUMERO} ${SO_DESKTOP}`}>Adiantamento</div>
        <div role="columnheader" className={NUMERO}>Total a pagar</div>
        <div role="columnheader" className={`${NUMERO} ${SO_TABLET}`}>Valor real pago</div>
        <div role="columnheader" className="sr-only">Detalhes</div>
      </div>
      {ativos.map(f => <LinhaFolha key={f.id} f={f} mes={mes} />)}
      {ativos.length === 0 && (
        <div role="row"><div role="cell" className="border-t py-8 text-center text-muted-foreground">Nenhum funcionário ativo configurado.</div></div>
      )}
      {ativos.length > 0 && (
        <div role="row" className={`${GRADE} border-t bg-muted font-semibold`}>
          <div role="cell" className={CELULA}>Total ({ativos.length})</div>
          <div role="cell" className={`${NUMERO} ${SO_TABLET}`}>{fmtBRL(totais.salarios)}</div>
          <div role="cell" className={`${NUMERO} ${SO_TABLET}`}>{fmtBRL(totais.comissoes)}</div>
          <div role="cell" className={`${NUMERO} ${SO_DESKTOP}`}>{fmtBRL(totais.premiacoes)}</div>
          <div role="cell" className={`${NUMERO} ${SO_DESKTOP}`}>{fmtBRL(totais.ajudaCusto)}</div>
          <div role="cell" className={`${NUMERO} ${SO_DESKTOP}`}><ValorOuZero valor={totais.adiantamentos} negativo /></div>
          <div role="cell" className={NUMERO}>{fmtBRL(totais.geral)}</div>
          <div role="cell" className={`${NUMERO} ${SO_TABLET} text-info`}>{fmtBRL(totais.efetivo)}</div>
        </div>
      )}
    </div>
  )
}
