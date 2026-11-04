'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DADOS_TRANSPORTE_VAZIOS, MODALIDADES_FRETE, type DadosTransporte, type EnderecoEntrega } from '@/lib/notagateway/transporte'
import { tipoPessoa } from '@/lib/notagateway/venda'

type Props = {
  dados: DadosTransporte
  exigeEntrega: boolean
  onChange: (atualizar: (anterior: DadosTransporte) => DadosTransporte) => void
}

export function TransporteForm({ dados, exigeEntrega, onChange }: Props) {
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
        <h2 className="font-semibold">2. {exigeEntrega ? 'Transporte e entrega' : 'Transporte'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Selecione a modalidade do frete.{exigeEntrega && ' No faturamento direto (tpOp 2), informe onde o veículo será entregue, mesmo com frete 9.'}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="modalidade-frete">Modalidade do frete</Label>
        <select id="modalidade-frete" value={dados.modalidade} onChange={e => setFrete(e.target.value as DadosTransporte['modalidade'])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm">
          <option value="">Selecione a modalidade</option>
          {MODALIDADES_FRETE.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select>
      </div>
      {exigeEntrega && <div className="grid gap-3 sm:grid-cols-2">
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
      </div>}
    </section>
  )
}
