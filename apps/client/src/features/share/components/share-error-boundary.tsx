import { Component, type ErrorInfo, type ReactNode } from "react";

interface ShareErrorBoundaryProps {
  children: ReactNode;
  renderFallback: (params: {
    error: Error;
    resetErrorBoundary: () => void;
  }) => ReactNode;
}

interface ShareErrorBoundaryState {
  error: Error | null;
}

export class ShareErrorBoundary extends Component<
  ShareErrorBoundaryProps,
  ShareErrorBoundaryState
> {
  override state: ShareErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ShareErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Share route render failed", error, errorInfo);
  }

  private resetErrorBoundary = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return this.props.renderFallback({
        error: this.state.error,
        resetErrorBoundary: this.resetErrorBoundary,
      });
    }

    return this.props.children;
  }
}
