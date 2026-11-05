'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TIPOS_CHAVE_PIX, type TipoChavePix } from '@/lib/dados-funcionario'

// Tipo e chave PIX: o funcionário em /completar-cadastro e o admin em /admin/dados-funcionarios.
export function CamposPix({ id, tipo, chave, onTipo, onChave, ajuda }: {
  /** Prefixo dos ids, único na página (a lista do admin tem um diálogo por linha). */
  id: string
  tipo: TipoChavePix
  chave: string
  onTipo: (tipo: TipoChavePix) => void
  onChave: (chave: string) => void
  ajuda?: Record<TipoChavePix, string>
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-tipo`}>Tipo da chave PIX</Label>
        {/* <select> nativo de propósito: o <Select> do base-ui mostra o value cru
            quando ele difere do rótulo (valor "cpf", rótulo "CPF"). */}
        <select id={`${id}-tipo`} value={tipo}
                onChange={e => onTipo(e.target.value as TipoChavePix)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          {TIPOS_CHAVE_PIX.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-chave`}>Chave PIX</Label>
        <Input id={`${id}-chave`} value={chave} onChange={e => onChave(e.target.value)} />
        {ajuda && <p className="text-xs text-muted-foreground">{ajuda[tipo]}</p>}
      </div>
    </>
  )
}
