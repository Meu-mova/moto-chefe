'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CamposPix } from '@/components/campos-pix'
import type { TipoChavePix } from '@/lib/dados-funcionario'
import { FALHA_SEM_RESPOSTA } from '@/lib/falha-sem-resposta'
import { salvarDadosFuncionarioAction } from './actions'

const AJUDA: Record<TipoChavePix, string> = {
  cpf:       'Mesmo número do seu CPF',
  celular:   'Com DDD, ex.: (35) 99999-1234',
  email:     'ex.: seunome@email.com',
  aleatoria: 'A chave gerada pelo banco, com 32 caracteres',
}

type Inicial = {
  cpf: string
  pixTipo: TipoChavePix
  pixChave: string
  dataNascimento: string
}

export function CompletarCadastroForm({ inicial }: { inicial: Inicial | null }) {
  const [cpf, setCpf] = useState(inicial?.cpf ?? '')
  const [pixTipo, setPixTipo] = useState<TipoChavePix>(inicial?.pixTipo ?? 'cpf')
  const [pixChave, setPixChave] = useState(inicial?.pixChave ?? '')
  const [dataNascimento, setDataNascimento] = useState(inicial?.dataNascimento ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await salvarDadosFuncionarioAction({ cpf, pixTipo, pixChave, dataNascimento })
      if (!r.ok) { setErro(r.erro); setSalvando(false); return }

      // Navegação dura, de propósito. A versão anterior fazia router.push()
      // seguido de router.refresh(): o refresh re-renderizava a rota atual e
      // devolvia a pessoa para este mesmo formulário — ela salvava, salvava de
      // novo, e a tela não saía do lugar. Recarregar a página inteira força o
      // servidor a montar o layout do zero, já enxergando os dados gravados.
      window.location.assign('/dashboard')
    } catch {
      setErro(FALHA_SEM_RESPOSTA)
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input id="cpf" inputMode="numeric" value={cpf} onChange={e => setCpf(e.target.value)}
               placeholder="000.000.000-00" />
      </div>

      <CamposPix id="pix" tipo={pixTipo} chave={pixChave} onTipo={setPixTipo} onChave={setPixChave} ajuda={AJUDA} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nascimento">Data de nascimento</Label>
        <Input id="nascimento" type="date" value={dataNascimento}
               onChange={e => setDataNascimento(e.target.value)} />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Button onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar e continuar'}
      </Button>
    </div>
  )
}
