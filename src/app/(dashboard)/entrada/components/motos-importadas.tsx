'use client'

import { CurrencyInput } from '@/components/ui/currency-input'
import { agruparPorNfEModelo, type MotoImportada } from '@/lib/entrada-lista'
import { estadoDaSelecao, type EstadoDaSelecao } from '@/lib/selecao'

type Modelo = { id: string; modelo: string; marca: string }

type Props = {
  linhas: MotoImportada[]
  modelos: Modelo[]
  /** Posições marcadas na lista. */
  marcadas: ReadonlySet<number>
  onMarcar: (indices: number[], ligar: boolean) => void
  onTrocarModelo: (indices: number[], modeloId: string) => void
  onPreco: (idx: number, preco: string) => void
  onExcluir: () => void
  onLimpar: () => void
  /** Durante o envio do registro. */
  travado: boolean
}

const caixinha = 'size-4 cursor-pointer accent-primary'
// No celular a tabela vira cartões: cada linha empilha as células, com a caixinha no canto.
const celula = 'px-2 py-1 max-md:block max-md:p-0.5'
const rotuloCelular = 'text-muted-foreground md:hidden'

function CaixaDoModelo({ estado, rotulo, onMarcar }: { estado: EstadoDaSelecao; rotulo: string; onMarcar: (ligar: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={rotulo}
      className={caixinha}
      checked={estado === 'todas'}
      ref={el => { if (el) el.indeterminate = estado === 'parte' }}
      onChange={() => onMarcar(estado !== 'todas')}
    />
  )
}

/** Lista das motos lidas do XML ou da planilha, antes do "Registrar entrada" (#686). */
export function MotosImportadas({ linhas, modelos, marcadas, onMarcar, onTrocarModelo, onPreco, onExcluir, onLimpar, travado }: Props) {
  const qtdMarcadas = marcadas.size
  return (
    <div className="bg-card rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">Motos importadas ({linhas.length})</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExcluir}
            disabled={travado || qtdMarcadas === 0}
            className="min-h-9 rounded-md border border-destructive px-3 text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Excluir selecionadas ({qtdMarcadas})
          </button>
          <button type="button" onClick={onLimpar} disabled={travado} className="px-1 py-1.5 text-sm text-destructive hover:opacity-80 disabled:opacity-40">
            Limpar
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Marque as motos e clique em Excluir selecionadas.</p>

      {agruparPorNfEModelo(linhas).map(({ nf, total, modelos: modelosDaNf }) => (
        <div key={nf} className="space-y-3">
          <div className="flex items-center gap-2 border-b pb-2">
            <span className="text-sm font-semibold text-foreground">NF {nf}</span>
            <span className="text-xs bg-info/10 text-info px-2 py-0.5 rounded-full">{total} moto(s)</span>
          </div>

          {modelosDaNf.map(({ modelo, motos }) => {
            const indices = motos.map(m => m.idx)
            const estado = estadoDaSelecao(indices, marcadas)
            const rotuloDoModelo = `Marcar todas as ${modelo} da NF ${nf}`
            const marcarModelo = (ligar: boolean) => onMarcar(indices, ligar)
            // O bloco só tem um modelo escolhido quando todas as suas motos
            // apontam pro mesmo; senão o select abre vazio, esperando escolha.
            const idsNoGrupo = new Set(motos.map(m => m.moto.modeloId))
            const modeloIdDoGrupo = idsNoGrupo.size === 1 ? [...idsNoGrupo][0] : ''
            return (
              <div key={`${nf}-${modelo}`} className="border rounded-md p-3 space-y-2 md:ml-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{modelo}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{motos.length} un.</span>
                  <select
                    value={modeloIdDoGrupo}
                    onChange={e => onTrocarModelo(indices, e.target.value)}
                    className={`border rounded px-2 py-1 text-xs ${modeloIdDoGrupo ? '' : 'border-destructive/50 text-destructive bg-destructive/10'}`}
                  >
                    <option value="">Escolha o modelo cadastrado...</option>
                    {modelos.map(m => (
                      <option key={m.id} value={m.id}>{m.marca} {m.modelo}</option>
                    ))}
                  </select>
                  {!modeloIdDoGrupo && (
                    <span className="text-xs text-destructive font-medium">
                      Modelo não cadastrado: escolha o equivalente
                    </span>
                  )}
                  <label className="ml-auto flex items-center gap-2 text-xs md:hidden">
                    <CaixaDoModelo estado={estado} rotulo={rotuloDoModelo} onMarcar={marcarModelo} />
                    Marcar todas
                  </label>
                </div>
                <table className="w-full text-xs max-md:block">
                  <thead className="max-md:hidden">
                    <tr className="border-b text-muted-foreground">
                      <th className="w-8 px-2 py-1 text-left">
                        <CaixaDoModelo estado={estado} rotulo={rotuloDoModelo} onMarcar={marcarModelo} />
                      </th>
                      <th className="text-left px-2 py-1 w-8">#</th>
                      <th className="text-left px-2 py-1">Chassi</th>
                      <th className="text-left px-2 py-1">Motor</th>
                      <th className="text-left px-2 py-1">Cor</th>
                      <th className="text-left px-2 py-1 w-32">Preço de compra</th>
                    </tr>
                  </thead>
                  <tbody className="max-md:block max-md:space-y-2">
                    {motos.map(({ moto: m, idx }, i) => {
                      const marcada = marcadas.has(idx)
                      return (
                        <tr
                          key={idx}
                          className={`md:border-b md:last:border-0 max-md:relative max-md:block max-md:rounded-md max-md:border max-md:p-2 ${marcada ? 'bg-destructive/10' : ''}`}
                        >
                          <td className={`${celula} max-md:absolute max-md:right-2 max-md:top-2`}>
                            <input
                              type="checkbox"
                              aria-label={`Marcar ${m.chassi}`}
                              className={caixinha}
                              checked={marcada}
                              onChange={() => onMarcar([idx], !marcada)}
                            />
                          </td>
                          <td className={`${celula} text-muted-foreground max-md:hidden`}>{i + 1}</td>
                          <td className={`${celula} font-mono`}><span className={rotuloCelular}>Chassi: </span>{m.chassi}</td>
                          <td className={`${celula} font-mono`}><span className={rotuloCelular}>Motor: </span>{m.motor}</td>
                          <td className={celula}><span className={rotuloCelular}>Cor: </span>{m.cor}</td>
                          <td className={celula}>
                            <CurrencyInput
                              value={m.preco}
                              onChange={v => onPreco(idx, v)}
                              placeholder="0,00"
                              aria-label={`Preço de compra ${m.chassi}`}
                              className="h-7 text-xs max-md:w-40"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
