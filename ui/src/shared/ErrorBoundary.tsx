import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Center } from '@astryxdesign/core/Center'
import { report } from './log'

interface Props {
  children: ReactNode
  /** What to call the area in the fallback text, e.g. "this page". */
  area?: string
}

interface State {
  failed: boolean
}

/** Catches render errors, reports them, and offers a reload instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    report(
      'react_error',
      {
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? '').slice(0, 1500),
        component_stack: String(info.componentStack ?? '').slice(0, 1500),
      },
      'error',
      true,
    )
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Center height="100%" padding={6}>
        <EmptyState
          title="Something went wrong"
          description={`We couldn't show ${this.props.area ?? 'this page'}. Your visit is safe; reloading picks up where you left off.`}
          actions={<Button label="Reload" variant="primary" size="lg" onClick={() => window.location.reload()} />}
        />
      </Center>
    )
  }
}
