'use client'
// Passos 3 e 4 da adesão (#588, variante B do protótipo): "Sua empresa" vem da Receita
// pelo CNPJ do certificado; "Impostos e notas" pede só o que a Receita não tem.
import { useRef } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CepInput } from '@/components/ui/cep-input'
import { buscarEnderecoPorCep } from '@/lib/mascaras'
import { ROTULO_REGIME, type RegimeAdesao } from '@/lib/adesao-campos'
import { comEndereco, soDigitos, type DadosFiscais } from '@/lib/adesao-fiscal'
import { formatarCpfCnpj } from '@/lib/documento'
import type { EnderecoSede } from '@/lib/endereco-sede'
import { UFS } from '@/lib/sefaz/uf'

export type Consulta = { cnpj: string; receita: 'achou' | 'nao_encontrado' | 'sem_resposta'; situacao: string; avisoRazao: string | null; regimeDaReceita: boolean }

const selectClass = 'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30'
const opcaoClass = (sel: boolean) =>
  `flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${sel ? 'border-2 border-primary bg-primary-soft' : 'border border-input'}`

function Campo({ id, label, dica, className, children }: { id: string; label: string; dica?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

// Função recebe o estado mais recente: quem espera uma resposta async usa essa forma (AGENTS.md, Interface).
type Props = { f: DadosFiscais; mudar: (patch: Partial<DadosFiscais> | ((atual: DadosFiscais) => Partial<DadosFiscais>)) => void }

export function PassoEmpresa({ f, mudar, consulta }: Props & { consulta: Consulta }) {
  // Resposta de um CEP já trocado não pode sobrescrever os campos do CEP novo.
  const ultimoCep = useRef('')
  const end = (patch: Partial<EnderecoSede>) => mudar(atual => comEndereco(atual, patch))

  async function trocarCep(cep: string) {
    end({ cep })
    ultimoCep.current = cep
    const e = await buscarEnderecoPorCep(cep)
    if (!e || ultimoCep.current !== cep) return
    // Só o que o ViaCEP trouxe, sobre o estado de agora: número e complemento digitados durante a busca ficam.
    end(Object.fromEntries(Object.entries(e).filter(([, v]) => v)))
  }

  return (
    <div className="space-y-4">
      {consulta.receita === 'achou' ? (
        <p className="flex gap-2 rounded-lg bg-primary-soft px-3 py-2 text-xs leading-relaxed text-primary-text">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          <span>Encontramos o CNPJ {formatarCpfCnpj(consulta.cnpj)} na Receita Federal.{consulta.situacao && <> Situação: <b>{consulta.situacao}</b>.</>}</span>
        </p>
      ) : (
        <p className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {consulta.receita === 'nao_encontrado'
            ? <>Não encontramos o CNPJ {formatarCpfCnpj(consulta.cnpj)} na Receita Federal. Preencha os dados abaixo à mão; dá para continuar normalmente.</>
            : 'A Receita Federal não respondeu agora. Preencha os dados abaixo; dá para continuar normalmente.'}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <Campo id="razao" label="Razão social" className="md:col-span-6"
          dica={consulta.avisoRazao ?? undefined}>
          <Input id="razao" className="h-10" value={f.razaoSocial} onChange={e => mudar({ razaoSocial: e.target.value })} />
        </Campo>
        <Campo id="fantasia" label="Nome fantasia (opcional)" className="md:col-span-3">
          <Input id="fantasia" className="h-10" value={f.nomeFantasia} onChange={e => mudar({ nomeFantasia: e.target.value })} />
        </Campo>
        <Campo id="cnpjlido" label="CNPJ" dica="Lido do certificado digital" className="md:col-span-3">
          <Input id="cnpjlido" className="h-10" value={formatarCpfCnpj(consulta.cnpj)} readOnly />
        </Campo>
        <Campo id="tel" label="Telefone comercial (opcional)" className="md:col-span-3">
          <Input id="tel" className="h-10" type="tel" inputMode="tel" value={f.telefone} onChange={e => mudar({ telefone: e.target.value })} />
        </Campo>

        <p className="border-t border-border pt-3 text-sm font-medium md:col-span-6">Endereço</p>
        <Campo id="cep" label="CEP" className="md:col-span-2">
          <CepInput id="cep" value={f.endereco.cep} onChange={trocarCep} />
        </Campo>
        <Campo id="rua" label="Rua" className="md:col-span-4">
          <Input id="rua" className="h-10" value={f.endereco.logradouro} onChange={e => end({ logradouro: e.target.value })} />
        </Campo>
        <Campo id="num" label="Número" className="md:col-span-2">
          <Input id="num" className="h-10" value={f.endereco.numero} onChange={e => end({ numero: e.target.value })} />
        </Campo>
        <Campo id="compl" label="Complemento (opcional)" className="md:col-span-4">
          <Input id="compl" className="h-10" value={f.endereco.complemento} onChange={e => end({ complemento: e.target.value })} />
        </Campo>
        <Campo id="bairro" label="Bairro" className="md:col-span-2">
          <Input id="bairro" className="h-10" value={f.endereco.bairro} onChange={e => end({ bairro: e.target.value })} />
        </Campo>
        <Campo id="cidade" label="Cidade" className="md:col-span-3">
          <Input id="cidade" className="h-10" value={f.endereco.cidade} onChange={e => end({ cidade: e.target.value })} />
        </Campo>
        <Campo id="uf" label="Estado" className="md:col-span-1">
          {/* select nativo: lista fechada evita UF inválida. */}
          <select id="uf" className={selectClass} value={f.endereco.uf} onChange={e => end({ uf: e.target.value })}>
            <option value="">UF</option>
            {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.sigla}</option>)}
          </select>
        </Campo>
      </div>
    </div>
  )
}

export function PassoImpostos({ f, mudar, regimeDaReceita }: Props & { regimeDaReceita: boolean }) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">1. Regime de impostos</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROTULO_REGIME) as RegimeAdesao[]).map(r => (
            <label key={r} className={opcaoClass(f.regime === r)}>
              <input type="radio" name="regime" checked={f.regime === r} onChange={() => mudar({ regime: r })} />
              {ROTULO_REGIME[r]}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {regimeDaReceita ? 'Marcado pela Receita Federal. Corrija se estiver errado.' : 'Na dúvida, pergunte ao seu contador.'}
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo id="ie" label="2. Inscrição estadual" dica="Sem ela não sai nota de moto. Pontos, traços e letras são removidos sozinhos.">
          <Input id="ie" className="h-10" inputMode="numeric" disabled={f.ieIsenta} placeholder={f.ieIsenta ? 'ISENTA' : 'Só números'}
            value={f.inscricaoEstadual} onChange={e => mudar({ inscricaoEstadual: soDigitos(e.target.value) })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.ieIsenta} onChange={e => mudar({ ieIsenta: e.target.checked, inscricaoEstadual: '' })} />
            A loja é isenta
          </label>
        </Campo>
        <Campo id="im" label="3. Inscrição municipal (opcional)" dica="Pontos, traços e letras são removidos sozinhos.">
          <Input id="im" className="h-10" inputMode="numeric" placeholder="Só números"
            value={f.inscricaoMunicipal} onChange={e => mudar({ inscricaoMunicipal: soDigitos(e.target.value) })} />
        </Campo>
        <Campo id="emailnotas" label="4. E-mail que recebe as notas (contador ou financeiro)" className="md:col-span-2">
          <Input id="emailnotas" className="h-10" type="email" inputMode="email" value={f.emailNotas} onChange={e => mudar({ emailNotas: e.target.value })} />
        </Campo>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">5. A loja já emite nota de venda por outro sistema?</legend>
        <div className="flex flex-wrap gap-2">
          <label className={opcaoClass(f.jaEmite)}>
            <input type="radio" name="jaemite" checked={f.jaEmite} onChange={() => mudar({ jaEmite: true })} />
            Sim, já emite
          </label>
          <label className={opcaoClass(!f.jaEmite)}>
            <input type="radio" name="jaemite" checked={!f.jaEmite} onChange={() => mudar({ jaEmite: false })} />
            Não, ainda não emite
          </label>
        </div>
        {f.jaEmite && (
          <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
            <Campo id="serie" label="Série da nota">
              <Input id="serie" className="h-10" inputMode="numeric" maxLength={3} value={f.nfSerie} onChange={e => mudar({ nfSerie: soDigitos(e.target.value) })} />
            </Campo>
            <Campo id="ultima" label="Número da última nota emitida">
              <Input id="ultima" className="h-10" inputMode="numeric" maxLength={9} value={f.nfUltimoNumero} onChange={e => mudar({ nfUltimoNumero: soDigitos(e.target.value) })} />
            </Campo>
            <p className="text-xs text-muted-foreground md:col-span-2">
              Os dois estão no DANFE (a folha impressa da nota), no alto, ao lado de &quot;Nº&quot; e &quot;Série&quot;. O MOVA continua a partir do número seguinte, para não repetir.
            </p>
          </div>
        )}
      </fieldset>
    </div>
  )
}
