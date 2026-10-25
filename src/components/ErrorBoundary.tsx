import { Component, type ReactNode } from 'react'

// If a screen crashes, show what happened (so Gili can send a screenshot) instead of a blank or wrong page
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="screen">
        <h1>משהו השתבש במסך הזה</h1>
        <p className="muted">צלמו את המסך ושלחו, זה יעזור לתקן. המידע שלך לא נמחק.</p>
        <pre dir="ltr" className="card small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {this.state.error.message}{'\n'}{__BUILD__}
        </pre>
        <a className="btn block" href="#/home" onClick={() => this.setState({ error: null })}>חזרה לבית</a>
      </main>
    )
  }
}
