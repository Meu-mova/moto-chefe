import { redirect } from 'next/navigation'

// O grid de cards do /admin virou o hub /areas/configuracao. Este redirect
// existe para não quebrar link salvo nem atalho de quem já usava a rota.
export default function AdminPage() {
  redirect('/areas/configuracao')
}
