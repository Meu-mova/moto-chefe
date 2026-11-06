'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalidadeFreteSelect } from '@/components/modalidade-frete-select'
import { DADOS_TRANSPORTE_VAZIOS, type DadosTransporte, type EnderecoEntrega } from '@/lib/notagateway/transporte'
import { tipoPessoa } from '@/lib/notagateway/venda'

type Props = {
  dados: DadosTransporte
  onChange: (atualizar: (anterior: DadosTransporte) => DadosTransporte) => void
}

export function TransporteForm({ dados, onChange }: Props) {
  const endereco = dados.enderecoEntrega ?? DADOS_TRANSPORTE_VAZIOS.enderecoEntrega
  const setFrete = (modalidade: DadosTransporte['modalidade']) => onChange(anterior => ({ ...anterior, modalidade }))
  const setEndereco = (campo: keyof EnderecoEntrega, valor: string) => onChange(anterior => ({
    ...anterior,
    enderecoEntrega: {
      ...(anterior.enderecoEntrega ?? DADOS_TRANSPORTE_VAZIOS.enderecoEntrega),
      [campo]: valor,
      ...(campo === 'cpfCnpjDestinatario' ? { tipoPessoaDestinatario: tipoPessoa(valor) } : {}),
    },
  }))

  const texto = (campo: keyof EnderecoEntrega, nome: string) => (
    <div className="space-y-1">
      <Label htmlFor={`entrega-${campo}`}>{nome}</Label>
      <Input id={`entrega-${campo}`} value={endereco[campo]} onChange={e => setEndereco(campo, e.target.value)} />
    </div>
  )

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Transporte e entrega</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha o frete e informe onde o veículo será entregue, qualquer que seja o frete.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="modalidade-frete">Modalidade do frete</Label>
        <ModalidadeFreteSelect id="modalidade-frete" valor={dados.modalidade} onChange={setFrete} placeholder="Selecione a modalidade" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="entrega-cpfCnpjDestinatario">CPF ou CNPJ do destinatário</Label>
          <Input id="entrega-cpfCnpjDestinatario" value={endereco.cpfCnpjDestinatario} onChange={e => setEndereco('cpfCnpjDestinatario', e.target.value)} inputMode="numeric" placeholder="CPF ou CNPJ" />
        </div>
        {texto('logradouro', 'Logradouro')}
        {texto('numero', 'Número')}
        {texto('bairro', 'Bairro')}
        <div className="space-y-1">
          <Label htmlFor="entrega-cidade">Código IBGE do município</Label>
          <Input id="entrega-cidade" value={endereco.cidade} onChange={e => setEndereco('cidade', e.target.value)} inputMode="numeric" maxLength={7} placeholder="7 dígitos" />
          <p className="text-xs text-muted-foreground">A NG usa este código para preencher código e nome no XML.</p>
        </div>
        {texto('uf', 'UF')}
      </div>
    </section>
  )
}
