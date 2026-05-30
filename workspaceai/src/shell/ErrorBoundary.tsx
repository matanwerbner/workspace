import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState({ error });
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <div className="error-screen-title">Something went wrong</div>
          <div className="error-screen-msg">{this.state.error.message}</div>
          <button
            className="btn-ghost"
            onClick={() => this.setState({ error: null })}
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
