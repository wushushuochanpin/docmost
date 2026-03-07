import { Component, type ErrorInfo, type ReactNode } from "react";

interface ShareWidgetBoundaryProps {
  area: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface ShareWidgetBoundaryState {
  hasError: boolean;
}

export class ShareWidgetBoundary extends Component<
  ShareWidgetBoundaryProps,
  ShareWidgetBoundaryState
> {
  override state: ShareWidgetBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ShareWidgetBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Share widget failed: ${this.props.area}`, error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}
