'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cpfValido, lerDocumentoCliente, mascararCpfCnpj, rotuloDocumento, soDigitosDoc, tipoPessoaSeCompleto } from '@/lib/documento'

/**
 * Campo CPF/CNPJ do comprador: máscara enquanto digita e o resultado da
 * conferência embaixo. O erro só aparece com o documento completo, para não
 * ficar vermelho a cada tecla.
 */
export function DocumentoClienteInput({ value, onChange, autoFocus, ocultarValido }: {
  value: string
  onChange: (mascarado: string) => void
  autoFocus?: boolean
  /** Esconde o "✓ válido" (ex.: enquanto a busca do cadastro roda). */
  ocultarValido?: boolean
}) {
  const completo = tipoPessoaSeCompleto(value) !== null
  const doc = lerDocumentoCliente(value)
  return (
    <>
      <Input
        value={value}
        onChange={e => onChange(mascararCpfCnpj(e.target.value))}
        placeholder="CPF ou CNPJ"
        autoFocus={autoFocus}
        className={completo && !doc.ok ? 'border-red-400 focus-visible:ring-red-400' : ''}
      />
      {completo && !doc.ok && <p className="text-xs text-red-500">{doc.erro}</p>}
      {doc.ok && !ocultarValido && (
        <p className="text-xs text-green-600">✓ {rotuloDocumento(doc.documento)} válido</p>
      )}
    </>
  )
}

export function TipoPessoaEtiqueta({ documento }: { documento: string }) {
  const tipo = tipoPessoaSeCompleto(documento)
  if (!tipo) return null
  return tipo === 'juridica'
    ? <span className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">Pessoa jurídica</span>
    : <span className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">Pessoa física</span>
}

/**
 * Quem assina pela empresa na venda para PJ. Opcional, e o CPF inválido só
 * avisa: não vai para a nota, então segue o "avise, não bloqueie" (ADR-0015).
 */
export function RepresentanteLegalCampos({ nome, cpf, onNomeChange, onCpfChange }: {
  nome: string
  cpf: string
  onNomeChange: (v: string) => void
  onCpfChange: (mascarado: string) => void
}) {
  const digitos = soDigitosDoc(cpf)
  const valido = cpfValido(digitos)
  return (
    <div className="col-span-2 rounded-md border border-slate-200 bg-slate-50 p-3 grid grid-cols-2 gap-3">
      <p className="col-span-2 text-sm font-medium text-slate-700">Representante legal</p>
      <p className="col-span-2 text-xs text-slate-500">
        Opcional. Sai no contrato como &quot;neste ato representada por…&quot;. Sem ele, o contrato sai com a linha em branco.
      </p>
      <div className="col-span-2 space-y-1">
        <Label>Nome do representante</Label>
        <Input value={nome} onChange={e => onNomeChange(e.target.value)} placeholder="Quem assina pela empresa" />
      </div>
      <div className="col-span-2 space-y-1">
        <Label>CPF do representante</Label>
        <Input
          value={cpf}
          onChange={e => onCpfChange(mascararCpfCnpj(soDigitosDoc(e.target.value).slice(0, 11)))}
          placeholder="000.000.000-00"
          className={digitos && !valido ? 'border-amber-400 focus-visible:ring-amber-300' : ''}
        />
        {digitos && !valido && (
          <p className="text-xs text-amber-600">⚠ CPF parece inválido — confira. Dá para salvar assim.</p>
        )}
        {valido && <p className="text-xs text-green-600">✓ CPF válido</p>}
      </div>
    </div>
  )
}
