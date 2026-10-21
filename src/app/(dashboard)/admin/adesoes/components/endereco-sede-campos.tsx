'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CepInput } from '@/components/ui/cep-input'
import { buscarEnderecoPorCep } from '@/lib/mascaras'
import type { EnderecoSede } from '@/lib/endereco-sede'

// Cenário A do protótipo (#292): CEP primeiro, que preenche logradouro, bairro,
// cidade e UF; tudo continua editável.

const CAMPOS: { chave: Exclude<keyof EnderecoSede, 'cep'>; rotulo: string; classe: string }[] = [
  { chave: 'logradouro', rotulo: 'Logradouro', classe: 'sm:col-span-4' },
  { chave: 'numero', rotulo: 'Número', classe: 'sm:col-span-2' },
  { chave: 'complemento', rotulo: 'Complemento (opcional)', classe: 'sm:col-span-3' },
  { chave: 'bairro', rotulo: 'Bairro', classe: 'sm:col-span-3' },
  { chave: 'cidade', rotulo: 'Cidade', classe: 'sm:col-span-4' },
  { chave: 'uf', rotulo: 'UF', classe: 'sm:col-span-2' },
]

export function EnderecoSedeCampos({ id, valor, onChange, disabled, erro, textoAntigo }: {
  id: string
  valor: EnderecoSede
  onChange: (patch: Partial<EnderecoSede>) => void
  disabled: boolean
  erro?: string
  /** Endereço gravado antes dos campos existirem: mostrado até ser substituído. */
  textoAntigo: string | null
}) {
  const [busca, setBusca] = useState<'buscando' | 'nao_achou' | null>(null)

  async function trocarCep(cep: string) {
    onChange({ cep })
    if (cep.replace(/\D/g, '').length !== 8) { setBusca(null); return }
    setBusca('buscando')
    const e = await buscarEnderecoPorCep(cep)
    setBusca(e ? null : 'nao_achou')
    // Só o que o ViaCEP trouxe; o resto (número, complemento) fica como está.
    if (e) onChange(Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Partial<EnderecoSede>)
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-sm font-medium">Endereço da sede</p>
      {textoAntigo && <p className="text-xs text-muted-foreground">Gravado antes: {textoAntigo}. Preencha os campos para substituir.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <Label htmlFor={`${id}-sede-cep`}>CEP</Label>
          <CepInput id={`${id}-sede-cep`} value={valor.cep} onChange={trocarCep} disabled={disabled} aria-invalid={!!erro} />
          {busca && <p className="text-xs text-muted-foreground">{busca === 'buscando' ? 'Buscando o CEP…' : 'CEP não encontrado: preencha à mão'}</p>}
        </div>
        <div className="hidden sm:block sm:col-span-4" />
        {CAMPOS.map(c => (
          <div key={c.chave} className={`${c.classe} space-y-1`}>
            <Label htmlFor={`${id}-sede-${c.chave}`}>{c.rotulo}</Label>
            <Input
              id={`${id}-sede-${c.chave}`}
              value={valor[c.chave]}
              maxLength={c.chave === 'uf' ? 2 : undefined}
              onChange={e => onChange({ [c.chave]: e.target.value })}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}
