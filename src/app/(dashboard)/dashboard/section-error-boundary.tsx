'use client'

import { Component, ReactNode } from 'react'

export class SectionErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: boolean }
> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white border border-red-100 rounded-lg p-4 text-center text-slate-400 text-sm">
          Não foi possível carregar{this.props.label ? ` ${this.props.label}` : ' esta seção'}. Recarregue a página.
        </div>
      )
    }
    return this.props.children
  }
}
