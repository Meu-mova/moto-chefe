'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Circle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UFS } from '@/lib/sefaz/uf'
import type { DadosAtivacao } from '@/lib/ativacao-cliente'
import { aplicarCertificadoAction, aplicarPortalAction, criarLojaAtivacaoAction, criarUsuariosAtivacaoAction, dadosAtivacaoAction } from '../actions'
import type { ResultadoUsuario } from '@/lib/ativacao-usuarios'
import { PAPEIS_ADESAO } from '@/lib/adesao'

// "Ativar cliente" (#292): loja, usuários, certificado A1 e login do portal saem da adesão
// para o grupo e a loja pelo servidor. Seção na própria tela, não diálogo: o
// revalidatePath das actions desmontaria um diálogo aberto (AGENTS.md, "Interface").

const formatarData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

// Exceção da action (rede, sessão) aparece como erro na tela, não some calada.
const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Falha inesperada; tente de novo'

export function AtivarCliente({ adesaoId }: { adesaoId: string }) {
  const [dados, setDados] = useState<DadosAtivacao | null>(null)
  const [pendente, iniciar] = useTransition()

  function carregar() {
    iniciar(async () => {
      const d = await dadosAtivacaoAction(adesaoId)
      if (!d) { toast.error('Contrato não assinado ou adesão sem grupo'); return }
      setDados(d)
    })
  }

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Ativar cliente</h3>
        {!dados && <Button variant="outline" onClick={carregar} disabled={pendente}>Ativar cliente</Button>}
      </div>
      {dados && (
        <>
          <PassoLoja adesaoId={adesaoId} dados={dados} aoAplicar={carregar} />
          <PassoUsuarios adesaoId={adesaoId} dados={dados} aoAplicar={carregar} />
          <PassoCertificado adesaoId={adesaoId} dados={dados} aoAplicar={carregar} />
          <PassoPortal adesaoId={adesaoId} dados={dados} aoAplicar={carregar} />
          <Resumo dados={dados} />
        </>
      )}
    </div>
  )
}

type Passo = { adesaoId: string; dados: DadosAtivacao; aoAplicar: () => void }

const CAMPOS_LOJA = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'endereco', rotulo: 'Endereço' },
  { chave: 'cep', rotulo: 'CEP' },
] as const

function PassoLoja({ adesaoId, dados, aoAplicar }: Passo) {
  const [loja, setLoja] = useState(dados.lojaSugerida)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function criar() {
    setErro(null)
    iniciar(async () => {
      let r
      try { r = await criarLojaAtivacaoAction(adesaoId, loja) } catch (e) { setErro(mensagem(e)); return }
      if (!r.ok) { setErro(r.erro); return }
      if (r.geocodificado) toast.success('Loja criada')
      else toast.warning('Loja criada, mas sem localização no mapa (CEP vazio ou não encontrado). Ajuste o CEP em /admin/lojas para o frete funcionar.')
      aoAplicar()
    })
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-sm font-medium">Loja</p>
      {dados.lojas.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {dados.lojas.map(l => l.nome).join(', ')}. Outras lojas: <Link href="/admin/lojas" className="underline">/admin/lojas</Link>.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CAMPOS_LOJA.map(c => (
              <div key={c.chave} className="space-y-1">
                <Label htmlFor={`ativar-${adesaoId}-loja-${c.chave}`}>{c.rotulo}</Label>
                <Input
                  id={`ativar-${adesaoId}-loja-${c.chave}`}
                  value={loja[c.chave]}
                  onChange={e => { const v = e.target.value; setLoja(prev => ({ ...prev, [c.chave]: v })) }}
                  disabled={pendente}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Preenchido com o endereço da sede da adesão; confira.</p>
          <Button onClick={criar} disabled={pendente}>Criar loja</Button>
        </>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}

const ROTULO_PAPEL = new Map<string, string>(PAPEIS_ADESAO.map(p => [p.valor, p.rotulo]))

function PassoUsuarios({ adesaoId, dados, aoAplicar }: Passo) {
  // Loja de cada pessoa, pelo e-mail: o cliente pode ter mais de uma loja.
  const [escolhidas, setEscolhidas] = useState<Record<string, string>>({})
  const [resultados, setResultados] = useState<ResultadoUsuario[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const pendentes = dados.usuarios.filter(u => !u.temAcesso)
  // Uma loja só (inclusive a recém-criada no passo acima): vale para todos, sem perguntar.
  const unica = dados.lojas.length === 1 ? dados.lojas[0].id : ''
  const chave = (email: string) => email.trim().toLowerCase()
  const lojaDe = (email: string) => escolhidas[chave(email)] || unica
  const faltaLoja = pendentes.some(u => !lojaDe(u.email))

  function criar() {
    setErro(null)
    iniciar(async () => {
      const lojaPorEmail = Object.fromEntries(pendentes.map(u => [chave(u.email), lojaDe(u.email)]))
      let r
      try { r = await criarUsuariosAtivacaoAction(adesaoId, lojaPorEmail) } catch (e) { setErro(mensagem(e)); return }
      if (!r.ok) { setErro(r.erro); return }
      setResultados(r.resultados)
      aoAplicar()
    })
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-sm font-medium">Usuários</p>
      <ul className="space-y-2 text-sm">
        {dados.usuarios.map(u => (
          <li key={u.email} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {u.temAcesso ? <Check aria-hidden className="h-4 w-4 text-primary-text" /> : <Circle aria-hidden className="h-4 w-4 text-muted-foreground" />}
            <span>{u.nome}</span>
            <span className="text-muted-foreground">· {u.email} · {ROTULO_PAPEL.get(u.papel) ?? u.papel}</span>
            {u.temAcesso ? <span className="text-xs text-muted-foreground">(já tem acesso)</span>
              : dados.lojas.length > 1 && (
                <>
                  <Label htmlFor={`ativar-${adesaoId}-loja-${chave(u.email)}`} className="sr-only">Loja de {u.nome}</Label>
                  {/* select nativo: o value é o id da loja. */}
                  <select
                    id={`ativar-${adesaoId}-loja-${chave(u.email)}`}
                    value={lojaDe(u.email)}
                    onChange={e => { const v = e.target.value; setEscolhidas(prev => ({ ...prev, [chave(u.email)]: v })) }}
                    disabled={pendente}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="">Loja…</option>
                    {dados.lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </>
              )}
          </li>
        ))}
      </ul>
      {dados.lojas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Crie a loja no passo acima: os usuários entram nela.</p>
      ) : pendentes.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={criar} disabled={pendente || faltaLoja}>
            {pendente ? 'Criando…' : `Criar ${pendentes.length} acesso(s) e enviar e-mails`}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            {faltaLoja ? 'Escolha a loja de cada pessoa. ' : ''}Cada pessoa recebe por e-mail uma senha provisória e cria a dela no primeiro acesso.
          </p>
        </div>
      )}
      {resultados && (
        <ul className="space-y-1 text-sm">
          {resultados.filter(r => r.situacao !== 'ja_tinha').map(r => (
            <li key={r.email}>
              {r.situacao === 'erro' ? <span className="text-destructive">{r.nome}: {r.erro}</span>
                : r.emailEnviado ? <span>{r.nome}: acesso criado, e-mail enviado.</span>
                : (
                  <span className="text-warning">
                    {r.nome}: acesso criado, mas o e-mail falhou. Senha provisória (anote agora, não aparece de novo):{' '}
                    <code className="rounded bg-muted px-1 font-mono text-foreground">{r.senhaProvisoria}</code>
                  </span>
                )}
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}

function PassoCertificado({ adesaoId, dados, aoAplicar }: Passo) {
  const [uf, setUf] = useState<string>(dados.ufSugerida ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function aplicar() {
    setErro(null)
    iniciar(async () => {
      let r
      try { r = await aplicarCertificadoAction(adesaoId, uf) } catch (e) { setErro(mensagem(e)); return }
      if (!r.ok) { setErro(r.erro); return }
      toast.success(`Certificado de ${r.titular} aplicado ao grupo`)
      aoAplicar()
    })
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-sm font-medium">Certificado A1</p>
      {dados.certificadoAplicadoEm ? (
        <p className="text-sm text-muted-foreground">Aplicado em {formatarData(dados.certificadoAplicadoEm)} e apagado da adesão.</p>
      ) : !dados.temCertificadoNaAdesao ? (
        <p className="text-sm text-muted-foreground">A adesão não tem certificado. Envie em <Link href="/admin/certificados" className="underline">/admin/certificados</Link>.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`ativar-${adesaoId}-uf`}>UF da empresa</Label>
            <select
              id={`ativar-${adesaoId}-uf`}
              value={uf}
              onChange={e => setUf(e.target.value)}
              disabled={pendente}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Escolha…</option>
              {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.sigla} · {u.nome}</option>)}
            </select>
          </div>
          <Button onClick={aplicar} disabled={pendente || !uf}>Aplicar certificado</Button>
          <p className="w-full text-xs text-muted-foreground">
            {dados.ufSugerida ? `UF sugerida pelo endereço da sede (${dados.ufSugerida}); confirme.` : 'Não deu para ler a UF do endereço; escolha.'}{' '}
            O CNPJ do certificado tem de ser o do grupo.
          </p>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}

function PassoPortal({ adesaoId, dados, aoAplicar }: Passo) {
  const [lojaId, setLojaId] = useState('')
  // Recalculado a cada carga: a loja pode ter sido criada depois de a seção abrir.
  const loja = lojaId || (dados.lojas.length === 1 ? dados.lojas[0].id : '')
  const [email, setEmail] = useState(dados.storeLogin)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function aplicar() {
    setErro(null)
    iniciar(async () => {
      let r
      try { r = await aplicarPortalAction(adesaoId, { lojaId: loja, email, senha }) } catch (e) { setErro(mensagem(e)); return }
      if (!r.ok) { setErro(r.erro); return }
      toast.success('Login do portal testado e aplicado à loja')
      setSenha('')
      aoAplicar()
    })
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-sm font-medium">Portal da fábrica</p>
      {dados.portalAplicadoEm ? (
        <p className="text-sm text-muted-foreground">Testado e aplicado em {formatarData(dados.portalAplicadoEm)} ({dados.storeLogin}).</p>
      ) : dados.lojas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          O grupo ainda não tem loja. Crie no passo acima.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="space-y-1">
            <Label htmlFor={`ativar-${adesaoId}-loja`}>Loja</Label>
            {/* select nativo: o value é o id da loja. */}
            <select
              id={`ativar-${adesaoId}-loja`}
              value={loja}
              onChange={e => setLojaId(e.target.value)}
              disabled={pendente}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Escolha…</option>
              {dados.lojas.map(l => <option key={l.id} value={l.id}>{l.nome}{l.temPortal ? ' (já tem login)' : ''}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ativar-${adesaoId}-email`}>E-mail do portal</Label>
            <Input id={`ativar-${adesaoId}-email`} type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={pendente} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ativar-${adesaoId}-senha`}>Senha</Label>
            <Input
              id={`ativar-${adesaoId}-senha`}
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder={dados.temSenhaPortalNaAdesao ? 'vazio = usar a da adesão' : 'senha do portal'}
              disabled={pendente}
            />
          </div>
          <div className="sm:col-span-3">
            <Button onClick={aplicar} disabled={pendente || !loja || !email.trim()}>
              {pendente ? 'Testando login…' : 'Testar login e aplicar'}
            </Button>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}

function Resumo({ dados }: { dados: DadosAtivacao }) {
  const r = dados.resumo
  const itens: { feito: boolean; texto: string; href?: string }[] = [
    { feito: !!r.certificado, texto: r.certificado ? `Certificado A1 · ${r.certificado.titular} · válido até ${r.certificado.validoAte.split('-').reverse().join('/')}` : 'Certificado A1' },
    { feito: r.portal, texto: 'Login do portal da fábrica numa loja' },
    { feito: r.notaGateway, texto: 'Nota Gateway: token e empresa', href: '/admin/notas-fiscais' },
    { feito: r.regraFiscal, texto: 'Regra fiscal de saída (contador do cliente)', href: '/admin/notas-fiscais' },
    { feito: r.motos > 0, texto: r.motos > 0 ? `Primeira entrada de motos (${r.motos} no grupo)` : 'Primeira entrada de motos', href: '/entrada' },
  ]
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">O que falta para este cliente</p>
      <ul className="space-y-1 text-sm">
        {itens.map(i => (
          <li key={i.texto} className="flex items-center gap-2">
            {i.feito ? <Check aria-hidden className="h-4 w-4 text-primary-text" /> : <Circle aria-hidden className="h-4 w-4 text-muted-foreground" />}
            <span className="sr-only">{i.feito ? 'Feito:' : 'Falta:'}</span>
            <span className={i.feito ? '' : 'text-muted-foreground'}>{i.texto}</span>
            {!i.feito && i.href && <Link href={i.href} className="text-xs underline text-primary-text">{i.href}</Link>}
          </li>
        ))}
      </ul>
    </div>
  )
}
