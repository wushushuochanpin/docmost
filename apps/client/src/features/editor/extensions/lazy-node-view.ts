import { createElement, lazy, Suspense, type ComponentType } from "react";
import type { NodeViewProps } from "@tiptap/react";

/**
 * Wraps a heavy NodeView component in React.lazy so the editor extension can
 * register a synchronous `view` while the actual component (and its transitive
 * dependencies, e.g. katex) is fetched only when a node of that type is
 * rendered on screen.
 */
export function createLazyNodeView(
  loader: () => Promise<{ default: ComponentType<NodeViewProps> }>,
) {
  const LazyNodeView = lazy(loader);

  return function DeferredNodeView(props: NodeViewProps) {
    return createElement(
      Suspense,
      { fallback: null },
      createElement(LazyNodeView, props),
    );
  };
}
