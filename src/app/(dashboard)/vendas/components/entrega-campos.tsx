'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CepInput } from '@/components/ui/cep-input'
import { CLASSE_SELECT_NATIVO } from '@/components/ui/select-nativo'
import { DocumentoClienteInput } from '@/components/documento-cliente'
import { useBuscaCep } from '@/components/use-busca-cep'
import { lerDocumentoCliente } from '@/lib/documento'
import { UFS } from '@/lib/sefaz/uf'
import { conferirQuemRecebe, modalidadeComFrete, type EnderecoDaEntrega, type EntregaVenda, type QuemRecebe } from '@/lib/notagateway/entrega'

/** O que a tela edita: trocar de "Entregar" para "Retira" e voltar não apaga o endereço digitado. */
export type EntregaDoFormulario = Pick<EntregaVenda, 'modalidade'> & {
  modo: EntregaVenda['modo']
  endereco: EnderecoDaEntrega
  outraPessoa: boolean
  recebe: QuemRecebe
  /** "+ Frete" ligado e o valor como o `CurrencyInput` devolve ("350.00"). */
  comFrete: boolean
  frete: string
}

export const ENTREGA_DO_FORMULARIO_INICIAL: EntregaDoFormulario = {
  modo: 'retira', modalidade: '', outraPessoa: false, recebe: { nome: '', cpfCnpj: '' }, comFrete: false, frete: '',
  endereco: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', nomeCidade: '', uf: '' },
}

/** O frete cobrado vale só na entrega feita pela loja; trocar o modo ou a modalidade o tira (decisão do Luis, 07/11/2026). */
export const freteDoFormulario = (f: EntregaDoFormulario): number =>
  f.modo === 'entregar' && f.comFrete && modalidadeComFrete(f.modalidade) && Number(f.frete) > 0 ? Number(f.frete) : 0

/** A Entrega que vai ao servidor: só o que o modo escolhido usa. Quem recebe vazio = o comprador. */
export function entregaDoFormulario(f: EntregaDoFormulario): EntregaVenda {
  if (f.modo === 'retira') return { modo: 'retira', modalidade: f.modalidade }
  const frete = freteDoFormulario(f)
  return { modo: 'entregar', modalidade: f.modalidade, endereco: f.endereco, recebe: f.outraPessoa ? f.recebe : null, ...(frete ? { frete } : {}) }
}

/** Quem recebe recusado pela mesma regra do servidor (ADR-0015, até 60 caracteres): a tela não deixa criar. */
export const quemRecebeInvalido = (f: EntregaDoFormulario) => f.modo === 'entregar' && f.outraPessoa && !conferirQuemRecebe(f.recebe).ok

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
  const mudarRecebe = (patch: Partial<QuemRecebe>) => onChange(anterior => ({ ...anterior, recebe: { ...anterior.recebe, ...patch } }))
  // O código IBGE vem do CEP; trocar cidade ou UF à mão apaga o código e pede o novo (rejeição 279).
  const [ibgeAMao, setIbgeAMao] = useState(false)
  const mudarMunicipio = (patch: Partial<EnderecoDaEntrega>) => { setIbgeAMao(true); mudarEndereco({ ...patch, cidade: '' }) }
  const { busca, buscar } = useBuscaCep(e => {
    setIbgeAMao(!e.ibge)
    mudarEndereco({
      ...(e.logradouro ? { logradouro: e.logradouro } : {}), ...(e.bairro ? { bairro: e.bairro } : {}),
      nomeCidade: e.cidade, uf: e.uf, cidade: e.ibge,
    })
  })
  const e = valor.endereco
  const pedeIbge = busca === 'nao_achou' || ibgeAMao
  const recebe = conferirQuemRecebe(valor.recebe)
  // Documento errado o próprio campo já mostra; aqui só o que é do nome.
  const erroDoNome = !recebe.ok && lerDocumentoCliente(valor.recebe.cpfCnpj).ok ? recebe.erro : null

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
              <Input id="entrega-nomeCidade" value={e.nomeCidade} onChange={ev => mudarMunicipio({ nomeCidade: ev.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="entrega-uf">UF</Label>
              <select id="entrega-uf" value={e.uf} onChange={ev => mudarMunicipio({ uf: ev.target.value })} className={CLASSE_SELECT_NATIVO}>
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
                <Input id="entrega-recebe-nome" value={valor.recebe.nome} onChange={ev => mudarRecebe({ nome: ev.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="entrega-recebe-doc">CPF ou CNPJ de quem recebe</Label>
                <DocumentoClienteInput id="entrega-recebe-doc" value={valor.recebe.cpfCnpj} onChange={cpfCnpj => mudarRecebe({ cpfCnpj })} />
              </div>
              {erroDoNome && <p className="text-xs text-destructive sm:col-span-2">{erroDoNome}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Quem recebe é o próprio comprador.</p>
          )}
        </div>
      )}

    </div>
  )
}
