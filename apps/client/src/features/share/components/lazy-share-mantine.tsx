import type { ComponentType } from "react";
import { ensureShareLazyRuntime } from "@/features/share/share-lazy-runtime.ts";

type ComponentModule<TProps> = {
  default: ComponentType<TProps>;
};

export async function lazyShareMantineComponent<TProps>(
  loadComponent: () => Promise<ComponentModule<TProps>>,
): Promise<ComponentModule<TProps>> {
  const [{ default: Component }, { ShareMantineBoundary }] = await Promise.all([
    loadComponent(),
    import("./share-mantine-boundary.tsx"),
    ensureShareLazyRuntime(),
  ]);

  function WrappedComponent(props: TProps) {
    return (
      <ShareMantineBoundary>
        <Component {...props} />
      </ShareMantineBoundary>
    );
  }

  WrappedComponent.displayName = `LazyShareMantine(${
    Component.displayName || Component.name || "Component"
  })`;

  return {
    default: WrappedComponent,
  };
}
