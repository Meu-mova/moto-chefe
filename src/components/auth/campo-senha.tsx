'use client'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function CampoSenha(props: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={ver ? 'text' : 'password'} className="h-10 pr-11" />
      <button
        type="button"
        onClick={() => setVer(v => !v)}
        aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
      >
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
