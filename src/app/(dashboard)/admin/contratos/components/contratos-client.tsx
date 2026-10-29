'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CAMPOS_CONTRATO, colarNoTexto, renderizarContratoGrupo, validarTextoContrato,
} from '@/lib/assinatura/contrato-grupo'
import { envolverDocumento, type DadosDocumento } from '@/lib/assinatura/documento'
import type { Categoria, VersaoContrato } from '@/lib/contratos-grupo'
import { salvarContratoAction } from '../actions'

type Versao = Omit<VersaoContrato, 'criadoEm'> & { criadoEm: string }

const ROTULO: Record<Categoria, string> = {
  autopropelido: 'Autopropelido', ciclomotor: 'Ciclomotor', triciclo: 'Triciclo',
  bike: 'Bike', brinquedo: 'Brinquedo', patinete: 'Patinete',
}

// Venda inventada só para a prévia: nenhum dado de cliente de verdade.
const VENDA_EXEMPLO: DadosDocumento = {
  vendaId: 'exemplo', clienteNome: 'Maria Exemplo', clienteCpf: '52998224725', clienteEmail: 'maria@exemplo.com',
  clienteEndereco: 'Rua das Flores, nº 10, Centro, Cidade Exemplo/MG', vendedoraRazaoSocial: 'EMPRESA EXEMPLO LTDA.',
  vendedoraCnpj: '11222333000181', vendedoraEndereco: 'Avenida Exemplo, nº 100, Centro, Cidade Exemplo/MG',
  cidadeSede: 'Cidade Exemplo', comarcaForo: 'Cidade Exemplo, Minas Gerais', lojaNome: 'Loja Exemplo',
  lojaCidade: 'Cidade Exemplo', marca: 'Marca', modelo: 'Modelo X', chassi: '9C2EXEMPLO0000001', cor: 'Azul',
  motor: '', valor: '12.990,00', formaPagamento: 'PIX',
  pagamentos: [{ tipo: 'pix', valor: 2000 }, { tipo: 'cartao_credito', valor: 10990, parcelas: 12 }],
  dataVenda: '29/10/2026',
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function ContratosClient({ categorias, versoes, podeEditar }: {
  categorias: Categoria[]
  versoes: Versao[]
  podeEditar: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [texto, setTexto] = useState('')
  const [vendoVersao, setVendoVersao] = useState<Versao | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const ativa = (c: Categoria) => versoes.find(v => v.categoria === c) ?? null
  const validacao = useMemo(() => validarTextoContrato(texto), [texto])
  const previa = useMemo(() => envolverDocumento(renderizarContratoGrupo(texto, VENDA_EXEMPLO)), [texto])

  function abrir(c: Categoria) {
    setEditando(c)
    setVendoVersao(null)
    setTexto(ativa(c)?.texto ?? '')
  }

  // Insere no cursor e devolve o foco, para o sócio seguir digitando.
  function inserir(colado: string) {
    const el = area.current
    const r = colarNoTexto(texto, el?.selectionStart ?? texto.length, el?.selectionEnd ?? texto.length, colado)
    setTexto(r.texto)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(r.cursor, r.cursor)
    })
  }

  function salvar() {
    if (!editando) return
    startTransition(async () => {
      const r = await salvarContratoAction(editando, texto)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(`Contrato de ${ROTULO[editando].toLowerCase()} salvo (versão ${r.versao})`)
      setEditando(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Contrato por categoria da moto</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Categoria</th><th>Contrato do grupo</th><th>Atualizado</th><th /></tr>
            </thead>
            <tbody>
              {categorias.map(c => {
                const v = ativa(c)
                return (
                  <tr key={c} className="border-t border-border">
                    <td className="py-2 font-medium">{ROTULO[c]}</td>
                    <td>
                      {v ? `Cadastrado (versão ${v.versao})`
                        : c === 'autopropelido'
                          ? <span className="text-muted-foreground">Não cadastrado: usa o contrato padrão do MOVA</span>
                          : <span className="text-warning">Não cadastrado: a venda mostra aviso e não gera contrato</span>}
                    </td>
                    <td className="text-muted-foreground">{v ? `${fmtData(v.criadoEm)}${v.criadoPorNome ? ` por ${v.criadoPorNome}` : ''}` : ''}</td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => abrir(c)}>
                        {podeEditar ? (v ? 'Editar' : 'Cadastrar') : 'Ver'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editando && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {podeEditar ? 'Editando' : 'Vendo'}: contrato de {ROTULO[editando].toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {podeEditar && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Clique num campo para inserir no texto. O MOVA troca pelo dado da venda. Ao colar do Word,
                  títulos em caixa alta viram # e marcadores viram item de lista; confira e ajuste.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CAMPOS_CONTRATO.map(c => (
                    <button
                      key={c.chave}
                      type="button"
                      title={c.rotulo}
                      onClick={() => inserir(`{${c.chave}}`)}
                      className="rounded-full border border-dashed border-input px-2.5 py-0.5 text-xs text-primary-text hover:bg-muted"
                    >
                      {`{${c.chave}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Texto do contrato</p>
                <textarea
                  ref={area}
                  value={texto}
                  readOnly={!podeEditar}
                  onChange={e => setTexto(e.target.value)}
                  onPaste={e => {
                    if (!podeEditar) return
                    e.preventDefault()
                    inserir(e.clipboardData.getData('text/plain'))
                  }}
                  aria-label="Texto do contrato"
                  className="h-[28rem] w-full resize-y rounded-lg border border-input bg-transparent p-3 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring"
                  placeholder={'# CONTRATO DE COMPRA E VENDA\n{comprador_qualificacao}\n**CLÁUSULA PRIMEIRA**: o objeto deste contrato é...'}
                />
                <p className="text-xs text-muted-foreground">
                  # título · ## subtítulo · cada linha é um parágrafo · - item de lista · **negrito**
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Como o cliente vai receber (venda de exemplo)</p>
                {/* A prévia é o mesmo render do documento, com tudo escapado. */}
                <div className="tema-claro h-[28rem] overflow-auto rounded-lg border border-border bg-card p-4" dangerouslySetInnerHTML={{ __html: previa }} />
              </div>
            </div>

            {podeEditar && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={salvar} disabled={pending || !validacao.ok}>Salvar nova versão</Button>
                <Button variant="outline" onClick={() => setEditando(null)} disabled={pending}>Fechar</Button>
                {!validacao.ok && texto.trim() && <p className="text-sm text-destructive">{validacao.erro}</p>}
              </div>
            )}

            <Versoes versoes={versoes.filter(v => v.categoria === editando)} vendo={vendoVersao} onVer={setVendoVersao} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Versões antigas só para consulta: o contrato já enviado aponta para a dele. */
function Versoes({ versoes, vendo, onVer }: { versoes: Versao[]; vendo: Versao | null; onVer: (v: Versao | null) => void }) {
  if (versoes.length === 0) return null
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-medium">Versões</p>
      <ul className="space-y-1 text-sm">
        {versoes.map(v => (
          <li key={v.id} className="flex items-center gap-2">
            <span>Versão {v.versao} · {fmtData(v.criadoEm)}{v.criadoPorNome ? ` por ${v.criadoPorNome}` : ''}</span>
            <Button size="sm" variant="ghost" onClick={() => onVer(vendo?.id === v.id ? null : v)}>
              {vendo?.id === v.id ? 'Esconder' : 'Ver texto'}
            </Button>
          </li>
        ))}
      </ul>
      {vendo && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{vendo.texto}</pre>}
    </div>
  )
}
