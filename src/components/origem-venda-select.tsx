'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OrigemParaEscolher } from '@/lib/queries/origens-venda'

type Props = {
  origens: OrigemParaEscolher[]
  origemId: string
  onOrigemChange: (id: string) => void
  detalhe: string
  onDetalheChange: (v: string) => void
}

/**
 * Campo "por onde o cliente chegou", usado nos três lugares que fecham venda
 * (vender, efetivar pedido e editar).
 *
 * `<select>` nativo de propósito: o value é UUID e o label é o nome, que é
 * exatamente o caso em que o <Select> do @base-ui/react mostra o UUID na tela.
 * <optgroup> por tipo para a lista não virar uma parede quando o Cesar
 * cadastrar as campanhas.
 */
export function OrigemVendaSelect({
  origens,
  origemId,
  onOrigemChange,
  detalhe,
  onDetalheChange,
}: Props) {
  const escolhida = origens.find(o => o.id === origemId)
  const tipos = [...new Set(origens.map(o => o.tipo))]

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>Por onde o cliente chegou <span className="text-destructive">*</span></Label>
        <select
          value={origemId}
          onChange={e => onOrigemChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Selecione…</option>
          {tipos.map(tipo => (
            <optgroup key={tipo} label={tipo}>
              {origens.filter(o => o.tipo === tipo).map(o => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {origens.length === 0 && (
          <p className="text-xs text-warning">
            Nenhuma origem cadastrada para este grupo — cadastre em Admin → Origens da venda.
          </p>
        )}
      </div>

      {escolhida?.pedeDetalhe && (
        <div className="space-y-1">
          <Label>Detalhe <span className="text-destructive">*</span></Label>
          <Input
            value={detalhe}
            onChange={e => onDetalheChange(e.target.value)}
            placeholder="Quem indicou, qual evento, qual parceiro…"
          />
        </div>
      )}
    </div>
  )
}

/** Mesma regra do servidor, para o botão não deixar enviar o que a action recusaria. */
export function origemPreenchida(
  origens: OrigemParaEscolher[],
  origemId: string,
  detalhe: string,
): boolean {
  const escolhida = origens.find(o => o.id === origemId)
  if (!escolhida) return false
  if (escolhida.pedeDetalhe && !detalhe.trim()) return false
  return true
}
