'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  OPCOES_COMBUSTIVEL, OPCOES_CONDICAO, OPCOES_CONDICAO_VIN, OPCOES_COR_DENATRAN, OPCOES_ESPECIE,
  OPCOES_RESTRICAO, OPCOES_UNIDADE_POTENCIA, SUGESTOES_PINTURA, converterPotencia, OPCOES_TIPO_OPERACAO, OPCOES_TIPO_VEICULO, type DadosRenave,
} from '@/lib/notagateway/veiculo'

type Props = {
  dados: DadosRenave
  onChange: (atualizar: (prev: DadosRenave) => DadosRenave) => void
}

/** Equivalência e o que vai no XML. O leiaute descreve o pot em CV; a unidade é escolha da loja. */
function dicaPotencia(valor: string, unidade: string): string {
  const outra = unidade === 'W' ? 'CV' : 'W'
  const eq = unidade === 'W' || unidade === 'CV' ? converterPotencia(valor, unidade, outra) : ''
  const xml = valor.trim() ? `Vai na nota: ${valor.trim()} (${unidade || 'sem unidade'}).` : 'Até 4 caracteres.'
  return eq ? `${xml} Equivale a ${eq} ${outra}.` : xml
}

/**
 * Dados do veículo que o ciclomotor leva na NF de saída (grupo veicProd) e o
 * RENAVE usa no emplacamento. Preenchidos no ato do envio: vão junto com a
 * transmissão, que valida e grava o que foi enviado na moto.
 */
export function RenaveForm({ dados, onChange }: Props) {
  const set = (campo: keyof DadosRenave) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const valor = e.target.value
    onChange(prev => ({ ...prev, [campo]: valor }))
  }

  const texto = (campo: keyof DadosRenave, rotulo: string, extra?: { placeholder?: string; numerico?: boolean; dica?: string; largo?: boolean; sugestoes?: [string, string][] }) => (
    <div className={extra?.largo ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
      <Label htmlFor={`renave-${campo}`}>{rotulo}</Label>
      <Input
        id={`renave-${campo}`}
        value={dados[campo]}
        onChange={set(campo)}
        inputMode={extra?.numerico ? 'decimal' : undefined}
        placeholder={extra?.placeholder}
        list={extra?.sugestoes ? `renave-${campo}-sugestoes` : undefined}
      />
      {extra?.sugestoes && (
        <datalist id={`renave-${campo}-sugestoes`}>
          {extra.sugestoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </datalist>
      )}
      {extra?.dica && <p className="text-xs text-muted-foreground">{extra.dica}</p>}
    </div>
  )

  const opcoes = (campo: keyof DadosRenave, rotulo: string, lista: [string, string][]) => (
    <div className="space-y-1">
      <Label htmlFor={`renave-${campo}`}>{rotulo}</Label>
      <select
        id={`renave-${campo}`}
        value={dados[campo]}
        onChange={set(campo)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
      >
        {!lista.some(([v]) => v === dados[campo]) && <option value={dados[campo]}>Escolha…</option>}
        {lista.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <p className="font-medium">Dados do veículo (RENAVE)</p>
        <p className="text-sm text-muted-foreground">
          Ciclomotor leva estes dados na nota para o emplacamento. Chassi e motor vêm do cadastro da moto; confira
          tudo no documento do fabricante antes de emitir.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm font-medium sm:col-span-2">Desta moto</p>
        {texto('chassi', 'Chassi', { dica: '17 letras e números. Corrige só a nota, não o cadastro.' })}
        {texto('numeroMotor', 'Número do motor')}
        {texto('numeroSerie', 'Número de série', { dica: 'Até 9 caracteres. Sugerido: final do chassi.' })}
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
          <Label htmlFor="renave-potenciaMotor">Potência</Label>
          <div className="flex gap-2">
            <Input
              id="renave-potenciaMotor"
              value={dados.potenciaMotor}
              onChange={set('potenciaMotor')}
              inputMode="decimal"
            />
            <select
              aria-label="Unidade da potência"
              value={dados.unidadePotencia}
              onChange={e => {
                const para = e.target.value
                onChange(prev => ({ ...prev, unidadePotencia: para, potenciaMotor: converterPotencia(prev.potenciaMotor, prev.unidadePotencia, para) || prev.potenciaMotor }))
              }}
              className="h-10 rounded-md border border-input bg-background px-2 text-base sm:text-sm"
            >
              {!OPCOES_UNIDADE_POTENCIA.some(([v]) => v === dados.unidadePotencia) && <option value={dados.unidadePotencia}>Escolha…</option>}
              {OPCOES_UNIDADE_POTENCIA.map(([v]) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{dicaPotencia(dados.potenciaMotor, dados.unidadePotencia)}</p>
        </div>
        {texto('cilindradas', 'Cilindradas', { numerico: true, dica: 'Elétrico: 0.' })}
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
