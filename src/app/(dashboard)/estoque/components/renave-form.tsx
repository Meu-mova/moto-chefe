'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  OPCOES_COMBUSTIVEL, OPCOES_CONDICAO, OPCOES_CONDICAO_VIN, OPCOES_COR_DENATRAN, OPCOES_ESPECIE,
  OPCOES_PINTURA, OPCOES_RESTRICAO, OPCOES_TIPO_OPERACAO, OPCOES_TIPO_VEICULO, type DadosRenave,
} from '@/lib/notagateway/veiculo'

type Props = {
  dados: DadosRenave
  onChange: (atualizar: (prev: DadosRenave) => DadosRenave) => void
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

  const texto = (campo: keyof DadosRenave, rotulo: string, extra?: { placeholder?: string; numerico?: boolean; dica?: string; largo?: boolean }) => (
    <div className={extra?.largo ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
      <Label htmlFor={`renave-${campo}`}>{rotulo}</Label>
      <Input
        id={`renave-${campo}`}
        value={dados[campo]}
        onChange={set(campo)}
        inputMode={extra?.numerico ? 'decimal' : undefined}
        placeholder={extra?.placeholder}
      />
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
        {opcoes('tipoPintura', 'Tipo de pintura', OPCOES_PINTURA)}

        <p className="pt-2 text-sm font-medium sm:col-span-2">Do modelo</p>
        {texto('codigoMarcaModelo', 'Código marca/modelo RENAVAM', { numerico: true, placeholder: '143402', dica: 'Até 6 dígitos, da tabela RENAVAM.' })}
        {opcoes('tipoVeiculo', 'Tipo de veículo', OPCOES_TIPO_VEICULO)}
        {opcoes('especie', 'Espécie', OPCOES_ESPECIE)}
        {opcoes('tipoCombustivel', 'Combustível', OPCOES_COMBUSTIVEL)}
        {texto('potenciaMotor', 'Potência (CV)', { numerico: true, dica: 'Até 4 caracteres. 1000 W ≈ 1.36 CV.' })}
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
