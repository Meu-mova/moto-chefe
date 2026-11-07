'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CepInput } from '@/components/ui/cep-input'
import { useBuscaCep } from '@/components/use-busca-cep'
import { faltamNoEnderecoSede, limparEnderecoSede, montarEnderecoSede, type EnderecoSede } from '@/lib/endereco-sede'
import { UFS } from '@/lib/sefaz/uf'

// Cenário A do protótipo (#292): CEP primeiro, que preenche logradouro, bairro,
// cidade e UF; tudo continua editável.

const CAMPOS: { chave: Exclude<keyof EnderecoSede, 'cep' | 'uf'>; rotulo: string; classe: string }[] = [
  { chave: 'logradouro', rotulo: 'Logradouro', classe: 'sm:col-span-4' },
  { chave: 'numero', rotulo: 'Número', classe: 'sm:col-span-2' },
  { chave: 'complemento', rotulo: 'Complemento (opcional)', classe: 'sm:col-span-3' },
  { chave: 'bairro', rotulo: 'Bairro', classe: 'sm:col-span-3' },
  { chave: 'cidade', rotulo: 'Cidade', classe: 'sm:col-span-4' },
]

export function EnderecoSedeCampos({ id, valor, onChange, disabled, erro, linhaAtual }: {
  id: string
  valor: EnderecoSede
  onChange: (patch: Partial<EnderecoSede>) => void
  disabled: boolean
  erro?: string
  /** Linha gravada hoje: é a que vale no contrato enquanto os campos estiverem incompletos. */
  linhaAtual: string | null
}) {
  const montada = montarEnderecoSede(limparEnderecoSede(valor))
  const faltam = faltamNoEnderecoSede(limparEnderecoSede(valor))
  // Só o que o ViaCEP trouxe; o resto (número, complemento) fica como está.
  const { busca, buscar } = useBuscaCep(({ logradouro, bairro, cidade, uf }) =>
    onChange(Object.fromEntries(Object.entries({ logradouro, bairro, cidade, uf }).filter(([, v]) => v))))

  function trocarCep(cep: string) {
    onChange({ cep })
    buscar(cep)
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-sm font-medium">Endereço da sede</p>
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
              onChange={e => onChange({ [c.chave]: e.target.value })}
              disabled={disabled}
            />
          </div>
        ))}
        <div className="sm:col-span-2 space-y-1">
          <Label htmlFor={`${id}-sede-uf`}>UF</Label>
          {/* select nativo: lista fechada evita UF inválida. */}
          <select
            id={`${id}-sede-uf`}
            value={valor.uf}
            onChange={e => onChange({ uf: e.target.value })}
            disabled={disabled}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.sigla}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {montada ? <>Vai no contrato como: <span className="text-foreground">{montada}</span></>
          : linhaAtual ? <>Faltam {faltam.join(', ')}. Enquanto isso, o contrato usa: <span className="text-foreground">{linhaAtual}</span></>
          : <>Faltam {faltam.join(', ')} para o contrato.</>}
      </p>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  )
}
