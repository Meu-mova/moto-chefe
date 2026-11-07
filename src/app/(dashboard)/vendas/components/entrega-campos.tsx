'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CepInput } from '@/components/ui/cep-input'
import { CLASSE_SELECT_NATIVO } from '@/components/ui/select-nativo'
import { DocumentoClienteInput } from '@/components/documento-cliente'
import { useBuscaCep } from '@/components/use-busca-cep'
import { lerDocumentoCliente } from '@/lib/documento'
import { UFS } from '@/lib/sefaz/uf'
import { type EnderecoDaEntrega, type EntregaVenda, type QuemRecebe } from '@/lib/notagateway/entrega'

/** O que a tela edita: trocar de "Entregar" para "Retira" e voltar não apaga o endereço digitado. */
export type EntregaDoFormulario = Pick<EntregaVenda, 'modalidade'> & {
  modo: EntregaVenda['modo']
  endereco: EnderecoDaEntrega
  outraPessoa: boolean
  recebe: QuemRecebe
}

export const ENTREGA_DO_FORMULARIO_INICIAL: EntregaDoFormulario = {
  modo: 'retira', modalidade: '', outraPessoa: false, recebe: { nome: '', cpfCnpj: '' },
  endereco: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', nomeCidade: '', uf: '' },
}

/** A Entrega que vai ao servidor: só o que o modo escolhido usa. Quem recebe vazio = o comprador. */
export const entregaDoFormulario = (f: EntregaDoFormulario): EntregaVenda => (f.modo === 'retira'
  ? { modo: 'retira', modalidade: f.modalidade }
  : { modo: 'entregar', modalidade: f.modalidade, endereco: f.endereco, recebe: f.outraPessoa ? f.recebe : null })

/** Documento de quem recebe digitado e errado: a tela não deixa criar (ADR-0015); o servidor confere de novo. */
export const quemRecebeInvalido = (f: EntregaDoFormulario) => f.modo === 'entregar' && f.outraPessoa
  && (!f.recebe.nome.trim() || !lerDocumentoCliente(f.recebe.cpfCnpj).ok)

const OPCOES: { modo: EntregaVenda['modo']; titulo: string; ajuda: string }[] = [
  { modo: 'retira', titulo: 'Retira na loja', ajuda: 'O cliente leva daqui.' },
  { modo: 'entregar', titulo: 'Entregar', ajuda: 'A loja manda para um endereço.' },
]

type CampoTexto = 'logradouro' | 'numero' | 'complemento' | 'bairro'
const CAMPOS: { campo: CampoTexto; rotulo: string; classe: string }[] = [
  { campo: 'logradouro', rotulo: 'Rua', classe: 'sm:col-span-4' },
  { campo: 'numero', rotulo: 'Número', classe: 'sm:col-span-2' },
  { campo: 'complemento', rotulo: 'Complemento (opcional)', classe: 'sm:col-span-3' },
  { campo: 'bairro', rotulo: 'Bairro', classe: 'sm:col-span-3' },
]

type Props = {
  valor: EntregaDoFormulario
  onChange: (atualizar: (anterior: EntregaDoFormulario) => EntregaDoFormulario) => void
}

/** Entrega do Novo pedido (layout B da #682): retira ou entregar, com o endereço e quem recebe. */
export function EntregaCampos({ valor, onChange }: Props) {
  const mudar = (patch: Partial<EntregaDoFormulario>) => onChange(anterior => ({ ...anterior, ...patch }))
  const mudarEndereco = (patch: Partial<EnderecoDaEntrega>) =>
    onChange(anterior => ({ ...anterior, endereco: { ...anterior.endereco, ...patch } }))
  const { busca, buscar } = useBuscaCep(e => mudarEndereco({
    ...(e.logradouro ? { logradouro: e.logradouro } : {}), ...(e.bairro ? { bairro: e.bairro } : {}),
    nomeCidade: e.cidade, uf: e.uf, cidade: e.ibge,
  }))
  const e = valor.endereco
  // O código IBGE vem do CEP; só se pede à mão quando a busca falha ou a cidade foi trocada à mão.
  const pedeIbge = busca === 'nao_achou' || (!!e.nomeCidade && !/^\d{7}$/.test(e.cidade))

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Entrega</h3>
        <div role="radiogroup" aria-label="Como a moto chega ao cliente" className="grid gap-2 sm:grid-cols-2">
          {OPCOES.map(o => (
            <label key={o.modo} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${valor.modo === o.modo ? 'border-primary bg-primary-soft' : 'border-border'}`}>
              <input type="radio" name="pedido-entrega" value={o.modo} checked={valor.modo === o.modo}
                onChange={() => mudar({ modo: o.modo })} className="mt-1 size-4 accent-primary" />
              <span>
                <span className="block text-sm font-medium">{o.titulo}</span>
                <span className="block text-sm text-muted-foreground">{o.ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {valor.modo === 'entregar' && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="entrega-cep">CEP</Label>
              <CepInput id="entrega-cep" value={e.cep} onChange={cep => { mudarEndereco({ cep }); buscar(cep) }} />
              {busca && <p className="text-xs text-muted-foreground">{busca === 'buscando' ? 'Buscando o CEP...' : 'CEP não encontrado: preencha à mão'}</p>}
            </div>
            {CAMPOS.map(c => (
              <div key={c.campo} className={`space-y-1 ${c.classe}`}>
                <Label htmlFor={`entrega-${c.campo}`}>{c.rotulo}</Label>
                <Input id={`entrega-${c.campo}`} value={e[c.campo]} onChange={ev => mudarEndereco({ [c.campo]: ev.target.value })} />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor="entrega-nomeCidade">Cidade</Label>
              {/* Trocar a cidade à mão invalida o código IBGE que veio do CEP. */}
              <Input id="entrega-nomeCidade" value={e.nomeCidade} onChange={ev => mudarEndereco({ nomeCidade: ev.target.value, cidade: '' })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="entrega-uf">UF</Label>
              <select id="entrega-uf" value={e.uf} onChange={ev => mudarEndereco({ uf: ev.target.value })} className={CLASSE_SELECT_NATIVO}>
                <option value="">Escolha</option>
                {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.sigla}</option>)}
              </select>
            </div>
            {pedeIbge && (
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="entrega-ibge">Código IBGE do município</Label>
                <Input id="entrega-ibge" value={e.cidade} onChange={ev => mudarEndereco({ cidade: ev.target.value })} inputMode="numeric" maxLength={7} placeholder="7 dígitos" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Pode ser a casa do cliente ou outro lugar. O endereço de onde o cliente mora entra na efetivação.</p>

          <label className="flex items-center gap-2 text-sm" htmlFor="entrega-outra-pessoa">
            <input id="entrega-outra-pessoa" type="checkbox" checked={valor.outraPessoa}
              onChange={ev => mudar({ outraPessoa: ev.target.checked })} className="size-4 accent-primary" />
            Outra pessoa recebe
          </label>
          {valor.outraPessoa ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="entrega-recebe-nome">Nome de quem recebe</Label>
                <Input id="entrega-recebe-nome" value={valor.recebe.nome} onChange={ev => mudar({ recebe: { ...valor.recebe, nome: ev.target.value } })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="entrega-recebe-doc">CPF ou CNPJ de quem recebe</Label>
                <DocumentoClienteInput id="entrega-recebe-doc" value={valor.recebe.cpfCnpj} onChange={cpfCnpj => mudar({ recebe: { ...valor.recebe, cpfCnpj } })} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Quem recebe é o próprio comprador.</p>
          )}
        </div>
      )}

    </div>
  )
}
