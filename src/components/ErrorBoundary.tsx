import { Component, type ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render errors in a page and shows a friendly fallback with the error text and a
 * "Reset inputs" button that clears the store back to defaults. A bad or out-of-range input
 * combination should never leave the user looking at a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('Page crashed:', error, info.componentStack)
  }

  handleReset = () => {
    useAppStore.getState().resetAll()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="card mx-auto my-8 max-w-xl text-center" role="alert">
        <h2 className="text-lg font-semibold text-slate-900">Something went wrong showing this page</h2>
        <p className="mt-2 text-sm text-slate-600">
          One of the inputs is producing a calculation this page can't handle. Your data is safe — you can reset the
          inputs to the defaults and try again.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-slate-50 p-3 text-left text-xs text-slate-500">{error.message}</pre>
        <button type="button" className="btn-primary mt-4" onClick={this.handleReset}>
          Reset inputs
        </button>
      </div>
    )
  }
}
