export interface PixTransaction {
  endToEndId: string
  name: string
  document: string
  id: string
  date: string
  price: string
  pixKey: string | null
  observation: string | null
  inPixChecked: boolean
  checkedDate: string | null
}

interface PixSession {
  accessToken: string
  deviceKey: string
  teamId: number
  expiresAt: number
}

// Cache de sessão por conta — cada grupo pode ter credenciais ValidaPix diferentes.
const sessions = new Map<string, PixSession>()

async function getSession(email: string, password: string): Promise<PixSession> {
  const cached = sessions.get(email)
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached

  const res = await fetch('https://api.validapix.tech/api/v2/auth/signIn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`ValidaPix auth falhou: ${res.status}`)

  const data = await res.json()

  const novaSession: PixSession = {
    accessToken: data.accessToken,
    deviceKey: data.deviceKey,
    teamId: data.teams[0].id,
    expiresAt: new Date(data.accessTokenExp).getTime(),
  }
  sessions.set(email, novaSession)

  return novaSession
}

async function fetchPage(s: PixSession, from: Date, to: Date, page: number, email: string): Promise<{ list: PixTransaction[]; totalPage: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: '100',
    search: '',
    from: from.toISOString(),
    to: to.toISOString(),
    paginate: 'true',
    emergency: 'false',
    exactTimes: 'false',
  })

  const res = await fetch(`https://api.validapix.tech/api/v2/pix?${params}`, {
    headers: {
      Authorization: `Bearer ${s.accessToken}`,
      'x-device-key': s.deviceKey,
      'x-team-id': String(s.teamId),
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (res.status === 401) {
    sessions.delete(email)
    throw new Error('Sessão ValidaPix expirada, recarregue a página')
  }
  if (!res.ok) throw new Error(`ValidaPix erro ${res.status}`)

  return res.json()
}

export async function fetchAllPix(from: Date, to: Date, credenciais: { email: string; password: string }): Promise<PixTransaction[]> {
  const s = await getSession(credenciais.email, credenciais.password)
  const first = await fetchPage(s, from, to, 1, credenciais.email)
  const all = [...first.list]

  for (let p = 2; p <= first.totalPage; p++) {
    const next = await fetchPage(s, from, to, p, credenciais.email)
    all.push(...next.list)
  }

  return all
}

export function parseObservation(obs: string | null): { tipo: 'NF' | 'PV' | 'OS' | null; numero: number | null } {
  if (!obs) return { tipo: null, numero: null }
  const m = obs.trim().match(/^(NF|PV|OS)\s+(\d+)$/i)
  if (!m) return { tipo: null, numero: null }
  return { tipo: m[1].toUpperCase() as 'NF' | 'PV' | 'OS', numero: parseInt(m[2]) }
}
