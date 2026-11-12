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
type Campo = { campo: CampoTexto; rotulo: string; opcional?: boolean; classe: string }
// A grade segue a largura da coluna de Entrega, não a da tela (#846): 6 colunas estreita, 12 a partir de 34rem.
const RUA: Campo = { campo: 'logradouro', rotulo: 'Rua', classe: 'col-span-6 @[34rem]:col-span-7' }
const NUMERO: Campo = { campo: 'numero', rotulo: 'Número', classe: 'col-span-2' }
const COMPLEMENTO: Campo = { campo: 'complemento', rotulo: 'Complemento', opcional: true, classe: 'col-span-4 @[34rem]:col-span-5' }
const BAIRRO: Campo = { campo: 'bairro', rotulo: 'Bairro', classe: 'col-span-6 @[34rem]:col-span-7' }

/** O que o endereço mostra: só o CEP, o resumo do CEP achado ou todos os campos. */
type Exibicao = 'so_cep' | 'resumo' | 'completo'
// Endereço que já chega preenchido (além do CEP) abre inteiro, para nada ficar escondido.
const exibicaoInicial = ({ cep: _cep, ...resto }: EnderecoDaEntrega): Exibicao =>
  Object.values(resto).some(Boolean) ? 'completo' : 'so_cep'

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
  const [exibicao, setExibicao] = useState<Exibicao>(() => exibicaoInicial(valor.endereco))
  const mudarMunicipio = (patch: Partial<EnderecoDaEntrega>) => { setIbgeAMao(true); mudarEndereco({ ...patch, cidade: '' }) }
  const { busca, buscar } = useBuscaCep(e => {
    setIbgeAMao(!e.ibge)
    // Sem a rua (CEP geral) ou sem o código IBGE o resumo não basta: abre tudo para digitar.
    setExibicao(atual => atual === 'completo' || !e.ibge || !e.logradouro ? 'completo' : 'resumo')
    mudarEndereco({
      ...(e.logradouro ? { logradouro: e.logradouro } : {}), ...(e.bairro ? { bairro: e.bairro } : {}),
      nomeCidade: e.cidade, uf: e.uf, cidade: e.ibge,
    })
  })
  const e = valor.endereco
  const buscarCep = (cep: string) => { mudarEndereco({ cep }); buscar(cep) }
  // CEP não achado abre tudo e não fecha mais: o que for digitado à mão não some.
  if (busca === 'nao_achou' && exibicao !== 'completo') setExibicao('completo')
  const campoTexto = (c: Campo) => (
    <div key={c.campo} className={`space-y-1 ${c.classe}`}>
      <Label htmlFor={`entrega-${c.campo}`}>
        {c.rotulo}{c.opcional && <span className="ml-1 text-xs font-normal text-muted-foreground">(opcional)</span>}
      </Label>
      <Input id={`entrega-${c.campo}`} value={e[c.campo]} onChange={ev => mudarEndereco({ [c.campo]: ev.target.value })} />
    </div>
  )
  const pedeIbge = busca === 'nao_achou' || ibgeAMao
  const recebe = conferirQuemRecebe(valor.recebe)
  // Documento errado o próprio campo já mostra; aqui só o que é do nome.
  const erroDoNome = !recebe.ok && lerDocumentoCliente(valor.recebe.cpfCnpj).ok ? recebe.erro : null

  return (
    <div className="@container space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Entrega</h3>
        <div role="radiogroup" aria-label="Como a moto chega ao cliente" className="grid gap-2 @[20rem]:grid-cols-2">
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
          <div className="flex items-end gap-3">
            <div className="w-40 shrink-0 space-y-1">
              <Label htmlFor="entrega-cep">CEP</Label>
              <CepInput id="entrega-cep" value={e.cep} onChange={buscarCep} />
            </div>
            {exibicao === 'resumo' && <p className="pb-2 text-xs text-primary-text">Endereço encontrado</p>}
          </div>
          {busca && <p className="text-xs text-muted-foreground">{busca === 'buscando' ? 'Buscando o CEP...' : 'CEP não encontrado: preencha à mão'}</p>}

          {exibicao === 'resumo' && (
            <>
              <div className="flex items-start justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                <p><span className="font-medium">{e.logradouro}</span><br />{[e.bairro, `${e.nomeCidade} / ${e.uf}`].filter(Boolean).join(', ')}</p>
                <button type="button" onClick={() => setExibicao('completo')} className="shrink-0 font-medium text-primary-text hover:underline">
                  Editar endereço
                </button>
              </div>
              <div className="grid grid-cols-6 gap-3">{[NUMERO, COMPLEMENTO].map(campoTexto)}</div>
            </>
          )}

          {exibicao === 'completo' && (
            <div className="grid grid-cols-6 gap-3 @[34rem]:grid-cols-12">
              {[RUA, NUMERO, COMPLEMENTO, BAIRRO].map(campoTexto)}
              <div className="col-span-6 flex gap-3 @[34rem]:col-span-12">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="entrega-nomeCidade">Cidade</Label>
                  <Input id="entrega-nomeCidade" value={e.nomeCidade} onChange={ev => mudarMunicipio({ nomeCidade: ev.target.value })} />
                </div>
                <div className="w-28 shrink-0 space-y-1">
                  <Label htmlFor="entrega-uf">UF</Label>
                  <select id="entrega-uf" value={e.uf} onChange={ev => mudarMunicipio({ uf: ev.target.value })} className={CLASSE_SELECT_NATIVO}>
                    <option value="">Escolha</option>
                    {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.sigla}</option>)}
                  </select>
                </div>
              </div>
              {pedeIbge && (
                <div className="col-span-6 space-y-1">
                  <Label htmlFor="entrega-ibge">Código IBGE do município</Label>
                  <Input id="entrega-ibge" value={e.cidade} onChange={ev => mudarEndereco({ cidade: ev.target.value })} inputMode="numeric" maxLength={7} placeholder="7 dígitos" />
                </div>
              )}
            </div>
          )}
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
