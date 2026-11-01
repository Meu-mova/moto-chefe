'use client'
// Página pública de adesão ao MOVA, na IDV (docs/produto/identidade-visual.md): cores com nome,
// logo claro/escuro, ondas da marca ao fundo e verde chapado nos botões.
import { useState } from 'react'
import { Check, FileText, KeyRound, Loader2, Lock, Plus, Store, Trash2, Upload, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FundoOndas } from '@/components/auth/fundo-ondas'
import { CampoSenha } from '@/components/auth/campo-senha'
import { mascaraCelular } from '@/lib/mascaras'
import { ERRO_STORE_LOGIN, PAPEIS_ADESAO, storeLoginValido } from '@/lib/adesao'
import { faltaNaEmpresa, faltaNosImpostos, type DadosFiscais } from '@/lib/adesao-fiscal'
import { ENDERECO_SEDE_VAZIO } from '@/lib/endereco-sede'
import { consultarEmpresaAction, registrarAdesaoAction } from './actions'
import { PassoEmpresa, PassoImpostos, type Consulta } from './passos-fiscais'

type Usuario = { nome: string; email: string; papel: string }
type Dados = {
  loja: string; responsavel: string; celular: string
  cnpj: File | null; cert: File | null; certSenha: string
  usuarios: Usuario[]
  storeLogin: string; storeSenha: string
  fiscal: DadosFiscais
}
const NOVO_USUARIO: Usuario = { nome: '', email: '', papel: '' }
const VAZIO: Dados = {
  loja: '', responsavel: '', celular: '', cnpj: null, cert: null, certSenha: '',
  usuarios: [NOVO_USUARIO], storeLogin: '', storeSenha: '',
  fiscal: {
    razaoSocial: '', nomeFantasia: '', telefone: '', endereco: ENDERECO_SEDE_VAZIO, codigoIbge: '', situacao: '',
    regime: '', inscricaoEstadual: '', ieIsenta: false, inscricaoMunicipal: '', emailNotas: '',
    jaEmite: false, nfSerie: '', nfUltimoNumero: '',
  },
}

const PASSOS = [
  { nome: 'Loja', titulo: 'Qual é a sua loja?' },
  { nome: 'Documentos', titulo: 'Documentos para emitir nota' },
  { nome: 'Sua empresa', titulo: 'Confira os dados da sua empresa' },
  { nome: 'Impostos e notas', titulo: 'Impostos e notas' },
  { nome: 'Usuários', titulo: 'Quem vai usar o MOVA?' },
  { nome: 'Loja online', titulo: 'Acesso ao motochefe.store' },
]

const btnPrimario = 'mova-botao flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:w-40'
const btnSecundario = 'flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-input text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-32'
const selectClass = 'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30'

/** Mensagem do primeiro campo obrigatório vazio do passo; null = pode seguir. O servidor revalida tudo. */
function faltaNoPasso(passo: number, d: Dados): string | null {
  if (passo === 0) {
    if (!d.loja.trim()) return 'Informe o nome da loja'
    if (!d.responsavel.trim()) return 'Informe o responsável'
    if (d.celular.replace(/\D/g, '').length < 10) return 'Informe o celular com DDD'
  }
  if (passo === 1) {
    if (!d.cnpj) return 'Anexe o cartão de CNPJ'
    if (!d.cert) return 'Anexe o certificado digital'
    if (!d.certSenha) return 'Informe a senha do certificado'
  }
  if (passo === 2) return faltaNaEmpresa(d.fiscal)
  if (passo === 3) return faltaNosImpostos(d.fiscal)
  if (passo === 4 && d.usuarios.some(u => !u.nome.trim() || !u.email.trim() || !u.papel)) {
    return 'Preencha nome, e-mail e função de cada usuário'
  }
  if (passo === 5 && !storeLoginValido(d.storeLogin)) return ERRO_STORE_LOGIN
  if (passo === 5 && !d.storeSenha) return 'Informe a senha do motochefe.store'
  return null
}

function Logo({ className }: { className: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mova-nome-claro.svg" alt="MOVA" className={`${className} dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mova-nome-escuro.svg" alt="MOVA" className={`${className} hidden dark:block`} />
    </>
  )
}

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function Arquivo({ id, label, arquivo, aceita, dica, onPick }: {
  id: string; label: string; arquivo: File | null; aceita: string; dica: string; onPick: (f: File | null) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 text-sm transition-colors hover:bg-muted ${arquivo ? 'border-primary bg-primary-soft' : 'border-input'}`}
      >
        <span className={`grid size-9 shrink-0 place-items-center rounded-md ${arquivo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          {arquivo ? <Check className="size-4" /> : <Upload className="size-4" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{arquivo?.name || 'Anexar arquivo'}</span>
          <span className="block text-xs text-muted-foreground">{arquivo ? 'Toque para trocar' : dica}</span>
        </span>
        <input id={id} type="file" accept={aceita} className="sr-only" onChange={e => onPick(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  )
}

export function FormAdesao() {
  const [d, setD] = useState<Dados>(VAZIO)
  const [passo, setPasso] = useState(0)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  // Certificado e senha da última consulta: voltar e avançar sem trocar nada não consulta de novo.
  const [consultado, setConsultado] = useState<{ cert: File; senha: string } | null>(null)

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => setD(x => ({ ...x, [k]: v }))
  const setUser = (i: number, k: keyof Usuario, v: string) =>
    setD(x => ({ ...x, usuarios: x.usuarios.map((u, j) => (j === i ? { ...u, [k]: v } : u)) }))

  function ir(novo: number) { setErro(''); setPasso(novo) }
  const mudarFiscal = (patch: Partial<DadosFiscais> | ((atual: DadosFiscais) => Partial<DadosFiscais>)) =>
    setD(x => ({ ...x, fiscal: { ...x.fiscal, ...(typeof patch === 'function' ? patch(x.fiscal) : patch) } }))

  async function consultarEmpresa(): Promise<boolean> {
    if (consultado?.cert === d.cert && consultado.senha === d.certSenha) return true
    const f = new FormData()
    f.set('cert', d.cert!); f.set('certSenha', d.certSenha)
    f.set('site', (document.getElementById('site') as HTMLInputElement | null)?.value ?? '')
    const res = await consultarEmpresaAction(f)
    if (!res.ok) { setErro(res.erro); return false }
    const e = res.empresa
    setConsultado({ cert: d.cert!, senha: d.certSenha })
    setConsulta({ cnpj: res.cnpj, achou: !!e, situacao: e?.situacao ?? '', avisoRazao: res.avisoRazao, regimeDaReceita: !!e?.regime })
    // Dados da Receita só preenchem; o que a pessoa já digitou fica.
    if (e) setD(x => {
      const f0 = x.fiscal
      const ou = (atual: string, novo: string) => atual || novo
      return {
        ...x,
        fiscal: {
          ...f0,
          razaoSocial: e.razaoSocial || f0.razaoSocial, nomeFantasia: ou(f0.nomeFantasia, e.nomeFantasia), telefone: ou(f0.telefone, e.telefone),
          situacao: e.situacao, codigoIbge: e.codigoIbge, regime: f0.regime || e.regime || '',
          endereco: {
            cep: ou(f0.endereco.cep, e.cep), logradouro: ou(f0.endereco.logradouro, e.logradouro), numero: ou(f0.endereco.numero, e.numero),
            complemento: ou(f0.endereco.complemento, e.complemento), bairro: ou(f0.endereco.bairro, e.bairro),
            cidade: ou(f0.endereco.cidade, e.cidade), uf: ou(f0.endereco.uf, e.uf),
          },
        },
      }
    })
    return true
  }

  async function avancar() {
    const falta = faltaNoPasso(passo, d)
    if (falta) return setErro(falta)
    if (passo === 1) {
      setErro('')
      setEnviando(true)
      const pode = await consultarEmpresa()
      setEnviando(false)
      if (!pode) return
    }
    if (passo < PASSOS.length - 1) return ir(passo + 1)

    setErro('')
    setEnviando(true)
    const f = new FormData()
    f.set('loja', d.loja); f.set('responsavel', d.responsavel); f.set('celular', d.celular)
    f.set('certSenha', d.certSenha); f.set('storeLogin', d.storeLogin); f.set('storeSenha', d.storeSenha)
    f.set('usuarios', JSON.stringify(d.usuarios))
    f.set('fiscal', JSON.stringify(d.fiscal))
    f.set('cnpj', d.cnpj!); f.set('cert', d.cert!)
    f.set('site', (document.getElementById('site') as HTMLInputElement | null)?.value ?? '')
    const res = await registrarAdesaoAction(f)
    setEnviando(false)
    if (res.ok) setOk(true)
    else setErro(res.erro)
  }

  return (
    <div className="mova-auth relative min-h-dvh px-4 py-8 sm:py-12 lg:flex lg:items-center lg:justify-center">
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-background"><FundoOndas /></div>
      <div className="relative mx-auto w-full max-w-lg md:max-w-2xl lg:max-w-4xl">
        <Logo className="mx-auto mb-6 h-9 w-auto lg:h-10" />
        <div className="mova-subir overflow-hidden rounded-2xl border border-border bg-card/95 text-card-foreground shadow-xl backdrop-blur lg:grid lg:grid-cols-[240px_1fr]">
          {!ok && (
            <ol className="flex items-center gap-2 p-5 pb-0 sm:px-8 lg:flex-col lg:items-stretch lg:gap-1 lg:border-r lg:border-border lg:bg-muted/40 lg:p-6">
              {PASSOS.map((p, i) => (
                <li key={p.nome} className="flex flex-1 items-center gap-2 lg:flex-none lg:gap-3 lg:rounded-lg lg:px-2 lg:py-2.5">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${i < passo ? 'bg-primary text-primary-foreground' : i === passo ? 'border-2 border-primary text-primary-text' : 'border border-input text-muted-foreground'}`}>
                    {i < passo ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={`hidden text-sm lg:block ${i === passo ? 'font-medium' : 'text-muted-foreground'}`}>{p.nome}</span>
                  {i < PASSOS.length - 1 && <span className={`h-0.5 flex-1 rounded lg:hidden ${i < passo ? 'bg-primary' : 'bg-border'}`} />}
                </li>
              ))}
            </ol>
          )}
          <div className={`p-5 sm:p-8 ${ok ? 'lg:col-span-2 lg:py-14' : ''}`}>
            {ok ? (
              <div className="space-y-3 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary-text"><Check className="size-6" /></span>
                <h1 className="text-xl font-semibold">Recebido!</h1>
                <p className="text-sm text-muted-foreground">Recebemos os dados da sua loja. Nossa equipe vai configurar o MOVA e avisa você quando estiver pronto.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Passo {passo + 1} de {PASSOS.length}</p>
                  <h1 className="text-lg font-semibold sm:text-xl">{PASSOS[passo].titulo}</h1>
                </div>

                {passo === 0 && (
                  <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                    <div className="md:col-span-2"><Campo id="loja" label="Nome da loja"><Input id="loja" className="h-10" value={d.loja} onChange={e => set('loja', e.target.value)} /></Campo></div>
                    <Campo id="resp" label="Responsável"><Input id="resp" className="h-10" autoComplete="name" value={d.responsavel} onChange={e => set('responsavel', e.target.value)} /></Campo>
                    <Campo id="cel" label="Celular"><Input id="cel" className="h-10" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" value={d.celular} onChange={e => set('celular', mascaraCelular(e.target.value))} /></Campo>
                  </div>
                )}

                {passo === 1 && (
                  <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                    <Arquivo id="cnpj" label="Cartão de CNPJ" arquivo={d.cnpj} aceita="application/pdf,image/*" dica="PDF ou foto, até 5 MB" onPick={f => set('cnpj', f)} />
                    <Arquivo id="cert" label="Certificado digital (A1)" arquivo={d.cert} aceita=".pfx,.p12" dica="Arquivo .pfx ou .p12" onPick={f => set('cert', f)} />
                    <div className="md:col-span-2"><Campo id="certsenha" label="Senha do certificado"><CampoSenha id="certsenha" autoComplete="off" value={d.certSenha} onChange={e => set('certSenha', e.target.value)} /></Campo></div>
                    <p className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning md:col-span-2">
                      <Lock className="mt-0.5 size-3.5 shrink-0" />
                      Certificado e senhas ficam guardados cifrados e só a equipe MOVA tem acesso.
                    </p>
                  </div>
                )}

                {passo === 2 && consulta && <PassoEmpresa f={d.fiscal} mudar={mudarFiscal} consulta={consulta} />}
                {passo === 3 && <PassoImpostos f={d.fiscal} mudar={mudarFiscal} regimeDaReceita={!!consulta?.regimeDaReceita} />}

                {passo === 4 && (
                  <div className="space-y-3">
                    {d.usuarios.map((u, i) => (
                      <div key={i} className="space-y-3 rounded-lg border border-border bg-muted/50 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary-text">Usuário {i + 1}</span>
                          {d.usuarios.length > 1 && (
                            <button type="button" onClick={() => setD(x => ({ ...x, usuarios: x.usuarios.filter((_, j) => j !== i) }))} aria-label="Remover usuário" className="text-destructive"><Trash2 className="size-4" /></button>
                          )}
                        </div>
                        <div className="space-y-3 md:grid md:grid-cols-3 md:gap-3 md:space-y-0">
                          <Campo id={`un${i}`} label="Nome"><Input id={`un${i}`} className="h-10" value={u.nome} onChange={e => setUser(i, 'nome', e.target.value)} /></Campo>
                          <Campo id={`ue${i}`} label="E-mail"><Input id={`ue${i}`} className="h-10" type="email" inputMode="email" value={u.email} onChange={e => setUser(i, 'email', e.target.value)} /></Campo>
                          <Campo id={`uf${i}`} label="Função">
                            <select id={`uf${i}`} className={selectClass} value={u.papel} onChange={e => setUser(i, 'papel', e.target.value)}>
                              <option value="">Selecione</option>
                              {PAPEIS_ADESAO.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                            </select>
                          </Campo>
                        </div>
                      </div>
                    ))}
                    {d.usuarios.length < 20 && (
                      <button type="button" onClick={() => setD(x => ({ ...x, usuarios: [...x.usuarios, NOVO_USUARIO] }))} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-input text-sm font-medium hover:bg-muted"><Plus className="size-4" /> Adicionar usuário</button>
                    )}
                  </div>
                )}

                {passo === 5 && (<>
                  <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                    <Campo id="sl" label="E-mail de acesso ao motochefe.store"><Input id="sl" type="email" inputMode="email" className="h-10" autoComplete="off" value={d.storeLogin} onChange={e => set('storeLogin', e.target.value)} /></Campo>
                    <Campo id="ss" label="Senha"><CampoSenha id="ss" autoComplete="off" value={d.storeSenha} onChange={e => set('storeSenha', e.target.value)} /></Campo>
                  </div>
                  <dl className="space-y-1 rounded-lg bg-primary-soft p-3.5 text-sm">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-primary-text">Resumo</dt>
                    <dd>{d.loja} · {d.responsavel}</dd>
                    <dd>{d.fiscal.razaoSocial}</dd>
                    <dd className="text-muted-foreground">{d.usuarios.length} usuário(s) · CNPJ e certificado anexados</dd>
                  </dl>
                </>)}

                {/* Isca para robô: gente não vê nem preenche. */}
                <input id="site" name="site" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-0 opacity-0" />

                {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

                <div className="flex gap-3 pt-2 sm:justify-end">
                  {passo > 0 && <button type="button" onClick={() => ir(passo - 1)} disabled={enviando} className={btnSecundario}>Voltar</button>}
                  <button type="button" onClick={avancar} disabled={enviando} className={btnPrimario}>
                    {enviando && <Loader2 className="size-4 animate-spin" />}
                    {enviando ? (passo === 1 ? 'Conferindo…' : 'Enviando…') : passo === PASSOS.length - 1 ? 'Enviar' : 'Continuar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
