'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  OPCOES_COMBUSTIVEL, OPCOES_CONDICAO, OPCOES_CONDICAO_VIN, OPCOES_COR_DENATRAN, OPCOES_ESPECIE,
  OPCOES_RESTRICAO, OPCOES_UNIDADE_POTENCIA, SUGESTOES_PINTURA, converterPotencia, OPCOES_TIPO_OPERACAO, OPCOES_TIPO_VEICULO,
  type DadosRenave, type OrigemRenave,
} from '@/lib/notagateway/veiculo'

type Props = {
  dados: DadosRenave
  origem: OrigemRenave
  onChange: (atualizar: (prev: DadosRenave) => DadosRenave) => void
}

/** Equivalência e o que vai no XML. O leiaute descreve o pot em CV; a unidade é escolha da loja. */
function dicaPotencia(valor: string, unidade: string): string {
  const outra = unidade === 'W' ? 'CV' : 'W'
  const eq = unidade === 'W' || unidade === 'CV' ? converterPotencia(valor, unidade, outra) : ''
  if (!valor.trim()) return 'Até 4 caracteres.'
  const xml = `Vai no XML: <pot>${valor.trim()}</pot> (${unidade || 'sem unidade'}).`
  return eq ? `${xml} Equivale a ${eq} ${outra}.` : xml
}

/**
 * Dados do veículo que o ciclomotor leva na NF de saída (grupo veicProd) e o
 * RENAVE usa no emplacamento. Preenchidos no ato do envio: vão junto com a
 * transmissão, que valida e grava o que foi enviado na moto. Ao lado de cada
 * campo, de onde veio o valor; campo vazio fica em destaque até ser preenchido.
 */
export function RenaveForm({ dados, origem, onChange }: Props) {
  const set = (campo: keyof DadosRenave) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const valor = e.target.value
    onChange(prev => ({ ...prev, [campo]: valor }))
  }
  const vazio = (campo: keyof DadosRenave) => !String(dados[campo] ?? '').trim()

  const rotulo = (campo: keyof DadosRenave, texto: string, lista: boolean) => (
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={`renave-${campo}`}>{texto}</Label>
      {vazio(campo)
        ? <span className="text-xs text-destructive">{lista ? 'escolha' : 'preencha'}</span>
        : origem[campo] && <span className="text-xs text-muted-foreground">{origem[campo]}</span>}
    </div>
  )

  const texto = (campo: keyof DadosRenave, nome: string, extra?: { placeholder?: string; numerico?: boolean; dica?: string; sugestoes?: [string, string][] }) => (
    <div className="space-y-1">
      {rotulo(campo, nome, false)}
      <Input
        id={`renave-${campo}`}
        value={dados[campo]}
        onChange={set(campo)}
        inputMode={extra?.numerico ? 'decimal' : undefined}
        placeholder={extra?.placeholder}
        list={extra?.sugestoes ? `renave-${campo}-sugestoes` : undefined}
        aria-invalid={vazio(campo) || undefined}
        className={cn(vazio(campo) && 'border-destructive')}
      />
      {extra?.sugestoes && (
        <datalist id={`renave-${campo}-sugestoes`}>
          {extra.sugestoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </datalist>
      )}
      {extra?.dica && <p className="text-xs text-muted-foreground">{extra.dica}</p>}
    </div>
  )

  const opcoes = (campo: keyof DadosRenave, nome: string, lista: [string, string][]) => (
    <div className="space-y-1">
      {rotulo(campo, nome, true)}
      <select
        id={`renave-${campo}`}
        value={dados[campo]}
        onChange={set(campo)}
        aria-invalid={vazio(campo) || undefined}
        className={cn('h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm', vazio(campo) && 'border-destructive')}
      >
        {!lista.some(([v]) => v === dados[campo]) && <option value={dados[campo]}>Escolha…</option>}
        {lista.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <p className="font-medium">Dados do veículo (RENAVE)</p>
        <p className="text-sm text-muted-foreground">
          Ciclomotor leva estes dados na nota para o emplacamento. Confira tudo no documento do fabricante antes de emitir.
        </p>
        <p className="text-xs text-muted-foreground">
          Ao lado de cada campo, de onde veio o valor: da moto, da nota de entrada ou da última moto do mesmo modelo.
          Em <span className="text-destructive">vermelho</span>, o que falta escolher ou preencher.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm font-medium sm:col-span-2">Desta moto</p>
        {texto('chassi', 'Chassi', { dica: '17 letras e números. Corrige só a nota, não o cadastro.' })}
        {texto('numeroMotor', 'Número do motor')}
        {texto('numeroSerie', 'Número de série', { dica: 'Até 9 caracteres.' })}
        {texto('anoFabricacao', 'Ano de fabricação', { numerico: true, placeholder: '2026' })}
        {texto('anoModelo', 'Ano do modelo', { numerico: true, placeholder: '2026' })}
        {texto('corDescricao', 'Cor (descrição)', { placeholder: 'PRETA' })}
        {opcoes('corDenatran', 'Cor DENATRAN', OPCOES_COR_DENATRAN)}
        {texto('corCodigo', 'Código da cor', { dica: 'Da montadora, até 4 caracteres. Sem ele, use o da cor DENATRAN.' })}
        {texto('tipoPintura', 'Tipo de pintura', { placeholder: 'S', sugestoes: SUGESTOES_PINTURA, dica: 'Uma letra, como na nota de entrada. Comuns: S sólida, M metálica, P perolizada.' })}

        <p className="pt-2 text-sm font-medium sm:col-span-2">Do modelo</p>
        {texto('codigoMarcaModelo', 'Código marca/modelo RENAVAM', { numerico: true, placeholder: '143402', dica: 'Até 6 dígitos, da tabela RENAVAM.' })}
        {opcoes('tipoVeiculo', 'Tipo de veículo', OPCOES_TIPO_VEICULO)}
        {opcoes('especie', 'Espécie', OPCOES_ESPECIE)}
        {opcoes('tipoCombustivel', 'Combustível', OPCOES_COMBUSTIVEL)}
        <div className="space-y-1">
          {rotulo('potenciaMotor', 'Potência', false)}
          <div className="flex gap-2">
            <Input
              id="renave-potenciaMotor"
              value={dados.potenciaMotor}
              onChange={set('potenciaMotor')}
              inputMode="decimal"
              aria-invalid={vazio('potenciaMotor') || undefined}
              className={cn(vazio('potenciaMotor') && 'border-destructive')}
            />
            <select
              aria-label="Unidade da potência"
              value={dados.unidadePotencia}
              onChange={e => {
                const para = e.target.value
                onChange(prev => ({ ...prev, unidadePotencia: para, potenciaMotor: converterPotencia(prev.potenciaMotor, prev.unidadePotencia, para) || prev.potenciaMotor }))
              }}
              className={cn('h-10 rounded-md border border-input bg-background px-2 text-base sm:text-sm', vazio('unidadePotencia') && 'border-destructive')}
            >
              {!OPCOES_UNIDADE_POTENCIA.some(([v]) => v === dados.unidadePotencia) && <option value={dados.unidadePotencia}>Escolha…</option>}
              {OPCOES_UNIDADE_POTENCIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{dicaPotencia(dados.potenciaMotor, dados.unidadePotencia)}</p>
        </div>
        {texto('cilindradas', 'Cilindradas', { numerico: true })}
        {texto('pesoLiquido', 'Peso líquido (toneladas)', { numerico: true, placeholder: '0,0850', dica: '85 kg = 0,0850' })}
        {texto('pesoBruto', 'Peso bruto (toneladas)', { numerico: true, placeholder: '0,2350' })}
        {texto('capacidadeMaximaTracao', 'Capacidade máx. de tração (toneladas)', { numerico: true, placeholder: '0,2350', dica: 'CMT. Sem reboque, costuma ser o peso bruto.' })}
        {texto('distanciaEixos', 'Distância entre eixos (mm)', { numerico: true, placeholder: '1300' })}
        {texto('lotacao', 'Lotação (passageiros)', { numerico: true, placeholder: '2' })}

        <p className="pt-2 text-sm font-medium sm:col-span-2">Da operação</p>
        {opcoes('tipoOperacao', 'Tipo da operação', OPCOES_TIPO_OPERACAO)}
        {opcoes('restricao', 'Restrição', OPCOES_RESTRICAO)}
        {opcoes('condicao', 'Condição do veículo', OPCOES_CONDICAO)}
        {opcoes('condicaoVin', 'Condição do chassi (VIN)', OPCOES_CONDICAO_VIN)}
      </div>
    </div>
  )
}
