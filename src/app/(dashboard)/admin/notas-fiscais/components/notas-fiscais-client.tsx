'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { salvarCredencialAction, salvarRegraAction } from '../actions'
import type { CredencialTela } from '@/lib/notagateway/credencial-tela'
import { ShieldCheck, ShieldAlert, FileCheck2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

type Credencial = CredencialTela
type Regra = {
  naturezaOperacao: string; cfopInterno: string; cstIcmsInterno: string
  cfopInterestadual: string; cstIcmsInterestadual: string; aliquotaIcmsInterestadual: string
  cstPis: string; aliquotaPis: string; cstCofins: string; aliquotaCofins: string
  cstIpi: string; cstIbsCbs: string; classTribIbsCbs: string; crt: number; origemFixa: string
  ibptFederal: string; ibptEstadual: string
}
type LinhaGrupo = {
  grupoId: string
  grupoNome: string
  credencial: Credencial | null
  regra: Regra | null
  certificado: { titular: string; cnpj: string; uf: string; validoAte: string } | null
  estoque: { total: number; comFicha: number }
}

const REGRA_VAZIA: Regra = {
  naturezaOperacao: '', cfopInterno: '', cstIcmsInterno: '',
  cfopInterestadual: '', cstIcmsInterestadual: '', aliquotaIcmsInterestadual: '',
  cstPis: '', aliquotaPis: '', cstCofins: '', aliquotaCofins: '',
  cstIpi: '', cstIbsCbs: '', classTribIbsCbs: '', crt: 3, origemFixa: '', ibptFederal: '', ibptEstadual: '',
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

function Campo({ label, valor, onChange, placeholder, dica, largura = '' }: {
  label: string; valor: string; onChange: (v: string) => void
  placeholder?: string; dica?: string; largura?: string
}) {
  return (
    <div className={`space-y-1 ${largura}`}>
      <Label className="text-xs">{label}</Label>
      <Input value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-sm" />
      {dica && <p className="text-[11px] text-muted-foreground leading-tight">{dica}</p>}
    </div>
  )
}

export function NotasFiscaisClient({ grupos, podeEditarCredencial }: { grupos: LinhaGrupo[]; podeEditarCredencial: boolean }) {
  const [aberto, setAberto] = useState<string | null>(grupos[0]?.grupoId ?? null)

  return (
    <div className="space-y-4">
      {grupos.map(g => (
        <CartaoGrupo
          key={g.grupoId}
          linha={g}
          podeEditarCredencial={podeEditarCredencial}
          aberto={aberto === g.grupoId}
          onToggle={() => setAberto(aberto === g.grupoId ? null : g.grupoId)}
        />
      ))}
    </div>
  )
}

function CartaoGrupo({ linha, podeEditarCredencial, aberto, onToggle }: { linha: LinhaGrupo; podeEditarCredencial: boolean; aberto: boolean; onToggle: () => void }) {
  const [token, setToken] = useState('')
  const [ambiente, setAmbiente] = useState<'Homologacao' | 'Producao'>(linha.credencial?.ambiente ?? 'Homologacao')
  const [empresaId, setEmpresaId] = useState('')
  const [trocandoEmpresa, setTrocandoEmpresa] = useState(false)
  const [regra, setRegra] = useState<Regra>(linha.regra ?? REGRA_VAZIA)
  const [pendCred, startCred] = useTransition()
  const [pendRegra, startRegra] = useTransition()

  const setR = (campo: keyof Regra) => (v: string) => setRegra(r => ({ ...r, [campo]: v }))

  const certVencido = linha.certificado ? new Date(linha.certificado.validoAte) < new Date() : false
  const semFicha = linha.estoque.total - linha.estoque.comFicha
  const pronto = !!linha.credencial?.temToken && !!linha.regra && !!linha.certificado && !certVencido

  function salvarCredencial() {
    startCred(async () => {
      try {
        const r = await salvarCredencialAction({
          grupoId: linha.grupoId, token, empresaId, ambiente,
        })
        if (!r.ok) { toast.error(r.erro); return }
        setToken('')
        setEmpresaId('')
        setTrocandoEmpresa(false)
        toast.success('Credencial salva')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  function salvarRegra() {
    startRegra(async () => {
      try {
        await salvarRegraAction({ grupoId: linha.grupoId, ...regra, crt: Number(regra.crt) || 3 })
        toast.success('Regra de saída salva')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <button onClick={onToggle} className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left">
        <div className="flex items-center gap-3">
          {aberto ? <ChevronDown size={18} className="text-muted-foreground" /> : <ChevronRight size={18} className="text-muted-foreground" />}
          <div>
            <h2 className="font-semibold text-foreground">{linha.grupoNome}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {linha.certificado
                ? `${linha.certificado.titular} · CNPJ ${linha.certificado.cnpj} · ${linha.certificado.uf}`
                : 'sem certificado digital cadastrado'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {linha.credencial?.temToken
            ? <Badge variant={linha.credencial.ambiente === 'Producao' ? 'default' : 'secondary'}>{linha.credencial.ambiente}</Badge>
            : <Badge variant="outline" className="text-warning border-warning/50">sem credencial</Badge>}
          {pronto
            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><ShieldCheck size={14} /> pronto</span>
            : <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><ShieldAlert size={14} /> incompleto</span>}
        </div>
      </button>

      {aberto && (
        <div className="border-t divide-y">
          {/* Situação */}
          <div className="px-6 py-4 grid gap-3 sm:grid-cols-3">
            <Situacao
              ok={!!linha.certificado && !certVencido}
              titulo="Certificado A1"
              detalhe={linha.certificado
                ? (certVencido ? `venceu em ${fmtData(linha.certificado.validoAte)}` : `válido até ${fmtData(linha.certificado.validoAte)}`)
                : 'não cadastrado. Envie em Radar Fiscal.'}
            />
            <Situacao
              ok={!!linha.credencial?.temEmpresa}
              titulo="Empresa na Nota Gateway"
              detalhe={linha.credencial?.temEmpresa ? 'cadastrada' : 'ainda não cadastrada'}
            />
            <Situacao
              ok={semFicha === 0}
              titulo="Fichas fiscais do estoque"
              detalhe={`${linha.estoque.comFicha} de ${linha.estoque.total} motos`}
              aviso={semFicha > 0 ? `${semFicha} sem ficha. Confira na emissão.` : undefined}
            />
          </div>

          {/* Credencial */}
          <div className="px-6 py-5 space-y-3">
            <h3 className="font-medium text-foreground text-sm">Credencial da Nota Gateway</h3>
            {!podeEditarCredencial ? (
              // Só o admin_geral grava a credencial (#446); o sócio vê se está cadastrada.
              <div className="text-sm space-y-1">
                <p>Token: {linha.credencial?.temToken ? 'cadastrado' : 'ainda não cadastrado'}</p>
                <p>Ambiente: {linha.credencial ? (linha.credencial.ambiente === 'Producao' ? 'Produção (nota valendo)' : 'Homologação (teste)') : '-'}</p>
                <p className="text-[11px] text-muted-foreground">Só o Admin Geral altera a credencial da Nota Gateway.</p>
              </div>
            ) : (<>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Token Basic</Label>
                <Input
                  type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder={linha.credencial?.temToken ? '•••••• (deixe vazio para manter)' : 'cole o token aqui'}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Guardado cifrado; nunca volta para a tela.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ambiente</Label>
                <select
                  value={ambiente}
                  onChange={e => setAmbiente(e.target.value as 'Homologacao' | 'Producao')}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-card"
                >
                  <option value="Homologacao">Homologação (teste)</option>
                  <option value="Producao">Produção (nota valendo)</option>
                </select>
                <p className="text-[11px] text-muted-foreground">Vai no payload de cada nota.</p>
              </div>
            </div>
            {/* Só de escrita (#446): o id nunca volta para a tela, só se está cadastrado. */}
            <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Empresa na Nota Gateway</span>
                {linha.credencial?.temEmpresa
                  ? <Badge variant="secondary">cadastrada</Badge>
                  : <Badge variant="outline" className="text-warning border-warning/50">ainda não cadastrada</Badge>}
              </div>
              {!trocandoEmpresa && (
                <Button variant="secondary" size="sm" onClick={() => setTrocandoEmpresa(true)}>
                  {linha.credencial?.temEmpresa ? 'Trocar' : 'Cadastrar'}
                </Button>
              )}
            </div>
            {trocandoEmpresa && (
              <div className="space-y-1 rounded-lg border border-dashed bg-muted/60 p-3">
                <Label className="text-xs">Id da empresa na Nota Gateway</Label>
                <Input value={empresaId} onChange={e => setEmpresaId(e.target.value)} placeholder="cole o id da empresa" className="font-mono text-sm" autoComplete="off" />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">Ao salvar, o MOVA confere na Nota Gateway se o CNPJ é o deste grupo.</p>
                  <Button variant="ghost" size="sm" onClick={() => { setEmpresaId(''); setTrocandoEmpresa(false) }}>Cancelar</Button>
                </div>
              </div>
            )}
            <Button onClick={salvarCredencial} disabled={pendCred} size="sm">
              {pendCred ? 'Salvando...' : 'Salvar credencial'}
            </Button>
            </>)}
          </div>

          {/* Regra de saída */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <h3 className="font-medium text-foreground text-sm">Tributação de saída</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                O que a <strong>nossa</strong> nota leva. Não vem do XML de entrada: o CFOP da
                compra é de entrada e a venda tem o seu. Quem define é o contador do CNPJ.
              </p>
            </div>

            <Campo
              label="Natureza da operação" valor={regra.naturezaOperacao} onChange={setR('naturezaOperacao')}
              placeholder="Venda de mercadoria com ST"
            />

            <div className="rounded-lg border bg-muted/60 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Venda dentro da UF</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="CFOP" valor={regra.cfopInterno} onChange={setR('cfopInterno')} placeholder="5405" />
                <Campo label="CST / CSOSN do ICMS" valor={regra.cstIcmsInterno} onChange={setR('cstIcmsInterno')} placeholder="60" dica="60 = ST já recolhida pelo fornecedor" />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/60 p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Venda para fora da UF</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo label="CFOP" valor={regra.cfopInterestadual} onChange={setR('cfopInterestadual')} placeholder="6404" />
                <Campo label="CST / CSOSN do ICMS" valor={regra.cstIcmsInterestadual} onChange={setR('cstIcmsInterestadual')} placeholder="00" />
                <Campo label="Alíquota ICMS (%)" valor={regra.aliquotaIcmsInterestadual} onChange={setR('aliquotaIcmsInterestadual')} placeholder="12.00" dica="Vazio = sem ICMS destacado" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Campo label="CST PIS" valor={regra.cstPis} onChange={setR('cstPis')} placeholder="01" />
              <Campo label="Alíquota PIS (%)" valor={regra.aliquotaPis} onChange={setR('aliquotaPis')} placeholder="0.65" />
              <Campo label="CST COFINS" valor={regra.cstCofins} onChange={setR('cstCofins')} placeholder="01" />
              <Campo label="Alíquota COFINS (%)" valor={regra.aliquotaCofins} onChange={setR('aliquotaCofins')} placeholder="3.00" />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Campo label="CST IPI" valor={regra.cstIpi} onChange={setR('cstIpi')} placeholder="99" />
              <Campo label="CST IBS/CBS" valor={regra.cstIbsCbs} onChange={setR('cstIbsCbs')} placeholder="000" dica="Reforma tributária" />
              <Campo label="Class. trib. IBS/CBS" valor={regra.classTribIbsCbs} onChange={setR('classTribIbsCbs')} placeholder="000001" />
              <div className="space-y-1">
                <Label className="text-xs">CRT do emitente</Label>
                <select
                  value={regra.crt}
                  onChange={e => setRegra(r => ({ ...r, crt: Number(e.target.value) }))}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-card"
                >
                  <option value={1}>1 — Simples Nacional</option>
                  <option value={2}>2 — Simples, excesso de receita</option>
                  <option value={3}>3 — Regime Normal</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Campo label="Tributos aprox. federal (%)" valor={regra.ibptFederal} onChange={setR('ibptFederal')} placeholder="31.60" dica="Tabela do IBPT" />
              <Campo label="Tributos aprox. estadual (%)" valor={regra.ibptEstadual} onChange={setR('ibptEstadual')} placeholder="12.00" dica="Lei da Transparência" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Origem da mercadoria</Label>
              <select
                value={regra.origemFixa}
                onChange={e => setRegra(r => ({ ...r, origemFixa: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 text-sm bg-card sm:max-w-md"
              >
                <option value="">Pela nota de entrada de cada moto (1 sai como 2; 0, 2 e 4 iguais)</option>
                <option value="0">Sempre 0 — Nacional</option>
                <option value="1">Sempre 1 — Estrangeira, importação direta</option>
                <option value="2">Sempre 2 — Estrangeira, mercado interno</option>
                <option value="3">Sempre 3 — Nacional, mais de 40% de conteúdo importado</option>
                <option value="4">Sempre 4 — Nacional, produzida conforme PPB</option>
              </select>
              <p className="text-[11px] text-muted-foreground leading-tight">
                As motos entram com origem 0, 1, 2 e 4 conforme o fornecedor. Fixar um valor é o
                que o Bling faz hoje (sempre 0); usar a real espelha a nota de entrada.
              </p>
            </div>

            <Button onClick={salvarRegra} disabled={pendRegra} size="sm">
              {pendRegra ? 'Salvando...' : 'Salvar tributação'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Situacao({ ok, titulo, detalhe, aviso }: { ok: boolean; titulo: string; detalhe: string; aviso?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? 'border-border bg-card' : 'border-warning/30 bg-warning/5'}`}>
      <div className="flex items-center gap-1.5">
        {ok ? <FileCheck2 size={14} className="text-success" /> : <AlertTriangle size={14} className="text-warning" />}
        <span className="text-xs font-medium text-foreground">{titulo}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{detalhe}</p>
      {aviso && <p className="text-xs text-warning mt-0.5">{aviso}</p>}
    </div>
  )
}
