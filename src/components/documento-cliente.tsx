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
        className={completo && !doc.ok ? 'border-destructive focus-visible:ring-destructive/50' : ''}
      />
      {completo && !doc.ok && <p className="text-xs text-destructive">{doc.erro}</p>}
      {doc.ok && !ocultarValido && (
        <p className="text-xs text-success">✓ {rotuloDocumento(doc.documento)} válido</p>
      )}
    </>
  )
}

export function TipoPessoaEtiqueta({ documento }: { documento: string }) {
  const tipo = tipoPessoaSeCompleto(documento)
  if (!tipo) return null
  return tipo === 'juridica'
    ? <span className="text-xs text-info bg-info/10 border border-info/30 rounded px-1.5 py-0.5">Pessoa jurídica</span>
    : <span className="text-xs text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">Pessoa física</span>
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
    <div className="col-span-2 rounded-md border border-border bg-muted p-3 grid grid-cols-2 gap-3">
      <p className="col-span-2 text-sm font-medium text-foreground">Representante legal</p>
      <p className="col-span-2 text-xs text-muted-foreground">
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
          className={digitos && !valido ? 'border-warning focus-visible:ring-warning/50' : ''}
        />
        {digitos && !valido && (
          <p className="text-xs text-warning">⚠ CPF parece inválido — confira. Dá para salvar assim.</p>
        )}
        {valido && <p className="text-xs text-success">✓ CPF válido</p>}
      </div>
    </div>
  )
}

/**
 * Contribuinte de ICMS do comprador CNPJ: vai na nota fiscal (indIEDest). Sem
 * escolha é não contribuinte, o caso mais comum. Contribuinte sem a IE só avisa:
 * a venda grava, e a emissão da nota mostra a pendência.
 */
export function ContribuinteIcmsCampos({ indicador, inscricaoEstadual, onIndicadorChange, onInscricaoEstadualChange }: {
  indicador: string
  inscricaoEstadual: string
  onIndicadorChange: (v: string) => void
  onInscricaoEstadualChange: (v: string) => void
}) {
  return (
    <div className="col-span-2 rounded-md border border-border bg-muted p-3 grid grid-cols-2 gap-3">
      <p className="col-span-2 text-sm font-medium text-foreground">Contribuinte de ICMS</p>
      <p className="col-span-2 text-xs text-muted-foreground">
        Vai na nota fiscal. Na dúvida, pergunte à empresa ou consulte o CNPJ no Sintegra.
      </p>
      <div className="col-span-2 space-y-1">
        <Label htmlFor="indicador-ie">A empresa é</Label>
        <select
          id="indicador-ie"
          value={indicador || 'nao_contribuinte'}
          onChange={e => onIndicadorChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground"
        >
          <option value="nao_contribuinte">Não contribuinte (sem inscrição estadual)</option>
          <option value="contribuinte">Contribuinte, com inscrição estadual</option>
          <option value="isento">Isenta de inscrição estadual</option>
        </select>
      </div>
      {indicador === 'contribuinte' && (
        <div className="col-span-2 space-y-1">
          <Label htmlFor="inscricao-estadual">Inscrição estadual</Label>
          <Input
            id="inscricao-estadual"
            value={inscricaoEstadual}
            onChange={e => onInscricaoEstadualChange(e.target.value)}
            placeholder="Só os números"
            inputMode="numeric"
          />
          {!soDigitosDoc(inscricaoEstadual) && (
            <p className="text-xs text-warning">Sem a inscrição estadual a nota fiscal não sai. Dá para salvar e completar depois.</p>
          )}
        </div>
      )}
    </div>
  )
}
