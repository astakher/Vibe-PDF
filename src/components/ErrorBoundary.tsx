import { Component, type ReactNode } from 'react'

type State = { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <h1>Something went wrong</h1>
          <p className="error">{this.state.error.message}</p>
          <p>Your file is untouched — reload the page and open it again.</p>
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
